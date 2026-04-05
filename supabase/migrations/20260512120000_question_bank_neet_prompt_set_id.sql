-- Track which KB prompt set was active when a question was generated (cloud_set only).

alter table public.question_bank_neet
  add column if not exists prompt_set_id uuid references public.kb_prompt_sets (id) on delete set null;

comment on column public.question_bank_neet.prompt_set_id is
  'When set, the kb_prompt_sets row whose prompts were merged for generation (KB generation_prompt_source = cloud_set). Null for browser local, built-in defaults, or legacy rows.';

create index if not exists question_bank_neet_prompt_set_id_idx
  on public.question_bank_neet (prompt_set_id);
