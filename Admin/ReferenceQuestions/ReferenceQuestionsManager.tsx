import '../../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import { Type } from '@google/genai';
import { adminGeminiGenerateContent } from '../../services/adminGeminiProxy';
import { layout, prepare } from '@chenglou/pretext';
import {
  parseDocxBufferWithEmbeddedImages,
  stripDocxImageTokens,
  type DocxEmbeddedImage,
} from '../../utils/docxFigureExtract';
import { buildParseSanityWarning, type ParseSanityWarning } from '../../utils/examQuestionCountHeuristic';
import { correctLetterToIndex, extractLocalMcqRowsFromText, type LocalMcqRow } from '../../utils/localMcqExtract';
import ReferenceBankImportPanel from './ReferenceBankImportPanel';

declare const mammoth: any;

type SetRow = {
  id: string;
  created_at: string;
  updated_at?: string;
  doc_path: string;
  original_filename: string;
  uploaded_by: string | null;
  ai_status: string;
  ai_error: string | null;
  preview_questions: Draft[] | null;
  committed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type RefRow = {
  id: string;
  created_at: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  question_format?: string | null;
  difficulty: string | null;
  class_name: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  image_url: string | null;
  reference_set_id?: string | null;
  reference_upload_set_id?: string | null;
  metadata: Record<string, unknown> | null;
};

type Draft = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  question_type: string;
  question_format: string;
  difficulty: string;
  class_name: string;
  subject_name: string;
  chapter_name: string;
  topic_tag: string;
  image_index?: number | null;
  import_file_ordinal?: number;
  /** Printed question number from the source (e.g. 1, 09, 101, 4a). Used for ordering and preview. */
  source_question_number?: string;
};

type GeminiDocRow = Partial<Draft>;

function getAdditionalDocPaths(meta: Record<string, unknown> | null): string[] {
  const raw = meta?.additional_doc_paths;
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string' && p.length > 0) : [];
}

function allDocPaths(set: SetRow): string[] {
  return [set.doc_path, ...getAdditionalDocPaths(set.metadata)];
}

function formatRefPendingLabel(files: File[]): string {
  if (files.length === 0) return 'import';
  if (files.length === 1) return files[0].name;
  return `${files[0].name} (+${files.length - 1} more)`;
}

