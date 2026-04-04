-- reference_questions_admin_access() is used by storage.objects RLS and prompt/reference tables.
-- As SECURITY INVOKER it could not see profiles.role under some RLS contexts → inserts failed.
-- SECURITY DEFINER + search_path: read role for auth.uid() reliably (same logic as is_developer OR is_school_admin).

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
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role::text, ''))) in ('developer', 'school_admin')
  );
$$;

grant execute on function public.reference_questions_admin_access() to authenticated;

comment on function public.reference_questions_admin_access() is
  'True when profiles.role is developer or school_admin for auth.uid(); used by reference-question and prompt-studio RLS. SECURITY DEFINER so storage/table policies can evaluate without profiles RLS blocking the lookup.';
