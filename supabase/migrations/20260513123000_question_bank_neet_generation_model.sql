-- Gemini (or other) text model id used for Neural Studio question synthesis.

alter table public.question_bank_neet
  add column if not exists generation_model text;

comment on column public.question_bank_neet.generation_model is
  'API model id for text question generation (e.g. gemini-3-pro-preview, gemini-3-flash-preview, gemini-flash-lite-latest). Null for legacy rows or non-AI inserts.';

create index if not exists question_bank_neet_generation_model_idx
  on public.question_bank_neet (generation_model);
