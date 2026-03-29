-- Batches of uploaded Mathpix .docx files for reference questions, with AI analysis state.

create table if not exists public.reference_question_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  doc_path text not null,
  original_filename text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  -- ai_status: pending | analyzing | complete | failed
  ai_status text not null default 'pending',
  ai_error text,
  -- preview_questions: Gemini drafts (JSON array) before commit to reference_questions
  preview_questions jsonb,
  committed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists reference_question_sets_created_idx
  on public.reference_question_sets (created_at desc);

create index if not exists reference_question_sets_uploaded_by_idx
  on public.reference_question_sets (uploaded_by);

alter table public.reference_question_sets enable row level security;

drop policy if exists reference_question_sets_select_auth on public.reference_question_sets;
create policy reference_question_sets_select_auth
on public.reference_question_sets for select
to authenticated
using (true);

drop policy if exists reference_question_sets_insert_admin on public.reference_question_sets;
create policy reference_question_sets_insert_admin
on public.reference_question_sets for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists reference_question_sets_update_admin on public.reference_question_sets;
create policy reference_question_sets_update_admin
on public.reference_question_sets for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists reference_question_sets_delete_admin on public.reference_question_sets;
create policy reference_question_sets_delete_admin
on public.reference_question_sets for delete
to authenticated
using (public.reference_questions_admin_access());

alter table public.reference_questions
  add column if not exists reference_set_id uuid references public.reference_question_sets (id) on delete set null;

create index if not exists reference_questions_set_idx on public.reference_questions (reference_set_id);

-- Original .docx storage (preview + re-analysis).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reference-question-docs',
  'reference-question-docs',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reference_question_docs_read_auth on storage.objects;
create policy reference_question_docs_read_auth
on storage.objects for select
to authenticated
using (bucket_id = 'reference-question-docs');

drop policy if exists reference_question_docs_insert_admin on storage.objects;
create policy reference_question_docs_insert_admin
on storage.objects for insert
to authenticated
with check (bucket_id = 'reference-question-docs' and public.reference_questions_admin_access());

drop policy if exists reference_question_docs_update_admin on storage.objects;
create policy reference_question_docs_update_admin
on storage.objects for update
to authenticated
using (bucket_id = 'reference-question-docs' and public.reference_questions_admin_access())
with check (bucket_id = 'reference-question-docs' and public.reference_questions_admin_access());

drop policy if exists reference_question_docs_delete_admin on storage.objects;
create policy reference_question_docs_delete_admin
on storage.objects for delete
to authenticated
using (bucket_id = 'reference-question-docs' and public.reference_questions_admin_access());
