-- Public marketing / checkout pricing (INR only). Amounts in paise (100 paise = ₹1).
-- Read by anon for the pricing page; edit via Supabase SQL or service role.

create table if not exists public.marketing_pricing_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  plan_key text not null unique,
  title text not null,
  description text not null default '',
  currency text not null default 'INR' check (currency = 'INR'),
  pricing_model text not null default 'fixed' check (pricing_model in ('fixed', 'custom')),
  monthly_amount_paise bigint,
  yearly_amount_paise bigint,
  highlight boolean not null default false,
  badge text,
  button_text text not null default 'Choose plan',
  features jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  dodo_product_id text,
  dodo_yearly_product_id text
);

comment on table public.marketing_pricing_plans is 'INR list prices for the public pricing page. Amounts in paise; use pricing_model=custom for Enterprise-style quotes.';
comment on column public.marketing_pricing_plans.monthly_amount_paise is 'Per month in paise when pricing_model=fixed; null when custom.';
comment on column public.marketing_pricing_plans.yearly_amount_paise is 'Total per year in paise when pricing_model=fixed; null when custom.';
comment on column public.marketing_pricing_plans.dodo_product_id is 'Optional Dodo product id for monthly checkout (wire in app when checkout is implemented).';
comment on column public.marketing_pricing_plans.dodo_yearly_product_id is 'Optional Dodo product id for yearly checkout.';

create index if not exists marketing_pricing_plans_active_sort_idx
  on public.marketing_pricing_plans (is_active, sort_order);

create or replace function public.marketing_pricing_plans_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists marketing_pricing_plans_updated_at on public.marketing_pricing_plans;
create trigger marketing_pricing_plans_updated_at
before update on public.marketing_pricing_plans
for each row execute function public.marketing_pricing_plans_set_updated_at();

alter table public.marketing_pricing_plans enable row level security;

drop policy if exists marketing_pricing_plans_public_read on public.marketing_pricing_plans;
create policy marketing_pricing_plans_public_read
  on public.marketing_pricing_plans for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists marketing_pricing_plans_dev_all on public.marketing_pricing_plans;
create policy marketing_pricing_plans_dev_all
  on public.marketing_pricing_plans for all
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

grant select on public.marketing_pricing_plans to anon, authenticated;
grant insert, update, delete on public.marketing_pricing_plans to authenticated;

-- Seed INR plans (edit amounts in Dashboard SQL as needed).
insert into public.marketing_pricing_plans (
  plan_key, title, description, currency, pricing_model,
  monthly_amount_paise, yearly_amount_paise, highlight, badge, button_text, features, sort_order
)
values
  (
    'tier-1',
    'Tier 1',
    '',
    'INR',
    'fixed',
    300000,
    3600000,
    false,
    null,
    'Choose Tier 1',
    jsonb_build_array(
      jsonb_build_object('name', 'Class Test QP PDF', 'icon', 'check', 'iconColor', 'text-green-500'),
      jsonb_build_object('name', 'Cost per student: Rs 10', 'icon', 'check', 'iconColor', 'text-orange-500'),
      jsonb_build_object('name', 'Rs 3000 per month', 'icon', 'check', 'iconColor', 'text-teal-500'),
      jsonb_build_object('name', 'Monthly QP limit applies', 'icon', 'check', 'iconColor', 'text-blue-500')
    ),
    1
  ),
  (
    'tier-2',
    'Tier 2',
    '',
    'INR',
    'fixed',
    12000,
    144000,
    true,
    'Most popular',
    'Choose Tier 2',
    jsonb_build_array(
      jsonb_build_object('name', 'Class Test QP PDF', 'icon', 'check', 'iconColor', 'text-green-500'),
      jsonb_build_object('name', 'Online exam', 'icon', 'check', 'iconColor', 'text-orange-500'),
      jsonb_build_object('name', 'Mock Test', 'icon', 'check', 'iconColor', 'text-teal-500'),
      jsonb_build_object('name', 'Student profile', 'icon', 'check', 'iconColor', 'text-blue-500'),
      jsonb_build_object('name', 'Report', 'icon', 'check', 'iconColor', 'text-zinc-500'),
      jsonb_build_object('name', 'Cost per student: Rs 15', 'icon', 'check', 'iconColor', 'text-zinc-500'),
      jsonb_build_object('name', 'Rs 120 per month (per student)', 'icon', 'check', 'iconColor', 'text-zinc-500')
    ),
    2
  ),
  (
    'tier-3',
    'Tier 3',
    '',
    'INR',
    'fixed',
    20000,
    240000,
    false,
    null,
    'Choose Tier 3',
    jsonb_build_array(
      jsonb_build_object('name', 'Question Paper (Class Test)', 'icon', 'check', 'iconColor', 'text-green-500'),
      jsonb_build_object('name', 'Student Profiles', 'icon', 'check', 'iconColor', 'text-orange-500'),
      jsonb_build_object('name', 'Online Test', 'icon', 'check', 'iconColor', 'text-teal-500'),
      jsonb_build_object('name', 'AI student report', 'icon', 'check', 'iconColor', 'text-blue-500'),
      jsonb_build_object('name', 'Report', 'icon', 'check', 'iconColor', 'text-zinc-500'),
      jsonb_build_object('name', 'Institute / Class Management', 'icon', 'check', 'iconColor', 'text-zinc-500'),
      jsonb_build_object('name', 'Cost per student: Rs 25', 'icon', 'check', 'iconColor', 'text-zinc-500'),
      jsonb_build_object('name', 'Rs 200 per month (per student, negotiable with student count)', 'icon', 'check', 'iconColor', 'text-zinc-500')
    ),
    3
  )
on conflict (plan_key) do update
set
  title = excluded.title,
  description = excluded.description,
  currency = excluded.currency,
  pricing_model = excluded.pricing_model,
  monthly_amount_paise = excluded.monthly_amount_paise,
  yearly_amount_paise = excluded.yearly_amount_paise,
  highlight = excluded.highlight,
  badge = excluded.badge,
  button_text = excluded.button_text,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());
