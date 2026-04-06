-- Record how prompts were sourced for Neural Studio forge (not only cloud kb_prompt_sets).

alter table public.question_bank_neet
  add column if not exists prompt_generation_source text;

alter table public.question_bank_neet
  drop constraint if exists question_bank_neet_prompt_generation_source_chk;

alter table public.question_bank_neet
  add constraint question_bank_neet_prompt_generation_source_chk
  check (
    prompt_generation_source is null
    or prompt_generation_source in ('builtin_default', 'browser_local', 'cloud_set')
  );

comment on column public.question_bank_neet.prompt_generation_source is
  'Neural Studio: builtin_default = shipped DEFAULT_PROMPTS; browser_local = localStorage + reference layer (no cloud set row); cloud_set = merged kb_prompt_sets (prompt_set_id set when known). Null = legacy row before this column.';

create index if not exists question_bank_neet_prompt_generation_source_idx
  on public.question_bank_neet (prompt_generation_source);
