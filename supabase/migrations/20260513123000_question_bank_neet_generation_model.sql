-- Gemini (or other) text model id used for Neural Studio question synthesis.

alter table public.question_bank_neet
  add column if not exists generation_model text;

comment on column public.question_bank_neet.generation_model is
  'Human-readable text synthesis model label (e.g. Gemini 3 Pro, Gemini 3 Flash, Gemini 3 Flash Lite). Null for legacy rows or non-AI inserts.';

create index if not exists question_bank_neet_generation_model_idx
  on public.question_bank_neet (generation_model);
