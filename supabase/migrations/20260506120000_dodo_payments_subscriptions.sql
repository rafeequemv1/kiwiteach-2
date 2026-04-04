-- Dodo Payments webhook persistence: payments and subscriptions (service role writes; RLS blocks anon/authenticated).

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

comment on table public.payments is 'Dodo Payments charges; written by /api/dodo-webhook with service role. Amounts are smallest currency units (e.g. cents).';
comment on column public.payments.total_amount_minor is 'Total charged including tax, in smallest currency unit per Dodo API.';
comment on column public.payments.raw_event is 'Last webhook payload for this payment (debugging).';

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

comment on table public.subscriptions is 'Dodo subscription state; written by /api/dodo-webhook with service role.';
comment on column public.subscriptions.recurring_pre_tax_amount is 'Recurring amount before tax, smallest currency unit per Dodo API.';
comment on column public.subscriptions.raw_event is 'Last webhook payload for this subscription (debugging).';

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

-- No policies: anon/authenticated have no access; service_role bypasses RLS for webhook upserts.
