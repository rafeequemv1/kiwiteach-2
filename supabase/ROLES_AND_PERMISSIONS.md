# Roles & permissions (Supabase)

## Tables (source of truth)

| Table | Purpose |
|--------|---------|
| `public.role_registry` | All app roles (system + custom). Slugs align with `public.profiles.role` for built-ins. |
| `public.permission_registry` | Dedicated catalog of permission keys (`nav.*`, `admin.*`, …). |
| `public.role_permission_grant` | Which permissions each role has (`allowed` boolean). |

## Views (friendly names)

| View | Backing table |
|------|----------------|
| `public.roles` | `role_registry` |
| `public.permissions` | `permission_registry` |

The Admin UI reads through these views when available, and falls back to the base tables.

## Migrations

1. `20260328130000_role_permission_registry.sql` — creates tables, RLS, seeds, RPCs.
2. `20260329120000_roles_permissions_views_and_seed_rpc.sql` — comments, views, `admin_ensure_role_permission_seed()`.

Apply with `supabase db push` (or run SQL in the dashboard).

## Default app roles (seeded)

`developer`, `school_admin`, `teacher`, `student` — same set as `APP_ROLES` in `auth/roles.ts`.
