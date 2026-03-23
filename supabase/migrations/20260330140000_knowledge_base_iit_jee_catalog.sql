-- Platform/catalog knowledge bases (name-only rows; chapters/subjects added later).
-- Allows rows without a owning user for shared curricula (e.g. IIT-JEE).

alter table public.knowledge_bases
  add column if not exists is_catalog boolean not null default false;

comment on column public.knowledge_bases.is_catalog is
  'When true, this KB is a shared catalog entry (visible to all authenticated users), not owned by a single user.';

-- Allow catalog rows without user_id (FK permits NULL when column is nullable).
alter table public.knowledge_bases
  alter column user_id drop not null;

-- IIT-JEE — insert once if missing (match by name, case-insensitive).
insert into public.knowledge_bases (name, description, user_id, is_catalog)
select 'IIT-JEE', '', null, true
where not exists (
  select 1 from public.knowledge_bases kb
  where lower(trim(kb.name)) = 'iit-jee'
);