function cleanJson(txt: string) {
  return txt
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function safeInt(v: unknown, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(String(v ?? ''));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function attachSingleOrphanRefImage(rows: Draft[], images: DocxEmbeddedImage[]): Draft[] {
  if (images.length !== 1) return rows;
  const unbound: number[] = [];
  rows.forEach((r, i) => {
    const idxOk = r.image_index != null && r.image_index >= 0;
    if (!idxOk) unbound.push(i);
  });
  if (unbound.length !== 1) return rows;
  const i = unbound[0];
  return rows.map((r, j) => (j === i ? { ...r, image_index: 0 } : r));
}

/** Smaller chunks → smaller JSON per response → fewer truncated / dropped rows on 100–200 Q papers. */
const REF_SOURCE_CHUNK_CHARS = 10_000;
const REF_SOURCE_CHUNK_OVERLAP = 5_000;
const REF_GEMINI_MAX_OUTPUT_TOKENS = 65_536;

function splitRefSourceIntoChunks(full: string): string[] {
  const target = REF_SOURCE_CHUNK_CHARS;
  const overlap = REF_SOURCE_CHUNK_OVERLAP;
  if (full.length <= target) return [full];
  const chunks: string[] = [];
  let start = 0;
  let guard = 0;
  while (start < full.length && guard < 400) {
    guard += 1;
    let end = Math.min(start + target, full.length);
    if (end < full.length) {
      const slice = full.slice(start, end);
      let breakAt = slice.lastIndexOf('\n\n');
      if (breakAt < target * 0.38) breakAt = slice.lastIndexOf('\n');
      if (breakAt >= target * 0.32) end = start + breakAt + 1;
    }
    chunks.push(full.slice(start, end));
    if (end >= full.length) break;
    let nextStart = end - overlap;
    if (nextStart <= start) nextStart = end;
    start = nextStart;
  }
  return chunks.length ? chunks : [full];
}

function mergeRefChunkDrafts(parts: Draft[][]): Draft[] {
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const part of parts) {
    for (const d of part) {
      const sq = (d.source_question_number || '').trim().toLowerCase();
      const stem = stripDocxImageTokens(d.question_text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
        .toLowerCase();
      const opts = (d.options || [])
        .map((o) => stripDocxImageTokens(o).replace(/\s+/g, ' ').trim().slice(0, 72))
        .join('|');
      const key = `${sq}\t${stem}::${opts}`;
      if (!stem) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function buildRefGeminiUserPrompt(
  fileName: string,
  docText: string,
  segment?: { index: number; total: number }
): string {
  const segIntro =
    segment && segment.total > 1
      ? `SEGMENT ${segment.index} of ${segment.total} (same file split for length). ` +
        `Extract every question whose stem STARTS in this segment. ` +
        `Do not repeat questions from earlier segments. ` +
        `Do not skip any question that starts here.\n\n`
      : '';
  return (
    segIntro +
    `You are converting Mathpix-exported questions into strict JSON.\n\n` +
    `CRITICAL — completeness: extract every question in the document (or this segment). Never omit, merge, or summarize items. ` +
    `The output array length must match the number of distinct scored items in the source (within this segment if segmented).\n\n` +
    `CRITICAL — verbatim text: copy question_text and each option string character-for-character from the source ` +
    `(same spelling, punctuation, math/LaTeX, units). Do not rephrase, fix typos, simplify, or normalize whitespace. ` +
    `The only allowed edit is removing IMAGE_N tokens from text fields (figures use image_index).\n\n` +
    `Return ONLY valid JSON (no markdown) as an array of objects with:\n` +
    `- source_question_number (string, REQUIRED): the printed question number exactly as in the source (e.g. 1, 09, 101, 4a, 12(i)). Never renumber by extraction order; papers may start at 101 or 180.\n` +
    `- question_text (string)\n` +
    `- options (array of 4 strings if MCQ; otherwise empty array)\n` +
    `- correct_index (0-3 for MCQ; 0 if unknown)\n` +
    `- explanation (string; empty allowed)\n` +
    `- question_type (mcq|reasoning|matching|statements)\n` +
    `- question_format (text|with_figure|table|multi_part)\n` +
    `- difficulty (Easy|Medium|Hard)\n` +
    `- class_name, subject_name, chapter_name, topic_tag (strings; infer when possible; empty allowed)\n` +
    `- image_index (integer or null): 0-based index matching IMAGE_N in SOURCE TEXT when the item uses that figure; otherwise null\n\n` +
    `Figures: SOURCE TEXT contains lines IMAGE_0, IMAGE_1, … for embedded pictures — these tokens ARE visible. ` +
    `Set image_index to that integer when the question uses the diagram; use null if no figure. ` +
    `Do not paste IMAGE_N into question_text or options.\n\n` +
    `If options are labeled A/B/C/D, map to array in that order.\n` +
    `Do not hallucinate keys; use correct_index=0 if unknown.\n\n` +
    `Source filename: ${fileName}\n\nSOURCE TEXT:\n${docText}`
  );
}

const REF_GEMINI_FIXED_PROMPT_CHARS = buildRefGeminiUserPrompt('', '').length;

/** USD → INR for UI estimates only. */
const REF_USD_INR = 87;

const REF_MODEL_STORAGE_KEY = 'kiwiteach_reference_gemini_model';

type RefGeminiModelOption = {
  id: string;
  label: string;
  blurb: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  bestValue: boolean;
};

const REF_GEMINI_MODEL_OPTIONS: RefGeminiModelOption[] = [
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro (preview)',
    blurb: 'Best for 100–200 questions — fewest skipped items (higher cost)',
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
    bestValue: false,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (preview)',
    blurb: 'Faster; may miss a few items on very long papers vs Pro',
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
    bestValue: false,
  },
  {
    id: 'gemini-flash-lite-latest',
    label: 'Gemini Flash Lite',
    blurb: 'Lowest cost — OK for short sets; not ideal for 150+ questions',
    inputUsdPer1M: 0.05,
    outputUsdPer1M: 0.2,
    bestValue: true,
  },
];

function estimateSingleRefParseInr(
  sourceChars: number,
  fileNameLen: number,
  model: Pick<RefGeminiModelOption, 'inputUsdPer1M' | 'outputUsdPer1M'>,
  usdInr: number
) {
  const chunkCalls = Math.max(1, Math.ceil(sourceChars / REF_SOURCE_CHUNK_CHARS));
  const charsPerCall = Math.ceil(sourceChars / chunkCalls);
  const inputTok = Math.ceil((REF_GEMINI_FIXED_PROMPT_CHARS + fileNameLen + charsPerCall) / 4);
  const outputTok = Math.min(REF_GEMINI_MAX_OUTPUT_TOKENS, Math.max(800, Math.ceil(inputTok * 0.18)));
  const usdPerCall =
    (inputTok / 1e6) * model.inputUsdPer1M + (outputTok / 1e6) * model.outputUsdPer1M;
  return { inr: usdPerCall * chunkCalls * usdInr, inputTok, outputTok };
}

async function getDocCharCountForEstimate(file: File): Promise<number> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.txt')) return (await file.text()).length;
  const m = (window as any)?.mammoth;
  if (!m?.extractRawText) return 0;
  const buf = await file.arrayBuffer();
  const out = await m.extractRawText({ arrayBuffer: buf });
  return (out.value || '').length;
}

async function downloadRefDocPath(path: string): Promise<ArrayBuffer> {
  const { data, error: e } = await supabase.storage.from('reference-question-docs').download(path);
  if (e) throw e;
  return await data.arrayBuffer();
}

function normalizeGeminiDraft(r: GeminiDocRow): Draft {
  const opts = Array.isArray(r.options) ? r.options.map((x) => stripDocxImageTokens(String(x))) : [];
  const sqRaw = (r as GeminiDocRow & { source_question_number?: unknown }).source_question_number;
  const source_question_number =
    sqRaw == null || sqRaw === '' ? '' : String(sqRaw).trim();
  return {
    source_question_number,
    question_text: stripDocxImageTokens(String(r.question_text ?? '')),
    options: opts,
    correct_index: Math.max(0, Math.min(3, safeInt((r as any).correct_index, 0))),
    explanation: String(r.explanation || '').trim(),
    question_type: String(r.question_type || 'mcq').trim().toLowerCase(),
    question_format: String(r.question_format || 'text').trim().toLowerCase() || 'text',
    difficulty: String(r.difficulty || 'Medium').trim(),
    class_name: String(r.class_name || '').trim(),
    subject_name: String(r.subject_name || '').trim(),
    chapter_name: String(r.chapter_name || '').trim(),
    topic_tag: String(r.topic_tag || '').trim(),
    image_index: (() => {
      const v = r.image_index;
      if (v == null || String(v) === '' || Number(v) === -1) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    })(),
  };
}

function refDraftFromLocalRow(r: LocalMcqRow): Draft {
  return normalizeGeminiDraft({
    source_question_number: r.source_question_number,
    question_text: r.question_text,
    options: [r.option_a, r.option_b, r.option_c, r.option_d],
    correct_index: correctLetterToIndex(r.correct_answer),
    explanation: r.explanation,
    question_type: 'mcq',
    question_format: /\bIMAGE_\d+\b/i.test(r.question_text) ? 'figure' : 'text',
    difficulty: 'Medium',
    image_index: r.doc_image_index,
  });
}

async function runRefLocalOnBuffer(
  buf: ArrayBuffer,
  displayName: string
): Promise<{ drafts: Draft[]; imageCount: number; parseSanity: ParseSanityWarning | null }> {
  const { text, images } = await parseDocxBufferWithEmbeddedImages(buf, mammoth);
  if (!text.trim()) throw new Error(`No text extracted from ${displayName}`);
  const rows = extractLocalMcqRowsFromText(text);
  let drafts = rows.map(refDraftFromLocalRow);
  drafts = attachSingleOrphanRefImage(drafts, images);
  const parseSanity = buildParseSanityWarning(text, drafts.length, displayName);
  return { drafts, imageCount: images.length, parseSanity };
}

function getRefGeminiResponseSchema() {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        source_question_number: { type: Type.STRING },
        question_text: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correct_index: { type: Type.NUMBER },
        explanation: { type: Type.STRING },
        question_type: { type: Type.STRING },
        question_format: { type: Type.STRING },
        difficulty: { type: Type.STRING },
        class_name: { type: Type.STRING },
        subject_name: { type: Type.STRING },
        chapter_name: { type: Type.STRING },
        topic_tag: { type: Type.STRING },
        image_index: { type: Type.NUMBER },
      },
      required: [
        'source_question_number',
        'question_text',
        'options',
        'correct_index',
        'explanation',
        'question_type',
        'difficulty',
      ],
    },
  };
}

