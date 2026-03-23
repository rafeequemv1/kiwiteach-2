-- Business → institutes hierarchy (institutes belong to a business).
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

drop policy if exists "Users manage own businesses" on public.businesses;
create policy "Users manage own businesses"
on public.businesses for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.businesses is 'Top-level org (franchise / business); institutes are grouped under a business.';
comment on column public.institutes.business_id is 'Optional parent business; null = unassigned legacy row.';
