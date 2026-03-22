-- Signup role defaults:
-- - Natural signup defaults to student
-- - Optional signup metadata role supports student/teacher
-- - Developer email(s) remain forced to developer

alter table public.profiles alter column role set default 'student';

create or replace function public.ensure_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  effective_role text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  effective_role := case
    when lower(new.email) in ('rafeequemavoor@gmail.com') then 'developer'
    when requested_role in ('teacher', 'student') then requested_role
    else 'student'
  end;

  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    effective_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set role = excluded.role;

  return new;
end;
$$;
