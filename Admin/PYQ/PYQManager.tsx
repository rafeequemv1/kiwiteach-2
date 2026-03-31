import '../../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from '@google/genai';
import { assertGeminiApiKey } from '../../config/env';
import { layout, prepare } from '@chenglou/pretext';
import { parsePseudoLatexAndMathAllowTables } from '../../utils/latexParser';
import { parseDocxBufferWithEmbeddedImages, type DocxEmbeddedImage } from '../../utils/docxFigureExtract';

interface PYQRow {
  id: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  question_format: string | null;
  difficulty: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  class_name: string | null;
  year: number | null;
  source_exam: string | null;
  paper_code: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  upload_set_id?: string | null;
}

interface PyqUploadSet {
  id: string;
  created_at: string;
  original_filename: string | null;
  source_kind: string;
  uploaded_by: string | null;
}

type Draft = {
  question_text: string;
  question_format: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  correct_index: number;
  explanation: string;
  question_type: string;
  difficulty: string;
  subject_name: string;
  chapter_name: string;
  topic_tag: string;
  class_name: string;
  year: string;
  source_exam: string;
  paper_code: string;
  image_url: string;
  /** 0-based index into DOCX embedded images (IMAGE_N placeholders). Resolved to data URL then uploaded. */
  doc_image_index: number | null;
  /** Section / part label from the paper, e.g. "Section A", "Part II". */
  paper_part: string;
  /** Original question number as printed (per section). Stored in DB metadata verbatim. */
  source_question_number: string;
  /** Multi-doc import only: file order for stable sort when Q numbers repeat across files. Not saved to DB. */
  import_file_ordinal?: number;
};

type GeminiDocRow = Partial<Draft>;

const emptyDraft: Draft = {
  question_text: '',
  question_format: 'text',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_answer: 'A',
  correct_index: 0,
  explanation: '',
  question_type: 'mcq',
  difficulty: 'Medium',
  subject_name: '',
  chapter_name: '',
  topic_tag: '',
  class_name: 'NEET',
  year: '',
  source_exam: 'NEET',
  paper_code: '',
  image_url: '',
  doc_image_index: null,
  paper_part: '',
  source_question_number: '',
};

/** Stable order: import file → part label → source Q label (numeric-aware, exact string). */
function sortDraftsExamOrder(rows: Draft[]): Draft[] {
  return [...rows].sort((a, b) => {
    const oa = a.import_file_ordinal;
    const ob = b.import_file_ordinal;
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    const pa = (a.paper_part || '').trim();
    const pb = (b.paper_part || '').trim();
    if (pa !== pb) return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: 'base' });
    const sa = String(a.source_question_number || '').trim();
    const sb = String(b.source_question_number || '').trim();
    if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
    return 0;
  });
}

async function parsePyqDocxBuffer(arrayBuffer: ArrayBuffer): Promise<{ text: string; images: DocxEmbeddedImage[] }> {
  const mammoth = (window as any)?.mammoth;
  return parseDocxBufferWithEmbeddedImages(arrayBuffer, mammoth);
}

function resolveDraftDocImage(d: Draft, images: DocxEmbeddedImage[]): Draft {
  const idx = d.doc_image_index;
  if (idx == null || idx < 0 || idx >= images.length) return d;
  const explicit = d.image_url?.trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return d;
  const im = images[idx];
  const dataUrl = `data:${im.mimeType};base64,${im.data}`;
  const nextFormat =
    d.question_format === 'figure' || /diagram|figure|graph|image/i.test(d.question_text)
      ? d.question_format
      : d.question_format === 'text' && !explicit
        ? 'figure'
        : d.question_format;
  return {
    ...d,
    image_url: explicit || dataUrl,
    question_format: nextFormat,
  };
}

/**
 * If the model left doc_image_index unset but the DOCX has exactly one image and only one row
 * could use it, bind IMAGE_0 so preview/upload still work.
 */
function attachSingleOrphanDocxImage(rows: Draft[], images: DocxEmbeddedImage[]): Draft[] {
  if (images.length !== 1) return rows;
  const unbound: number[] = [];
  rows.forEach((r, i) => {
    const hasHttp = /^https?:\/\//i.test(r.image_url?.trim() || '');
    const hasData = r.image_url?.trim().startsWith('data:');
    const idxOk = r.doc_image_index != null && r.doc_image_index >= 0;
    if (!hasHttp && !hasData && !idxOk) unbound.push(i);
  });
  if (unbound.length !== 1) return rows;
  const i = unbound[0];
  return rows.map((r, j) =>
    j === i ? resolveDraftDocImage({ ...r, doc_image_index: 0 }, images) : r
  );
}