async function runGeminiExtractOneChunk(
  fileName: string,
  modelId: string,
  chunkText: string,
  segment: { index: number; total: number } | undefined
): Promise<Draft[]> {
  const prompt = buildRefGeminiUserPrompt(fileName, chunkText, segment);
  const response = await adminGeminiGenerateContent({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0,
      maxOutputTokens: REF_GEMINI_MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: getRefGeminiResponseSchema(),
    },
  });
  const raw = cleanJson(response.text || '[]');
  const parsed = JSON.parse(raw) as GeminiDocRow[];
  return (Array.isArray(parsed) ? parsed : [])
    .map(normalizeGeminiDraft)
    .filter((x) => stripDocxImageTokens(x.question_text).replace(/\s/g, '').length > 0);
}

async function runGeminiExtract(docText: string, fileName: string, modelId: string): Promise<Draft[]> {
  const chunks = splitRefSourceIntoChunks(docText);
  if (chunks.length === 1) {
    return runGeminiExtractOneChunk(fileName, modelId, chunks[0], undefined);
  }
  const parts: Draft[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    const piece = await runGeminiExtractOneChunk(fileName, modelId, chunks[i], {
      index: i + 1,
      total: chunks.length,
    });
    parts.push(piece);
  }
  return mergeRefChunkDrafts(parts);
}

function ensureRefSourceQuestionNumberFromStem(d: Draft): Draft {
  if ((d.source_question_number || '').trim()) return d;
  const plain = (d.question_text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length < 2) return d;
  const m = plain.match(/^(\d{1,4})\s*[.)]\s/);
  if (m) return { ...d, source_question_number: m[1] };
  return d;
}

function finalizeReferenceDrafts(rows: Draft[]): Draft[] {
  const withNums = rows.map(ensureRefSourceQuestionNumberFromStem);
  return [...withNums]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const oa = a.r.import_file_ordinal;
      const ob = b.r.import_file_ordinal;
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      const sa = (a.r.source_question_number || '').trim();
      const sb = (b.r.source_question_number || '').trim();
      if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
      return a.i - b.i;
    })
    .map(({ r }) => r);
}

async function runRefGeminiOnBuffer(
  buf: ArrayBuffer,
  displayName: string,
  modelId: string
): Promise<{ drafts: Draft[]; imageCount: number; parseSanity: ParseSanityWarning | null }> {
  const { text, images } = await parseDocxBufferWithEmbeddedImages(buf, mammoth);
  if (!text.trim()) throw new Error(`No text extracted from ${displayName}`);
  let drafts = await runGeminiExtract(text, displayName, modelId);
  drafts = attachSingleOrphanRefImage(drafts, images);
  const parseSanity = buildParseSanityWarning(text, drafts.length, displayName);
  return { drafts, imageCount: images.length, parseSanity };
}

