/**
 * Local estimate of how many numbered question stems appear in the same plain text
 * Gemini sees (DOCX extraction with figure placeholders). Use only as a rough sanity
 * check — layout quirks and instructions can skew counts.
 */

export type ParseSanityWarning = {
  fileLabel: string;
  heuristicCount: number;
  extractedCount: number;
};

const DEFAULT_MIN_HEURISTIC = 5;
const DEFAULT_MIN_RATIO = 0.88;

export function estimateQuestionCountFromRawText(rawText: string): number {
  if (!rawText || rawText.trim().length < 40) return 0;
  const lines = rawText.split(/\r?\n/);
  const reNum = /^\s*(\d{1,4})\s*[.)]\s+\S/;
  const reParen = /^\s*\(?(\d{1,4})\)\s+\S/;
  const reQ = /^\s*Q\.?\s*(\d{1,4})\s*[.:)]\s*\S/i;
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 6) continue;
    if (reNum.test(t) || reParen.test(t) || reQ.test(t)) n += 1;
  }
  return n;
}

export function buildParseSanityWarning(
  rawText: string,
  extractedCount: number,
  fileLabel: string,
  opts?: { minHeuristic?: number; minRatio?: number }
): ParseSanityWarning | null {
  const minH = opts?.minHeuristic ?? DEFAULT_MIN_HEURISTIC;
  const minR = opts?.minRatio ?? DEFAULT_MIN_RATIO;
  const h = estimateQuestionCountFromRawText(rawText);
  if (h < minH) return null;
  if (extractedCount >= h * minR) return null;
  return { fileLabel, heuristicCount: h, extractedCount };
}