async function ensurePyqImagePublicUrl(
  imageUrl: string | null | undefined,
  uploadSetId: string,
  slug: string
): Promise<string | null> {
  const u = (imageUrl || '').trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (!u.startsWith('data:')) return u;

  const m = u.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!m) return u;

  const mimeRaw = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  const mime =
    mimeRaw === 'image/jpg'
      ? 'image/jpeg'
      : mimeRaw === 'image/pjpeg'
        ? 'image/jpeg'
        : mimeRaw;

  const ext =
    mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';

  const path = `${uploadSetId}/${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage.from('pyq-images').upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('pyq-images').getPublicUrl(path);
  return data.publicUrl;
}

function buildPyqMetadata(d: Draft): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const part = d.paper_part?.trim();
  if (part) meta.paper_part = part;
  const sq = d.source_question_number?.trim();
  /** Keep exact printed label (preserve leading zeros / suffixes like 4(a)); avoid silent parseInt coercion. */
  if (sq) meta.source_question_number = sq;
  return meta;
}

const csvSplit = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
      continue;
    }
    if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_');

const toOptionArray = (d: Draft) => [d.option_a, d.option_b, d.option_c, d.option_d].filter((x) => x.trim().length > 0);

const toInsertPayload = (d: Draft, uploadSetId: string | null) => ({
  question_text: d.question_text.trim(),
  options: toOptionArray(d),
  choice_a: d.option_a.trim() || null,
  choice_b: d.option_b.trim() || null,
  choice_c: d.option_c.trim() || null,
  choice_d: d.option_d.trim() || null,
  correct_answer: d.correct_answer.trim() || null,
  correct_index: Number.isFinite(d.correct_index) ? d.correct_index : 0,
  explanation: d.explanation.trim() || null,
  question_type: d.question_type.trim() || 'mcq',
  question_format: d.question_format.trim() || 'text',
  difficulty: d.difficulty.trim() || null,
  subject_name: d.subject_name.trim() || null,
  chapter_name: d.chapter_name.trim() || null,
  topic_tag: d.topic_tag.trim() || null,
  class_name: d.class_name.trim() || 'NEET',
  year: d.year.trim() ? Number(d.year) : null,
  source_exam: d.source_exam.trim() || null,
  paper_code: d.paper_code.trim() || null,
  image_url: d.image_url.trim() || null,
  metadata: buildPyqMetadata(d),
  upload_set_id: uploadSetId,
});

const applyMapped = (base: Draft, mapped: Record<string, string>) => ({
  ...base,
  question_text: mapped.question_text || mapped.question || '',
  question_format: (mapped.question_format || mapped.format || 'text').toLowerCase(),
  option_a: mapped.option_a || mapped.a || '',
  option_b: mapped.option_b || mapped.b || '',
  option_c: mapped.option_c || mapped.c || '',
  option_d: mapped.option_d || mapped.d || '',
  correct_answer: (mapped.correct_answer || mapped.answer || 'A').toUpperCase(),
  correct_index:
    Number(mapped.correct_index || mapped.answer_index) ||
    ({ A: 0, B: 1, C: 2, D: 3 }[(mapped.correct_answer || mapped.answer || '').toUpperCase() as 'A' | 'B' | 'C' | 'D'] ?? 0),
  explanation: mapped.explanation || '',
  question_type: (mapped.question_type || mapped.type || 'mcq').toLowerCase(),
  difficulty: mapped.difficulty || 'Medium',
  subject_name: mapped.subject_name || mapped.subject || '',
  chapter_name: mapped.chapter_name || mapped.chapter || '',
  topic_tag: mapped.topic_tag || mapped.topic || '',
  class_name: mapped.class_name || mapped.class || 'NEET',
  year: mapped.year || '',
  source_exam: mapped.source_exam || mapped.exam || 'NEET',
  paper_code: mapped.paper_code || mapped.paper || '',
  image_url: mapped.image_url || mapped.figure_url || '',
  doc_image_index: (() => {
    const raw = mapped.doc_image_index ?? mapped.image_index ?? '';
    if (raw === '' || raw == null) return null;
    const n = Number(String(raw));
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  })(),
  paper_part:
    mapped.paper_part ||
    mapped.section ||
    mapped.part ||
    mapped.paper_section ||
    '',
  source_question_number:
    mapped.source_question_number ||
    mapped.exam_question_number ||
    mapped.question_no ||
    mapped.q_no ||
    mapped.question_number ||
    '',
});

/** Printed paper index at the start of a stem (e.g. "101. Text", "102) Match…"). */
const LEADING_STEM_QNUM = /^(\d{1,4})\s*[.)]\s+/;

/**
 * If Gemini leaves source_question_number empty but the stem begins with the printed
 * question number (common in NEET DOCX: "101.", "102."), copy it into the field and
 * strip the duplicate prefix from plain-text stems; for HTML stems, set field only.
 */
function ensureSourceQuestionNumberFromStem(d: Draft): Draft {
  if (d.source_question_number?.trim()) return d;

  const raw = (d.question_text || '').trim();
  if (!raw) return d;

  const htmlStem = /^[\s\uFEFF]*</i.test(raw);

  if (!htmlStem) {
    const m = raw.match(LEADING_STEM_QNUM);
    if (m) {
      const num = m[1];
      const rest = raw.slice(m[0].length).trim();
      if (rest.length > 0) {
        return { ...d, source_question_number: num, question_text: rest };
      }
      return { ...d, source_question_number: num };
    }
    return d;
  }

  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const m2 = plain.match(LEADING_STEM_QNUM);
  if (m2) {
    return { ...d, source_question_number: m2[1] };
  }
  return d;
}

/**
 * When the model drops the leading "101." from question_text but it still exists in the
 * extracted DOCX text, find this stem in rawText and take the nearest preceding "101." line.
 */
function applySourceQuestionNumbersFromRawText(rows: Draft[], rawText: string): Draft[] {
  if (!rawText.trim()) return rows;
  let searchFrom = 0;
  return rows.map((d) => {
    if (d.source_question_number?.trim()) return d;
    const plain = (d.question_text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain.length < 12) return d;
    const needleLen = Math.min(56, plain.length);
    const needle = plain.slice(0, needleLen);
    let idx = rawText.indexOf(needle, searchFrom);
    if (idx === -1) idx = rawText.indexOf(needle);
    if (idx === -1) return d;
    searchFrom = Math.max(searchFrom, idx + Math.max(needleLen, 20));
    const before = rawText.slice(Math.max(0, idx - 600), idx);
    const lines = before.split(/\r?\n/);
    for (let li = lines.length - 1; li >= 0; li--) {
      const line = lines[li].trim();
      const m = line.match(/^(\d{1,4})\s*[.)]\s/);
      if (m) return { ...d, source_question_number: m[1] };
    }
    return d;
  });
}

const normalizeGeminiRow = (row: GeminiDocRow): Draft => ({
  ...emptyDraft,
  question_text: scrubFigurePlaceholders(String(row.question_text || '')),
  question_format: String((row as any).question_format || 'text').toLowerCase(),
  option_a: scrubFigurePlaceholders(String(row.option_a || '')),
  option_b: scrubFigurePlaceholders(String(row.option_b || '')),
  option_c: scrubFigurePlaceholders(String(row.option_c || '')),
  option_d: scrubFigurePlaceholders(String(row.option_d || '')),
  correct_answer: String((row as any).correct_answer || 'A').toUpperCase(),
  correct_index: Number(row.correct_index ?? 0) || 0,
  explanation: String(row.explanation || ''),
  question_type: String(row.question_type || 'mcq').toLowerCase(),
  difficulty: String(row.difficulty || 'Medium'),
  subject_name: String(row.subject_name || ''),
  chapter_name: String(row.chapter_name || ''),
  topic_tag: String(row.topic_tag || ''),
  class_name: String(row.class_name || 'NEET'),
  year: row.year == null ? '' : String(row.year),
  source_exam: String(row.source_exam || 'NEET'),
  paper_code: String(row.paper_code || ''),
  image_url: String(row.image_url || ''),
  doc_image_index: (() => {
    const v = (row as any).doc_image_index;
    if (v == null || v === '' || Number(v) === -1) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  })(),
  paper_part: String((row as any).paper_part || ''),
  source_question_number:
    (row as any).source_question_number == null || (row as any).source_question_number === ''
      ? ''
      : String((row as any).source_question_number),
});

const parseGeminiJson = (txt: string): GeminiDocRow[] => {
  const cleaned = txt
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];
  return parsed as GeminiDocRow[];
};

/** USD → INR for UI estimates only (adjust if your billing uses a different FX). */
const PYQ_USD_INR = 87;

const PYQ_MODEL_STORAGE_KEY = 'kiwiteach_pyq_gemini_model';

type PyqGeminiModelOption = {
  id: string;
  label: string;
  blurb: string;
  /** Approx. USD per 1M input tokens (Google AI pricing tier — verify on console). */
  inputUsdPer1M: number;
  /** Approx. USD per 1M output tokens. */
  outputUsdPer1M: number;
  bestValue: boolean;
};

const PYQ_GEMINI_MODEL_OPTIONS: PyqGeminiModelOption[] = [
  {
    id: 'gemini-flash-lite-latest',
    label: 'Gemini Flash Lite',
    blurb: 'Lowest cost — best for bulk PYQ parsing',
    inputUsdPer1M: 0.05,
    outputUsdPer1M: 0.2,
    bestValue: true,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (preview)',
    blurb: 'Balanced quality and speed',
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
    bestValue: false,
  },
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro (preview)',
    blurb: 'Highest quality — higher cost',
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    bestValue: false,
  },
];

function buildPyqGeminiUserPrompt(fileName: string, rawText: string): string {
  return (
    'Convert the following exam/PYQ source into a JSON array of scored questions only. Output JSON only, no markdown.\n\n' +
    'IGNORE (do not output as questions): cover pages; logos and branding; watermarks; coaching or publisher headers/footers; decorative or banner images; hall-ticket / OMR instructions; ' +
    'generic "Read carefully", duration, maximum marks, or syllabus tables unless they are the sole content of a scored item. ' +
    'Only extract real question stems with answer choices (or match-list / assertion types as appropriate).\n\n' +
    'Do not paraphrase question facts. Keep stems and options verbatim from the source when present. Use empty string for missing optional fields.\n\n' +
    'Multi-part papers (Section A/B, Part I/II, etc.): for each row set paper_part to the section label exactly as printed (e.g. "Section A", "Part II"). ' +
    'source_question_number is mandatory on EVERY row: copy the question number EXACTLY as on the paper (e.g. 1, 09, 101, 102, 121, 4a, 12(i)). ' +
    'When a stem starts like "101. The text..." or "102) Match…", set source_question_number to 101 or 102 — never leave it empty. ' +
    'Never renumber 1,2,3… by extraction order; papers often start at 101 or 180 — keep those values. ' +
    'If the paper shows a range (e.g. Questions 121–125), use 121,122,123,124,125 in source_question_number for each row respectively. ' +
    'You may omit repeating the number at the start of question_text if it is redundant, but you must still set source_question_number. ' +
    'Do not paste section headings or instruction blocks into question_text—only the item stem.\n\n' +
    'Figures: SOURCE TEXT contains lines with IMAGE_0, IMAGE_1, … where the DOCX had an embedded picture — these tokens ARE visible in SOURCE TEXT (img innerText must be respected). ' +
    'The question row that corresponds to that item must set doc_image_index to that same integer (0-based) and question_format "figure" when the item depends on the diagram. ' +
    'Do not include IMAGE_N tokens in question_text or options. If there is no figure for the item, set doc_image_index to -1. ' +
    'match_list / column matching: you may include a simple HTML <table>…</table> inside question_text for two-column list layouts; keep only table/tr/th/td text, no scripts. ' +
    'Else use standard option fields for codes / matches.\n\n' +
    'Required keys per row: question_text, option_a, option_b, option_c, option_d, correct_answer, correct_index, explanation, question_type, question_format, difficulty, ' +
    'subject_name, chapter_name, topic_tag, class_name, year, source_exam, paper_code, image_url, doc_image_index, paper_part, source_question_number.\n\n' +
    'image_url: full http(s) URL only if the source already has a public URL; otherwise leave empty and use doc_image_index from IMAGE_N. ' +
    'question_format "figure" when the item needs a diagram or uses doc_image_index >= 0. ' +
    'Allowed question_format: text, figure. Allowed question_type: mcq, assertion_reason, reason_based, match_list. Allowed difficulty: easy, medium, hard.\n\n' +
    `Source filename: ${fileName}\n\nSOURCE TEXT:\n${rawText}`
  );
}

const PYQ_GEMINI_FIXED_PROMPT_CHARS = buildPyqGeminiUserPrompt('', '').length;

function estimateSingleDocPyqParseInr(
  sourceChars: number,
  fileNameLen: number,
  model: Pick<PyqGeminiModelOption, 'inputUsdPer1M' | 'outputUsdPer1M'>,
  usdInr: number
) {
  const inputTok = Math.ceil((PYQ_GEMINI_FIXED_PROMPT_CHARS + fileNameLen + sourceChars) / 4);
  const outputTok = Math.min(8192, Math.max(1200, Math.ceil(inputTok * 0.2)));
  const usd = (inputTok / 1e6) * model.inputUsdPer1M + (outputTok / 1e6) * model.outputUsdPer1M;
  return { inr: usd * usdInr, inputTok, outputTok };
}

async function getDocCharCountForEstimate(file: File): Promise<number> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.txt')) return (await file.text()).length;
  const mammoth = (window as any)?.mammoth;
  if (!mammoth?.extractRawText) return 0;
  const buf = await file.arrayBuffer();
  const out = await mammoth.extractRawText({ arrayBuffer: buf });
  return (out.value || '').length;
}

async function extractLocalPyqSource(file: File): Promise<{ rawText: string; docxImages: DocxEmbeddedImage[] }> {
  const ext = file.name.toLowerCase();
  let rawText = '';
  let docxImages: DocxEmbeddedImage[] = [];
  if (ext.endsWith('.txt')) {
    rawText = await file.text();
  } else {
    const mammoth = (window as any)?.mammoth;
    if (!mammoth?.extractRawText) {
      throw new Error('DOC/DOCX parser not available.');
    }
    const buffer = await file.arrayBuffer();
    if (ext.endsWith('.docx') && mammoth.convertToHtml && mammoth.images?.imgElement) {
      try {
        const parsedDoc = await parsePyqDocxBuffer(buffer);
        rawText = parsedDoc.text;
        docxImages = parsedDoc.images;
      } catch {
        const out = await mammoth.extractRawText({ arrayBuffer: buffer });
        rawText = out.value || '';
        docxImages = [];
      }
    } else {
      const out = await mammoth.extractRawText({ arrayBuffer: buffer });
      rawText = out.value || '';
    }
  }
  if (!rawText.trim()) {
    throw new Error(`No readable text in ${file.name}`);
  }
  return { rawText, docxImages };
}

function getPyqGeminiResponseSchema() {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question_text: { type: Type.STRING },
        option_a: { type: Type.STRING },
        option_b: { type: Type.STRING },
        option_c: { type: Type.STRING },
        option_d: { type: Type.STRING },
        correct_answer: { type: Type.STRING },
        correct_index: { type: Type.NUMBER },
        explanation: { type: Type.STRING },
        question_type: { type: Type.STRING },
        question_format: { type: Type.STRING },
        difficulty: { type: Type.STRING },
        subject_name: { type: Type.STRING },
        chapter_name: { type: Type.STRING },
        topic_tag: { type: Type.STRING },
        class_name: { type: Type.STRING },
        year: { type: Type.STRING },
        source_exam: { type: Type.STRING },
        paper_code: { type: Type.STRING },
        image_url: { type: Type.STRING },
        doc_image_index: { type: Type.NUMBER },
        paper_part: { type: Type.STRING },
        source_question_number: { type: Type.STRING },
      },
    },
  };
}

async function runPyqGeminiExtract(file: File, modelId: string): Promise<Draft[]> {
  const { rawText, docxImages } = await extractLocalPyqSource(file);
  const ai = new GoogleGenAI({ apiKey: assertGeminiApiKey() });
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPyqGeminiUserPrompt(file.name, rawText) }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: getPyqGeminiResponseSchema(),
    },
  });
  const outText = response.text || '[]';
  const base = parseGeminiJson(outText)
    .map(normalizeGeminiRow)
    .map(ensureSourceQuestionNumberFromStem)
    .filter((r) => r.question_text.trim());
  const withPaperNums = applySourceQuestionNumbersFromRawText(base, rawText);
  let withFigures = withPaperNums.map((r) => (docxImages.length > 0 ? resolveDraftDocImage(r, docxImages) : r));
  if (docxImages.length > 0) {
    withFigures = attachSingleOrphanDocxImage(withFigures, docxImages);
  }
  return withFigures;
}

function formatPendingCommitLabel(files: File[]): string {
  if (files.length === 0) return 'import';
  if (files.length === 1) return files[0].name;
  return `${files[0].name} (+${files.length - 1} more)`;
}

function norm(s: string | null | undefined) {
  return (s || '').trim().toLowerCase();
}

/** Paper question # from stored metadata (string or legacy numeric). */
function paperQuestionLabelFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as { source_question_number?: unknown }).source_question_number;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/** Remove DOCX figure placeholders if the model echoed them into text fields. */
function scrubFigurePlaceholders(text: string): string {
  return (text || '')
    .replace(/\bIMAGE_\d+\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const COMPACT_OPT_LEN = 58;
function shouldCompactMcqOptions(opts: string[]): boolean {
  if (opts.length !== 4) return false;
  return opts.every((o) => o.length <= COMPACT_OPT_LEN && !/<img\b/i.test(o));
}

const PyqPaperQuestion: React.FC<{ draft: Draft; index: number }> = ({ draft, index }) => {
  const optStrs = [draft.option_a, draft.option_b, draft.option_c, draft.option_d].map((s) => String(s || ''));
  const opts = optStrs.map((s) => s.trim());
  const nonempty = opts.map((s, i) => (s ? { t: s, i } : null)).filter(Boolean) as { t: string; i: number }[];
  const compact = opts.filter((s) => s.length > 0).length === 4 && shouldCompactMcqOptions(optStrs);
  const isMatch = (draft.question_type || '').toLowerCase() === 'match_list';

  const sq = draft.source_question_number?.trim();
  const primaryQ = sq || String(index + 1);
  const partOnly = draft.paper_part?.trim() || '';

  const stemHtml = parsePseudoLatexAndMathAllowTables(draft.question_text || '');

  return (
    <div className="mb-4 break-inside-avoid text-black">
      <div className="flex gap-1.5 items-start leading-tight">
        <span className="shrink-0 font-bold">{primaryQ}.</span>
        <div className="min-w-0 flex-1">
          {partOnly ? (
            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">{partOnly}</p>
          ) : null}
          <div
            className="math-content pyq-rich [&_.katex]:text-[inherit]"
            dangerouslySetInnerHTML={{ __html: stemHtml }}
          />
          {(draft.question_format === 'figure' || draft.image_url?.trim()) && (
            <div className="mt-1.5">
              {draft.image_url?.trim() ? (
                <img
                  src={draft.image_url.trim()}
                  alt=""
                  className="max-h-52 max-w-full rounded border border-zinc-200 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <p className="text-[9px] italic text-zinc-500">Figure referenced — no image URL in row</p>
              )}
            </div>
          )}
          {nonempty.length > 0 && (
            <div
              className={`mt-1.5 ${
                isMatch
                  ? 'rounded border border-zinc-300 bg-zinc-50/80 p-2'
                  : ''
              } ${compact && !isMatch ? 'grid grid-cols-2 gap-x-3 gap-y-0.5' : 'space-y-0'} text-[10pt] font-medium`}
            >
              {nonempty.map(({ t, i }) => (
                <div key={i} className="flex min-w-0 gap-1 items-start">
                  <span className="shrink-0">({i + 1})</span>
                  <span
                    className="min-w-0 math-content [&_.katex]:text-[inherit]"
                    dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMathAllowTables(t) }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MeasuredSnippet: React.FC<{
  text: string;
  className?: string;
  font?: string;
  lineHeight?: number;
}> = ({ text, className, font = '11px Inter, system-ui, sans-serif', lineHeight = 16 }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  const cacheRef = useRef<Map<string, ReturnType<typeof prepare>>>(new Map());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const value = (text || '').trim();
    if (!value) {
      setMinHeight(undefined);
      return;
    }

    const recompute = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      try {
        const key = `${font}|${value}`;
        let prepared = cacheRef.current.get(key);
        if (!prepared) {
          prepared = prepare(value, font, { whiteSpace: 'normal' });
          cacheRef.current.set(key, prepared);
        }
        const out = layout(prepared, Math.max(20, width), lineHeight);
        setMinHeight(Math.ceil(out.height + 2));
      } catch {
        setMinHeight(undefined);
      }
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, font, lineHeight]);

  return (
    <div
      ref={ref}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      className={className}
      title={text}
    >
      {text}
    </div>
  );
};

const PyqPreviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  drafts: Draft[];
  sourceLabel: string | null;
  saving: boolean;
  onCommit: () => void;
}> = ({ open, onClose, drafts, sourceLabel, saving, onCommit }) => {
  const figureCount = useMemo(() => drafts.reduce((n, d) => n + (d.image_url?.trim() ? 1 : 0), 0), [drafts]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/50 p-2 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="PYQ import preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Test paper preview</p>
            <p className="truncate text-sm font-semibold text-zinc-900" title={sourceLabel || ''}>
              {sourceLabel || 'Parsed questions'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {drafts.length} question{drafts.length === 1 ? '' : 's'} · {figureCount} with figure{figureCount === 1 ? '' : 's'}{' '}
              (LaTeX + tables inline)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Close
            </button>
            <button
              type="button"
              disabled={saving || drafts.length === 0}
              onClick={() => void onCommit()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to PYQ bank'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100/80 p-4">
          <div className="mx-auto max-w-[210mm] rounded-sm border-[0.5pt] border-black bg-white shadow-md">
            <div className="border-b-[0.5pt] border-black px-4 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-black">
              Preview — not saved
            </div>
            <div
              className="p-4 sm:p-5"
              style={{
                fontFamily: "'Times New Roman', Times, serif",
                fontSize: '10pt',
                lineHeight: 1.45,
              }}
            >
              <div className="h-[0.5pt] w-full bg-black" />
              <div className="mt-3 columns-1 gap-8 md:columns-2 md:gap-10">
                {drafts.map((d, i) => (
                  <PyqPaperQuestion key={`${i}-${d.question_text.slice(0, 24)}`} draft={d} index={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PYQManager: React.FC = () => {
  const [rows, setRows] = useState<PYQRow[]>([]);
  const [uploadSets, setUploadSets] = useState<PyqUploadSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [previewRows, setPreviewRows] = useState<Draft[]>([]);
  const [activeUploadSetId, setActiveUploadSetId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [pendingCommit, setPendingCommit] = useState<{ files: File[]; kind: string } | null>(null);
  const [docImportQueue, setDocImportQueue] = useState<File[]>([]);
  const [docQueueStats, setDocQueueStats] = useState<{ name: string; chars: number }[]>([]);
  const [docQueueScanning, setDocQueueScanning] = useState(false);
  const [pyqGeminiModel, setPyqGeminiModel] = useState<string>(() => {
    try {
      const s = localStorage.getItem(PYQ_MODEL_STORAGE_KEY);
      if (s && PYQ_GEMINI_MODEL_OPTIONS.some((m) => m.id === s)) return s;
    } catch {
      /* ignore */
    }
    return PYQ_GEMINI_MODEL_OPTIONS.find((m) => m.bestValue)!.id;
  });
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterFormat, setFilterFormat] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const setNameById = useMemo(() => {
    const m = new Map<string, string>();
    uploadSets.forEach((s) => m.set(s.id, s.original_filename || s.id.slice(0, 8)));
    return m;
  }, [uploadSets]);

  const loadUploadSets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pyq_upload_sets')
      .select('id, created_at, original_filename, source_kind, uploaded_by')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    setUploadSets((data || []) as PyqUploadSet[]);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: qData, error: qErr } = await supabase
        .from('pyq_questions_neet')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2500);
      if (qErr) throw qErr;
      setRows((qData || []) as PYQRow[]);
      await loadUploadSets();
    } catch (e: any) {
      alert(e?.message || 'Failed to load PYQs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PYQ_MODEL_STORAGE_KEY, pyqGeminiModel);
    } catch {
      /* ignore */
    }
  }, [pyqGeminiModel]);

  useEffect(() => {
    if (docImportQueue.length === 0) {
      setDocQueueStats([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDocQueueScanning(true);
      try {
        const stats: { name: string; chars: number }[] = [];
        for (const f of docImportQueue) {
          try {
            const chars = await getDocCharCountForEstimate(f);
            if (cancelled) return;
            stats.push({ name: f.name, chars });
          } catch {
            if (cancelled) return;
            stats.push({ name: f.name, chars: 0 });
          }
        }
        if (!cancelled) setDocQueueStats(stats);
      } catch {
        if (!cancelled) setDocQueueStats(docImportQueue.map((f) => ({ name: f.name, chars: 0 })));
      } finally {
        if (!cancelled) setDocQueueScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docImportQueue]);

  const pyqModelMeta = useMemo(
    () => PYQ_GEMINI_MODEL_OPTIONS.find((m) => m.id === pyqGeminiModel) ?? PYQ_GEMINI_MODEL_OPTIONS[0],
    [pyqGeminiModel]
  );

  const bestValueModel = useMemo(() => PYQ_GEMINI_MODEL_OPTIONS.find((m) => m.bestValue)!, []);

  const parseCostEstimateInr = useMemo(() => {
    if (docQueueStats.length !== docImportQueue.length || docQueueStats.length === 0) return null;
    let t = 0;
    for (let i = 0; i < docQueueStats.length; i++) {
      t += estimateSingleDocPyqParseInr(
        docQueueStats[i].chars,
        docImportQueue[i].name.length,
        pyqModelMeta,
        PYQ_USD_INR
      ).inr;
    }
    return t;
  }, [docQueueStats, docImportQueue, pyqModelMeta]);

  const parseCostEstimateBestInr = useMemo(() => {
    if (docQueueStats.length !== docImportQueue.length || docQueueStats.length === 0) return null;
    let t = 0;
    for (let i = 0; i < docQueueStats.length; i++) {
      t += estimateSingleDocPyqParseInr(
        docQueueStats[i].chars,
        docImportQueue[i].name.length,
        bestValueModel,
        PYQ_USD_INR
      ).inr;
    }
    return t;
  }, [docQueueStats, docImportQueue, bestValueModel]);

  const fmtInr = useCallback(
    (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n),
    []
  );

  const appendDocFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    /** Snapshot immediately — clearing the input below can empty the live FileList before setState runs. */
    const incoming = Array.from(list);
    setDocImportQueue((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      for (const f of incoming) {
        const k = `${f.name}:${f.size}:${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }
      return next;
    });
    const input = docFileInputRef.current;
    if (input) input.value = '';
  }, []);

  const removeDocFromQueue = useCallback((index: number) => {
    setDocImportQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const parseAllQueuedDocs = useCallback(async () => {
    if (docImportQueue.length === 0) {
      alert('Add at least one document.');
      return;
    }
    setParsingDoc(true);
    const combined: Draft[] = [];
    try {
      let fileOrd = 0;
      for (const file of docImportQueue) {
        const drafts = await runPyqGeminiExtract(file, pyqGeminiModel);
        if (drafts.length === 0) {
          alert(`No questions extracted from ${file.name}.`);
          return;
        }
        combined.push(...drafts.map((d) => ({ ...d, import_file_ordinal: fileOrd })));
        fileOrd += 1;
      }
      setActiveUploadSetId(null);
      setPendingCommit({ files: [...docImportQueue], kind: 'doc' });
      setDocImportQueue([]);
      setDocQueueStats([]);
      setPreviewRows(sortDraftsExamOrder(combined));
    } catch (e: any) {
      alert(e?.message || 'Failed to parse documents with Gemini');
    } finally {
      setParsingDoc(false);
    }
  }, [docImportQueue, pyqGeminiModel]);

  const createUploadSet = async (originalFilename: string, kind: string): Promise<string | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('pyq_upload_sets')
      .insert({
        original_filename: originalFilename.slice(0, 500),
        source_kind: kind,
        uploaded_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (error) {
      alert(error.message);
      return null;
    }
    const id = data.id as string;
    setActiveUploadSetId(id);
    await loadUploadSets();
    return id;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this PYQ?')) return;
    const { error } = await supabase.from('pyq_questions_neet').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  };

  const handleDeleteSet = async (setId: string) => {
    if (!confirm('Delete this upload batch and all its questions?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pyq_upload_sets').delete().eq('id', setId);
      if (error) throw error;
      if (activeUploadSetId === setId) {
        setActiveUploadSetId(null);
        setPreviewRows([]);
        setPendingCommit(null);
        setPreviewModalOpen(false);
      }
      if (expandedSetId === setId) setExpandedSetId(null);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCsv = async (file: File) => {
    const txt = await file.text();
    const lines = txt.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      alert('CSV is empty');
      return;
    }
    const headers = csvSplit(lines[0]).map(normalizeHeader);
    const parsed: Draft[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = csvSplit(lines[i]);
      const mapped: Record<string, string> = {};
      headers.forEach((h, idx) => {
        mapped[h] = cells[idx] || '';
      });
      const d = ensureSourceQuestionNumberFromStem(applyMapped(emptyDraft, mapped));
      if (d.question_text.trim()) parsed.push(d);
    }
    if (parsed.length === 0) {
      alert('No questions found in CSV.');
      return;
    }
    setActiveUploadSetId(null);
    setPendingCommit({ files: [file], kind: 'csv' });
    setPreviewRows(sortDraftsExamOrder(parsed));
  };

  const uploadPreviewRows = async () => {
    if (previewRows.length === 0) {
      alert('Nothing to upload.');
      return;
    }
    setSaving(true);
    try {
      const importLabelForSlug =
        pendingCommit?.files?.length
          ? formatPendingCommitLabel(pendingCommit.files)
          : activeUploadSetId
            ? setNameById.get(activeUploadSetId) || null
            : null;
      const slugBase = (importLabelForSlug || 'pyq-import').replace(/[^\w.\-]+/g, '_').slice(0, 60);

      let setId = activeUploadSetId;
      if (!setId) {
        if (!pendingCommit?.files?.length) {
          alert('Re-import the file, then save.');
          return;
        }
        const created = await createUploadSet(
          formatPendingCommitLabel(pendingCommit.files),
          pendingCommit.kind
        );
        if (!created) return;
        setId = created;
        setPendingCommit(null);
      }
      const user = await supabase.auth.getUser();
      const ordered = sortDraftsExamOrder(previewRows);
      const withUploadedImages = await Promise.all(
        ordered.map(async (d, i) => {
          const url = await ensurePyqImagePublicUrl(d.image_url, setId!, `${slugBase}-q${i + 1}`);
          return { ...d, image_url: url ?? d.image_url };
        })
      );
      const payload = withUploadedImages.map((d) => ({
        ...toInsertPayload(d, setId),
        uploaded_by: user.data.user?.id || null,
      }));
      const { error } = await supabase.from('pyq_questions_neet').insert(payload);
      if (error) throw error;
      setPreviewRows([]);
      setActiveUploadSetId(null);
      setPreviewModalOpen(false);
      await load();
      alert('PYQs uploaded.');
    } catch (e: any) {
      alert(e?.message || 'Bulk upload failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelPreview = () => {
    setPreviewRows([]);
    setActiveUploadSetId(null);
    setPendingCommit(null);
    setDocImportQueue([]);
    setDocQueueStats([]);
    setPreviewModalOpen(false);
  };

  const rowMatchesFilters = useCallback(
    (r: {
      question_text: string;
      year: number | null;
      subject_name: string | null;
      question_type: string | null;
      difficulty: string | null;
      question_format: string | null;
      source_exam: string | null;
    }) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !r.question_text.toLowerCase().includes(q)) return false;
      if (filterYear && String(r.year ?? '') !== filterYear) return false;
      if (filterSubject && !norm(r.subject_name).includes(norm(filterSubject))) return false;
      if (filterType && norm(r.question_type) !== norm(filterType)) return false;
      if (filterDifficulty && norm(r.difficulty) !== norm(filterDifficulty)) return false;
      if (filterFormat && norm(r.question_format) !== norm(filterFormat)) return false;
      if (filterExam && !norm(r.source_exam).includes(norm(filterExam))) return false;
      return true;
    },
    [searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam]
  );

  const draftMatchesFilters = useCallback(
    (d: Draft) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !d.question_text.toLowerCase().includes(q)) return false;
      if (filterYear && String(d.year || '') !== filterYear) return false;
      if (filterSubject && !norm(d.subject_name).includes(norm(filterSubject))) return false;
      if (filterType && norm(d.question_type) !== norm(filterType)) return false;
      if (filterDifficulty && norm(d.difficulty) !== norm(filterDifficulty)) return false;
      if (filterFormat && norm(d.question_format) !== norm(filterFormat)) return false;
      if (filterExam && !norm(d.source_exam).includes(norm(filterExam))) return false;
      return true;
    },
    [searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam]
  );

  const filterOptions = useMemo(() => {
    const years = new Set<number>();
    const subjects = new Set<string>();
    const types = new Set<string>();
    const diffs = new Set<string>();
    const formats = new Set<string>();
    const exams = new Set<string>();
    const addRow = (r: PYQRow) => {
      if (r.year != null) years.add(r.year);
      if (r.subject_name?.trim()) subjects.add(r.subject_name.trim());
      if (r.question_type?.trim()) types.add(r.question_type.trim());
      if (r.difficulty?.trim()) diffs.add(r.difficulty.trim());
      if (r.question_format?.trim()) formats.add(r.question_format.trim());
      if (r.source_exam?.trim()) exams.add(r.source_exam.trim());
    };
    rows.forEach(addRow);
    previewRows.forEach((p) => {
      const y = Number(p.year);
      if (Number.isFinite(y)) years.add(y);
      if (p.subject_name?.trim()) subjects.add(p.subject_name.trim());
      if (p.question_type?.trim()) types.add(p.question_type.trim());
      if (p.difficulty?.trim()) diffs.add(p.difficulty.trim());
      if (p.question_format?.trim()) formats.add(p.question_format.trim());
      if (p.source_exam?.trim()) exams.add(p.source_exam.trim());
    });
    return {
      years: Array.from(years).sort((a, b) => b - a),
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b)),
      types: Array.from(types).sort(),
      difficulties: Array.from(diffs).sort(),
      formats: Array.from(formats).sort(),
      exams: Array.from(exams).sort(),
    };
  }, [rows, previewRows]);

  const countsBySet = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r.upload_set_id) m.set(r.upload_set_id, (m.get(r.upload_set_id) || 0) + 1);
    });
    return m;
  }, [rows]);

  const aggregateForSet = useCallback(
    (setId: string) => {
      const qs = rows.filter((r) => r.upload_set_id === setId);
      const fromPreview = setId === activeUploadSetId ? previewRows : [];
      const years: number[] = [];
      const subjects = new Set<string>();
      const types = new Set<string>();
      qs.forEach((r) => {
        if (r.year != null) years.push(r.year);
        if (r.subject_name) subjects.add(r.subject_name);
        if (r.question_type) types.add(r.question_type);
      });
      fromPreview.forEach((p) => {
        const y = Number(p.year);
        if (Number.isFinite(y)) years.push(y);
        if (p.subject_name) subjects.add(p.subject_name);
        if (p.question_type) types.add(p.question_type);
      });
      years.sort((a, b) => a - b);
      const yLabel =
        years.length === 0 ? '—' : years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
      return {
        count: setId === activeUploadSetId && previewRows.length > 0 ? previewRows.length : countsBySet.get(setId) || 0,
        yearLabel: yLabel,
        subjects: Array.from(subjects).slice(0, 4),
        types: Array.from(types).slice(0, 4),
        pending: setId === activeUploadSetId && previewRows.length > 0 && countsBySet.get(setId) === 0,
      };
    },
    [rows, activeUploadSetId, previewRows, countsBySet]
  );

  const setMatchesFilters = useCallback(
    (setId: string) => {
      const qs = rows.filter((r) => r.upload_set_id === setId);
      const prev = setId === activeUploadSetId ? previewRows : [];
      if (qs.length === 0 && prev.length === 0) return !searchQuery && !filterYear && !filterSubject && !filterType && !filterDifficulty && !filterFormat && !filterExam;
      const anyRow =
        qs.some((r) => rowMatchesFilters(r)) || prev.some((d) => draftMatchesFilters(d));
      const name = (setNameById.get(setId) || '').toLowerCase();
      const searchOk = !searchQuery.trim() || name.includes(searchQuery.trim().toLowerCase()) || anyRow;
      return searchOk && (qs.length + prev.length === 0 || anyRow);
    },
    [rows, activeUploadSetId, previewRows, rowMatchesFilters, draftMatchesFilters, searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam, setNameById]
  );

  const filteredSets = useMemo(() => uploadSets.filter((s) => setMatchesFilters(s.id)), [uploadSets, setMatchesFilters]);

  const legacyCount = useMemo(() => rows.filter((r) => !r.upload_set_id).length, [rows]);

  const legacyVisible = useMemo(
    () => rows.some((r) => !r.upload_set_id && rowMatchesFilters(r)),
    [rows, rowMatchesFilters]
  );

  const legacyFilteredCount = useMemo(
    () => rows.filter((r) => !r.upload_set_id && rowMatchesFilters(r)).length,
    [rows, rowMatchesFilters]
  );

  const filteredRows = useMemo(() => rows.filter((r) => rowMatchesFilters(r)), [rows, rowMatchesFilters]);

  const previewSourceLabel = useMemo(
    () =>
      (pendingCommit?.files?.length ? formatPendingCommitLabel(pendingCommit.files) : null) ||
      (activeUploadSetId ? setNameById.get(activeUploadSetId) || null : null) ||
      null,
    [pendingCommit, activeUploadSetId, setNameById]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setFilterYear('');
    setFilterSubject('');
    setFilterType('');
    setFilterDifficulty('');
    setFilterFormat('');
    setFilterExam('');
  };

  const hasActiveFilters =
    !!searchQuery.trim() ||
    !!filterYear ||
    !!filterSubject ||
    !!filterType ||
    !!filterDifficulty ||
    !!filterFormat ||
    !!filterExam;

  const downloadCsvTemplate = () => {
    const headers = [
      'question_text',
      'question_format',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'correct_index',
      'explanation',
      'question_type',
      'difficulty',
      'subject_name',
      'chapter_name',
      'topic_tag',
      'class_name',
      'year',
      'source_exam',
      'paper_code',
      'paper_part',
      'source_question_number',
      'image_url',
    ];
    const sample = [
      'Assertion reason question sample',
      'text',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'B',
      '1',
      'Reasoning for the answer',
      'assertion_reason',
      'medium',
      'Biology',
      'Genetics',
      'Mendelian inheritance',
      'NEET',
      '2025',
      'NEET',
      'SET-A',
      'Section A',
      '1',
      'https://example.com/image.png',
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = `${headers.map(esc).join(',')}\n${sample.map(esc).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyq_neet_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const questionsForExpanded = useMemo(() => {
    if (!expandedSetId) return [];
    return rows.filter((r) => r.upload_set_id === expandedSetId).filter(rowMatchesFilters);
  }, [expandedSetId, rows, rowMatchesFilters]);

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">PYQ import</h3>
        <p className="mt-1 max-w-3xl text-[13px] leading-snug text-zinc-500">
          For documents: add one or more files, choose a Gemini model, then click <strong>Parse all with Gemini</strong>. Set{' '}
          <strong>year</strong> (e.g. 2025) per row or in the doc; multi-part papers use <strong>paper_part</strong> and{' '}
          <strong>source_question_number</strong> in metadata. Then <strong>Save to bank</strong>.
        </p>

        {previewRows.length === 0 ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 p-5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40">
                <iconify-icon icon="mdi:table-arrow-down" width="28" className="text-indigo-500" />
                <p className="mt-2 text-sm font-semibold text-zinc-900">CSV template</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">Download the column layout, fill your sheet, then import.</p>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  <iconify-icon icon="mdi:download-outline" width="18" />
                  Download template
                </button>
              </div>

              <label className="flex cursor-pointer flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-white p-5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/30">
                <iconify-icon icon="mdi:file-delimited-outline" width="28" className="text-emerald-600" />
                <p className="mt-2 text-sm font-semibold text-zinc-900">Import CSV</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">Comma-separated file with PYQ columns.</p>
                <span className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white pointer-events-none">
                  Choose CSV file
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleCsv(f);
                  }}
                />
              </label>

              <div className="flex flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-white p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/30">
                <iconify-icon icon="mdi:file-document-multiple-outline" width="28" className="text-violet-600" />
                <p className="mt-2 text-sm font-semibold text-zinc-900">DOC · DOCX · TXT (multi)</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  Add files, pick a model, estimate cost in ₹, then parse. One Gemini request per file (figures stay aligned per document).
                </p>
                <input
                  ref={docFileInputRef}
                  type="file"
                  accept=".doc,.docx,.txt"
                  multiple
                  className="hidden"
                  onChange={(e) => appendDocFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => docFileInputRef.current?.click()}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[12px] font-semibold text-violet-800 shadow-sm hover:bg-violet-50"
                >
                  <iconify-icon icon="mdi:folder-open-outline" width="18" />
                  Add documents
                </button>
                {docImportQueue.length > 0 ? (
                  <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-[11px] text-zinc-700">
                    {docImportQueue.map((f, i) => (
                      <li
                        key={`${f.name}-${f.size}-${i}`}
                        className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1"
                      >
                        <span className="min-w-0 truncate" title={f.name}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] font-semibold text-rose-600 hover:underline"
                          onClick={() => removeDocFromQueue(i)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Gemini model</label>
                  <select
                    value={pyqGeminiModel}
                    onChange={(e) => setPyqGeminiModel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-900 outline-none focus:border-violet-400"
                  >
                    {PYQ_GEMINI_MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.bestValue ? ' — best ₹ efficiency' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] leading-snug text-zinc-500">
                    <span className="font-semibold text-zinc-700">{pyqModelMeta.label}:</span> {pyqModelMeta.blurb}
                    {pyqModelMeta.id !== bestValueModel.id && parseCostEstimateBestInr != null && parseCostEstimateInr != null ? (
                      <span className="mt-1 block text-emerald-800">
                        Most cost-efficient here: {bestValueModel.label} — about {fmtInr(parseCostEstimateBestInr)} for this queue (vs{' '}
                        {fmtInr(parseCostEstimateInr)} with current selection).
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-2 text-[10px] leading-snug text-zinc-600">
                  {docQueueScanning ? (
                    <span className="flex items-center gap-2 text-violet-700">
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
                      Scanning files for estimate…
                    </span>
                  ) : docImportQueue.length === 0 ? (
                    'Estimated Gemini cost (INR) appears after you add documents.'
                  ) : parseCostEstimateInr == null ? (
                    'Working on estimate…'
                  ) : (
                    <>
                      <span className="font-semibold text-zinc-800">Est. cost — {docImportQueue.length} API call(s):</span>{' '}
                      <span className="font-mono text-indigo-700">{fmtInr(parseCostEstimateInr)}</span>
                      <span className="mt-1 block text-zinc-500">
                        Approximate only (FX ~₹{PYQ_USD_INR}/USD). Actual charges follow your Google AI billing meters.
                      </span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  disabled={parsingDoc || docImportQueue.length === 0 || docQueueScanning}
                  onClick={() => void parseAllQueuedDocs()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {parsingDoc ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                      Parsing with Gemini…
                    </>
                  ) : (
                    <>
                      <iconify-icon icon="mdi:robot-outline" width="18" />
                      Parse all with Gemini
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900" title={previewSourceLabel || ''}>
                  {previewSourceLabel || 'Imported file'}
                </p>
                <p className="mt-0.5 text-[12px] text-zinc-600">
                  <span className="font-mono font-semibold text-indigo-700">{previewRows.length}</span> questions · not saved to bank
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  <iconify-icon icon="mdi:book-open-page-variant-outline" width="18" />
                  Test paper preview
                </button>
                <button
                  type="button"
                  onClick={() => void uploadPreviewRows()}
                  disabled={saving || previewRows.length === 0 || (!pendingCommit?.files?.length && !activeUploadSetId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save to bank'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Discard this import and start over?')) cancelPreview();
                  }}
                  className="px-2 py-2 text-[12px] font-medium text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800"
                >
                  New import
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">All extracted questions</p>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  Open test paper view →
                </button>
              </div>
              <div className="max-h-[min(70vh,600px)] overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 z-10 bg-zinc-50 text-zinc-600 shadow-sm">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-2" title="Number from the uploaded paper">
                        Paper Q#
                      </th>
                      <th className="px-2 py-2">Part</th>
                      <th className="min-w-[200px] px-2 py-2">Question</th>
                      <th className="px-2 py-2">Img</th>
                      <th className="px-2 py-2">Format</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Subject</th>
                      <th className="px-2 py-2">Chapter</th>
                      <th className="px-2 py-2">Difficulty</th>
                      <th className="px-2 py-2">Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={`${i}-${r.question_text.slice(0, 12)}`} className="border-t border-zinc-100">
                        <td className="whitespace-nowrap px-2 py-2 font-mono font-semibold text-zinc-800">
                          {r.source_question_number?.trim() || '—'}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-2 text-zinc-600" title={r.paper_part || ''}>
                          {r.paper_part?.trim() || '—'}
                        </td>
                        <td className="px-2 py-2 text-zinc-800">
                          <MeasuredSnippet
                            text={r.question_text.length > 280 ? `${r.question_text.slice(0, 280)}…` : r.question_text}
                            className="break-words [overflow-wrap:anywhere] leading-snug"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {r.image_url?.trim() ? (
                            <img src={r.image_url.trim()} alt="" className="h-12 w-16 rounded border border-zinc-200 object-cover" />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-zinc-600">{r.question_format || 'text'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.question_type || 'mcq'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.subject_name || '—'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.chapter_name || '—'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.difficulty || '—'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.year || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <PyqPreviewModal
        open={previewModalOpen && previewRows.length > 0}
        onClose={() => setPreviewModalOpen(false)}
        drafts={previewRows}
        sourceLabel={previewSourceLabel}
        saving={saving}
        onCommit={uploadPreviewRows}
      />

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Search & filters</p>
            <p className="text-[11px] text-zinc-400">Narrow batches and the question table below.</p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:bg-zinc-50"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Search</label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Question text or filename…"
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Year</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All years</option>
              {filterOptions.years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Subject</label>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All subjects</option>
              {filterOptions.subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Difficulty</label>
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All</option>
              {filterOptions.difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Format</label>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All formats</option>
              {filterOptions.formats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Exam</label>
            <select
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All exams</option>
              {filterOptions.exams.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Upload batches</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
        {loading && uploadSets.length === 0 ? (
          <p className="text-[12px] text-zinc-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {legacyVisible && (
              <div className="flex flex-col rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-800">Legacy (no batch)</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                    {legacyFilteredCount} Q
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">Rows imported before batch tracking ({legacyCount} total).</p>
              </div>
            )}
            {filteredSets.map((s) => {
              const agg = aggregateForSet(s.id);
              const expanded = expandedSetId === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col rounded-xl border p-4 shadow-sm transition-shadow ${
                    agg.pending ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200 bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900" title={s.original_filename || ''}>
                        {s.original_filename || 'Upload'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                        {agg.count} Q
                      </span>
                      {agg.pending && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                          Unsaved preview
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-600">
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium">Year {agg.yearLabel}</span>
                    {agg.subjects.map((sub) => (
                      <span key={sub} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-900">
                        {sub}
                      </span>
                    ))}
                    {agg.types.map((t) => (
                      <span key={t} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-900">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] uppercase text-zinc-400">Source: {s.source_kind}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedSetId(expanded ? null : s.id)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      {expanded ? 'Hide questions' : 'View questions'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDeleteSet(s.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Delete batch
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-3 max-h-48 overflow-auto rounded-md border border-zinc-100 bg-zinc-50/80 p-2">
                      {questionsForExpanded.length === 0 ? (
                        <p className="text-[10px] text-zinc-500">No matching questions (adjust filters).</p>
                      ) : (
                        <ul className="space-y-1.5 text-[10px] text-zinc-700">
                          {questionsForExpanded.slice(0, 40).map((q) => {
                            const pq = paperQuestionLabelFromMetadata(q.metadata);
                            return (
                              <li key={q.id} className="border-b border-zinc-100/80 pb-1.5 last:border-0">
                                {pq ? (
                                  <span className="mb-0.5 inline-block rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-zinc-800">
                                    Q{pq}
                                  </span>
                                ) : null}
                                <MeasuredSnippet
                                  text={q.question_text}
                                  className="line-clamp-2 break-words [overflow-wrap:anywhere]"
                                />
                                <span className="mt-0.5 block text-zinc-500">
                                  {q.year ?? '—'} · {q.subject_name || '—'} · {q.question_type || '—'}
                                </span>
                              </li>
                            );
                          })}
                          {questionsForExpanded.length > 40 && (
                            <li className="text-zinc-400">+{questionsForExpanded.length - 40} more…</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredSets.length === 0 && !(legacyCount > 0) && (
              <p className="col-span-full py-6 text-center text-sm text-zinc-400">
                No batches match filters.{uploadSets.length === 0 ? ' Upload a file to create one.' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
            All PYQs <span className="font-normal text-zinc-400">({filteredRows.length} shown)</span>
          </p>
        </div>
        {loading ? (
          <p className="text-[12px] text-zinc-500">Loading...</p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Batch</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Paper Q#</th>
                  <th className="px-2 py-1.5">Question</th>
                  <th className="px-2 py-1.5">Subject</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Year</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-zinc-500" title={r.upload_set_id ? setNameById.get(r.upload_set_id) : ''}>
                      {r.upload_set_id ? setNameById.get(r.upload_set_id)?.slice(0, 24) || '—' : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] font-semibold text-zinc-800">
                      {paperQuestionLabelFromMetadata(r.metadata) || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-700">
                      <MeasuredSnippet
                        text={r.question_text.slice(0, 100)}
                        className="break-words [overflow-wrap:anywhere]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.subject_name || '-'}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.question_type || '-'}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.year ?? '-'}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-zinc-400" colSpan={7}>
                      No PYQs match filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PYQManager;
