import { supabase } from '../../supabase/client';
import {
  parseDocxBufferWithEmbeddedImages,
  type DocxEmbeddedImage,
} from '../../utils/docxFigureExtract';
import { buildParseSanityWarning, type ParseSanityWarning } from '../../utils/examQuestionCountHeuristic';
import { extractLocalMcqRowsFromText, type LocalMcqRow } from '../../utils/localMcqExtract';
import { parseCsvMatrix, normalizeCsvHeader } from '../../utils/bankCsvMatrix';

/** Same shape as PYQ CSV/local draft rows; maps into reference_questions + metadata. */
export type BankImportDraft = {
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
  doc_image_index: number | null;
  paper_part: string;
  source_question_number: string;
  import_file_ordinal?: number;
};

export const emptyBankDraft = (): BankImportDraft => ({
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
});

const LEADING_STEM_QNUM = /^(\d{1,4})\s*[.)]\s+/;

export function ensureSourceQuestionNumberFromStem(d: BankImportDraft): BankImportDraft {
  if (d.source_question_number?.trim()) return d;
  const raw = (d.question_text || '').trim();
  if (!raw) return d;
  const htmlStem = /^[\s\uFEFF]*</i.test(raw);
  if (!htmlStem) {
    const m = raw.match(LEADING_STEM_QNUM);
    if (m) {
      const num = m[1];
      const rest = raw.slice(m[0].length).trim();
      if (rest.length > 0) return { ...d, source_question_number: num, question_text: rest };
      return { ...d, source_question_number: num };
    }
    return d;
  }
  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const m2 = plain.match(LEADING_STEM_QNUM);
  if (m2) return { ...d, source_question_number: m2[1] };
  return d;
}

