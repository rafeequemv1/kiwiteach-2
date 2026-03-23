-- Safety migration: ensure org tables exist even if earlier runs failed.
-- `gen_random_uuid()` requires `pgcrypto`.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists businesses_user_id_idx on public.businesses (user_id);

alter table public.institutes
  add column if not exists business_id uuid references public.businesses (id) on delete set null;

create index if not exists institutes_business_id_idx on public.institutes (business_id);

alter table public.businesses enable row level security;

