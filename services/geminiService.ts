
import { Type } from "@google/genai";
import { Question, QuestionType, TypeDistribution } from "../Quiz/types";
import { supabase } from "../supabase/client";
import { adminGeminiGenerateContent } from "./adminGeminiProxy";
import { FORGE_FORMAT_PROTOCOLS, CHOICE_DIVERSITY_BATCH_RULES } from "./neuralStudioPromptBlueprint";
import {
  distributeIntegerByWeights,
  getMaxSourceCharsPerForgeCall,
  sourceChunkPreamble,
  splitRawTextIntoForgeChunks,
  scaleTypeWeightsToTotal,
} from "./forgeSourceChunking";
import { getReferenceLayerBlock } from "./neetReferenceLayer";
import * as pdfjs from "pdfjs-dist";

declare const mammoth: any;

const PDFJS_WORKER_VER = "4.10.38";
let pdfjsWorkerReady = false;

function ensurePdfJsWorker() {
    if (typeof window === "undefined") return;
    if (pdfjsWorkerReady) return;
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_WORKER_VER}/build/pdf.worker.min.mjs`;
    pdfjsWorkerReady = true;
}

function storagePathLooksPdf(path: string) {
    return path.toLowerCase().split("?")[0].endsWith(".pdf");
}

function isRetryableGeminiError(error: any): boolean {
  const msg = String(error?.message || '');
  const st = typeof error?.status === 'number' ? error.status : undefined;
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return true;
  if (st === 408 || st === 429) return true;
  if (st !== undefined && st >= 500) return true;
  return false;
}

function isRateLimitGeminiError(error: any): boolean {
  const st = typeof error?.status === 'number' ? error.status : undefined;
  if (st === 429) return true;
  const msg = String(error?.message || '');
  return /429|rate limit|resource exhausted|quota|too many requests/i.test(msg);
}

/** Exponential backoff with jitter; longer waits on HTTP 429 / rate-limit style errors. */
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1500
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const retryable = isRetryableGeminiError(error);

      if (retryable && i < maxRetries - 1) {
        const rateLimited = isRateLimitGeminiError(error);
        const mult = rateLimited ? 2.75 : 1;
        const exp = baseDelay * mult * Math.pow(2, i);
        const jitter = exp * (0.2 + Math.random() * 0.45);
        const delay = Math.min(90000, Math.floor(exp + jitter));
        console.warn(
          `Gemini request failed (${error?.message || error}). Retrying in ${delay}ms (${i + 1}/${maxRetries})…`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        if (!retryable) throw error;
      }
    }
  }
  throw lastError;
};

/**
 * Strips Null characters (\u0000) that cause PostgreSQL errors.
 */
const sanitizeString = (str: string): string => {
    if (!str) return str;
    return str.replace(/\u0000/g, '').replace(/\0/g, '');
};

const sanitizeResult = (obj: any): any => {
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeResult);
    if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
            cleaned[key] = sanitizeResult(obj[key]);
        }
        return cleaned;
    }
    return obj;
};

/**
 * Fixes common issues where LaTeX commands in JSON strings are interpreted as control characters.
 * E.g., "\text" -> becomes Tab + "ext" in standard JSON.parse if not escaped as "\\text".
 */
const repairMalformedJsonLatex = (jsonStr: string): string => {
    if (!jsonStr) return "[]";
    return jsonStr
        // Fix \text, \times, \theta, \tau (overlap with \t tab)
        .replace(/(?<!\\)\\(text|times|theta|tau)/g, '\\\\$1')
        // Fix \frac, \forall (overlap with \f formfeed)
        .replace(/(?<!\\)\\(frac|forall)/g, '\\\\$1')
        // Fix \beta, \bar (overlap with \b backspace)
        .replace(/(?<!\\)\\(beta|bar)/g, '\\\\$1')
        // Fix \rho (overlap with \r carriage return)
        .replace(/(?<!\\)\\(rho|right)/g, '\\\\$1');
};

/**
 * Gemini often puts LaTeX like \underbrace, \upsilon, \unit in JSON strings with a single backslash.
 * JSON.parse treats `\u` as the start of a Unicode escape (must be \u + 4 hex). That throws
 * "Bad Unicode escape in JSON". Escape that `\u` as `\\u` when it is not a real \uXXXX.
 *
 * Important: valid JSON uses `\\underbrace` in the raw text (backslash backslash u…) so the parsed
 * string contains `\underbrace`. A naive `/\\u/g` replace matches the second `\` and the `u` and
 * corrupts the JSON. Only treat `\u` as a unicode escape when the backslash run ending at `\` has
 * **odd** length (that `\` actually starts an escape, not a paired `\\`).
 */
const repairInvalidJsonUnicodeEscapes = (jsonStr: string): string => {
    if (!jsonStr) return jsonStr;
    let result = "";
    let i = 0;
    while (i < jsonStr.length) {
        if (jsonStr[i] === "\\" && i + 1 < jsonStr.length && jsonStr[i + 1] === "u") {
            let start = i;
            while (start > 0 && jsonStr[start - 1] === "\\") start--;
            const runLen = i - start + 1;
            const next4 = jsonStr.slice(i + 2, i + 6);
            const validUnicode =
                next4.length === 4 && /^[0-9a-fA-F]{4}$/.test(next4);

            if (runLen % 2 === 1) {
                if (validUnicode) {
                    result += jsonStr.slice(i, i + 6);
                    i += 6;
                    continue;
                }
                result += "\\\\u";
                i += 2;
                continue;
            }
        }
        result += jsonStr[i];
        i += 1;
    }
    return result;
};

/**
 * Model often writes LaTeX like `\neq`, `\nabla` with a single backslash before `n`.
 * In JSON, `\n` is a newline escape — but `\\n` is a literal backslash + n.
 * Only fix the single-backslash case (not when already escaped).
 */
const repairJsonLatexNewlineFalsePositive = (jsonStr: string): string =>
    jsonStr.replace(/(?<!\\)\\n(?=[a-zA-Z])/g, "\\\\n");

/**
 * Forge JSON can be huge (many questions × LaTeX × long explanations).
 * If the model returns finishReason=MAX_TOKENS, JSON.parse fails ("Unterminated string" etc.).
 * Request the highest output budget the model tier allows; large batches need Pro or split-by-style.
 */
function computeForgeMaxOutputTokens(questionCount: number, modelName: string): number {
  const n = Math.max(1, questionCount);
  const largeBatch = n >= 14;
  const perQuestion = modelName.includes("lite")
    ? largeBatch ? 1900 : 1600
    : modelName.includes("pro")
      ? largeBatch ? 3600 : 3000
      : largeBatch ? 2800 : 2200;
  const budget = n * perQuestion + (largeBatch ? 20000 : 14000);
  const cap = modelName.includes("lite") ? 24576 : 65536;
  return Math.min(cap, Math.max(20480, budget));
}

function forgeJsonParseHint(
  parseMessage: string,
  responseLen: number,
  finishReason: string
): string {
  const fr = finishReason.toUpperCase();
  const truncated =
    /MAX_TOKEN|LENGTH|TOKEN/i.test(fr) ||
    /Unexpected end|end of data|Unterminated string/i.test(parseMessage);
  const unicode = /unicode escape|\\u/i.test(parseMessage);
  const parts: string[] = [];
  if (truncated) {
    parts.push(
      "The model’s JSON was probably cut off (output token limit) or a string was broken mid-way — try fewer questions per run, use split-by-style, or a model with a larger output budget."
    );
  }
  if (unicode) {
    parts.push(
      'Some LaTeX uses "\\u…" (e.g. \\underbrace) which JSON treats as a Unicode escape — we try to fix this automatically; if it still fails, shorten explanations or reduce batch size.'
    );
  }
  if (parts.length === 0) {
    parts.push(
      "The response was not valid JSON (often unescaped quotes or newlines inside a field). Try a smaller batch or re-forge."
    );
  }
  parts.push(`(Response length ~${responseLen.toLocaleString()} chars; finishReason=${finishReason || "unknown"})`);
  return parts.join(" ");
}

/** Same largest-remainder scaling as Neural Studio forge — maps template E/M/H to exact batch size. */
function scaleDifficultyCountsToTotal(
  template: { easy: number; medium: number; hard: number },
  total: number
): { easy: number; medium: number; hard: number } {
  const wE = Math.max(0, Math.floor(template.easy));
  const wM = Math.max(0, Math.floor(template.medium));
  const wH = Math.max(0, Math.floor(template.hard));
  const sumW = wE + wM + wH;
  if (total <= 0) return { easy: 0, medium: 0, hard: 0 };
  if (sumW <= 0) return { easy: 0, medium: total, hard: 0 };
  const exact = [(wE / sumW) * total, (wM / sumW) * total, (wH / sumW) * total];
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return { easy: out[0], medium: out[1], hard: out[2] };
}

function capitalizeDifficultyMandate(d: string): "Easy" | "Medium" | "Hard" {
  const raw = String(d).trim().toLowerCase();
  if (raw === "easy" || raw === "e") return "Easy";
  if (raw === "hard" || raw === "h") return "Hard";
  return "Medium";
}

/** Legacy hook: Gemini runs on the server via /api/gemini; no browser API key. */
export const ensureApiKey = async () => {};

const cleanBase64 = (base64: string): string => {
    if (!base64) return "";
    return base64.replace(/^data:image\/[a-z]+;base64,/, "").trim();
};

const SYSTEM_PROMPTS: Record<string, string> = {
    'General': `TASK: Generate NTA NEET (UG) style assessment items with a clear ladder of depth.
    - GOAL: Match the real exam arc — from accessible, well-scored items through standard NEET reasoning to a thin band of elite discriminators. Easy → Medium → Hard must mean visibly increasing cognitive load, not the same stem with a different label.
    - OPTION VARIETY (BATCH): Across each batch, include a reasonable share of numerically framed four-option sets and of near-miss / confusion-style distractors where the topic allows—see Distractors and forge protocols (approx. ~25–35% each, not every item).
    - TONE: Clinical and analytical where appropriate; always professional. Stems read like a formal entrance paper, not a textbook excerpt.
    - NEGATIVE CONSTRAINT: NEVER use the words "NCERT", "Textbook", "The Source", "Chapter", or "Passage" in the output. The question must appear as an independent scientific problem.
    - SYLLABUS CONSTRAINT: Map every question to a specific sub-topic from the syllabus.`,
    
    'Difficulty': `NEET DIFFICULTY CALIBRATION (STRICT LADDER — EASY < MEDIUM < HARD):

    1. EASY (Accessible / high yield — like the “scoring” zone on NEET papers):
       - STEM: Clear, concise (typically ~20–45 words unless a table/list is needed). One main idea.
       - COGNITION: Direct recall of definitions, facts, classifications, standard diagrams, or single-step application (one logical hop). Comparable to straightforward PYQ-style recall and “obvious if you know the line” items.
       - NOT THIS TIER: Multi-paragraph vignettes, deep traps, or cross-chapter synthesis — those belong in Medium/Hard.

    2. MEDIUM (Standard NEET core — thoughtful, exam-authentic):
       - STEM: Moderate length (~35–70 words) or compact data; may use short scenarios, exceptions, “which is correct”, or two linked concepts within the same chapter/theme.
       - COGNITION: 2–4 reasoning steps, compare/contrast, mild numerical reasoning, or ruling out options with real science (not guessing from wording).
       - DISTRACTORS: Plausible to a prepared student; at least two wrong options should tempt someone who partially knows the topic.

    3. HARD (Elite / repeater tier — top ~0.5–2% discrimination, still syllabus-true):
       - AUDIENCE: Students who already know the chapter cold and need items that separate “good” from “airtight”.
       - STEM: Often longer (~55–110 words), dense, or multi-part (assertion–reason, multi-statement, integrated numeric + concept, edge cases, “except”, subtle data).
       - COGNITION: Cross-concept links within the syllabus, uncommon but fair twists, strict attention to exceptions, or reasoning that only resolves after full working. Must feel worth the label — not just a verbose Easy question.
       - QUALITY BAR: Every Hard item should be something a committed repeater respects as “exam-winning” preparation material.`,

    'Distractors': `OPTION & DISTRACTOR LOGIC (SCALE WITH DIFFICULTY):
    - EASY: Wrong options are clearly weaker scientifically once the key fact is known; avoid cruel trick wording.
    - MEDIUM: At least two distractors are highly plausible; design from typical misconceptions and “almost right” statements.
    - HARD: All four choices defensible on a quick read; wrong answers map to specific expert-level slips (sign errors, wrong exception, conflated mechanisms). No throwaway fillers on Hard items.
