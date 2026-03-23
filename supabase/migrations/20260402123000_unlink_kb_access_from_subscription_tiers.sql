-- Unlink KB usage access from subscription tiers.
-- Business-level KB mapping is the only source of non-developer KB usage access.

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
