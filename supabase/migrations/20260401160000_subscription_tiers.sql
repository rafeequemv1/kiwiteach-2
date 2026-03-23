-- B2B subscription tier definitions (features only; limits in next step).

create table if not exists public.subscription_tiers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  audience text not null check (audience in ('b2b', 'b2c')),
  tier_key text not null unique,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

create index if not exists subscription_tiers_audience_sort_idx
  on public.subscription_tiers (audience, sort_order);

alter table public.subscription_tiers enable row level security;

drop policy if exists subscription_tiers_select_auth on public.subscription_tiers;
create policy subscription_tiers_select_auth
on public.subscription_tiers for select
to authenticated
using (true);

drop policy if exists subscription_tiers_insert_dev on public.subscription_tiers;
create policy subscription_tiers_insert_dev
on public.subscription_tiers for insert
to authenticated
with check (public.is_developer());

drop policy if exists subscription_tiers_update_dev on public.subscription_tiers;
create policy subscription_tiers_update_dev
on public.subscription_tiers for update
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists subscription_tiers_delete_dev on public.subscription_tiers;
create policy subscription_tiers_delete_dev
on public.subscription_tiers for delete
to authenticated
using (public.is_developer());

-- Seed B2B tiers.
-- Features (for now): only store what tier includes; limit enforcement comes later.
insert into public.subscription_tiers (audience, tier_key, name, description, sort_order, features)
values
  (
    'b2b',
    'b2b_tier_1',
    'Tier 1',
    'Test paper generation only',
    1,
    jsonb_build_object(
      'test_paper_generation', true,
      'online_exam', false,
      'student_profiles', false
    )
  ),
  (
    'b2b',
    'b2b_tier_2',
    'Tier 2',
    'Online exam + student profiles',
    2,
    jsonb_build_object(
      'test_paper_generation', true,
      'online_exam', true,
      'student_profiles', true
    )
  ),
  (
    'b2b',
    'b2b_tier_3',
    'Tier 3',
    'All features',
    3,
    jsonb_build_object(
      'test_paper_generation', true,
      'online_exam', true,
      'student_profiles', true,
      'all_features', true
    )
  )
on conflict (tier_key) do update
set
  audience = excluded.audience,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  features = excluded.features,
  updated_at = timezone('utc'::text, now());

