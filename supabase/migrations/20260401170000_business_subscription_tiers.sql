-- Subscription tier assignment to businesses + public pricing read.

alter table public.businesses
  add column if not exists subscription_tier_id uuid null
  references public.subscription_tiers (id) on delete set null;

create index if not exists businesses_subscription_tier_id_idx
  on public.businesses (subscription_tier_id);

-- Allow public website (anon role) to read tier definitions.
drop policy if exists subscription_tiers_select_anon on public.subscription_tiers;
create policy subscription_tiers_select_anon
on public.subscription_tiers for select
to anon
using (true);

