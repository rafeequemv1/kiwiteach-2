-- profiles.role CHECK must include 'reviewer' — admin_set_user_role already allows it (20260410120000 / 20260615100000).
-- Without this, assigning reviewer fails: new row violates check constraint "profiles_role_check".

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role is not null
    and length(trim(role)) > 0
    and lower(trim(role)) in (
      'developer',
      'teacher',
      'student',
      'school_admin',
      'reviewer'
    )
  );

comment on constraint profiles_role_check on public.profiles is
  'Allowed app roles; must stay in sync with public.admin_set_user_role allowlist.';