async function runRefGeminiOnDocPaths(
  paths: string[],
  modelId: string
): Promise<{ drafts: Draft[]; parseSanityWarnings: ParseSanityWarning[] }> {
  let offset = 0;
  const combined: Draft[] = [];
  const parseSanityWarnings: ParseSanityWarning[] = [];
  let fileOrd = 0;
  for (const pth of paths) {
    const displayName = pth.split('/').pop() || pth;
    const buf = await downloadRefDocPath(pth);
    const { drafts, imageCount, parseSanity } = await runRefGeminiOnBuffer(buf, displayName, modelId);
    if (parseSanity) parseSanityWarnings.push(parseSanity);
    for (const d of drafts) {
      combined.push({
        ...d,
        image_index: d.image_index == null ? null : d.image_index + offset,
        import_file_ordinal: fileOrd,
      });
    }
    offset += imageCount;
    fileOrd += 1;
  }
  return { drafts: finalizeReferenceDrafts(combined), parseSanityWarnings };
}

function toPublicUrl(path: string) {
  const { data } = supabase.storage.from('reference-question-images').getPublicUrl(path);
  return data.publicUrl;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\- ()\[\]]+/g, '_').slice(0, 180) || 'document.docx';
}

const MeasuredSnippet: React.FC<{
  text: string;
  className?: string;
  font?: string;
  lineHeight?: number;
}> = ({ text, className, font = '12px Inter, system-ui, sans-serif', lineHeight = 17 }) => {
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

const ReferenceQuestionsManager: React.FC = () => {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [rows, setRows] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<SetRow | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [analyzingSetId, setAnalyzingSetId] = useState<string | null>(null);
  const [committingSetId, setCommittingSetId] = useState<string | null>(null);

  const [docImportQueue, setDocImportQueue] = useState<File[]>([]);
  const [docQueueStats, setDocQueueStats] = useState<{ name: string; chars: number }[]>([]);
  const [docQueueScanning, setDocQueueScanning] = useState(false);
  const [stagedPreview, setStagedPreview] = useState<Draft[]>([]);
  const [refParseSanityWarnings, setRefParseSanityWarnings] = useState<ParseSanityWarning[]>([]);
  const [pendingPublishFiles, setPendingPublishFiles] = useState<File[] | null>(null);
  const [bankPanelResetSignal, setBankPanelResetSignal] = useState(0);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const [refImportParser, setRefImportParser] = useState<'gemini' | 'local'>('gemini');
  const [refGeminiModel, setRefGeminiModel] = useState<string>(() => {
    try {
      const s = localStorage.getItem(REF_MODEL_STORAGE_KEY);
      if (s && REF_GEMINI_MODEL_OPTIONS.some((m) => m.id === s)) return s;
    } catch {
      /* ignore */
    }
    const pro = REF_GEMINI_MODEL_OPTIONS.find((m) => m.id === 'gemini-3-pro-preview');
    return pro?.id ?? REF_GEMINI_MODEL_OPTIONS[0].id;
  });

  useEffect(() => {
    try {
      localStorage.setItem(REF_MODEL_STORAGE_KEY, refGeminiModel);
    } catch {
      /* ignore */
    }
  }, [refGeminiModel]);

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

  const refModelMeta = useMemo(
    () => REF_GEMINI_MODEL_OPTIONS.find((m) => m.id === refGeminiModel) ?? REF_GEMINI_MODEL_OPTIONS[0],
    [refGeminiModel]
  );

  const bestValueModel = useMemo(() => REF_GEMINI_MODEL_OPTIONS.find((m) => m.bestValue)!, []);

  const parseCostEstimateInr = useMemo(() => {
    if (docQueueStats.length !== docImportQueue.length || docQueueStats.length === 0) return null;
    let t = 0;
    for (let i = 0; i < docQueueStats.length; i++) {
      t += estimateSingleRefParseInr(docQueueStats[i].chars, docImportQueue[i].name.length, refModelMeta, REF_USD_INR).inr;
    }
    return t;
  }, [docQueueStats, docImportQueue, refModelMeta]);

  const parseCostEstimateBestInr = useMemo(() => {
    if (docQueueStats.length !== docImportQueue.length || docQueueStats.length === 0) return null;
    let t = 0;
    for (let i = 0; i < docQueueStats.length; i++) {
      t += estimateSingleRefParseInr(docQueueStats[i].chars, docImportQueue[i].name.length, bestValueModel, REF_USD_INR).inr;
    }
    return t;
  }, [docQueueStats, docImportQueue, bestValueModel]);

  const refTotalGeminiCalls = useMemo(() => {
    if (docQueueStats.length !== docImportQueue.length || docQueueStats.length === 0) {
      return Math.max(1, docImportQueue.length);
    }
    return docQueueStats.reduce(
      (sum, s) => sum + Math.max(1, Math.ceil((s.chars || 1) / REF_SOURCE_CHUNK_CHARS)),
      0
    );
  }, [docQueueStats, docImportQueue]);

  const fmtInr = useCallback(
    (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n),
    []
  );

  const loadSets = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('reference_question_sets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) throw e;
    setSets((data || []) as SetRow[]);
  }, []);

  const loadQuestions = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('reference_questions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (e) throw e;
    setRows((data || []) as RefRow[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSets(), loadQuestions()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [loadSets, loadQuestions]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const appendDocFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
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

  const cancelStagedImport = useCallback(() => {
    setStagedPreview([]);
    setRefParseSanityWarnings([]);
    setPendingPublishFiles(null);
    setDocImportQueue([]);
    setDocQueueStats([]);
  }, []);

  const parseAllQueuedDocs = useCallback(async () => {
    if (docImportQueue.length === 0) {
      setError('Add at least one .docx file.');
      return;
    }
    const invalid = docImportQueue.filter((f) => !/\.docx$/i.test(f.name));
    if (invalid.length) {
      setError('Reference import accepts .docx only (Mathpix export).');
      return;
    }
    setParsingDoc(true);
    setError(null);
    setRefParseSanityWarnings([]);
    const combined: Draft[] = [];
    const sanityCollected: ParseSanityWarning[] = [];
    try {
      let offset = 0;
      let fileOrd = 0;
      for (const file of docImportQueue) {
        const buf = await file.arrayBuffer();
        const { drafts, imageCount, parseSanity } =
          refImportParser === 'local'
            ? await runRefLocalOnBuffer(buf, file.name)
            : await runRefGeminiOnBuffer(buf, file.name, refGeminiModel);
        if (parseSanity) sanityCollected.push(parseSanity);
        if (drafts.length === 0) {
          setError(`No questions extracted from ${file.name}.`);
          return;
        }
        for (const d of drafts) {
          combined.push({
            ...d,
            image_index: d.image_index == null ? null : d.image_index + offset,
            import_file_ordinal: fileOrd,
          });
        }
        offset += imageCount;
        fileOrd += 1;
      }
      setPendingPublishFiles([...docImportQueue]);
      setDocImportQueue([]);
      setDocQueueStats([]);
      setStagedPreview(finalizeReferenceDrafts(combined));
      setRefParseSanityWarnings(sanityCollected);
      setBankPanelResetSignal((k) => k + 1);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse documents with Gemini');
    } finally {
      setParsingDoc(false);
    }
  }, [docImportQueue, refGeminiModel, refImportParser]);

  const publishStagedBatch = useCallback(async () => {
    const files = pendingPublishFiles;
    const drafts = stagedPreview;
    if (!files?.length || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const setId = crypto.randomUUID();
      const primaryPath = `${setId}/${sanitizeFilename(files[0].name)}`;
      let up = await supabase.storage.from('reference-question-docs').upload(primaryPath, files[0], {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });
      if (up.error) throw up.error;

      const additionalPaths: string[] = [];
      for (let i = 1; i < files.length; i++) {
        const p = `${setId}/${sanitizeFilename(files[i].name)}`;
        const r = await supabase.storage.from('reference-question-docs').upload(p, files[i], {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: false,
        });
        if (r.error) throw r.error;
        additionalPaths.push(p);
      }

      const { error: insErr } = await supabase.from('reference_question_sets').insert({
        id: setId,
        doc_path: primaryPath,
        original_filename: formatRefPendingLabel(files),
        uploaded_by: user?.id ?? null,
        ai_status: 'complete',
        preview_questions: finalizeReferenceDrafts(drafts) as unknown as Record<string, unknown>,
        ai_error: null,
        metadata: additionalPaths.length > 0 ? { additional_doc_paths: additionalPaths } : {},
      });
      if (insErr) throw insErr;

      cancelStagedImport();
      await loadSets();
    } catch (e: any) {
      setError(e?.message || 'Publish failed');
    } finally {
      setSaving(false);
    }
  }, [pendingPublishFiles, stagedPreview, cancelStagedImport, loadSets]);

  const openPreviewModal = async (set: SetRow) => {
    setActiveSet(set);
    setPreviewHtml(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const buf = await downloadRefDocPath(set.doc_path);
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      setPreviewHtml(result.value || '<p>(empty)</p>');
    } catch (e: any) {
      setPreviewHtml(`<p class="text-rose-600">Preview failed: ${e?.message || 'unknown'}</p>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runAiAnalysis = async (set: SetRow) => {
    setAnalyzingSetId(set.id);
    setError(null);
    setRefParseSanityWarnings([]);
    try {
      await supabase
        .from('reference_question_sets')
        .update({ ai_status: 'analyzing', ai_error: null, updated_at: new Date().toISOString() })
        .eq('id', set.id);
      setSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, ai_status: 'analyzing' } : s)));

      const paths = allDocPaths(set);
      const { drafts, parseSanityWarnings } = await runRefGeminiOnDocPaths(paths, refGeminiModel);
      if (drafts.length === 0) throw new Error('No questions extracted from document(s)');

      const { error: uErr } = await supabase
        .from('reference_question_sets')
        .update({
          ai_status: 'complete',
          preview_questions: finalizeReferenceDrafts(drafts) as unknown as Record<string, unknown>,
          ai_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', set.id);
      if (uErr) throw uErr;
      setRefParseSanityWarnings(parseSanityWarnings);
      await loadSets();
    } catch (e: any) {
      const msg = e?.message || 'AI analysis failed';
      setError(msg);
      await supabase
        .from('reference_question_sets')
        .update({ ai_status: 'failed', ai_error: msg, updated_at: new Date().toISOString() })
        .eq('id', set.id);
      await loadSets();
    } finally {
      setAnalyzingSetId(null);
    }
  };

  const commitSetToLibrary = async (set: SetRow) => {
    const preview = finalizeReferenceDrafts((set.preview_questions || []) as Draft[]);
    if (preview.length === 0) {
      setError('Run AI analysis first.');
      return;
    }
    if (set.committed_at) {
      if (!confirm('This set was already committed. Insert questions again?')) return;
    }

    setCommittingSetId(set.id);
    setError(null);
    try {
      const paths = allDocPaths(set);
      const globalImages: DocxEmbeddedImage[] = [];
      for (const pth of paths) {
        const buf = await downloadRefDocPath(pth);
        const { images } = await parseDocxBufferWithEmbeddedImages(buf, mammoth);
        globalImages.push(...images);
      }

      const needed = new Set<number>();
      preview.forEach((p) => {
        if (typeof p.image_index === 'number') needed.add(p.image_index);
      });
      const imgUrlByIndex = new Map<number, string>();
      for (const idx of needed) {
        const img = globalImages[idx];
        if (!img?.data) continue;
        const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpg' : 'png';
        const path = `${set.id}-${Date.now()}-${idx}.${ext}`;
        const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
        const { error } = await supabase.storage
          .from('reference-question-images')
          .upload(path, bytes, { contentType: img.mimeType, upsert: false });
        if (error) throw error;
        imgUrlByIndex.set(idx, toPublicUrl(path));
      }

      const payload = preview.map((p) => {
        const imgUrl = typeof p.image_index === 'number' ? imgUrlByIndex.get(p.image_index) || null : null;
        return {
          question_text: p.question_text,
          options: p.options.length ? p.options : null,
          correct_index: Number.isFinite(p.correct_index) ? p.correct_index : 0,
          explanation: p.explanation || null,
          question_type: p.question_type || 'mcq',
          question_format: p.question_format || 'text',
          difficulty: p.difficulty || null,
          class_name: p.class_name || null,
          subject_name: p.subject_name || null,
          chapter_name: p.chapter_name || null,
          topic_tag: p.topic_tag || null,
          image_url: imgUrl,
          source_doc_name: set.original_filename,
          reference_set_id: set.id,
          metadata: {
            source: 'mathpix-docx',
            image_indices: p.image_index ?? null,
            set_id: set.id,
            source_question_number: (p.source_question_number || '').trim() || null,
            import_file_ordinal: p.import_file_ordinal ?? null,
          },
        };
      });

      const { error: insErr } = await supabase.from('reference_questions').insert(payload);
      if (insErr) throw insErr;

      await supabase
        .from('reference_question_sets')
        .update({ committed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', set.id);

      await loadSets();
      await loadQuestions();
    } catch (e: any) {
      setError(e?.message || 'Commit failed');
    } finally {
      setCommittingSetId(null);
    }
  };

  const deleteSet = async (set: SetRow) => {
    if (!confirm(`Delete upload "${set.original_filename}" and its stored file(s)?`)) return;
    setSaving(true);
    setError(null);
    try {
      const paths = allDocPaths(set);
      await supabase.storage.from('reference-question-docs').remove(paths);
      const { error } = await supabase.from('reference_question_sets').delete().eq('id', set.id);
      if (error) throw error;
      if (activeSet?.id === set.id) {
        setActiveSet(null);
        setPreviewHtml(null);
      }
      await loadSets();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this reference question?')) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from('reference_questions').delete().eq('id', id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const previewCount = (s: SetRow) => (Array.isArray(s.preview_questions) ? s.preview_questions.length : 0);

  const multiDocHint = (s: SetRow) => {
    const extra = getAdditionalDocPaths(s.metadata).length;
    return extra > 0 ? ` · ${extra + 1} files` : '';
  };

  const statusBadge = (s: SetRow) => {
    if (s.ai_status === 'complete') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <iconify-icon icon="mdi:check-circle" width="14" className="text-emerald-600" />
          AI done
        </span>
      );
    }
    if (s.ai_status === 'analyzing') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Analyzing…
        </span>
      );
    }
    if (s.ai_status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800 ring-1 ring-rose-200">
          <iconify-icon icon="mdi:alert-circle" width="14" />
          Failed
        </span>
      );
    }
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Pending analysis</span>
    );
  };

  const committedBadge = (s: SetRow) =>
    s.committed_at ? (
      <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600" title={s.committed_at}>
        <iconify-icon icon="mdi:database-check" width="12" />
        Saved
      </span>
    ) : null;

  const firstPreviewSlice = useMemo(() => {
    if (!activeSet?.preview_questions?.length) return [];
    return finalizeReferenceDrafts(activeSet.preview_questions as Draft[]).slice(0, 8);
  }, [activeSet]);

  const stagedPreviewOrdered = useMemo(
    () => finalizeReferenceDrafts(stagedPreview),
    [stagedPreview]
  );

  const stagedSourceLabel = pendingPublishFiles?.length ? formatRefPendingLabel(pendingPublishFiles) : '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mt-0 shrink-0 space-y-4">
        <ReferenceBankImportPanel
          onRefreshAll={loadAll}
          onClearMathpixStaged={cancelStagedImport}
          mathpixStagedActive={stagedPreview.length > 0}
          savedRows={rows}
          resetSignal={bankPanelResetSignal}
        />

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Mathpix DOCX · AI pipeline</h3>
            <p className="mt-1 max-w-3xl text-[13px] leading-snug text-zinc-500">
              Uses <span className="font-mono">reference_question_sets</span> + stored docs (not the PYQ-style bank above). Add one or more Mathpix{' '}
              <span className="font-mono">.docx</span> files, choose <strong>Gemini</strong> or <strong>local</strong> parser, then parse. Long papers with Gemini are split into overlapping segments so each response stays smaller
              (reduces dropped rows on 100–200 question sets). For maximum recall on large papers use <strong>Gemini 3 Pro</strong>. Then{' '}
              <strong>Publish to server</strong> and <strong>Save to library</strong> on the card.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>

        {refParseSanityWarnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-[12px] leading-snug text-amber-950">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-amber-900">Count sanity check</p>
                <p className="mt-1 text-amber-900/90">
                  Local scan of the extracted DOCX text found more numbered question-like lines than Gemini returned. You may be missing rows —
                  try Gemini 3 Pro or split the file.
                </p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-amber-900/85">
                  {refParseSanityWarnings.map((w, i) => (
                    <li key={`${w.fileLabel}-${i}`}>
                      <span className="font-medium">{w.fileLabel}</span>: ~{w.heuristicCount} stems vs {w.extractedCount} extracted
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setRefParseSanityWarnings([])}
                className="shrink-0 text-[11px] font-semibold text-amber-800 underline decoration-amber-300 hover:text-amber-950"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {stagedPreview.length === 0 ? (
          <div className="mt-5">
            <div className="flex flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-white p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/30">
              <iconify-icon icon="mdi:file-document-multiple-outline" width="28" className="text-violet-600" />
              <p className="mt-2 text-sm font-semibold text-zinc-900">DOCX (multi)</p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                Each file may use several Gemini requests if the text is long. Figures stay aligned per file; preview is sorted by printed
                question number.
              </p>
              <input
                ref={docFileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              <div className="mt-3 max-w-md space-y-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Parser</span>
                <div className="flex flex-col gap-2 text-[11px] text-zinc-800">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-2">
                    <input
                      type="radio"
                      name="ref-parser"
                      className="mt-0.5"
                      checked={refImportParser === 'gemini'}
                      onChange={() => setRefImportParser('gemini')}
                    />
                    <span>
                      <span className="font-semibold">Gemini</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                        Best quality on varied layouts. Uses API key; long files use multiple requests.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-2">
                    <input
                      type="radio"
                      name="ref-parser"
                      className="mt-0.5"
                      checked={refImportParser === 'local'}
                      onChange={() => setRefImportParser('local')}
                    />
                    <span>
                      <span className="font-semibold">Local only</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                        No AI — same numbered MCQ rules as PYQ local import. Unmatched blocks are skipped.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              {refImportParser === 'gemini' ? (
                <div className="mt-3 max-w-md space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Gemini model</label>
                  <select
                    value={refGeminiModel}
                    onChange={(e) => setRefGeminiModel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-900 outline-none focus:border-violet-400"
                  >
                    {REF_GEMINI_MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.id === 'gemini-3-pro-preview' ? ' — best for 100+ Q' : ''}
                        {m.bestValue ? ' — lowest ₹' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] leading-snug text-zinc-500">
                    <span className="font-semibold text-zinc-700">{refModelMeta.label}:</span> {refModelMeta.blurb}
                    {refModelMeta.id !== bestValueModel.id && parseCostEstimateBestInr != null && parseCostEstimateInr != null ? (
                      <span className="mt-1 block text-emerald-800">
                        Most cost-efficient here: {bestValueModel.label} — about {fmtInr(parseCostEstimateBestInr)} for this queue (vs{' '}
                        {fmtInr(parseCostEstimateInr)} with current selection).
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}
              <div className="mt-2 max-w-md rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-2 text-[10px] leading-snug text-zinc-600">
                {refImportParser === 'local' ? (
                  <span>
                    <span className="font-semibold text-zinc-800">Local parse:</span> no Gemini calls and no API cost for this import.
                  </span>
                ) : docQueueScanning ? (
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
                    <span className="font-semibold text-zinc-800">Est. cost — ~{refTotalGeminiCalls} API call(s):</span>{' '}
                    <span className="font-mono text-indigo-700">{fmtInr(parseCostEstimateInr)}</span>
                    <span className="mt-1 block text-zinc-500">
                      Approximate only (FX ~₹{REF_USD_INR}/USD). Actual charges follow your Google AI billing.
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={parsingDoc || docImportQueue.length === 0 || docQueueScanning}
                onClick={() => void parseAllQueuedDocs()}
                className="mt-3 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
              >
                {parsingDoc ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                    {refImportParser === 'local' ? 'Parsing locally…' : 'Parsing with Gemini…'}
                  </>
                ) : (
                  <>
                    <iconify-icon icon={refImportParser === 'local' ? 'mdi:file-document-outline' : 'mdi:robot-outline'} width="18" />
                    {refImportParser === 'local' ? 'Parse all locally' : 'Parse all with Gemini'}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900" title={stagedSourceLabel}>
                {stagedSourceLabel}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-600">
                <span className="font-mono font-semibold text-indigo-700">{stagedPreview.length}</span> questions · not on server yet
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void publishStagedBatch()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Publishing…' : 'Publish to server'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Discard this import and start over?')) cancelStagedImport();
                }}
                className="px-2 py-2 text-[12px] font-medium text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800"
              >
                New import
              </button>
            </div>
          </div>
        )}

        {stagedPreview.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[560px] table-fixed border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="w-14 py-2 pl-3">Q#</th>
                  <th className="py-2">Question</th>
                  <th className="w-28 py-2">Meta</th>
                  <th className="w-16 py-2 pr-3">Fig</th>
                </tr>
              </thead>
              <tbody>
                {stagedPreviewOrdered.slice(0, 40).map((p, i) => (
                  <tr
                    key={`${p.source_question_number || i}-${i}-${p.question_text.slice(0, 24)}`}
                    className="border-t border-zinc-100 align-top"
                  >
                    <td className="py-2 pl-3 font-mono text-[10px] text-zinc-600" title={p.source_question_number || undefined}>
                      {p.source_question_number?.trim() || `(${i + 1})`}
                    </td>
                    <td className="py-2 pr-2">
                      <MeasuredSnippet
                        text={p.question_text}
                        className="line-clamp-2 font-medium text-zinc-900 break-words [overflow-wrap:anywhere]"
                      />
                    </td>
                    <td className="py-2 text-zinc-600">
                      {p.class_name || '—'} · {p.subject_name || '—'}
                      <div className="text-zinc-400">{p.difficulty}</div>
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">{p.image_index != null ? `I${p.image_index}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stagedPreviewOrdered.length > 40 && (
              <p className="border-t border-zinc-100 px-3 py-2 text-center text-[11px] text-zinc-500">
                Showing first 40 of {stagedPreviewOrdered.length} — full list is saved when you publish.
              </p>
            )}
          </div>
        )}
        </div>
      </div>

      {(error || parsingDoc || saving) && (
        <div
          className={`mt-3 shrink-0 rounded-md border p-3 text-sm ${
            error ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-zinc-200 bg-white text-zinc-700'
          }`}
        >
          {error ? error : parsingDoc ? 'Parsing with Gemini…' : 'Working…'}
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Uploaded sets</p>
        {loading && sets.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
        ) : sets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 py-16 text-center text-sm text-zinc-500">
            No documents on the server yet. Parse above, then <strong>Publish to server</strong>, or run AI on a set below after upload
            from another flow.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900" title={s.original_filename}>
                      {s.original_filename}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      {new Date(s.created_at).toLocaleString()}
                      {multiDocHint(s)}
                    </p>
                  </div>
                  {s.ai_status === 'complete' && (
                    <iconify-icon
                      icon="mdi:check-decagram"
                      width="22"
                      className="shrink-0 text-emerald-500"
                      title="AI analysis complete"
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {statusBadge(s)}
                  {committedBadge(s)}
                </div>
                {s.ai_error && s.ai_status === 'failed' && (
                  <p className="mt-2 line-clamp-3 text-[10px] text-rose-600">{s.ai_error}</p>
                )}
                <p className="mt-2 text-[11px] text-zinc-600">
                  {s.ai_status === 'complete' ? (
                    <>
                      <span className="font-semibold text-emerald-700">{previewCount(s)}</span> questions parsed
                    </>
                  ) : (
                    'Run AI to extract questions, or use the import panel to parse before publish.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void openPreviewModal(s)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Preview doc
                  </button>
                  <button
                    type="button"
                    disabled={analyzingSetId === s.id || s.ai_status === 'analyzing'}
                    onClick={() => void runAiAnalysis(s)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {analyzingSetId === s.id || s.ai_status === 'analyzing'
                      ? 'Analyzing…'
                      : s.ai_status === 'complete'
                        ? 'Re-run AI'
                        : 'Run AI analysis'}
                  </button>
                  <button
                    type="button"
                    disabled={s.ai_status !== 'complete' || previewCount(s) === 0 || committingSetId === s.id}
                    onClick={() => void commitSetToLibrary(s)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {committingSetId === s.id ? 'Saving…' : 'Save to library'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteSet(s)}
                    className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t border-zinc-100 pt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Saved reference questions</p>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">No rows in reference_questions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="w-12 py-2 pl-3">Fig</th>
                    <th className="py-2">Question</th>
                    <th className="w-36 py-2">Meta</th>
                    <th className="w-24 py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 align-top">
                      <td className="py-2 pl-3">
                        {r.image_url ? (
                          <img
                            src={r.image_url}
                            alt="figure"
                            className="h-10 w-10 rounded border border-zinc-200 object-contain"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border border-zinc-200 bg-zinc-50" />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <MeasuredSnippet
                          text={r.question_text}
                          className="line-clamp-2 text-xs font-semibold text-zinc-900 break-words [overflow-wrap:anywhere]"
                        />
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {r.class_name || '—'} · {r.subject_name || '—'} · {r.chapter_name || '—'}
                        </p>
                      </td>
                      <td className="py-2 text-[10px] text-zinc-600">
                        <div>{r.difficulty || '—'}</div>
                        <div className="text-zinc-400">{r.question_type || '—'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteRow(r.id)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {activeSet && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => {
            setActiveSet(null);
            setPreviewHtml(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">{activeSet.original_filename}</h4>
                <p className="text-[11px] text-zinc-500">
                  Primary document preview · {statusBadge(activeSet)}
                  {getAdditionalDocPaths(activeSet.metadata).length > 0 ? ' · additional files in set' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSet(null);
                  setPreviewHtml(null);
                }}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <iconify-icon icon="mdi:close" width="20" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-56px)] overflow-y-auto p-4">
              {previewLoading ? (
                <p className="py-12 text-center text-sm text-zinc-500">Loading preview…</p>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-zinc-800"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
                />
              )}
              {activeSet.ai_status === 'complete' && firstPreviewSlice.length > 0 && (
                <div className="mt-6 border-t border-zinc-100 pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">AI preview (first 8)</p>
                  <ul className="space-y-2 text-[11px] text-zinc-700">
                    {firstPreviewSlice.map((p, i) => (
                      <li key={i} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-2">
                        <span className="font-mono font-semibold text-indigo-800">
                          Q{p.source_question_number?.trim() || i + 1}
                        </span>{' '}
                        <span className="font-semibold text-zinc-900">{p.chapter_name || 'Chapter ?'}</span> ·{' '}
                        {p.difficulty} · {p.question_type} · {p.question_format}
                        <MeasuredSnippet
                          text={p.question_text}
                          className="mt-1 line-clamp-2 text-zinc-600 break-words [overflow-wrap:anywhere]"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceQuestionsManager;
