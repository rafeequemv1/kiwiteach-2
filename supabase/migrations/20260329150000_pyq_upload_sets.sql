-- Group PYQ bulk uploads into batches (sets) for admin card UI + filters.

create table if not exists public.pyq_upload_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  original_filename text,
  source_kind text not null default 'unknown',
  uploaded_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists pyq_upload_sets_created_idx on public.pyq_upload_sets (created_at desc);

alter table public.pyq_upload_sets enable row level security;

drop policy if exists pyq_upload_sets_select_auth on public.pyq_upload_sets;
create policy pyq_upload_sets_select_auth
on public.pyq_upload_sets for select
to authenticated
using (true);

drop policy if exists pyq_upload_sets_insert_admin on public.pyq_upload_sets;
create policy pyq_upload_sets_insert_admin
on public.pyq_upload_sets for insert
to authenticated
with check (public.pyq_admin_access());

drop policy if exists pyq_upload_sets_update_admin on public.pyq_upload_sets;
create policy pyq_upload_sets_update_admin
on public.pyq_upload_sets for update
to authenticated
using (public.pyq_admin_access())
with check (public.pyq_admin_access());

drop policy if exists pyq_upload_sets_delete_admin on public.pyq_upload_sets;
create policy pyq_upload_sets_delete_admin
on public.pyq_upload_sets for delete
to authenticated
using (public.pyq_admin_access());

alter table public.pyq_questions_neet
  add column if not exists upload_set_id uuid references public.pyq_upload_sets (id) on delete cascade;

create index if not exists pyq_questions_neet_upload_set_idx on public.pyq_questions_neet (upload_set_id);
