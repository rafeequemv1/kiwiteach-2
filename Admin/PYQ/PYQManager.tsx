import '../../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from '@google/genai';
import { motion } from 'motion/react';
import { assertGeminiApiKey } from '../../config/env';
import { layout, prepare } from '@chenglou/pretext';
import { parsePseudoLatexAndMathAllowTables } from '../../utils/latexParser';
import {
  parseDocxBufferWithEmbeddedImages,
  stripDocxImageTokens,
  type DocxEmbeddedImage,
} from '../../utils/docxFigureExtract';
import { buildParseSanityWarning, type ParseSanityWarning } from '../../utils/examQuestionCountHeuristic';
import { extractLocalMcqRowsFromText, type LocalMcqRow } from '../../utils/localMcqExtract';

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
  ingestion_year?: number | null;
  metadata?: Record<string, unknown> | null;
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
  /** DB row id for React keys in saved-batch paper preview only. */
  previewKey?: string;
};

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
  difficulty: '',
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
  difficulty: mapped.difficulty?.trim() ? String(mapped.difficulty) : '',
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

type PyqParseProgressPayload = {
  fileIndex: number;
  fileTotal: number;
  fileName: string;
  chunkIndex: number;
  chunkTotal: number;
};

const PYQ_DIFFICULTY_FILL_MAX_OUT = 2048;
const PYQ_DIFFICULTY_BATCH = 10;

function getDifficultyFillResponseSchema() {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question_id: { type: Type.STRING },
        difficulty: { type: Type.STRING },
      },
    },
  };
}

function normalizeDifficultyLabel(raw: string): string | null {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'easy' || s === 'e') return 'easy';
  if (s === 'medium' || s === 'med' || s === 'm') return 'medium';
  if (s === 'hard' || s === 'difficult' || s === 'h') return 'hard';
  if (s.includes('easy')) return 'easy';
  if (s.includes('hard')) return 'hard';
  if (s.includes('medium')) return 'medium';
  return null;
}

async function runGeminiFillDifficulties(
  ai: GoogleGenAI,
  modelId: string,
  batch: { id: string; question_text: string; subject_name: string | null; question_type: string | null }[]
): Promise<Map<string, string>> {
  const payload = batch.map((q) => ({
    question_id: q.id,
    question_text: (q.question_text || '').slice(0, 2000),
    subject: q.subject_name || '',
    question_type: q.question_type || '',
  }));
  const userText =
    'For each item, assign exactly one difficulty: easy, medium, or hard (lowercase). ' +
    'Use typical NEET demand: easy = single-concept recall; medium = reasoning or multi-step; hard = lengthy, subtle, or unfamiliar framing. ' +
    'Return one object per input in the same order; question_id must match.\n\n' +
    JSON.stringify(payload);
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    config: {
      temperature: 0,
      maxOutputTokens: PYQ_DIFFICULTY_FILL_MAX_OUT,
      responseMimeType: 'application/json',
      responseSchema: getDifficultyFillResponseSchema(),
    },
  });
  const outText = response.text || '[]';
  let parsed: { question_id?: string; difficulty?: string }[];
  try {
    parsed = JSON.parse(outText.trim()) as { question_id?: string; difficulty?: string }[];
  } catch {
    throw new Error('Gemini returned invalid JSON for difficulty fill.');
  }
  const out = new Map<string, string>();
  if (!Array.isArray(parsed)) return out;
  parsed.forEach((row, idx) => {
    const id = row.question_id?.trim() || batch[idx]?.id;
    const d = normalizeDifficultyLabel(String(row.difficulty || ''));
    if (id && d) out.set(id, d);
  });
  return out;
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

function localMcqRowToPyqDraft(r: LocalMcqRow): Draft {
  const ca = (r.correct_answer || 'A').toUpperCase();
  const letter = ca === 'B' || ca === 'C' || ca === 'D' || ca === 'A' ? ca : 'A';
  const correct_index = letter === 'A' ? 0 : letter === 'B' ? 1 : letter === 'C' ? 2 : 3;
  const hasFig = /\bIMAGE_\d+\b/i.test(r.question_text);
  return {
    ...emptyDraft,
    source_question_number: r.source_question_number,
    question_text: r.question_text,
    option_a: r.option_a,
    option_b: r.option_b,
    option_c: r.option_c,
    option_d: r.option_d,
    correct_answer: letter,
    correct_index,
    explanation: r.explanation,
    doc_image_index: r.doc_image_index,
    question_format: hasFig ? 'figure' : 'text',
  };
}

