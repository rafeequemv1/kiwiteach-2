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
