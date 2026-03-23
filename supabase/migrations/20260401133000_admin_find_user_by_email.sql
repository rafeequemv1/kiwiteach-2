-- Lookup helper for team management in Settings > Institutes > Team.
-- Allows developer / school_admin to search by email and assign team role + business.

drop function if exists public.admin_find_user_by_email(text);
create or replace function public.admin_find_user_by_email(target_email text)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  business_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (public.is_developer() or v_actor_role = 'school_admin') then
    raise exception 'Not allowed';
  end if;

  return query
  select
    au.id,
    au.email::text,
    p.full_name,
    coalesce(p.role, 'student')::text as role,
    p.business_id
  from auth.users au
  left join public.profiles p on p.id = au.id
  where lower(au.email::text) = lower(trim(target_email))
    and (
      public.is_developer()
      or (
        v_actor_role = 'school_admin'
        and (
          p.business_id is null
          or p.business_id = v_actor_business
        )
      )
    )
  limit 1;
end;
$$;

grant execute on function public.admin_find_user_by_email(text) to authenticated;
