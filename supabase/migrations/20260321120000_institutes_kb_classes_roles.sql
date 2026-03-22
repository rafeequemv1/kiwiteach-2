-- Applied on hosted project via MCP; keep for local / other envs.
-- 1) KB curriculum table renamed: classes -> kb_classes (frees "classes" for org classes)
-- 2) schools -> institutes, school_classes -> classes, school_id -> institute_id
-- 3) profiles RLS, role check, signup trigger, is_developer(), org RLS for developer

-- See live migrations:
-- rename_kb_and_institutes_v2
-- roles_rls_profiles_and_developer
-- profiles_org_nullable_and_role_lower
-- make_institutes_org_nullable
