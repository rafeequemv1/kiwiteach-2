import { Type } from '@google/genai';
import * as pdfjs from 'pdfjs-dist';
import { adminGeminiGenerateContent } from './adminGeminiProxy';
import { downsampleImage, extractImagesFromPdfArrayBuffer } from './geminiService';
import { parseDocxBufferWithEmbeddedImages, stripDocxImageTokens } from '../utils/docxFigureExtract';
import { DEFAULT_PROMPTS, SECTIONS } from '../Admin/Prompts/neetPromptConfig';

declare const mammoth: any;

const PDFJS_WORKER_VER = '4.10.38';
let pdfjsWorkerReady = false;

function ensurePdfJsWorker() {
  if (typeof window === 'undefined') return;
  if (pdfjsWorkerReady) return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_WORKER_VER}/build/pdf.worker.min.mjs`;
  pdfjsWorkerReady = true;
}

const ANALYSIS_MODEL = 'gemini-3-flash-preview';
const PROMPT_GEN_MODEL = 'gemini-3-pro-preview';

const MAX_ANALYSIS_TEXT = 28_000;
const MAX_IMAGES = 10;

function cleanJson(txt: string) {
  return txt
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    dominantFormats: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    conceptualVsNumerical: { type: Type.STRING },
    typicalStemLength: { type: Type.STRING },
    distractorPatterns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    figureUsage: { type: Type.STRING },
    cognitiveLoadNotes: { type: Type.STRING },
    ntaNeetPatternNotes: { type: Type.STRING },
    questionStyleBullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'summary',
    'dominantFormats',
    'conceptualVsNumerical',
    'typicalStemLength',
    'distractorPatterns',
    'figureUsage',
    'cognitiveLoadNotes',
    'ntaNeetPatternNotes',
    'questionStyleBullets',
  ],
};

const promptsBundleSchema = {
  type: Type.OBJECT,
  properties: {
    General: { type: Type.STRING },
    Difficulty: { type: Type.STRING },
    Explanation: { type: Type.STRING },
    Distractors: { type: Type.STRING },
    Figure: { type: Type.STRING },
    Chemistry: { type: Type.STRING },
    Latex: { type: Type.STRING },
  },
  required: ['General', 'Difficulty', 'Explanation', 'Distractors', 'Figure', 'Chemistry', 'Latex'],
};

async function extractPdfPlainText(arrayBuffer: ArrayBuffer): Promise<string> {
  ensurePdfJsWorker();
  try {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let out = '';
    const n = Math.min(pdf.numPages, 40);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const line = tc.items
        .map((x) => (typeof x === 'object' && x && 'str' in x && typeof (x as { str?: string }).str === 'string' ? (x as { str: string }).str : ''))
        .join(' ');
      out += line + '\n';
    }
    return out.slice(0, MAX_ANALYSIS_TEXT);
  } catch {
    return '';
  }
}

export type ReferenceAnalysis = {
  summary: string;
  dominantFormats: string[];
  conceptualVsNumerical: string;
  typicalStemLength: string;
  distractorPatterns: string[];
  figureUsage: string;
  cognitiveLoadNotes: string;
  ntaNeetPatternNotes: string;
  questionStyleBullets: string[];
};

function partsFromGemini(res: Awaited<ReturnType<typeof adminGeminiGenerateContent>>): string {
  const t = res.text?.trim();
  if (t) return t;
  const parts = res.candidates?.[0]?.content?.parts;
  if (!parts?.length) return '';
  return parts.map((p) => p.text || '').join('').trim();
}

/**
 * Build multimodal parts from an uploaded reference file (DOCX with embedded images, or PDF).
 */
export async function buildReferenceFileParts(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<{ text: string; imageParts: { inlineData: { mimeType: string; data: string } }[] }> {
  const lower = (mimeType || '').toLowerCase();
  const isPdf = lower.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const isDocx =
    lower.includes('wordprocessingml') ||
    lower.includes('officedocument') ||
    fileName.toLowerCase().endsWith('.docx');

  if (isDocx && mammoth?.convertToHtml && mammoth?.images?.imgElement) {
    const { text, images } = await parseDocxBufferWithEmbeddedImages(arrayBuffer, mammoth);
    const plain = stripDocxImageTokens(text).slice(0, MAX_ANALYSIS_TEXT);
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    const n = Math.min(images.length, MAX_IMAGES);
    for (let i = 0; i < n; i++) {
      const img = images[i];
      const ds = await downsampleImage(img.data, img.mimeType || 'image/png', 900);
      if (ds.data) {
        imageParts.push({ inlineData: { mimeType: ds.mimeType, data: ds.data } });
      }
    }
    return { text: plain, imageParts };
  }

  if (isPdf) {
    const text = await extractPdfPlainText(arrayBuffer);
    const imgs = await extractImagesFromPdfArrayBuffer(arrayBuffer, { maxPages: 6, maxDim: 900 });
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (let i = 0; i < Math.min(imgs.length, MAX_IMAGES); i++) {
      if (imgs[i].data) {
        imageParts.push({ inlineData: { mimeType: imgs[i].mimeType, data: imgs[i].data } });
      }
    }
    return { text: text || '(PDF: limited text extraction; rely on page images.)', imageParts };
  }

  return { text: `Unknown format: ${fileName}.`, imageParts: [] };
}

export async function analyzeReferenceDocument(params: {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
}): Promise<ReferenceAnalysis> {
  const { text, imageParts } = await buildReferenceFileParts(params.arrayBuffer, params.mimeType, params.fileName);

  const instruction =
    `You are analyzing a reference medical entrance practice paper (NOT for copying). ` +
    `Infer STYLE and STRUCTURE only: formats (MCQ, assertion-reason, statements, matching), stem length, ` +
    `numerical vs conceptual balance, distractor strategies, use of figures, and cognitive load. ` +
    `Map observations to NTA NEET-style patterns where relevant. ` +
    `Do not reproduce long excerpts or identifiable question text in string fields; summarize patterns.\n\n` +
    `Filename: ${params.fileName}\n\n` +
    `Extracted/plain text (truncated):\n${text}`;

  const userParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
    { text: instruction },
    ...imageParts.map((p) => ({ inlineData: p.inlineData })),
  ];

  const res = await adminGeminiGenerateContent({
    model: ANALYSIS_MODEL,
    contents: [{ role: 'user', parts: userParts }],
    config: {
      temperature: 0.25,
      responseMimeType: 'application/json',
      responseSchema: analysisSchema,
    },
  });

  const raw = cleanJson(partsFromGemini(res));
  const parsed = JSON.parse(raw) as ReferenceAnalysis;
  return parsed;
}

export async function generateSystemPromptsFromAnalysis(analysis: ReferenceAnalysis): Promise<Record<string, string>> {
  const sectionHints = SECTIONS.map((s) => s.id).join(', ');
  const defaultsDigest = SECTIONS.map((s) => `## ${s.id}\n${(DEFAULT_PROMPTS[s.id] || '').slice(0, 400)}…`).join(
    '\n\n'
  );

  const analysisJson = JSON.stringify(analysis, null, 2);

  const prompt =
    `You are an expert NEET UG assessment designer. Given the structured ANALYSIS of a reference paper (style only), ` +
    `write a full replacement SYSTEM PROMPT LIBRARY as 7 sections: ${sectionHints}.\n\n` +
    `Rules:\n` +
    `- Output MUST follow the JSON schema (exact keys).\n` +
    `- Each section is detailed markdown-ish plain text suitable for instructing an LLM that generates questions.\n` +
    `- Encode the analysis into actionable rules (length, formats, distractors, figures, chemistry structures, LaTeX escaping for JSON).\n` +
    `- Do NOT paste copyrighted question text. No institution or book names.\n` +
    `- Preserve rigor: negative constraints (no "NCERT"/"textbook" wording in outputs), syllabus fidelity.\n\n` +
    `Current default excerpts (for alignment; you may replace fully):\n${defaultsDigest}\n\n` +
    `ANALYSIS JSON:\n${analysisJson}`;

  const res = await adminGeminiGenerateContent({
    model: PROMPT_GEN_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: promptsBundleSchema,
    },
  });

  const raw = cleanJson(partsFromGemini(res));
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Record<string, string> = { ...DEFAULT_PROMPTS };
  const keys = ['General', 'Difficulty', 'Explanation', 'Distractors', 'Figure', 'Chemistry', 'Latex'] as const;
  for (const id of keys) {
    if (typeof parsed[id] === 'string' && parsed[id].trim()) out[id] = parsed[id].trim();
  }
  return out;
}
