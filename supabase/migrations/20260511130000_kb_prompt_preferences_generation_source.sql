-- Distinguish how Neural Studio resolves prompts per KB: shipped defaults vs browser localStorage vs cloud set.

alter table public.kb_prompt_preferences
  add column if not exists generation_prompt_source text;

update public.kb_prompt_preferences
set generation_prompt_source = case
  when active_prompt_set_id is not null then 'cloud_set'
  else 'browser_local'
end
where generation_prompt_source is null;

alter table public.kb_prompt_preferences
  alter column generation_prompt_source set default 'browser_local';

alter table public.kb_prompt_preferences
  alter column generation_prompt_source set not null;

alter table public.kb_prompt_preferences
  drop constraint if exists kb_prompt_preferences_generation_source_chk;

alter table public.kb_prompt_preferences
  add constraint kb_prompt_preferences_generation_source_chk
  check (generation_prompt_source in ('builtin_default', 'browser_local', 'cloud_set'));

comment on column public.kb_prompt_preferences.generation_prompt_source is
  'Neural Studio / generateQuizQuestions: builtin_default = DEFAULT_PROMPTS; browser_local = null kb map (localStorage + reference block); cloud_set = active_prompt_set_id row.';
