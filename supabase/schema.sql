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
  class_ids jsonb default '[]'::jsonb,
  evaluation_pending boolean default false not null
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
  published_at timestamp with time zone default timezone('utc'::text, now()),
  meta_title text,
  meta_description text,
  canonical_path text,
  og_image_url text,
  faqs jsonb not null default '[]'::jsonb,
  keywords text
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

alter table if exists public.question_usage enable row level security;

drop policy if exists "Users can manage own question usage" on public.question_usage;
create policy "Users can manage own question usage"
on public.question_usage for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5. Dodo Payments (webhook / service role only; RLS enabled, no client policies)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  dodo_payment_id text not null unique,
  total_amount_minor bigint not null,
  currency text not null,
  status text,
  customer_id text,
  dodo_subscription_id text,
  dodo_created_at timestamptz,
  dodo_updated_at timestamptz,
  raw_event jsonb
);

create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_dodo_subscription_id_idx on public.payments (dodo_subscription_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  dodo_subscription_id text not null unique,
  customer_id text not null,
  status text not null,
  product_id text not null,
  currency text not null,
  recurring_pre_tax_amount bigint not null,
  cancel_at_next_billing_date boolean not null default false,
  previous_billing_date timestamptz,
  next_billing_date timestamptz,
  payment_frequency_count int not null,
  payment_frequency_interval text not null,
  subscription_period_count int not null,
  subscription_period_interval text not null,
  quantity int not null default 1,
  raw_event jsonb
);

create index if not exists subscriptions_customer_id_idx on public.subscriptions (customer_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

create or replace function public.dodo_payments_set_updated_at()
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

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
before update on public.payments
for each row execute function public.dodo_payments_set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.dodo_payments_set_updated_at();

alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;

-- 6. Marketing pricing (INR, public read for pricing page; amounts in paise)
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
