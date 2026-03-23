-- Knowledge base access control:
-- 1) Per-user grants from Admin
-- 2) Per-tier KB toggles for B2B subscription tiers
-- 3) RLS enforcement for KB + KB tree tables

create table if not exists public.user_knowledge_base_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, knowledge_base_id)
);

create index if not exists idx_user_kb_access_user on public.user_knowledge_base_access (user_id);
create index if not exists idx_user_kb_access_kb on public.user_knowledge_base_access (knowledge_base_id);

create table if not exists public.subscription_tier_knowledge_base_access (
  id uuid primary key default gen_random_uuid(),
  subscription_tier_id uuid not null references public.subscription_tiers (id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (subscription_tier_id, knowledge_base_id)
);

create index if not exists idx_tier_kb_access_tier on public.subscription_tier_knowledge_base_access (subscription_tier_id);
create index if not exists idx_tier_kb_access_kb on public.subscription_tier_knowledge_base_access (knowledge_base_id);

insert into public.subscription_tier_knowledge_base_access (subscription_tier_id, knowledge_base_id)
select st.id, kb.id
from public.subscription_tiers st
cross join public.knowledge_bases kb
where st.audience = 'b2b'
  and coalesce(kb.is_catalog, false) = true
on conflict (subscription_tier_id, knowledge_base_id) do nothing;

alter table public.user_knowledge_base_access enable row level security;
alter table public.subscription_tier_knowledge_base_access enable row level security;

drop policy if exists user_kb_access_select_admin on public.user_knowledge_base_access;
create policy user_kb_access_select_admin
on public.user_knowledge_base_access
for select
to authenticated
using (
  public.is_developer()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'school_admin'
  )
);

drop policy if exists user_kb_access_manage_admin on public.user_knowledge_base_access;
create policy user_kb_access_manage_admin
on public.user_knowledge_base_access
for all
to authenticated
using (
  public.is_developer()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'school_admin'
  )
)
with check (
  public.is_developer()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'school_admin'
  )
);

drop policy if exists tier_kb_access_select_auth on public.subscription_tier_knowledge_base_access;
create policy tier_kb_access_select_auth
on public.subscription_tier_knowledge_base_access
for select
to authenticated
using (true);

drop policy if exists tier_kb_access_manage_dev on public.subscription_tier_knowledge_base_access;
create policy tier_kb_access_manage_dev
on public.subscription_tier_knowledge_base_access
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists "Allow all" on public.knowledge_bases;
drop policy if exists "Allow all for authenticated" on public.knowledge_bases;
drop policy if exists "Enable all access for authenticated users" on public.knowledge_bases;

drop policy if exists "Allow all" on public.kb_classes;
drop policy if exists "Allow all for authenticated" on public.kb_classes;
drop policy if exists "Enable all access for authenticated users" on public.kb_classes;

drop policy if exists "Allow all" on public.subjects;
drop policy if exists "Allow all for authenticated" on public.subjects;
drop policy if exists "Enable all access for authenticated users" on public.subjects;

drop policy if exists "Allow all" on public.chapters;
drop policy if exists "Allow all for authenticated" on public.chapters;
drop policy if exists "Enable all access for authenticated users" on public.chapters;
drop policy if exists "Enable all access for everyone" on public.chapters;

drop policy if exists knowledge_bases_select_by_access on public.knowledge_bases;
create policy knowledge_bases_select_by_access
on public.knowledge_bases
for select
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
  or coalesce(is_catalog, false) = true
  or exists (
    select 1
    from public.user_knowledge_base_access uka
    where uka.user_id = auth.uid()
      and uka.knowledge_base_id = knowledge_bases.id
  )
  or exists (
    select 1
    from public.profiles p
    join public.businesses b on b.id = p.business_id
    join public.subscription_tier_knowledge_base_access stka on stka.subscription_tier_id = b.subscription_tier_id
    where p.id = auth.uid()
      and stka.knowledge_base_id = knowledge_bases.id
  )
);

drop policy if exists knowledge_bases_insert_owner_or_admin on public.knowledge_bases;
create policy knowledge_bases_insert_owner_or_admin
on public.knowledge_bases
for insert
to authenticated
with check (
  public.is_developer()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('school_admin', 'teacher')
  )
);

drop policy if exists knowledge_bases_update_owner_or_admin on public.knowledge_bases;
create policy knowledge_bases_update_owner_or_admin
on public.knowledge_bases
for update
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
)
with check (
  public.is_developer()
  or user_id = auth.uid()
);

drop policy if exists knowledge_bases_delete_owner_or_admin on public.knowledge_bases;
create policy knowledge_bases_delete_owner_or_admin
on public.knowledge_bases
for delete
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
);

drop policy if exists kb_classes_select_by_kb_access on public.kb_classes;
create policy kb_classes_select_by_kb_access
on public.kb_classes
for select
to authenticated
using (
  exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = kb_classes.kb_id
  )
);

drop policy if exists kb_classes_manage_admin on public.kb_classes;
create policy kb_classes_manage_admin
on public.kb_classes
for all
to authenticated
using (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = kb_classes.kb_id
      and kb.user_id = auth.uid()
  )
)
with check (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = kb_classes.kb_id
      and kb.user_id = auth.uid()
  )
);

drop policy if exists subjects_select_by_kb_access on public.subjects;
create policy subjects_select_by_kb_access
on public.subjects
for select
to authenticated
using (
  exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = subjects.kb_id
  )
);

drop policy if exists subjects_manage_admin on public.subjects;
create policy subjects_manage_admin
on public.subjects
for all
to authenticated
using (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = subjects.kb_id
      and kb.user_id = auth.uid()
  )
)
with check (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = subjects.kb_id
      and kb.user_id = auth.uid()
  )
);

drop policy if exists chapters_select_by_kb_access on public.chapters;
create policy chapters_select_by_kb_access
on public.chapters
for select
to authenticated
using (
  exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = chapters.kb_id
  )
);

drop policy if exists chapters_manage_admin on public.chapters;
create policy chapters_manage_admin
on public.chapters
for all
to authenticated
using (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = chapters.kb_id
      and kb.user_id = auth.uid()
  )
)
with check (
  public.is_developer()
  or exists (
    select 1 from public.knowledge_bases kb
    where kb.id = chapters.kb_id
      and kb.user_id = auth.uid()
  )
);
