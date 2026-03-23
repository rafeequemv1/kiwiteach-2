# Knowledge bases (`public.knowledge_bases`)

- **User-owned:** `user_id` set; created from Admin → Knowledge.
- **Catalog (platform):** `is_catalog = true`, `user_id` null — shared name-only rows (e.g. **IIT-JEE**) until classes/subjects/chapters are added later.

Migration: `20260330140000_knowledge_base_iit_jee_catalog.sql` adds `is_catalog`, allows null `user_id`, and seeds **IIT-JEE** if absent.