${CHOICE_DIVERSITY_BATCH_RULES}`,
    
    'Explanation': `EXPLANATION PROTOCOL:
- **Standard Questions**: Comprehensive, clear, step-by-step logic.
- **Diagram/Label Questions**: **STRICTLY CONCISE**.
  - If the question asks to identify labels (e.g. "Identify P and Q"), the explanation MUST be under 30 words.
  - Format: "P is [Structure X], Q is [Structure Y]. [Brief function]."
  - DO NOT write a paragraph. Direct identification only.`,

    'Figure': `VISUAL PROTOCOL (ANTI-CHEAT & ACCURACY):
    - **STYLE**: Strictly PURE BLACK lines on PURE WHITE background. High-contrast technical line art.
    - **ANTI-CHEAT CONSTRAINT**: NEVER include structural answers or descriptive names of products directly in the figure. 
    - **MASKING**: Use placeholder labels (P, Q, R, X, Y) in the diagram. The student must identify these from the options.
    - **MANDATORY**: A figure must pose a PROBLEM, not display the SOLUTION. If a reaction is shown, the product must be replaced with a label.`,

    'Chemistry': `EXPERT CHEMISTRY EXAM PROTOCOL (NEET/AIIMS STANDARD):

**ORGANIC CHEMISTRY EMPHASIS:**
1.  **REACTION SCHEMES:** When generating reaction sequences (e.g., A -> B -> C), the 'figurePrompt' MUST command the image model to mask the target product.
2.  **STRICT FIGURE RULE**: A figure for an organic chemistry question MUST NOT contain the answer. 
    *   Example: If asking "Identify the major product of ozonolysis of O-Xylene", the figure should show O-Xylene and the reagent arrows, but the product area must contain a large '?' or label 'P'.
    *   **NEVER** write product names (like "Glyoxal") inside the diagram if they are part of the options or List II.
