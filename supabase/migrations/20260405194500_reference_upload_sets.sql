-- Reference question bank batches (mirrors pyq_upload_sets pattern; different table name).
-- Links public.reference_questions.reference_upload_set_id → batches for CSV/local-doc imports.

create table if not exists public.reference_upload_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  original_filename text,
  source_kind text not null default 'unknown',
  uploaded_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  -- Optional; same column as PYQ for parity. No unique constraint — reference imports are not merged by year.
  ingestion_year int
);

create index if not exists reference_upload_sets_created_idx on public.reference_upload_sets (created_at desc);

alter table public.reference_upload_sets enable row level security;

drop policy if exists reference_upload_sets_select_auth on public.reference_upload_sets;
create policy reference_upload_sets_select_auth
on public.reference_upload_sets for select
to authenticated
using (true);

drop policy if exists reference_upload_sets_insert_admin on public.reference_upload_sets;
create policy reference_upload_sets_insert_admin
on public.reference_upload_sets for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists reference_upload_sets_update_admin on public.reference_upload_sets;
create policy reference_upload_sets_update_admin
on public.reference_upload_sets for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists reference_upload_sets_delete_admin on public.reference_upload_sets;
create policy reference_upload_sets_delete_admin
on public.reference_upload_sets for delete
to authenticated
using (public.reference_questions_admin_access());

alter table public.reference_questions
  add column if not exists reference_upload_set_id uuid references public.reference_upload_sets (id) on delete cascade;

create index if not exists reference_questions_upload_set_idx on public.reference_questions (reference_upload_set_id);

comment on table public.reference_upload_sets is 'Batches for reference_questions CSV/local imports (parallel to pyq_upload_sets).';
comment on column public.reference_questions.reference_upload_set_id is 'Batch from reference_upload_sets; Mathpix/AI sets use reference_set_id on reference_question_sets instead.';
