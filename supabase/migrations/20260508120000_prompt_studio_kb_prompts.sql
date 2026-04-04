-- Prompt Studio (NEET): KB-scoped saved system prompt sets + reference-layer documents (not reference_questions).
-- Reference layers are source papers/docs (DOCX with figures); AI analysis drives generated prompt JSON.

create table if not exists public.prompt_reference_layers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  title text,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  analysis_json jsonb,
  analysis_status text not null default 'pending',
  analysis_error text,
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists prompt_reference_layers_kb_idx
  on public.prompt_reference_layers (knowledge_base_id, created_at desc);

create table if not exists public.kb_prompt_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  name text not null,
  set_kind text not null default 'manual',
  reference_layer_id uuid references public.prompt_reference_layers (id) on delete set null,
  prompts_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  constraint kb_prompt_sets_set_kind_chk
    check (set_kind in ('manual', 'reference_derived'))
);

create index if not exists kb_prompt_sets_kb_idx
  on public.kb_prompt_sets (knowledge_base_id, created_at desc);

-- One preference row per knowledge base: which saved set is active for generation (null = browser defaults).
create table if not exists public.kb_prompt_preferences (
  knowledge_base_id uuid primary key references public.knowledge_bases (id) on delete cascade,
  active_prompt_set_id uuid references public.kb_prompt_sets (id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.prompt_reference_layers enable row level security;
alter table public.kb_prompt_sets enable row level security;
alter table public.kb_prompt_preferences enable row level security;

drop policy if exists prompt_reference_layers_select_auth on public.prompt_reference_layers;
create policy prompt_reference_layers_select_auth
on public.prompt_reference_layers for select
to authenticated
using (true);

drop policy if exists prompt_reference_layers_insert_admin on public.prompt_reference_layers;
create policy prompt_reference_layers_insert_admin
on public.prompt_reference_layers for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists prompt_reference_layers_update_admin on public.prompt_reference_layers;
create policy prompt_reference_layers_update_admin
on public.prompt_reference_layers for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists prompt_reference_layers_delete_admin on public.prompt_reference_layers;
create policy prompt_reference_layers_delete_admin
on public.prompt_reference_layers for delete
to authenticated
using (public.reference_questions_admin_access());

drop policy if exists kb_prompt_sets_select_auth on public.kb_prompt_sets;
create policy kb_prompt_sets_select_auth
on public.kb_prompt_sets for select
to authenticated
using (true);

drop policy if exists kb_prompt_sets_insert_admin on public.kb_prompt_sets;
create policy kb_prompt_sets_insert_admin
on public.kb_prompt_sets for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists kb_prompt_sets_update_admin on public.kb_prompt_sets;
create policy kb_prompt_sets_update_admin
on public.kb_prompt_sets for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists kb_prompt_sets_delete_admin on public.kb_prompt_sets;
create policy kb_prompt_sets_delete_admin
on public.kb_prompt_sets for delete
to authenticated
using (public.reference_questions_admin_access());

drop policy if exists kb_prompt_preferences_select_auth on public.kb_prompt_preferences;
create policy kb_prompt_preferences_select_auth
on public.kb_prompt_preferences for select
to authenticated
using (true);

drop policy if exists kb_prompt_preferences_insert_admin on public.kb_prompt_preferences;
create policy kb_prompt_preferences_insert_admin
on public.kb_prompt_preferences for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists kb_prompt_preferences_update_admin on public.kb_prompt_preferences;
create policy kb_prompt_preferences_update_admin
on public.kb_prompt_preferences for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists kb_prompt_preferences_delete_admin on public.kb_prompt_preferences;
create policy kb_prompt_preferences_delete_admin
on public.kb_prompt_preferences for delete
to authenticated
using (public.reference_questions_admin_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prompt-reference-docs',
  'prompt-reference-docs',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists prompt_reference_docs_read_auth on storage.objects;
create policy prompt_reference_docs_read_auth
on storage.objects for select
to authenticated
using (bucket_id = 'prompt-reference-docs');

drop policy if exists prompt_reference_docs_insert_admin on storage.objects;
create policy prompt_reference_docs_insert_admin
on storage.objects for insert
to authenticated
with check (bucket_id = 'prompt-reference-docs' and public.reference_questions_admin_access());

drop policy if exists prompt_reference_docs_update_admin on storage.objects;
create policy prompt_reference_docs_update_admin
on storage.objects for update
to authenticated
using (bucket_id = 'prompt-reference-docs' and public.reference_questions_admin_access())
with check (bucket_id = 'prompt-reference-docs' and public.reference_questions_admin_access());

drop policy if exists prompt_reference_docs_delete_admin on storage.objects;
create policy prompt_reference_docs_delete_admin
on storage.objects for delete
to authenticated
using (bucket_id = 'prompt-reference-docs' and public.reference_questions_admin_access());

comment on table public.prompt_reference_layers is
  'Uploaded reference papers for Prompt Studio (style analysis). Not the reference_questions bank.';

comment on table public.kb_prompt_sets is
  'Saved NEET system prompt bundles per knowledge base (manual or derived from prompt_reference_layers).';

comment on table public.kb_prompt_preferences is
  'Which kb_prompt_sets row is active for quiz generation per knowledge base; null active id = client defaults.';
