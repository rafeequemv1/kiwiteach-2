-- Denormalized prompt set label at generation time (e.g. kb_prompt_sets.name, "Built-in defaults", "Neural Lab").
alter table public.question_bank_neet
  add column if not exists prompt_set_name text;

comment on column public.question_bank_neet.prompt_set_name is
  'Human-readable prompt set label when the row was created (cloud set name, or built-in / browser / lab).';

create index if not exists question_bank_neet_prompt_set_name_idx
  on public.question_bank_neet (prompt_set_name);

-- Backfill from join where possible
update public.question_bank_neet q
set prompt_set_name = s.name
from public.kb_prompt_sets s
where q.prompt_set_id is not null
  and q.prompt_set_id = s.id
  and (q.prompt_set_name is null or btrim(q.prompt_set_name) = '');

-- Backfill non-cloud rows from generation source (rows still missing a label)
update public.question_bank_neet
set prompt_set_name = case prompt_generation_source
  when 'builtin_default' then 'Built-in defaults'
  when 'browser_local' then 'Browser / local prompts'
  when 'cloud_set' then 'Cloud prompt set'
  else coalesce(nullif(btrim(prompt_set_name), ''), 'Unknown')
end
where prompt_set_name is null or btrim(prompt_set_name) = '';
