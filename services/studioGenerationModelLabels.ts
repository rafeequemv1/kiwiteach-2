/**
 * Human-readable labels for Neural Studio text models → `question_bank_neet.generation_model`.
 * Keep in sync with model ids passed to `/api/gemini`.
 */
export const STUDIO_TEXT_MODEL_BANK_LABELS: Record<string, string> = {
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-flash-lite-latest': 'Gemini 3 Flash Lite',
};

export function bankLabelForTextGenerationModel(apiModelId: string | null | undefined): string | null {
  const id = (apiModelId || '').trim();
  if (!id) return null;
  return STUDIO_TEXT_MODEL_BANK_LABELS[id] ?? id;
}
