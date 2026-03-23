-- NEET PYQ management table + storage bucket for figures.

create or replace function public.pyq_admin_access()
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

create table if not exists public.pyq_questions_neet (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  question_text text not null,
  options jsonb,
  correct_index int,
  explanation text,
  question_type text not null default 'mcq',
  difficulty text,
  subject_name text,
  chapter_name text,
  topic_tag text,
  class_name text default 'NEET',
  year int,
  source_exam text,
  paper_code text,
  image_url text,
  source_figure_url text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null
);

create index if not exists pyq_questions_neet_subject_idx on public.pyq_questions_neet (subject_name);
create index if not exists pyq_questions_neet_chapter_idx on public.pyq_questions_neet (chapter_name);
create index if not exists pyq_questions_neet_year_idx on public.pyq_questions_neet (year);

alter table public.pyq_questions_neet enable row level security;

drop policy if exists pyq_questions_select_auth on public.pyq_questions_neet;
create policy pyq_questions_select_auth
on public.pyq_questions_neet for select
to authenticated
using (true);

drop policy if exists pyq_questions_insert_admin on public.pyq_questions_neet;
create policy pyq_questions_insert_admin
on public.pyq_questions_neet for insert
to authenticated
with check (public.pyq_admin_access());

drop policy if exists pyq_questions_update_admin on public.pyq_questions_neet;
create policy pyq_questions_update_admin
on public.pyq_questions_neet for update
to authenticated
using (public.pyq_admin_access())
with check (public.pyq_admin_access());

drop policy if exists pyq_questions_delete_admin on public.pyq_questions_neet;
create policy pyq_questions_delete_admin
on public.pyq_questions_neet for delete
to authenticated
using (public.pyq_admin_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pyq-images',
  'pyq-images',
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

drop policy if exists pyq_images_read_auth on storage.objects;
create policy pyq_images_read_auth
on storage.objects for select
to authenticated
using (bucket_id = 'pyq-images');

drop policy if exists pyq_images_insert_admin on storage.objects;
create policy pyq_images_insert_admin
on storage.objects for insert
to authenticated
with check (bucket_id = 'pyq-images' and public.pyq_admin_access());

drop policy if exists pyq_images_update_admin on storage.objects;
create policy pyq_images_update_admin
on storage.objects for update
to authenticated
using (bucket_id = 'pyq-images' and public.pyq_admin_access())
with check (bucket_id = 'pyq-images' and public.pyq_admin_access());

drop policy if exists pyq_images_delete_admin on storage.objects;
create policy pyq_images_delete_admin
on storage.objects for delete
to authenticated
using (bucket_id = 'pyq-images' and public.pyq_admin_access());

