-- 1. Create the Storage Bucket for figures if it doesn't exist
insert into storage.buckets (id, name, public)
values ('question-figures', 'question-figures', true)
on conflict (id) do nothing;

-- 2. Storage Policies for 'question-figures' (Idempotent)
drop policy if exists "Allow authenticated uploads" on storage.objects;
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check (bucket_id = 'question-figures');

drop policy if exists "Allow public read" on storage.objects;
create policy "Allow public read"
on storage.objects for select
to public
using (bucket_id = 'question-figures');

-- 3. Table Schema for question_bank_neet
create table if not exists public.question_bank_neet (
  id uuid default gen_random_uuid() primary key,
  chapter_id uuid references public.chapters on delete cascade,
  chapter_name text,
  subject_name text,
  class_name text, -- Hierarchy tracking for storage paths
  
  question_text text not null,
  options jsonb,
  correct_index int, -- Snake case for Postgres
  difficulty text,
  question_type text,
  explanation text,
  figure_url text,
  page_number int,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Table Policies for question_bank_neet (Idempotent)
alter table public.question_bank_neet enable row level security;

drop policy if exists "Enable all access for authenticated users" on public.question_bank_neet;
create policy "Enable all access for authenticated users" 
on public.question_bank_neet for all 
using (auth.role() = 'authenticated');