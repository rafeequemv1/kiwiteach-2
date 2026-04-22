-- Reviewer in role_registry + nav permission for Roles & Permissions UI.
-- (profiles.role reviewer is already allowed by admin_set_user_role in prior migration.)

insert into public.permission_registry (perm_key, label, description, category, sort_order)
values (
  'nav.question_bank_review',
  'Question bank review',
  'Review hub questions and submit quality flags',
  'navigation',
  75
)
on conflict (perm_key) do nothing;

insert into public.role_registry (role_slug, display_name, description, is_system)
values ('reviewer', 'Reviewer', 'Question bank quality review (scoped by knowledge base access)', true)
on conflict (role_slug) do nothing;

-- Reviewer: only review nav
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key = 'nav.question_bank_review'
where r.role_slug = 'reviewer'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- Teacher: review nav (school_admin uses admin console only; see 20260424120000)
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key = 'nav.question_bank_review'
where r.role_slug = 'teacher'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;

-- Developer: all permissions including new one
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
cross join public.permission_registry p
where r.role_slug = 'developer'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;