function applySourceQuestionNumbersFromRawText(rows: BankImportDraft[], rawText: string): BankImportDraft[] {
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

export function sortBankDraftsExamOrder(rows: BankImportDraft[]): BankImportDraft[] {
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

export function ensureFigureFormatForEmbeddedImage(d: BankImportDraft): BankImportDraft {
  const iu = d.image_url.trim();
  if (!iu) return d;
  if (iu.startsWith('data:image') || /^https?:\/\//i.test(iu)) {
    const qf = (d.question_format || 'text').toLowerCase();
    if (qf === 'text' || qf === '') return { ...d, question_format: 'figure' };
  }
  return d;
}

export function applyBankMapped(base: BankImportDraft, mapped: Record<string, string>): BankImportDraft {
  return {
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
      ({ A: 0, B: 1, C: 2, D: 3 }[(mapped.correct_answer || mapped.answer || '').toUpperCase() as 'A' | 'B' | 'C' | 'D'] ??
        0),
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
    image_url: (() => {
      const urlPart = (mapped.image_url || mapped.figure_url || '').trim();
      if (urlPart) return urlPart;
      const b64 = (mapped.image_base64 || mapped.image_data || '').replace(/\s+/g, '');
      if (!b64) return '';
      let mime = (mapped.image_mime || mapped.image_type || 'image/png').trim().toLowerCase();
      if (mime && !mime.includes('/')) mime = `image/${mime.replace(/^image\//i, '')}`;
      if (!mime || mime === 'image/') mime = 'image/png';
      return `data:${mime};base64,${b64}`;
    })(),
    doc_image_index: (() => {
      const raw = mapped.doc_image_index ?? mapped.image_index ?? '';
      if (raw === '' || raw == null) return null;
      const n = Number(String(raw));
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    })(),
    paper_part:
      mapped.paper_part || mapped.section || mapped.part || mapped.paper_section || '',
    source_question_number:
      mapped.source_question_number ||
      mapped.exam_question_number ||
      mapped.question_no ||
      mapped.q_no ||
      mapped.question_number ||
      '',
  };
}

function toOptionArray(d: BankImportDraft): string[] {
  return [d.option_a, d.option_b, d.option_c, d.option_d].filter((x) => x.trim().length > 0);
}

function buildRefBankMetadata(d: BankImportDraft): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const part = d.paper_part?.trim();
  if (part) meta.paper_part = part;
  const sq = d.source_question_number?.trim();
  if (sq) meta.source_question_number = sq;
  if (d.year?.trim()) {
    const y = Number(d.year);
    meta.year = Number.isFinite(y) ? y : d.year.trim();
  }
  if (d.source_exam?.trim()) meta.source_exam = d.source_exam.trim();
  if (d.paper_code?.trim()) meta.paper_code = d.paper_code.trim();
  meta.import_pipeline = 'reference_bank_csv_or_local_doc';
  return meta;
}

export function bankDraftToReferenceInsert(
  d: BankImportDraft,
  uploadSetId: string,
  uploadedBy: string | null
): Record<string, unknown> {
  const opts = toOptionArray(d);
  return {
    question_text: d.question_text.trim(),
    options: opts.length ? opts : null,
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
    image_url: d.image_url.trim() || null,
    metadata: buildRefBankMetadata(d),
    reference_upload_set_id: uploadSetId,
    uploaded_by: uploadedBy,
  };
}

export async function ensureReferenceBankImagePublicUrl(
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
    mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? 'jpg'
            : 'png';

  const path = `${uploadSetId}/${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage.from('reference-question-images').upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('reference-question-images').getPublicUrl(path);
  return data.publicUrl;
}

async function parseRefBankDocxBuffer(arrayBuffer: ArrayBuffer): Promise<{ text: string; images: DocxEmbeddedImage[] }> {
  const mammoth = (window as unknown as { mammoth?: { convertToHtml?: unknown; images?: { imgElement?: unknown } } })
    ?.mammoth;
  return parseDocxBufferWithEmbeddedImages(arrayBuffer, mammoth as Parameters<typeof parseDocxBufferWithEmbeddedImages>[1]);
}

function resolveDraftDocImage(d: BankImportDraft, images: DocxEmbeddedImage[]): BankImportDraft {
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

function attachSingleOrphanDocxImage(rows: BankImportDraft[], images: DocxEmbeddedImage[]): BankImportDraft[] {
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
  return rows.map((r, j) => (j === i ? resolveDraftDocImage({ ...r, doc_image_index: 0 }, images) : r));
}

function localMcqRowToBankDraft(r: LocalMcqRow): BankImportDraft {
  const base = emptyBankDraft();
  const ca = (r.correct_answer || 'A').toUpperCase();
  const letter = ca === 'B' || ca === 'C' || ca === 'D' || ca === 'A' ? ca : 'A';
  const correct_index = letter === 'A' ? 0 : letter === 'B' ? 1 : letter === 'C' ? 2 : 3;
  const hasFig = /\bIMAGE_\d+\b/i.test(r.question_text);
  return {
    ...base,
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

async function extractLocalBankSource(file: File): Promise<{ rawText: string; docxImages: DocxEmbeddedImage[] }> {
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
        const parsedDoc = await parseRefBankDocxBuffer(buffer);
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

export async function runLocalReferenceBankExtract(
  file: File
): Promise<{ drafts: BankImportDraft[]; parseSanity: ParseSanityWarning | null }> {
  const { rawText, docxImages } = await extractLocalBankSource(file);
  const rows = extractLocalMcqRowsFromText(rawText);
  let base = rows.map(localMcqRowToBankDraft);
  base = applySourceQuestionNumbersFromRawText(base, rawText);
  let withFigures = base.map((r) => (docxImages.length > 0 ? resolveDraftDocImage(r, docxImages) : r));
  if (docxImages.length > 0) {
    withFigures = attachSingleOrphanDocxImage(withFigures, docxImages);
  }
  const parseSanity = buildParseSanityWarning(rawText, withFigures.length, file.name);
  return { drafts: withFigures, parseSanity };
}

export function parseBankCsvFileText(txt: string): BankImportDraft[] {
  const matrix = parseCsvMatrix(txt);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeCsvHeader);
  const parsed: BankImportDraft[] = [];
  const base = emptyBankDraft();
  for (let r = 1; r < matrix.length; r += 1) {
    const cells = matrix[r];
    const mapped: Record<string, string> = {};
    headers.forEach((h, idx) => {
      mapped[h] = idx < cells.length ? cells[idx] ?? '' : '';
    });
    const d = ensureFigureFormatForEmbeddedImage(
      ensureSourceQuestionNumberFromStem(applyBankMapped(base, mapped))
    );
    if (d.question_text.trim()) parsed.push(d);
  }
  return sortBankDraftsExamOrder(parsed);
}

export function formatRefBankPendingLabel(files: File[]): string {
  if (files.length === 0) return 'import';
  if (files.length === 1) return files[0].name;
  return `${files[0].name} (+${files.length - 1} more)`;
}