3.  **MATCHING TYPE FIGURES**: For 'Match List I with List II', the figure should only show the structures/items of List I with generic index labels. It must NOT show the lines connecting them to answers or include the text of List II.
4.  **KaTeX for TEXT:** Use standard chemical formulas and KaTeX notation (e.g., H_2SO_4, CH_3COOH) for all chemical text in the question stem, options, and explanation.`,

    'Latex': `MATH & LATEX TYPOGRAPHY PROTOCOL (CRITICAL - STRICT COMPLIANCE REQUIRED):
    
    1. **JSON ESCAPING (MANDATORY)**: 
       - The output is a JSON string. You **MUST DOUBLE-ESCAPE** all backslashes.
       - **WRONG:** "\text{hello}", "\times", "\frac"
       - **CORRECT:** "\\text{hello}", "\\times", "\\frac"
       - **Reason:** A single backslash \t is interpreted as a TAB character by parsers, destroying the LaTeX command (e.g. "\\triangle" becomes tab + "riangle").
    
    2. **MANDATORY DELIMITERS**: ALL mathematical expressions, symbols, variables, subscripts, Greek letters, and equations MUST be wrapped in \`$\` ... \`$\` (or \`$$...$$\` for multi-line steps).
       - Correct: "Calculate the velocity $v$ where $v = u + at$."
       - For step-by-step explanations, wrap **each** numeric or symbolic step in its own \`$...$\` span, e.g. $C = \\dfrac{40}{12} = 3.33$, never leave bare \`\\dfrac{...}{...}\` outside math delimiters.
       - Use $\\log$, $\\ln$, $\\Delta$, $\\alpha$ inside \`$...$\`; never emit empty \`\\text{}\` for a symbol — write the real command (e.g. $\\alpha$ for degree of dissociation).

    3. **DIVISION SYNTAX**: 
       - ALWAYS use \`\\dfrac{numerator}{denominator}\` **inside** \`$...$\`. 
       - Example: $\\dfrac{GM}{r^2}$
       - BANNED: Do not use \`/\` for vertical division in math.

    4. **SYMBOLS & UNITS**: 
       - Use \`\\times\` for multiplication (e.g., $4 \\times 10^5$).
       - Use standard units directly or with \`\\mathrm{}\`. Avoid nested \`\\text{}\` for simple units.
       - **Correct:** $0.5 \\mu\\mathrm{m}$ or $0.5 \\mu m$.
       - **Avoid:** $0.5 \\text{\\text{mu}m}$.

    5. **EXPLANATIONS & LINE BREAKS**:
       - Use real line breaks between steps (paragraph breaks). Do **not** write the two-character sequence backslash + letter n as a fake newline inside JSON strings.
       - Never output placeholder tokens like \`__MATH_BLOCK_0__\` or any similar markup — only valid LaTeX inside \`$...$\`.

    6. **SUBSCRIPTS (NO \\_ OR \\\{ IN JSON)**:
       - Never write \`\\_\`, \`\\\{\`, or \`\\\}\` for subscripts. Inside \`$...$\` use normal TeX: \`$X_{ethanol}$\`, \`$H_2O$\`.
       - In JSON, braces in math are single characters inside the string (escape the string quotes only), e.g. \`"mole fraction $X_{ethanol} = 0.04$"\`.

    7. **GREEK + UNITS**:
       - Never glue a unit letter to a Greek command: **wrong** \`\\pim\`, \`\\pis\`; **right** \`$\\pi\\,\\mathrm{m}$\`, \`$50\\pi\\,\\mathrm{m}$\`.

    8. **NO PLACEHOLDER GLYPHS**:
       - Do not use empty boxes, □, U+FFFD, or “value here” placeholders in explanations. Use the actual number or a fully symbolic expression inside \`$...$\`.

    9. **NO MATH INSIDE \\text OR \\mathrm**:
       - Never wrap roots or fractions inside \`\\text{...}\` or \`\\mathrm{...}\` (e.g. **wrong** \`\\text{\\sqrt{2}}\` — KaTeX shows the word “sqrt”). **Right:** \`$\\sqrt{2}$\` or bare \`\\sqrt{2}\` inside a larger \`$...$\` block.
       - Never wrap relation symbols or Greek in \`\\text\`: **wrong** \`\\text{\\le}\`, \`\\text{\\mu}\`; **right** \`$\\le$\`, \`$\\mu_s$\`.
       - For “change in” quantity (e.g. ΔK), use \`\\Delta\` — do not invent garbled commands like \`\\triangleriangle\`.`
};

