-- Add permission entry for settings/business team management.

insert into public.permission_registry (perm_key, label, description, category, sort_order)
values ('admin.team', 'Admin: team management', 'Assign roles and business team members in institutes settings', 'admin', 195)
on conflict (perm_key) do nothing;

-- School admin should have team management by default.
insert into public.role_permission_grant (role_id, permission_id, allowed)
select r.id, p.id, true
from public.role_registry r
join public.permission_registry p on p.perm_key = 'admin.team'
where r.role_slug = 'school_admin'
on conflict (role_id, permission_id) do update set allowed = excluded.allowed;
