-- Clarify storage model + readable view names + idempotent seed (empty DB).
-- Base tables remain: role_registry, permission_registry, role_permission_grant.

comment on table public.role_registry is
  'Application roles (system + custom). Slugs align with public.profiles.role where applicable.';
comment on table public.permission_registry is
  'Dedicated permission catalog (keys like nav.* and admin.*).';
comment on table public.role_permission_grant is
  'Join table: which permissions are allowed (true/false) for each role.';

-- Friendly SQL / API names (same rows; RLS uses invoker = respect base table policies)
create or replace view public.roles as
select
  id,
  role_slug,
  display_name,
  description,
  is_system,
  created_at
from public.role_registry;

alter view public.roles set (security_invoker = true);

comment on view public.roles is
  'Alias of public.role_registry — use this name in SQL for clarity.';

create or replace view public.permissions as
select
  id,
  perm_key,
  label,
  description,
  category,
  sort_order,
  created_at
from public.permission_registry;

alter view public.permissions set (security_invoker = true);

comment on view public.permissions is
  'Alias of public.permission_registry — dedicated table for permission definitions.';

grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;

-- ---------------------------------------------------------------------------
-- Idempotent seed: restores default rows if tables were created but empty
-- (e.g. partial deploy). Safe to run multiple times.
-- ---------------------------------------------------------------------------

create or replace function public.admin_ensure_role_permission_seed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Only developer can seed roles & permissions';
  end if;

  set local row_security = off;

  insert into public.permission_registry (perm_key, label, description, category, sort_order) values
    ('nav.paper_tests', 'Paper tests', 'Teacher: paper test hub & studio', 'navigation', 10),
    ('nav.online_exam', 'Online exam', 'Teacher: schedule & manage online exams', 'navigation', 20),
    ('nav.students', 'Students', 'Student directory & roster', 'navigation', 30),
    ('nav.reports', 'Reports', 'Reports dashboard', 'navigation', 40),
    ('nav.settings', 'Settings', 'Branding & account settings', 'navigation', 50),
    ('nav.admin', 'Admin entry', 'Open the admin dashboard', 'navigation', 60),
    ('nav.student_online_test', 'Student: online exams', 'Student portal — assigned exams', 'navigation', 70),
    ('nav.student_mock_test', 'Student: mock tests', 'Student portal — mock practice', 'navigation', 80),
    ('admin.institutes', 'Admin: institutes', 'Schools, classes, org structure', 'admin', 100),
    ('admin.users', 'Admin: users', 'User list & profile roles', 'admin', 110),
    ('admin.knowledge', 'Admin: knowledge', 'Knowledge bases & explorer', 'admin', 120),
    ('admin.question_db', 'Admin: question DB', 'Question bank / neural studio', 'admin', 130),
    ('admin.prompts', 'Admin: prompts', 'AI prompts & system logic', 'admin', 140),
    ('admin.lab', 'Admin: batch forge', 'Rapid forging lab', 'admin', 150),
    ('admin.quality_lab', 'Admin: quality lab', 'Model benchmarking', 'admin', 160),
    ('admin.syllabus', 'Admin: syllabus', 'Syllabus & topic exclusions', 'admin', 170),
    ('admin.omr_lab', 'Admin: OMR lab', 'OMR accuracy tools', 'admin', 180),
    ('admin.roles', 'Admin: roles & permissions', 'This screen — role matrix', 'admin', 190)
  on conflict (perm_key) do nothing;

  insert into public.role_registry (role_slug, display_name, description, is_system) values
    ('developer', 'Developer', 'Full platform access', true),
    ('school_admin', 'School admin', 'Institute-level administration', true),
    ('teacher', 'Teacher', 'Teaching staff', true),
    ('student', 'Student', 'Learner account', true)
  on conflict (role_slug) do nothing;

  update public.role_registry set is_system = true
  where role_slug in ('developer', 'teacher', 'student', 'school_admin');

  insert into public.role_permission_grant (role_id, permission_id, allowed)
  select r.id, p.id, true
  from public.role_registry r
  cross join public.permission_registry p
  where r.role_slug = 'developer'
  on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

  insert into public.role_permission_grant (role_id, permission_id, allowed)
  select r.id, p.id, true
  from public.role_registry r
  join public.permission_registry p on p.perm_key in (
    'nav.paper_tests', 'nav.online_exam', 'nav.students', 'nav.reports', 'nav.settings', 'nav.admin',
    'admin.syllabus'
  )
  where r.role_slug = 'teacher'
  on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

  insert into public.role_permission_grant (role_id, permission_id, allowed)
  select r.id, p.id, true
  from public.role_registry r
  join public.permission_registry p on p.perm_key in (
    'nav.paper_tests', 'nav.online_exam', 'nav.students', 'nav.reports', 'nav.settings', 'nav.admin',
    'admin.institutes', 'admin.syllabus'
  )
  where r.role_slug = 'school_admin'
  on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

  insert into public.role_permission_grant (role_id, permission_id, allowed)
  select r.id, p.id, true
  from public.role_registry r
  join public.permission_registry p on p.perm_key in (
    'nav.student_online_test', 'nav.student_mock_test'
  )
  where r.role_slug = 'student'
  on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

  return jsonb_build_object(
    'roles', (select count(*) from public.role_registry),
    'permissions', (select count(*) from public.permission_registry),
    'grants', (select count(*) from public.role_permission_grant)
  );
end;
$$;

grant execute on function public.admin_ensure_role_permission_seed() to authenticated;
