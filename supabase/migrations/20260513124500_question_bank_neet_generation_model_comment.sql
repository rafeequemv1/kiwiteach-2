-- Clarify generation_model stores display labels, not raw API ids.

comment on column public.question_bank_neet.generation_model is
  'Human-readable text synthesis model label (e.g. Gemini 3 Pro, Gemini 3 Flash, Gemini 3 Flash Lite). Null for legacy rows or non-AI inserts.';
