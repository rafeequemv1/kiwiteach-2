-- Developer-only user list and role management RPCs.

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamp with time zone
)
language sql
security definer
set search_path = public
as $$
  select
    au.id,
    au.email::text as email,
    p.full_name,
    coalesce(p.role, 'student')::text as role,
    au.created_at
  from auth.users au
  left join public.profiles p on p.id = au.id
  where public.is_developer()
  order by au.created_at desc;
$$;

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Only developer can update user roles';
  end if;

  if target_role not in ('developer', 'teacher', 'student', 'school_admin') then
    raise exception 'Invalid role: %', target_role;
  end if;

  update public.profiles
  set role = target_role
  where id = target_user_id;

  if not found then
    insert into public.profiles (id, role, full_name)
    values (target_user_id, target_role, null)
    on conflict (id) do update set role = excluded.role;
  end if;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
