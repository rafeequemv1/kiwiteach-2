/** localStorage key for admin NEET “reference paper” quality layer (Prompts → NEET). */
export const KIWITEACH_NEET_PROMPT_EXTRAS_KEY = 'kiwiteach_neet_prompt_extras';

/** Optional admin reference excerpt: guides style/depth only when enabled. */
export function getReferenceLayerBlock(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(KIWITEACH_NEET_PROMPT_EXTRAS_KEY);
    if (!raw) return '';
    const j = JSON.parse(raw) as { referenceLayerEnabled?: boolean; referenceLayerText?: string };
    if (!j.referenceLayerEnabled) return '';
    const text = String(j.referenceLayerText || '').trim();
    if (!text) return '';
    return `
[REFERENCE_PAPER_QUALITY_BAR — PATTERN AND DEPTH ONLY]:
- Match or exceed the stem length, reasoning depth, and option quality implied by the excerpt below.
- Do NOT copy wording, numbers, labels, or identifiable scenarios from the reference. Invent fresh, syllabus-faithful items.
- Do not cite papers, institutes, or book titles.

Reference excerpt (non-authoritative; style bar only):
${text}
`;
  } catch {
    return '';
  }
}
