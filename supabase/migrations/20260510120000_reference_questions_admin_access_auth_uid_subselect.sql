-- Prompt Studio / reference-question RLS: stabilize JWT uid read inside SECURITY DEFINER.
-- Some Storage/RLS evaluation paths initialize policies before a bare auth.uid() is visible;
-- (select auth.uid()) forces a stable subquery read (Supabase/Postgres RLS pattern).

create or replace function public.reference_questions_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(trim(coalesce(p.role, ''))) in ('developer', 'school_admin')
  );
$$;

comment on function public.reference_questions_admin_access() is
  'True when profiles.role is developer or school_admin for JWT user. SECURITY DEFINER; uses (select auth.uid()) for reliable Storage RLS.';
