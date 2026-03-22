-- Enable Row Level Security (RLS) for the tables.
alter table if exists public.folders enable row level security;
alter table if exists public.tests enable row level security;

-- Drop existing policies if they exist, to prevent conflicts.
drop policy if exists "Allow authenticated users to manage their own folders" on public.folders;
drop policy if exists "Allow authenticated users to manage their own tests" on public.tests;

-- 1. Folders Table
-- Stores user-created folders for organizing tests.
create table if not exists public.folders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  parent_id uuid references public.folders on delete cascade,
  name text not null
);

-- RLS Policy for Folders
-- This policy allows users to perform any action (SELECT, INSERT, UPDATE, DELETE)
-- on folders where their authenticated user ID matches the 'user_id' column.
create policy "Allow authenticated users to manage their own folders"
on public.folders for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- 2. Tests Table
-- Stores created tests, including draft blueprints and generated question sets.
create table if not exists public.tests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  folder_id uuid references public.folders on delete set null,
  
  name text not null,
  status text default 'draft', -- e.g., 'draft', 'generated', 'scheduled'
  
  questions jsonb default '[]'::jsonb,
  question_ids text[] default array[]::text[], 
  question_count int default 0,
  
  -- 'config' stores the test creation blueprint (source chapters, settings, etc.)
  config jsonb default '{}'::jsonb,
  layout_config jsonb default '{}'::jsonb,
  
  scheduled_at timestamp with time zone,
  class_ids text[] default array[]::text[]
);

-- RLS Policy for Tests
-- This policy allows users to perform any action on tests
-- where their authenticated user ID matches the 'user_id' column.
create policy "Allow authenticated users to manage their own tests"
on public.tests for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 3. Blog posts (marketing journal — public read for published rows)
create table if not exists public.blog_posts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  category text not null default 'General',
  cover_image_url text,
  author_name text default 'KiwiTeach',
  published boolean default true not null,
  published_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists blog_posts_published_at_idx
  on public.blog_posts (published_at desc nulls last);

grant select on public.blog_posts to anon, authenticated;

alter table public.blog_posts enable row level security;

drop policy if exists "Public read published blog posts" on public.blog_posts;
create policy "Public read published blog posts"
on public.blog_posts for select
using (published = true);

-- 4. Question usage tracking (class-scoped no-repeat)
create table if not exists public.question_usage (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  class_id uuid references public.classes on delete cascade not null,
  question_id uuid not null,
  test_id uuid references public.tests on delete set null,
  used_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (class_id, question_id)
);

create index if not exists question_usage_class_used_at_idx
  on public.question_usage (class_id, used_at desc);

create index if not exists question_usage_question_id_idx
  on public.question_usage (question_id);

create index if not exists question_usage_user_class_idx
  on public.question_usage (user_id, class_id);

create table if not exists public.question_usage_history (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  class_id uuid references public.classes on delete cascade not null,
  question_id uuid not null,
  test_id uuid references public.tests on delete set null,
  used_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists question_usage_history_class_used_at_idx
  on public.question_usage_history (class_id, used_at desc);

create index if not exists question_usage_history_question_id_idx
  on public.question_usage_history (question_id);

alter table if exists public.question_usage enable row level security;
alter table if exists public.question_usage_history enable row level security;

drop policy if exists "Users can manage own question usage" on public.question_usage;
create policy "Users can manage own question usage"
on public.question_usage for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own question usage history" on public.question_usage_history;
create policy "Users can manage own question usage history"
on public.question_usage_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
