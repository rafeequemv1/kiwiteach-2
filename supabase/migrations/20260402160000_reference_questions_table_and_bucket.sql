-- Reference questions: import/canonical samples used for Neural Studio style + quality.
-- Includes storage bucket for extracted figures/images from Mathpix docs.

create or replace function public.reference_questions_admin_access()
returns boolean
language sql
stable
as $$
  select
    public.is_developer()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'school_admin'
    );
$$;

create table if not exists public.reference_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),

  question_text text not null,
  options jsonb,
  choice_a text,
  choice_b text,
  choice_c text,
  choice_d text,
  correct_answer text,
  correct_index int,
  explanation text,
  question_type text not null default 'mcq',
  question_format text not null default 'text',
  difficulty text,

  class_name text,
  subject_name text,
  chapter_name text,
  topic_tag text,

  image_url text,
  source_image_url text,
  source_doc_name text,
  source_doc_page int,

  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null
);

create index if not exists reference_questions_class_idx on public.reference_questions (class_name);
create index if not exists reference_questions_subject_idx on public.reference_questions (subject_name);
create index if not exists reference_questions_chapter_idx on public.reference_questions (chapter_name);
create index if not exists reference_questions_topic_idx on public.reference_questions (topic_tag);

alter table public.reference_questions enable row level security;

drop policy if exists reference_questions_select_auth on public.reference_questions;
create policy reference_questions_select_auth
on public.reference_questions for select
to authenticated
using (true);

drop policy if exists reference_questions_insert_admin on public.reference_questions;
create policy reference_questions_insert_admin
on public.reference_questions for insert
to authenticated
with check (public.reference_questions_admin_access());

drop policy if exists reference_questions_update_admin on public.reference_questions;
create policy reference_questions_update_admin
on public.reference_questions for update
to authenticated
using (public.reference_questions_admin_access())
with check (public.reference_questions_admin_access());

drop policy if exists reference_questions_delete_admin on public.reference_questions;
create policy reference_questions_delete_admin
on public.reference_questions for delete
to authenticated
using (public.reference_questions_admin_access());

-- Storage bucket for imported question images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reference-question-images',
  'reference-question-images',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reference_question_images_read_auth on storage.objects;
create policy reference_question_images_read_auth
on storage.objects for select
to authenticated
using (bucket_id = 'reference-question-images');

drop policy if exists reference_question_images_insert_admin on storage.objects;
create policy reference_question_images_insert_admin
on storage.objects for insert
to authenticated
with check (bucket_id = 'reference-question-images' and public.reference_questions_admin_access());

drop policy if exists reference_question_images_update_admin on storage.objects;
create policy reference_question_images_update_admin
on storage.objects for update
to authenticated
using (bucket_id = 'reference-question-images' and public.reference_questions_admin_access())
with check (bucket_id = 'reference-question-images' and public.reference_questions_admin_access());

drop policy if exists reference_question_images_delete_admin on storage.objects;
create policy reference_question_images_delete_admin
on storage.objects for delete
to authenticated
using (bucket_id = 'reference-question-images' and public.reference_questions_admin_access());