export const getSystemPrompt = (key: string): string => {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem('kiwiteach_system_prompts');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed[key]) return parsed[key];
            }
        } catch (e) {}
    }
    return SYSTEM_PROMPTS[key] || '';
};

export const downsampleImage = (base64Data: string, mimeType: string, maxDim = 1024): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width <= maxDim && height <= maxDim && (mimeType === 'image/jpeg' || mimeType === 'image/png')) {
                resolve({ data: cleanBase64(base64Data), mimeType });
                return;
            }
            if (width > height) { height *= maxDim / width; width = maxDim; } else { width *= maxDim / height; height = maxDim; }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const newData = canvas.toDataURL('image/jpeg', 0.85);
            const [header, data] = newData.split(',');
            resolve({ data: data.trim(), mimeType: 'image/jpeg' });
        };
        img.onerror = () => resolve({ data: '', mimeType: 'image/jpeg' });
        img.src = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    });
};

export const extractImagesFromDoc = async (docPath: string): Promise<{ data: string, mimeType: string }[]> => {
    if (storagePathLooksPdf(docPath)) return [];
    try {
        const mammothLib = (window as any).mammoth;
        if (!mammothLib?.convertToHtml || !mammothLib?.images?.imgElement) {
            console.warn("mammoth is not available on window; skip DOCX image extraction");
            return [];
        }
        const { data: blob } = await supabase.storage.from('chapters').download(docPath);
        if (!blob) return [];
        const arrayBuffer = await blob.arrayBuffer();
        const images: { data: string, mimeType: string }[] = [];
        await mammothLib.convertToHtml({ arrayBuffer }, {
            convertImage: mammothLib.images.imgElement((image: any) => image.read("base64").then((imageBuffer: string) => {
                images.push({ data: imageBuffer, mimeType: image.contentType || 'image/png' });
                return { src: "" };
            }))
        });
        const processed = await Promise.all(images.map(img => downsampleImage(img.data, img.mimeType, 1024)));
        return processed.filter(p => p.data);
    } catch (e) {
        console.error("Extraction error", e);
        return [];
    }
};

/**
 * Renders PDF pages to JPEG thumbnails (for chapters stored as PDF only, or when DOCX has no embedded images).
 */
export const extractImagesFromPdfPath = async (
    pdfPath: string,
    opts?: { maxPages?: number; scale?: number; maxDim?: number }
): Promise<{ data: string; mimeType: string }[]> => {
    ensurePdfJsWorker();
    const maxPages = Math.min(Math.max(opts?.maxPages ?? 48, 1), 80);
    const scale = opts?.scale ?? 1.25;
    const maxDim = opts?.maxDim ?? 1200;
    try {
        const { data: blob, error } = await supabase.storage.from("chapters").download(pdfPath);
        if (error || !blob) return [];
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return [];
        const out: { data: string; mimeType: string }[] = [];
        const n = Math.min(pdf.numPages, maxPages);
        for (let i = 1; i <= n; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const renderTask = page.render({ canvasContext: ctx, viewport });
            await renderTask.promise;
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const parts = dataUrl.split(",");
            const b64 = parts[1]?.trim();
            if (b64) out.push({ data: b64, mimeType: "image/jpeg" });
        }
        const processed = await Promise.all(out.map((img) => downsampleImage(img.data, img.mimeType, maxDim)));
        return processed.filter((p) => p.data);
    } catch (e) {
        console.error("PDF image extraction error", e);
        return [];
    }
};

/** Rasterize first pages of a PDF in memory (e.g. Prompt Studio reference uploads). */
export const extractImagesFromPdfArrayBuffer = async (
    arrayBuffer: ArrayBuffer,
    opts?: { maxPages?: number; scale?: number; maxDim?: number }
): Promise<{ data: string; mimeType: string }[]> => {
    ensurePdfJsWorker();
    const maxPages = Math.min(Math.max(opts?.maxPages ?? 8, 1), 24);
    const scale = opts?.scale ?? 1.15;
    const maxDim = opts?.maxDim ?? 1024;
    try {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return [];
        const out: { data: string; mimeType: string }[] = [];
        const n = Math.min(pdf.numPages, maxPages);
        for (let i = 1; i <= n; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const renderTask = page.render({ canvasContext: ctx, viewport });
            await renderTask.promise;
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const parts = dataUrl.split(",");
            const b64 = parts[1]?.trim();
            if (b64) out.push({ data: b64, mimeType: "image/jpeg" });
        }
        const processed = await Promise.all(out.map((img) => downsampleImage(img.data, img.mimeType, maxDim)));
        return processed.filter((p) => p.data);
    } catch (e) {
        console.error("PDF buffer image extraction error", e);
        return [];
    }
};

/**
 * Neural Studio / forge: embedded images from DOCX when present; otherwise page renders from chapter PDF.
 */
