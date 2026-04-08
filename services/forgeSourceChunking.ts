/**
 * Split long chapter source text across multiple Gemini forge calls so each request
 * stays within a safe source budget (prompt + SOURCE MATERIAL + output).
 */

const PRO_MODEL_SOURCE_LIMIT_CHARS = 100_000;
const FLASH_MODEL_SOURCE_LIMIT_CHARS = 30_000;

/** Room for main instructions, schema, boundaries — not counted as "source". */
const PROMPT_AND_OVERHEAD_RESERVE_CHARS = 16_000;

/** Minimum chunk size when splitting (avoid tiny tail-only API calls). */
const MIN_CHUNK_CHARS = 4_000;

export function getMaxSourceCharsPerForgeCall(modelName: string): number {
  const limit = modelName.includes("pro") ? PRO_MODEL_SOURCE_LIMIT_CHARS : FLASH_MODEL_SOURCE_LIMIT_CHARS;
  return Math.max(8_000, limit - PROMPT_AND_OVERHEAD_RESERVE_CHARS);
}

/**
 * Largest-remainder: assign `total` across buckets proportional to positive weights.
 */
export function distributeIntegerByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total <= 0) return weights.map(() => 0);
  const w = weights.map((x) => Math.max(0, x));
  const sumW = w.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const out = w.map(() => 0);
    out[0] = total;
    return out;
  }
  const exact = w.map((wi) => (wi / sumW) * total);
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % n].i] += 1;
  return out;
}

export function scaleTypeWeightsToTotal(
  weights: { mcq: number; reasoning: number; matching: number; statements: number },
  total: number
): { mcq: number; reasoning: number; matching: number; statements: number } {
  const keys = ["mcq", "reasoning", "matching", "statements"] as const;
  const ws = keys.map((k) => Math.max(0, Math.floor(weights[k])));
  const sumW = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
  if (sumW <= 0) return { mcq: total, reasoning: 0, matching: 0, statements: 0 };
  const exact = keys.map((_, i) => (ws[i] / sumW) * total);
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % keys.length].i] += 1;
  return { mcq: out[0], reasoning: out[1], matching: out[2], statements: out[3] };
}

/**
 * Split `text` into <= `maxChunkChars` segments, preferring paragraph boundaries.
 * Merges trailing tiny pieces into the previous chunk.
 */
export function splitRawTextIntoForgeChunks(text: string, maxChunkChars: number): string[] {
  const t = text || "";
  if (t.length <= maxChunkChars) return [t];

  const chunks: string[] = [];
  const paragraphs = t.split(/\n{2,}/);
  let buf = "";

  const flush = () => {
    const s = buf.trim();
    if (s) chunks.push(s);
    buf = "";
  };

  for (const p of paragraphs) {
    const piece = p.trim();
    if (!piece) continue;
    const candidate = buf ? `${buf}\n\n${piece}` : piece;
    if (candidate.length <= maxChunkChars) {
      buf = candidate;
    } else {
      if (buf) flush();
      if (piece.length <= maxChunkChars) {
        buf = piece;
      } else {
        for (let i = 0; i < piece.length; i += maxChunkChars) {
          chunks.push(piece.slice(i, i + maxChunkChars));
        }
        buf = "";
      }
    }
  }
  flush();

  if (chunks.length === 0) return [t];

  // Merge last chunk if too small
  while (chunks.length >= 2 && chunks[chunks.length - 1].length < MIN_CHUNK_CHARS) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${last}`;
  }

  return chunks;
}

export function sourceChunkPreamble(partIndex: number, partTotal: number, chapterTopic: string): string {
  return `[SOURCE_SEGMENT ${partIndex + 1} of ${partTotal} — use ONLY this segment for facts; chapter context: "${chapterTopic.replace(/"/g, "'")}"]\n\n`;
}
