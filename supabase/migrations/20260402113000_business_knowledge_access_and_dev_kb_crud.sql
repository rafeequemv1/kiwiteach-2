-- Business-level KB access for usage (paper generation),
-- while KB CRUD remains developer-only.

create table if not exists public.business_knowledge_base_access (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_id, knowledge_base_id)
);

create index if not exists idx_business_kb_access_business on public.business_knowledge_base_access (business_id);
create index if not exists idx_business_kb_access_kb on public.business_knowledge_base_access (knowledge_base_id);

insert into public.business_knowledge_base_access (business_id, knowledge_base_id)
select b.id, kb.id
from public.businesses b
cross join public.knowledge_bases kb
where coalesce(kb.is_catalog, false) = true
on conflict (business_id, knowledge_base_id) do nothing;

alter table public.business_knowledge_base_access enable row level security;

drop policy if exists business_kb_access_select_admin on public.business_knowledge_base_access;
create policy business_kb_access_select_admin
on public.business_knowledge_base_access
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

drop policy if exists business_kb_access_manage_admin on public.business_knowledge_base_access;
create policy business_kb_access_manage_admin
on public.business_knowledge_base_access
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
    join public.business_knowledge_base_access bka on bka.business_id = p.business_id
    where p.id = auth.uid()
      and bka.knowledge_base_id = knowledge_bases.id
  )
);

drop policy if exists knowledge_bases_insert_owner_or_admin on public.knowledge_bases;
drop policy if exists knowledge_bases_update_owner_or_admin on public.knowledge_bases;
drop policy if exists knowledge_bases_delete_owner_or_admin on public.knowledge_bases;

drop policy if exists knowledge_bases_insert_developer on public.knowledge_bases;
create policy knowledge_bases_insert_developer
on public.knowledge_bases
for insert
to authenticated
with check (public.is_developer());

drop policy if exists knowledge_bases_update_developer on public.knowledge_bases;
create policy knowledge_bases_update_developer
on public.knowledge_bases
for update
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists knowledge_bases_delete_developer on public.knowledge_bases;
create policy knowledge_bases_delete_developer
on public.knowledge_bases
for delete
to authenticated
using (public.is_developer());

drop policy if exists kb_classes_manage_admin on public.kb_classes;
drop policy if exists subjects_manage_admin on public.subjects;
drop policy if exists chapters_manage_admin on public.chapters;

drop policy if exists kb_classes_manage_developer on public.kb_classes;
create policy kb_classes_manage_developer
on public.kb_classes
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists subjects_manage_developer on public.subjects;
create policy subjects_manage_developer
on public.subjects
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists chapters_manage_developer on public.chapters;
create policy chapters_manage_developer
on public.chapters
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());