async function runLocalPyqExtract(file: File): Promise<{ drafts: Draft[]; parseSanity: ParseSanityWarning | null }> {
  const { rawText, docxImages } = await extractLocalPyqSource(file);
  const rows = extractLocalMcqRowsFromText(rawText);
  let base = rows.map(localMcqRowToPyqDraft);
  base = applySourceQuestionNumbersFromRawText(base, rawText);
  let withFigures = base.map((r) => (docxImages.length > 0 ? resolveDraftDocImage(r, docxImages) : r));
  if (docxImages.length > 0) {
    withFigures = attachSingleOrphanDocxImage(withFigures, docxImages);
  }
  const parseSanity = buildParseSanityWarning(rawText, withFigures.length, file.name);
  return { drafts: withFigures, parseSanity };
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

/** Dominant exam year from parsed rows for yearly batch merge; rejects strong multi-year mixes. */
function deriveIngestionYearFromDrafts(drafts: Draft[]): { year: number | null; error?: string } {
  if (!drafts.length) return { year: null, error: 'No questions to upload.' };
  const counts = new Map<number, number>();
  for (const d of drafts) {
    const y = Number(String(d.year || '').trim());
    if (!Number.isFinite(y) || y < 1980 || y > 2100) continue;
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  if (counts.size === 0) {
    return {
      year: null,
      error:
        'Could not determine exam year from these rows. Set the year on each question (or in your CSV) so uploads merge into the correct yearly batch.',
    };
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topYear, topN] = sorted[0];
  if (sorted.length > 1) {
    const [, secondN] = sorted[1];
    if (secondN / drafts.length >= 0.15) {
      return {
        year: null,
        error: `This import mixes multiple years (${sorted
          .slice(0, 3)
          .map(([y]) => y)
          .join(', ')}). Use one year per upload or fix the year field before saving.`,
      };
    }
  }
  return { year: topYear };
}

function pyqRowToDraft(r: PYQRow): Draft {
  const opts = Array.isArray(r.options) ? r.options : [];
  const get = (i: number) => (opts[i] != null ? String(opts[i]) : '');
  const idx = r.correct_index != null ? Math.max(0, Math.min(3, r.correct_index)) : 0;
  const letter = (['A', 'B', 'C', 'D'] as const)[idx];
  const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {};
  return {
    ...emptyDraft,
    question_text: r.question_text || '',
    question_format: r.question_format || 'text',
    option_a: get(0),
    option_b: get(1),
    option_c: get(2),
    option_d: get(3),
    correct_answer: letter,
    correct_index: idx,
    explanation: r.explanation || '',
    question_type: r.question_type || 'mcq',
    difficulty: r.difficulty?.trim() ? r.difficulty : '',
    subject_name: r.subject_name || '',
    chapter_name: r.chapter_name || '',
    topic_tag: r.topic_tag || '',
    class_name: r.class_name || 'NEET',
    year: r.year != null ? String(r.year) : '',
    source_exam: r.source_exam || 'NEET',
    paper_code: r.paper_code || '',
    image_url: r.image_url || '',
    doc_image_index: null,
    paper_part: String(meta.paper_part ?? ''),
    source_question_number: String(meta.source_question_number ?? ''),
    previewKey: r.id,
  };
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
  /** Saved batch preview — hide save, adjust header. */
  readOnly?: boolean;
}> = ({ open, onClose, drafts, sourceLabel, saving, onCommit, readOnly = false }) => {
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
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              {readOnly ? 'Batch paper view' : 'Test paper preview'}
            </p>
            <p className="truncate text-sm font-semibold text-zinc-900" title={sourceLabel || ''}>
              {sourceLabel || 'Parsed questions'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {drafts.length} question{drafts.length === 1 ? '' : 's'} · {figureCount} with figure{figureCount === 1 ? '' : 's'}{' '}
              (LaTeX + tables inline)
              {readOnly ? ' · read-only' : ''}
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
            {!readOnly ? (
              <button
                type="button"
                disabled={saving || drafts.length === 0}
                onClick={() => void onCommit()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save to PYQ bank'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100/80 p-4">
          <div className="mx-auto max-w-[210mm] rounded-sm border-[0.5pt] border-black bg-white shadow-md">
            <div className="border-b-[0.5pt] border-black px-4 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-black">
              {readOnly ? 'Saved batch (preview)' : 'Preview — not saved'}
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
              {drafts.length === 0 ? (
                <p className="py-12 text-center text-[11px] text-zinc-500">
                  {readOnly ? 'No questions in this batch yet.' : 'Nothing to preview.'}
                </p>
              ) : (
                <div className="mt-3 columns-1 gap-8 md:columns-2 md:gap-10">
                  {drafts.map((d, i) => (
                    <PyqPaperQuestion key={d.previewKey || `${i}-${d.question_text.slice(0, 24)}`} draft={d} index={i} />
                  ))}
                </div>
              )}
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
  const [pyqParseProgress, setPyqParseProgress] = useState<PyqParseProgressPayload | null>(null);
  const [pyqParseSanityWarnings, setPyqParseSanityWarnings] = useState<ParseSanityWarning[]>([]);
  const [previewRows, setPreviewRows] = useState<Draft[]>([]);
  const [activeUploadSetId, setActiveUploadSetId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewBulkYear, setPreviewBulkYear] = useState('');
  const [previewBulkSubject, setPreviewBulkSubject] = useState('');
  const [pendingCommit, setPendingCommit] = useState<{ files: File[]; kind: string } | null>(null);
  const [docImportQueue, setDocImportQueue] = useState<File[]>([]);
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
  const [batchPaperPreview, setBatchPaperPreview] = useState<{ setId: string; label: string } | null>(null);
  const [difficultyFillBusySetId, setDifficultyFillBusySetId] = useState<string | null>(null);

  const setNameById = useMemo(() => {
    const m = new Map<string, string>();
    uploadSets.forEach((s) => m.set(s.id, s.original_filename || s.id.slice(0, 8)));
    return m;
  }, [uploadSets]);

  const loadUploadSets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pyq_upload_sets')
      .select('id, created_at, original_filename, source_kind, uploaded_by, ingestion_year, metadata')
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
    const fileTotal = docImportQueue.length;
    setParsingDoc(true);
    setPyqParseProgress(null);
    setPyqParseSanityWarnings([]);
    const combined: Draft[] = [];
    const sanityCollected: ParseSanityWarning[] = [];
    try {
      let fileOrd = 0;
      for (let fi = 0; fi < docImportQueue.length; fi++) {
        const file = docImportQueue[fi];
        setPyqParseProgress({
          fileIndex: fi + 1,
          fileTotal,
          fileName: file.name,
          chunkIndex: 1,
          chunkTotal: 1,
        });
        const { drafts, parseSanity } = await runLocalPyqExtract(file);
        if (parseSanity) sanityCollected.push(parseSanity);
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
      setPreviewRows(sortDraftsExamOrder(combined));
      setPyqParseSanityWarnings(sanityCollected);
    } catch (e: any) {
      alert(e?.message || 'Failed to parse documents');
    } finally {
      setParsingDoc(false);
      setPyqParseProgress(null);
    }
  }, [docImportQueue]);

  const fillBlankDifficultiesForBatch = useCallback(
    async (setId: string) => {
      const subset = rows.filter((r) => r.upload_set_id === setId && !(r.difficulty && String(r.difficulty).trim()));
      if (subset.length === 0) {
        alert('No questions with blank difficulty in this batch.');
        return;
      }
      try {
        assertGeminiApiKey();
      } catch (e: any) {
        alert(e?.message || 'Set your Gemini API key in environment config.');
        return;
      }
      if (!confirm(`Fill difficulty for ${subset.length} question(s) using Gemini (${pyqGeminiModel})? This will use your API quota.`)) {
        return;
      }
      setDifficultyFillBusySetId(setId);
      try {
        const ai = new GoogleGenAI({ apiKey: assertGeminiApiKey() });
        let updated = 0;
        for (let i = 0; i < subset.length; i += PYQ_DIFFICULTY_BATCH) {
          const chunk = subset.slice(i, i + PYQ_DIFFICULTY_BATCH);
          const maps = await runGeminiFillDifficulties(ai, pyqGeminiModel, chunk);
          for (const r of chunk) {
            const d = maps.get(r.id);
            if (!d) continue;
            const { error } = await supabase.from('pyq_questions_neet').update({ difficulty: d }).eq('id', r.id);
            if (!error) updated += 1;
          }
        }
        await load();
        alert(updated ? `Updated difficulty for ${updated} question(s).` : 'No rows updated (check API response).');
      } catch (e: any) {
        alert(e?.message || 'Difficulty fill failed');
      } finally {
        setDifficultyFillBusySetId(null);
      }
    },
    [rows, pyqGeminiModel]
  );

  /** One Supabase row per exam year; reuses existing row so separate uploads merge into the same batch. */
  const resolveYearUploadSet = useCallback(
    async (year: number, sourceKind: string, sourceLabel: string): Promise<string | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const { data: hit, error: selErr } = await supabase
        .from('pyq_upload_sets')
        .select('id')
        .eq('ingestion_year', year)
        .maybeSingle();
      if (selErr) {
        alert(selErr.message);
        return null;
      }
      if (hit?.id) {
        await loadUploadSets();
        return hit.id as string;
      }
      const displayName = `NEET PYQ ${year}`;
      const { data: inserted, error } = await supabase
        .from('pyq_upload_sets')
        .insert({
          original_filename: displayName.slice(0, 500),
          source_kind: sourceKind,
          uploaded_by: userId,
          ingestion_year: year,
          metadata: { last_import_label: sourceLabel.slice(0, 500) },
        })
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          const { data: retry } = await supabase
            .from('pyq_upload_sets')
            .select('id')
            .eq('ingestion_year', year)
            .maybeSingle();
          if (retry?.id) {
            await loadUploadSets();
            return retry.id as string;
          }
        }
        alert(error.message);
        return null;
      }
      await loadUploadSets();
      return inserted!.id as string;
    },
    [loadUploadSets]
  );

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
        setPyqParseSanityWarnings([]);
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
    setPyqParseSanityWarnings([]);
    setPreviewRows(sortDraftsExamOrder(parsed));
  };

  const uploadPreviewRows = async () => {
    if (previewRows.length === 0) {
      alert('Nothing to upload.');
      return;
    }
    setSaving(true);
    try {
      const derived = deriveIngestionYearFromDrafts(previewRows);
      if (derived.error) {
        alert(derived.error);
        return;
      }
      const year = derived.year!;
      const sourceKind = pendingCommit?.kind || 'doc';
      const importLabelForSlug =
        pendingCommit?.files?.length
          ? formatPendingCommitLabel(pendingCommit.files)
          : previewSourceLabel || `PYQ ${year}`;
      const slugBase = (`${year}-${importLabelForSlug}` || 'pyq-import').replace(/[^\w.\-]+/g, '_').slice(0, 60);

      const setId = await resolveYearUploadSet(year, sourceKind, importLabelForSlug);
      if (!setId) return;
      setPendingCommit(null);
      setActiveUploadSetId(null);

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
      setPreviewBulkYear('');
      setPreviewBulkSubject('');
      setPyqParseSanityWarnings([]);
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
    setPreviewBulkYear('');
    setPreviewBulkSubject('');
    setPyqParseSanityWarnings([]);
    setActiveUploadSetId(null);
    setPendingCommit(null);
    setDocImportQueue([]);
    setPreviewModalOpen(false);
  };

  const applyPreviewBulkMeta = useCallback(() => {
    setPreviewRows((prev) =>
      prev.map((r) => ({
        ...r,
        ...(previewBulkYear.trim() ? { year: previewBulkYear.trim() } : {}),
        ...(previewBulkSubject.trim() ? { subject_name: previewBulkSubject.trim() } : {}),
      }))
    );
  }, [previewBulkYear, previewBulkSubject]);

  const previewIngestionDerive = useMemo(
    () => (previewRows.length === 0 ? { year: null as number | null, error: undefined as string | undefined } : deriveIngestionYearFromDrafts(previewRows)),
    [previewRows]
  );

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
    uploadSets.forEach((s) => {
      if (s.ingestion_year != null) years.add(s.ingestion_year);
    });
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
  }, [rows, uploadSets, previewRows]);

  const countsBySet = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r.upload_set_id) m.set(r.upload_set_id, (m.get(r.upload_set_id) || 0) + 1);
    });
    return m;
  }, [rows]);

  const aggregateForSet = useCallback(
    (setId: string) => {
      const uploadSet = uploadSets.find((s) => s.id === setId);
      const bucketYear = uploadSet?.ingestion_year;
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
      const yLabelFromRows =
        years.length === 0 ? '—' : years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
      const yLabel = bucketYear != null ? String(bucketYear) : yLabelFromRows;
      return {
        count: setId === activeUploadSetId && previewRows.length > 0 ? previewRows.length : countsBySet.get(setId) || 0,
        yearLabel: yLabel,
        subjects: Array.from(subjects).slice(0, 4),
        types: Array.from(types).slice(0, 4),
        pending: setId === activeUploadSetId && previewRows.length > 0 && countsBySet.get(setId) === 0,
      };
    },
    [rows, uploadSets, activeUploadSetId, previewRows, countsBySet]
  );

  const setMatchesFilters = useCallback(
    (setId: string) => {
      const qs = rows.filter((r) => r.upload_set_id === setId);
      const prev = setId === activeUploadSetId ? previewRows : [];
      const uploadSet = uploadSets.find((s) => s.id === setId);
      const ingestY = uploadSet?.ingestion_year;
      if (qs.length === 0 && prev.length === 0) return !searchQuery && !filterYear && !filterSubject && !filterType && !filterDifficulty && !filterFormat && !filterExam;
      const anyRow =
        qs.some((r) => rowMatchesFilters(r)) ||
        prev.some((d) => draftMatchesFilters(d)) ||
        (filterYear &&
          ingestY != null &&
          String(ingestY) === filterYear &&
          qs.some((r) => rowMatchesFilters({ ...r, year: r.year ?? ingestY })));
      const name = (setNameById.get(setId) || '').toLowerCase();
      const searchOk = !searchQuery.trim() || name.includes(searchQuery.trim().toLowerCase()) || anyRow;
      return searchOk && (qs.length + prev.length === 0 || anyRow);
    },
    [rows, uploadSets, activeUploadSetId, previewRows, rowMatchesFilters, draftMatchesFilters, searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam, setNameById]
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

  const batchPreviewDrafts = useMemo(() => {
    if (!batchPaperPreview) return [];
    const list = rows.filter((r) => r.upload_set_id === batchPaperPreview.setId);
    return sortDraftsExamOrder(list.map(pyqRowToDraft));
  }, [rows, batchPaperPreview]);

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
      '',
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
          For documents: add files and <strong>Parse all locally</strong> (no AI on import). Set <strong>year</strong> (e.g. 2025) before save; multi-part papers use{' '}
          <strong>paper_part</strong> and <strong>source_question_number</strong>. Then <strong>Save to bank</strong>. Imports merge into{' '}
          <strong>one batch per exam year</strong>. Difficulty stays blank unless you add it in CSV or use <strong>Fill blank difficulties</strong> (Gemini) on a batch.
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
                  Add one or more files and parse <strong>locally</strong> (no AI during import). Expects numbered MCQs, four options as (A)–(D) or
                  (1)–(4), and an answer line. Figures from DOCX use IMAGE_N placeholders. After saving, you can fill blank difficulties with Gemini
                  from an upload batch’s question list.
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
                <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-2 text-[10px] leading-snug text-zinc-600">
                  <span>
                    <span className="font-semibold text-zinc-800">Local extract:</span> no API cost. Difficulty is left blank by default. Year and
                    subject are often missing—use <strong>Year & subject</strong> below the preview (or table cells) before <strong>Save to bank</strong>.
                    After upload, open a batch and use <strong>Fill blank difficulties</strong> (Gemini) if needed.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={parsingDoc || docImportQueue.length === 0}
                  onClick={() => void parseAllQueuedDocs()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {parsingDoc ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                      Parsing locally…
                    </>
                  ) : (
                    <>
                      <iconify-icon icon="mdi:file-document-outline" width="18" />
                      Parse all locally
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

            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3">
              <p className="text-[11px] font-semibold text-indigo-900">Year & subject</p>
              <p className="mt-0.5 text-[10px] leading-snug text-indigo-900/75">
                Saving requires a consistent <strong>exam year</strong> on the rows (yearly batch). Set values here and apply to every row, or edit
                the table cells below.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Exam year</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 2024"
                    value={previewBulkYear}
                    onChange={(e) => setPreviewBulkYear(e.target.value)}
                    className="w-[88px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
                  />
                </label>
                <label className="flex min-w-[140px] flex-1 flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Subject (optional)</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. Physics"
                    value={previewBulkSubject}
                    onChange={(e) => setPreviewBulkSubject(e.target.value)}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => applyPreviewBulkMeta()}
                  disabled={
                    !previewBulkYear.trim() && !previewBulkSubject.trim()
                  }
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-800 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
                >
                  Apply to all rows
                </button>
              </div>
              {previewIngestionDerive.error ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1.5 text-[10px] leading-snug text-amber-950">
                  {previewIngestionDerive.error}
                </p>
              ) : null}
            </div>

            {pyqParseSanityWarnings.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-[12px] leading-snug text-amber-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-amber-900">Count sanity check</p>
                    <p className="mt-1 text-amber-900/90">
                      Plain-text scan suggests more numbered stems than were extracted. Some questions may be missing — verify the paper layout or split
                      the file.
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-amber-900/85">
                      {pyqParseSanityWarnings.map((w, i) => (
                        <li key={`${w.fileLabel}-${i}`}>
                          <span className="font-medium">{w.fileLabel}</span>: ~{w.heuristicCount} lines look like question starts, extracted{' '}
                          {w.extractedCount}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPyqParseSanityWarnings([])}
                    className="shrink-0 text-[11px] font-semibold text-amber-800 underline decoration-amber-300 hover:text-amber-950"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

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
                        <td className="px-2 py-1 align-top">
                          <input
                            value={r.subject_name}
                            onChange={(e) =>
                              setPreviewRows((rows) => {
                                const next = [...rows];
                                next[i] = { ...next[i], subject_name: e.target.value };
                                return next;
                              })
                            }
                            aria-label={`Subject row ${i + 1}`}
                            className="w-full min-w-[5rem] max-w-[7.5rem] rounded border border-zinc-200 bg-white px-1 py-1 text-[11px] text-zinc-800 outline-none focus:border-indigo-400"
                          />
                        </td>
                        <td className="px-2 py-2 text-zinc-600">{r.chapter_name || '—'}</td>
                        <td className="px-2 py-2 text-zinc-600">{r.difficulty || '—'}</td>
                        <td className="px-2 py-1 align-top">
                          <input
                            value={r.year}
                            onChange={(e) =>
                              setPreviewRows((rows) => {
                                const next = [...rows];
                                next[i] = { ...next[i], year: e.target.value };
                                return next;
                              })
                            }
                            inputMode="numeric"
                            aria-label={`Exam year row ${i + 1}`}
                            className="w-[3.75rem] rounded border border-zinc-200 bg-white px-1 py-1 text-[11px] text-zinc-800 outline-none focus:border-indigo-400"
                          />
                        </td>
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

      <PyqPreviewModal
        open={batchPaperPreview != null}
        onClose={() => setBatchPaperPreview(null)}
        drafts={batchPreviewDrafts}
        sourceLabel={batchPaperPreview?.label ?? null}
        saving={false}
        onCommit={() => {}}
        readOnly
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
              const blankDifficultyCount = rows.filter(
                (r) => r.upload_set_id === s.id && !(r.difficulty && String(r.difficulty).trim())
              ).length;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col rounded-xl border p-4 shadow-sm transition-shadow ${
                    agg.pending ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200 bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-zinc-900"
                        title={s.ingestion_year != null ? `Year ${s.ingestion_year}` : s.original_filename || ''}
                      >
                        {s.ingestion_year != null ? `Year ${s.ingestion_year}` : s.original_filename || 'Upload'}
                      </p>
                      {s.ingestion_year != null && s.original_filename ? (
                        <p className="mt-0.5 truncate text-[10px] text-zinc-500" title={s.original_filename}>
                          {s.original_filename}
                        </p>
                      ) : null}
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
                      onClick={() =>
                        setBatchPaperPreview({
                          setId: s.id,
                          label:
                            s.ingestion_year != null
                              ? `Year ${s.ingestion_year}${s.original_filename ? ` · ${s.original_filename}` : ''}`
                              : s.original_filename || 'PYQ batch',
                        })
                      }
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      Preview paper
                    </button>
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
                    <>
                      <div className="mt-3 flex flex-col gap-2 rounded-md border border-violet-100 bg-violet-50/40 p-2.5 sm:flex-row sm:flex-wrap sm:items-end">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Gemini model</span>
                          <select
                            value={pyqGeminiModel}
                            onChange={(e) => setPyqGeminiModel(e.target.value)}
                            disabled={difficultyFillBusySetId === s.id}
                            className="min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-900 outline-none focus:border-violet-400 disabled:opacity-60"
                          >
                            {PYQ_GEMINI_MODEL_OPTIONS.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={difficultyFillBusySetId === s.id || blankDifficultyCount === 0}
                          onClick={() => void fillBlankDifficultiesForBatch(s.id)}
                          className="rounded-lg border border-violet-300 bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                        >
                          {difficultyFillBusySetId === s.id
                            ? 'Filling…'
                            : `Fill blank difficulties${blankDifficultyCount ? ` (${blankDifficultyCount})` : ''}`}
                        </button>
                        <p className="w-full text-[10px] leading-snug text-zinc-600">
                          Sets <strong>easy</strong> / <strong>medium</strong> / <strong>hard</strong> only for rows with no difficulty. Requires Gemini API key.
                        </p>
                      </div>
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
                                  {q.year ?? '—'} · {q.subject_name || '—'} · {q.question_type || '—'} · diff: {q.difficulty?.trim() || '—'}
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
                    </>
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

      {parsingDoc ? (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-label="Parsing documents locally"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span
                className="mt-0.5 h-11 w-11 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  Parsing locally
                </p>
                <p className="mt-1 break-words text-[13px] leading-snug text-zinc-600">
                  {pyqParseProgress ? (
                    <>
                      File <span className="font-mono font-semibold text-indigo-700">{pyqParseProgress.fileIndex}</span> of{' '}
                      <span className="font-mono">{pyqParseProgress.fileTotal}</span>
                      <span className="mt-0.5 block truncate text-zinc-500" title={pyqParseProgress.fileName}>
                        {pyqParseProgress.fileName}
                      </span>
                      <span className="mt-1 block text-[12px] text-zinc-500">
                        Segment{' '}
                        <span className="font-mono font-medium text-zinc-800">
                          {pyqParseProgress.chunkIndex}/{pyqParseProgress.chunkTotal}
                        </span>{' '}
                        {pyqParseProgress.chunkTotal > 1 ? '(this file is split for reliability)' : ''}
                      </span>
                    </>
                  ) : (
                    'Preparing documents…'
                  )}
                </p>
              </div>
            </div>
            <div className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <motion.div
                className="absolute top-0 h-full w-[36%] rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                initial={{ left: '-36%' }}
                animate={{ left: ['-36%', '100%'] }}
                transition={{ duration: 2.1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
            <p className="mt-4 text-center text-[11px] text-zinc-500">Keep this tab open. Large papers can take several minutes.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PYQManager;