export const extractChapterReferenceImages = async (
    docPath: string | null | undefined,
    pdfPath: string | null | undefined,
    options?: { maxPdfPages?: number; pdfScale?: number; maxDim?: number }
): Promise<{ data: string; mimeType: string }[]> => {
    let fromDoc: { data: string; mimeType: string }[] = [];
    if (docPath && !storagePathLooksPdf(docPath)) {
        fromDoc = await extractImagesFromDoc(docPath);
    }
    if (fromDoc.length > 0) return fromDoc;
    const pdfRef =
        docPath && storagePathLooksPdf(docPath) ? docPath : pdfPath && pdfPath.trim() ? pdfPath : null;
    if (!pdfRef) return [];
    return extractImagesFromPdfPath(pdfRef, {
        maxPages: options?.maxPdfPages,
        scale: options?.pdfScale,
        maxDim: options?.maxDim,
    });
};

export const generateQuizQuestions = async (
  topic: string,
  difficulty: any,
  count: number,
  sourceContext?: { text: string; images?: { data: string; mimeType: string; }[] },
  qType: QuestionType | TypeDistribution = 'mcq',
  onProgress?: (status: string) => void,
  figureCount: number = 0,
  useSmiles: boolean = false,
  figureBreakdown?: string,
  modelName: string = 'gemini-3-pro-preview',
  visualMode: 'image' | 'text' = 'image',
  syllabusTopics?: string[],
  pyqContext?: string,
  isLengthy?: boolean,
  isConfusingChoices?: boolean,
  excludedTopicLabels?: string[],
  knowledgeBaseId?: string | null,
  /** When set with knowledgeBaseId, merge this cloud prompt set instead of KB prefs alone. */
  promptSetIdOverride?: string | null,
  /**
   * When true, long SOURCE MATERIAL is split into multiple API calls (counts scaled per segment).
   * One call if the text already fits — no extra cost. Reference images attach only to the first segment.
   */
  splitLongSource: boolean = false,
  /** When multiple entries, model must hit exact per-label counts and interleave topic_tags (admin syllabus forge). */
  syllabusTopicQuotaBatch?: { label: string; count: number }[] | null
): Promise<Question[]> => {
  const srcTextFull = sourceContext?.text ?? "";
  if (splitLongSource && srcTextFull.length > 0 && count > 0) {
    const maxChars = getMaxSourceCharsPerForgeCall(modelName);
    const chunks = splitRawTextIntoForgeChunks(srcTextFull, maxChars);
    if (chunks.length > 1) {
      const weights = chunks.map((c) => c.length);
      const subCounts = distributeIntegerByWeights(count, weights);
      const subFigures =
        figureCount > 0
          ? distributeIntegerByWeights(figureCount, weights)
          : chunks.map(() => 0);
      const merged: Question[] = [];
      const batchId = Date.now();
      for (let i = 0; i < chunks.length; i++) {
        const sc = subCounts[i];
        if (sc <= 0) continue;
        const segText = sourceChunkPreamble(i, chunks.length, topic) + chunks[i];
        const subCtx: { text: string; images?: { data: string; mimeType: string }[] } = {
          text: segText,
          ...(i === 0 && sourceContext?.images?.length ? { images: sourceContext.images } : {}),
        };
        const subDiff =
          typeof difficulty === "object" && difficulty !== null
            ? scaleDifficultyCountsToTotal(difficulty, sc)
            : difficulty;
        let subQType: QuestionType | TypeDistribution = qType;
        if (typeof qType === "object" && qType !== null && !Array.isArray(qType)) {
          subQType = scaleTypeWeightsToTotal(
            qType as { mcq: number; reasoning: number; matching: number; statements: number },
            sc
          );
        }
        const fc = subFigures[i] ?? 0;
        onProgress?.(`Gemini · source ${i + 1}/${chunks.length} · ${sc} Q (batch ${count})…`);
        const part = await generateQuizQuestions(
          topic,
          subDiff,
          sc,
          subCtx,
          subQType,
          (s) => onProgress?.(`[seg ${i + 1}/${chunks.length}] ${s}`),
          fc,
          useSmiles,
          fc > 0 ? figureBreakdown : undefined,
          modelName,
          visualMode,
          syllabusTopics,
          pyqContext,
          isLengthy,
          isConfusingChoices,
          excludedTopicLabels,
          knowledgeBaseId,
          promptSetIdOverride,
          false,
          undefined
        );
        part.forEach((q, idx) => {
          merged.push({ ...q, id: `forge-${batchId}-${i}-${idx}` });
        });
        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 450 + Math.floor(Math.random() * 350)));
        }
      }
      return merged;
    }
  }

  const { fetchMergedPromptsForKbGeneration } = await import("./kbPromptService");
  const kbPromptMap =
    knowledgeBaseId && typeof knowledgeBaseId === "string" && knowledgeBaseId.trim()
      ? await fetchMergedPromptsForKbGeneration(knowledgeBaseId.trim(), {
          promptSetIdOverride: promptSetIdOverride?.trim() || undefined,
        })
      : null;

  const resolvePrompt = (key: string): string => {
    if (kbPromptMap && Object.prototype.hasOwnProperty.call(kbPromptMap, key)) {
      const v = kbPromptMap[key];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return getSystemPrompt(key);
  };

  const styleInstruction = ((): string => {
    if (typeof qType === 'string') {
      return `STRICT FORMAT: All ${count} questions MUST be of type "${qType}".`;
    }
    
    const typeSum = (qType.mcq || 0) + (qType.reasoning || 0) + (qType.matching || 0) + (qType.statements || 0);
    const isCounts = Math.round(typeSum) === count && count > 0;

    if (isCounts) {
      return `MANDATORY VOLUME DISTRIBUTION (TOTAL ${count} ITEMS):
        1. "mcq": Exactly ${qType.mcq || 0} items
        2. "reasoning": Exactly ${qType.reasoning || 0} items
        3. "matching": Exactly ${qType.matching || 0} items
        4. "statements": Exactly ${qType.statements || 0} items`;
    } else {
      const totalForRatio = typeSum || 1;
      return `MANDATORY VOLUME DISTRIBUTION (TOTAL ${count} ITEMS):
        1. "mcq": Exactly ${Math.round(((qType.mcq || 0) / totalForRatio) * count)} items
        2. "reasoning": Exactly ${Math.round(((qType.reasoning || 0) / totalForRatio) * count)} items
        3. "matching": Exactly ${Math.round(((qType.matching || 0) / totalForRatio) * count)} items
        4. "statements": Exactly ${Math.round(((qType.statements || 0) / totalForRatio) * count)} items`;
    }
  })();

  const difficultyInstruction = typeof difficulty === 'string'
    ? `STRICT DIFFICULTY MANDATE: All ${count} items MUST be precisely "${difficulty}" level.`
    : `STRICT DIFFICULTY COUNTS (MANDATORY):
    - "Easy": Exactly ${difficulty.easy} items.
    - "Medium": Exactly ${difficulty.medium} items.
    - "Hard": Exactly ${difficulty.hard} items.`;

  const scaledDifficultyForHint =
    typeof difficulty === "object" && difficulty !== null && count > 0
      ? scaleDifficultyCountsToTotal(difficulty, count)
      : null;

  const difficultyOrderHint =
    scaledDifficultyForHint &&
    scaledDifficultyForHint.easy + scaledDifficultyForHint.medium + scaledDifficultyForHint.hard === count
      ? `
    - **JSON "difficulty" (ORDER-LOCKED)**: Return exactly ${count} objects in array order. Use these positions so the Easy/Medium/Hard *counts* match the forge recipe; each slot’s **content** must genuinely match that tier (do not put recall-only items in a Hard slot):
      ${scaledDifficultyForHint.easy > 0 ? `- First ${scaledDifficultyForHint.easy} item(s): "Easy"` : ""}
      ${scaledDifficultyForHint.medium > 0 ? `- Next ${scaledDifficultyForHint.medium} item(s): "Medium"` : ""}
      ${scaledDifficultyForHint.hard > 0 ? `- Final ${scaledDifficultyForHint.hard} item(s): "Hard"` : ""}
    - **Semantic match**: The *stem, options, and reasoning demand* for each position must match that tier in the Difficulty protocol — Easy stays direct and scoring-friendly; Hard must earn the label with elite depth (not length alone).`
      : typeof difficulty === "string" && count > 0
        ? `
    - Every item's "difficulty" must be exactly "${capitalizeDifficultyMandate(difficulty)}", and every stem must match that tier’s cognitive demand in the Difficulty protocol.`
        : "";

  const visualInstruction = figureCount > 0 
    ? `[VISUAL_MANDATE]:
       - EXACTLY ${figureCount} out of ${count} questions MUST include a "figurePrompt".
       - For these ${figureCount} questions, you MUST specify a "sourceImageIndex" (integer) mapping to the diagrams provided.
       ${figureBreakdown ? `- FREQUENCY PER IMAGE (SourceIndex: Q_Count): ${figureBreakdown}` : ''}
       - **FIGURE PROMPT RULES**: 
         - The 'figurePrompt' must be a direct command to the image generator to TRACE the source image (or synthesize when no source).
         - **LABEL-TYPE vs CONTEXT-ONLY**:
           - **Label-type** (stem or options require identifying specific lettered/numbered parts: e.g. "Identify P", "structures marked P–S", "which arrow shows"): figurePrompt must name ONLY those exact markers (P, Q, … or A–D on the diagram). Strip every other label from the source; never copy the full textbook figure’s labels.
           - **Context-only** (diagram is setup only—pathway, graph, apparatus—and the stem does NOT ask to choose among marked parts): figurePrompt MUST say explicitly: "Unlabeled diagram only: NO letters, NO Roman numerals, NO words naming structures on the drawing—clean line art only."
         - **NO DUAL LABELING**: Never label the same structure twice. Forbidden: both a marker (P, Q, A, B) and a written structure name (e.g. mitochondria, nucleus) on the figure for the same pointer. The image uses only the minimal exam markers the question needs, OR no on-image text for context-only items.
         - **SYNC RULE**: Any letter/number drawn on the image must appear in the stem or options; do not add extra letters.
         - For trace-from-source: "Trace the structure EXACTLY. Remove ALL original text. Add ONLY the labels listed below: …"
         - **ANTI-DUPLICATION**: Use each label (P, Q, R…) EXACTLY ONCE on the image.
       - **QUESTION SYNERGY**: The question text MUST match what is (or is not) labeled on the figure.`
    : `[VISUAL_CONSTRAINT]: Do NOT include any figurePrompts. Generate text-only questions.`;

  const effectiveSyllabusList: string[] =
    syllabusTopicQuotaBatch && syllabusTopicQuotaBatch.length > 0
      ? syllabusTopicQuotaBatch.map((q) => String(q.label).trim()).filter(Boolean)
      : syllabusTopics && syllabusTopics.length > 0
        ? syllabusTopics.map((t) => String(t).trim()).filter(Boolean)
        : [];

  const syllabusInstruction =
    effectiveSyllabusList.length > 0
      ? `[CRITICAL_SYLLABUS_PROTOCOL]:
       - You are provided with a definitive list of authorized 'topic_tag' values.
       - For EACH question you generate, the 'topic_tag' field in the JSON object MUST be an EXACT, case-sensitive match to one of the strings in this list.
       - AUTHORIZED TOPICS: [${effectiveSyllabusList.map((t) => `"${t}"`).join(', ')}]
       - **FAILURE CONDITION**: It is strictly forbidden to generate a 'topic_tag' that is not on this list. Do not paraphrase, summarize, or invent new topics. For example, if the list contains "Cell Cycle", the tag must be "Cell Cycle", not "Phases of the Cell Cycle".`
      : '';

  const multiTopicQuotaInstruction =
    syllabusTopicQuotaBatch && syllabusTopicQuotaBatch.length > 1
      ? `[MULTI_TOPIC_QUOTA — HARD REQUIREMENT]:
The ${count} questions MUST satisfy this exact quota (topic_tag on each object):
${syllabusTopicQuotaBatch.map((x) => `• ${x.count} × topic_tag exactly "${String(x.label).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join('\n')}
- **JSON ARRAY ORDER**: Interleave topics as you build the array — do not place all items for one topic_tag before moving to the next.
- **INTRA_TOPIC_DEPTH**: Within each topic_tag, probe different ideas; no two questions on the same narrow fact or wording pattern.
${figureCount > 0 ? '- **FIGURE_SPREAD**: Each figure-backed question should emphasize a different sub-idea where possible (structure vs process vs graph vs apparatus).' : ''}`
      : '';

  const topicBreadthInstruction =
    syllabusTopicQuotaBatch && syllabusTopicQuotaBatch.length > 1
      ? ''
      : `[TOPIC_BREADTH — EXAM_COVERAGE]:
- Span as many distinct subtopics as ${count} questions reasonably allow; avoid clustering on one narrow theme.
${figureCount > 0 ? '- For diagram items: vary what is being tested (different structures, graphs, cycles, setups) — avoid repeating the same visual concept.' : ''}`;

  const exclusionInstruction =
    excludedTopicLabels && excludedTopicLabels.length > 0
      ? `[FORBIDDEN_TOPICS — NEGATIVE SYLLABUS LIST]:
       - Do NOT create questions that belong to, reference, or should be tagged with any of these topics (case-insensitive; treat as hard bans).
       - BANNED LABELS: [${excludedTopicLabels.map((t) => `"${String(t).trim()}"`).join(', ')}]
       - Your topic_tag for every question must clearly avoid these areas; if the source material mentions them, skip and choose another subtopic.`
      : '';

  try {
    const mainPrompt = `
    ${resolvePrompt('General')}
    ${kbPromptMap ? '' : getReferenceLayerBlock()}
    ${resolvePrompt('Difficulty')}
    ${resolvePrompt('Explanation')}
    ${resolvePrompt('Distractors')}
    ${resolvePrompt('Chemistry')}
    ${resolvePrompt('Latex')}
    ${figureCount > 0 ? resolvePrompt('Figure') : ''}
    
    ${styleInstruction}
    ${difficultyInstruction}
    ${difficultyOrderHint}
    ${visualInstruction}
    ${syllabusInstruction}
    ${multiTopicQuotaInstruction}
    ${topicBreadthInstruction}
    ${exclusionInstruction}
    ${FORGE_FORMAT_PROTOCOLS}

    WORLD CLASS TUNING:
    ${pyqContext ? `[PYQ_DNA_INJECTION_ACTIVE]: \n MIMIC THE STYLE OF THESE QUESTIONS BUT CHANGE THE CONTENT: \n ${pyqContext}` : ''}
    ${isLengthy ? `[CLINICAL_MODE_ACTIVE]: Frame questions as case studies, experiments, or real-world scenarios. Use scientific verbosity.` : ''}
    ${isConfusingChoices ? `[DECEPTION_MODE_ACTIVE]: Distractors must be highly plausible common misconceptions. Avoid obvious eliminations.` : ''}

    HARD COMPLIANCE CHECK:
    - You MUST return EXACTLY ${count} questions.
    - The difficulty counts MUST match exactly the mandate above.
    - **NEET GOAL**: Overall batch reflects a real paper mix — Easy items are genuinely accessible; Hard items are repeater-grade discriminators that still respect the syllabus; options vary across the batch (substantial numeric-option questions and near-miss distractors where topics allow, per OPTION FORMAT MIX in forge protocols).
    - **LABEL EXPLANATION CHECK**: If a question asks to identify labels (e.g. "Identify P"), the explanation MUST be ultra-short (max 2 sentences).

    - TARGET CHAPTER: "${topic}"
    - TOTAL QUANTITY: ${count} questions.
    - JSON OUTPUT REQUIRED.`;

    const contents: any[] = [{ role: 'user', parts: [{ text: mainPrompt }] }];
    
    const contextLimit = modelName.includes('pro') ? 100000 : 30000;
    if (sourceContext?.text) contents[0].parts.push({ text: `SOURCE MATERIAL: ${sourceContext.text.substring(0, contextLimit)}` });
    
    if (sourceContext?.images && sourceContext.images.length > 0) {
        sourceContext.images.forEach((img, idx) => {
            contents[0].parts.push({ text: `REFERENCE DIAGRAM ${idx}:` });
            contents[0].parts.push({ inlineData: { data: cleanBase64(img.data), mimeType: img.mimeType } });
        });
    }

    const config: any = {
        temperature: modelName.includes('pro') ? 0.2 : 0.1,
        maxOutputTokens: computeForgeMaxOutputTokens(count, modelName),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING },
                type: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                explanation: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                figurePrompt: { type: Type.STRING },
                sourceImageIndex: { type: Type.NUMBER },
                topic_tag: { type: Type.STRING },
                columnA: { type: Type.ARRAY, items: { type: Type.STRING } },
                columnB: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["text", "difficulty", "explanation", "options", "correctIndex", "type", "topic_tag"],
          }
        }
    };

    // Reserve output budget for JSON; thinking can share the same token cap on some models.
    config.thinkingConfig = { thinkingBudget: 0 };

    const styleLabel = typeof qType === "string" ? qType : "mixed_types";
    onProgress?.(`Gemini · ${styleLabel} · ${count} Q — sending request…`);

    const response = await retryWithBackoff(
      () =>
        adminGeminiGenerateContent({
          model: modelName,
          contents,
          config,
        }),
      6,
      2500
    );

    onProgress?.(`Gemini · ${styleLabel} · ${count} Q — received response, parsing…`);

    const finishReason = String(response.candidates?.[0]?.finishReason ?? "");

    // Repair the raw JSON string before parsing
    const rawText = response.text || "[]";
    const repairedText = repairInvalidJsonUnicodeEscapes(
      repairJsonLatexNewlineFalsePositive(repairMalformedJsonLatex(rawText))
    );

    let rawData: unknown;
    try {
      rawData = JSON.parse(repairedText);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const hint = forgeJsonParseHint(msg, repairedText.length, finishReason);
      throw new Error(`${msg} (JSON parse). ${hint}`);
    }
    const safeData = sanitizeResult(rawData);
    const list = Array.isArray(safeData) ? safeData : [];

    onProgress?.(`Gemini · ${styleLabel} — ${list.length} question(s) parsed`);

    return list.map((q: any, index: number) => ({ 
        id: `forge-${Date.now()}-${index}`, 
        ...q 
    }));
  } catch (error: any) { throw new Error(`Forge failed: ${error.message}`); }
};

/** Default for Neural Studio figure pipeline; override via Admin image-model selector. */
export const COMPOSITE_IMAGE_MODEL_DEFAULT = 'gemini-3-pro-image-preview' as const;

export const generateCompositeStyleVariants = async (
  sourceBase64: string,
  sourceMimeType: string,
  prompts: string[],
  useAsIs: boolean = false,
  imageModelId: string = COMPOSITE_IMAGE_MODEL_DEFAULT
): Promise<string[]> => {
    const results: string[] = [];
    const cleanedSource = cleanBase64(sourceBase64);
    if (!cleanedSource) return [];

    for (const prompt of prompts) {
        if (!prompt) {
            results.push("");
            continue;
        }
        try {
            const imagePart = { inlineData: { mimeType: sourceMimeType, data: cleanedSource } };
            const instruction = `TASK: Create a professional "NEET Exam Style" black-and-white line diagram based on the source image.

EXECUTION RULES (STRICT FIDELITY & CLEANING):
1. **TRACING MODE - ANCHOR PRESERVATION**: 
   - Trace the biological structures exactly as they appear. 
   - **CRITICAL**: Keep the leader lines (pointers) in the EXACT same position and angle as the original image.
   - ONLY change the text at the end of the line. 
   - If a line points to the Nucleus in the original, the new line MUST point to the Nucleus.
2. **CLEANING PHASE**: 
   - **REMOVE WATERMARKS**: Detect and erase any faint text, logos, or patterns overlaid on the image. The background must be pure white (#FFFFFF).
   - **REMOVE ORIGINAL TEXT**: Erase ALL existing text labels from the source image.
   - **AGGRESSIVE WHITENING**: Treat any light grey pixels as white to remove background noise/scans.
3. **LABELING PHASE**:
   - **EXCLUSIVE LABELING**: If the prompt asks for 'P', ONLY draw 'P'. Do NOT include 'Q', 'R', or any other label unless explicitly requested. If the original image had multiple labels, IGNORE them.
   - **CONTEXT-ONLY / UNLABELED**: If the prompt says "unlabeled", "no labels", "no text on the diagram", or equivalent, draw ZERO text on the image (no letters, no names).
   - **NO DUAL LABELING**: Never place both a marker (P, Q, A–D) and a word name (e.g. mitochondria) for the same leader line—letters only when the exam uses letters.
   - **STRICT MINIMALISM**: Only add the labels explicitly requested in the prompt. Do NOT add extra labels.
   - **NO DUPLICATES**: Use each label variable (P, Q, A, B) EXACTLY ONCE. Never label two different parts with the same letter.
   - **TYPOGRAPHY**: Use HUGE, BOLD, BLACK sans-serif font (size 40px+). Ensure letters are perfectly formed and horizontal.
4. **STYLE**: High-contrast black ink on white. No shading, gradients, or grey areas.

Prompt: ${prompt}`;
            
            const response = await adminGeminiGenerateContent({
                model: imageModelId,
                contents: { parts: [imagePart, { text: instruction }] },
            });
            const outputPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
            if (outputPart?.inlineData?.data) {
                results.push(cleanBase64(outputPart.inlineData.data));
            } else {
                console.warn("Gemini did not return an image for redraw prompt:", prompt);
                results.push("");
            }
        } catch (e: any) { 
            console.error("Visual Synthesis Error:", e);
            results.push("");
        }
    }
    return results;
};

export const generateCompositeFigures = async (
  prompts: string[],
  imageModelId: string = COMPOSITE_IMAGE_MODEL_DEFAULT
): Promise<string[]> => {
    const results: string[] = [];
    for (const prompt of prompts) {
        if (!prompt) {
            results.push("");
            continue;
        }
        try {
            const instruction = `TASK: Generate a high-precision "NEET Exam Style" black-and-white line diagram.
            
PROMPT: ${prompt}

RULES:
1. **STYLE**: Pure black ink on white. No shading, no grey. Professional textbook quality.
2. **CLEANING**: Ensure background is 100% white. No artifacts, no watermarks.
3. **LABELS**:
   - **EXCLUSIVE LABELING**: If the prompt asks for 'P', ONLY draw 'P'. Do NOT include 'Q', 'R', or any other label unless explicitly requested.
   - **UNLABELED DIAGRAMS**: If the prompt requires no on-image text (unlabeled / context-only), output a diagram with ZERO letters and ZERO structure names on the drawing.
   - **NO DUAL LABELING**: Do not write both a letter marker and a full structure name for the same part (e.g. not "P" and "Nucleus" together). Use only the exam-style marker the prompt specifies.
   - Use HUGE, BOLD, BLACK letters (A, B, C...) or numbers when labels are required.
   - **NO DUPLICATES**: Ensure every label is unique. Do not label two parts with 'A'.
   - Draw precise leader lines only for parts that must be labeled per the prompt.
   - **CENSORSHIP**: Do NOT write anatomical or chemical names on the image unless the prompt explicitly asks for names only (rare). Prefer single-letter or single-number markers only when the question uses them.
4. **CLARITY**: Ensure lines are distinct and parts are easily distinguishable.`;
            
            const response = await adminGeminiGenerateContent({
                model: imageModelId,
                contents: { parts: [{ text: instruction }] },
            });
            const outputPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
            if (outputPart?.inlineData?.data) {
                results.push(cleanBase64(outputPart.inlineData.data));
            } else {
                console.warn("Gemini did not return an image for synthetic prompt:", prompt);
                results.push("");
            }
        } catch (e: any) { 
            console.error("Pure Synthetic Synthesis Error:", e);
            results.push("");
        }
    }
    return results;
};

export const refineSystemPrompt = async (currentPrompt: string, instruction: string): Promise<string> => {
    try {
        const response = await adminGeminiGenerateContent({
            model: 'gemini-3-flash-preview',
            contents: `Refine prompt: ${instruction}. Current: ${currentPrompt}`,
        });
        return response.text || currentPrompt;
    } catch {
        return currentPrompt;
    }
};

export const forgeSequentialQuestions = generateQuizQuestions;
