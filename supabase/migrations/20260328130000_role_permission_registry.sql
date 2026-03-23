-- Customizable app roles & fine-grained permissions (admin UI).
-- Requires public.is_developer() from earlier org/roles migrations.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.permission_registry (
  id uuid primary key default gen_random_uuid(),
  perm_key text not null unique,
  label text not null,
  description text not null default '',
  category text not null default 'general',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_registry (
  id uuid primary key default gen_random_uuid(),
  role_slug text not null unique,
  display_name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permission_grant (
  role_id uuid not null references public.role_registry (id) on delete cascade,
  permission_id uuid not null references public.permission_registry (id) on delete cascade,
  allowed boolean not null default true,
  primary key (role_id, permission_id)
);

create index if not exists role_permission_grant_role_id_idx on public.role_permission_grant (role_id);
create index if not exists role_permission_grant_permission_id_idx on public.role_permission_grant (permission_id);
create index if not exists permission_registry_category_idx on public.permission_registry (category, sort_order);

-- ---------------------------------------------------------------------------
-- RLS (developer-only)
-- ---------------------------------------------------------------------------

alter table public.permission_registry enable row level security;
alter table public.role_registry enable row level security;
alter table public.role_permission_grant enable row level security;

drop policy if exists permission_registry_dev_all on public.permission_registry;
drop policy if exists role_registry_dev_all on public.role_registry;
drop policy if exists role_permission_grant_dev_all on public.role_permission_grant;

create policy permission_registry_dev_all on public.permission_registry
  for all to authenticated using (public.is_developer()) with check (public.is_developer());

create policy role_registry_dev_all on public.role_registry
  for all to authenticated using (public.is_developer()) with check (public.is_developer());

create policy role_permission_grant_dev_all on public.role_permission_grant
  for all to authenticated using (public.is_developer()) with check (public.is_developer());

-- ---------------------------------------------------------------------------
-- Seed permissions
-- ---------------------------------------------------------------------------

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
  ('admin.roles', 'Admin: roles & permissions', 'This screen — role matrix', 'admin', 190),
  ('admin.team', 'Admin: team management', 'Assign roles and business team members in institutes settings', 'admin', 195)
on conflict (perm_key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed system roles (mirror profiles.role slugs)
-- ---------------------------------------------------------------------------

insert into public.role_registry (role_slug, display_name, description, is_system) values
  ('developer', 'Developer', 'Full platform access', true),
  ('school_admin', 'School admin', 'Institute-level administration', true),
  ('teacher', 'Teacher', 'Teaching staff', true),
  ('student', 'Student', 'Learner account', true)
on conflict (role_slug) do nothing;

-- ---------------------------------------------------------------------------
-- Seed default grants (aligned with current auth/roles.ts behaviour)
-- ---------------------------------------------------------------------------

-- Developer: everything on
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
cross join public.permission_registry p
where r.role_slug = 'developer'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- Teacher: teacher nav + admin entry + syllabus
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key in (
  'nav.paper_tests', 'nav.online_exam', 'nav.students', 'nav.reports', 'nav.settings', 'nav.admin',
  'admin.syllabus'
)
where r.role_slug = 'teacher'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- School admin: teacher nav + institutes + syllabus
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key in (
  'nav.paper_tests', 'nav.online_exam', 'nav.students', 'nav.reports', 'nav.settings', 'nav.admin',
  'admin.institutes', 'admin.syllabus', 'admin.team'
)
where r.role_slug = 'school_admin'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- Student: student nav only
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key in (
  'nav.student_online_test', 'nav.student_mock_test'
)
where r.role_slug = 'student'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- Explicitly deny missing combinations for seeded roles (optional clarity): not required — app treats missing as deny when we enforce later.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_upsert_role_grant(
  p_role_slug text,
  p_perm_key text,
  p_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid uuid;
  v_pid uuid;
begin
  if not public.is_developer() then
    raise exception 'Only developer can change permission grants';
  end if;

  set local row_security = off;

  select id into v_rid from public.role_registry where role_slug = lower(trim(p_role_slug));
  select id into v_pid from public.permission_registry where perm_key = lower(trim(p_perm_key));

  if v_rid is null then
    raise exception 'Unknown role: %', p_role_slug;
  end if;
  if v_pid is null then
    raise exception 'Unknown permission: %', p_perm_key;
  end if;

  insert into public.role_permission_grant (role_id, permission_id, allowed)
  values (v_rid, v_pid, p_allowed)
  on conflict (role_id, permission_id) do update set allowed = excluded.allowed;
end;
$$;

create or replace function public.admin_create_custom_role(
  p_slug text,
  p_display_name text,
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(regexp_replace(trim(p_slug), '[[:space:]]+', '_', 'g'));
  v_id uuid;
begin
  if not public.is_developer() then
    raise exception 'Only developer can create roles';
  end if;
  if v_slug is null or v_slug = '' then
    raise exception 'Role slug is required';
  end if;
  if p_display_name is null or trim(p_display_name) = '' then
    raise exception 'Display name is required';
  end if;

  if v_slug in ('developer', 'teacher', 'student', 'school_admin') then
    raise exception 'Reserved system role slug: %', v_slug;
  end if;

  set local row_security = off;

  insert into public.role_registry (role_slug, display_name, description, is_system)
  values (v_slug, trim(p_display_name), coalesce(p_description, ''), false)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Role slug already exists: %', v_slug;
end;
$$;

create or replace function public.admin_create_permission(
  p_key text,
  p_label text,
  p_description text default '',
  p_category text default 'general',
  p_sort_order int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(p_key));
  v_id uuid;
begin
  if not public.is_developer() then
    raise exception 'Only developer can create permissions';
  end if;
  if v_key is null or v_key = '' then
    raise exception 'Permission key is required';
  end if;
  if p_label is null or trim(p_label) = '' then
    raise exception 'Label is required';
  end if;

  set local row_security = off;

  insert into public.permission_registry (perm_key, label, description, category, sort_order)
  values (v_key, trim(p_label), coalesce(p_description, ''), coalesce(nullif(trim(p_category), ''), 'general'), coalesce(p_sort_order, 0))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Permission key already exists: %', v_key;
end;
$$;

grant execute on function public.admin_upsert_role_grant(text, text, boolean) to authenticated;
grant execute on function public.admin_create_custom_role(text, text, text) to authenticated;
grant execute on function public.admin_create_permission(text, text, text, text, int) to authenticated;
