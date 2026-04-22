-- Reviewer profile role + question bank review marks (multi-flag per reviewer per question).

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

create or replace function public.is_reviewer()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role::text, ''))) = 'reviewer'
  );
$$;

comment on function public.is_reviewer() is
  'True when profiles.role is reviewer for auth.uid().';

grant execute on function public.is_reviewer() to authenticated;

-- Who may submit rows in question_bank_review_marks (UI: Review workspace).
create or replace function public.can_submit_question_bank_review()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_developer()
    or public.is_reviewer()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role::text, ''))) = 'teacher'
    );
$$;

grant execute on function public.can_submit_question_bank_review() to authenticated;

-- Block self-service promotion to reviewer (same pattern as developer/school_admin).
create or replace function public.profiles_block_self_privileged_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_priv boolean;
  old_priv boolean;
  new_rev boolean;
  old_rev boolean;
begin
  new_priv := lower(trim(coalesce(new.role::text, ''))) in ('developer', 'school_admin');
  new_rev := lower(trim(coalesce(new.role::text, ''))) = 'reviewer';

  if tg_op = 'INSERT' then
    if new.id = auth.uid() and new_priv then
      raise exception 'Privileged roles cannot be set on self-service profile insert';
    end if;
    if new.id = auth.uid() and new_rev then
      raise exception 'Reviewer role cannot be set on self-service profile insert';
    end if;
    return new;
  end if;

  if new.id is distinct from auth.uid() then
    return new;
  end if;

  old_priv := lower(trim(coalesce(old.role::text, ''))) in ('developer', 'school_admin');
  old_rev := lower(trim(coalesce(old.role::text, ''))) = 'reviewer';

  if new_priv and not old_priv and not public.is_developer() then
    raise exception 'Elevating own role to developer or school_admin requires an existing developer';
  end if;

  if new_rev and not old_rev and not public.is_developer() then
    raise exception 'Reviewer role is assigned by a developer via admin tools';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: allow assigning reviewer role (developer only, existing RPC)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Only developer can update user roles';
  end if;

  if target_role not in ('developer', 'teacher', 'student', 'school_admin', 'reviewer') then
    raise exception 'Invalid role: %', target_role;
  end if;

  update public.profiles
  set role = target_role
  where id = target_user_id;

  if not found then
    insert into public.profiles (id, role, full_name)
    values (target_user_id, target_role, null)
    on conflict (id) do update set role = excluded.role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review marks
-- ---------------------------------------------------------------------------

create table if not exists public.question_bank_review_marks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  question_id uuid not null references public.question_bank_neet (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  mark_wrong boolean not null default false,
  mark_out_of_syllabus boolean not null default false,
  mark_latex_issue boolean not null default false,
  mark_figure_issue boolean not null default false,
  notes text,
  unique (question_id, reviewer_id)
);

create index if not exists question_bank_review_marks_question_idx
  on public.question_bank_review_marks (question_id);

create index if not exists question_bank_review_marks_reviewer_idx
  on public.question_bank_review_marks (reviewer_id);

alter table public.question_bank_review_marks enable row level security;

drop policy if exists "question_bank_review_marks_select" on public.question_bank_review_marks;
create policy "question_bank_review_marks_select"
on public.question_bank_review_marks for select
to authenticated
using (
  reviewer_id = auth.uid()
  or public.is_developer()
);

drop policy if exists "question_bank_review_marks_write" on public.question_bank_review_marks;
create policy "question_bank_review_marks_write"
on public.question_bank_review_marks for insert
to authenticated
with check (
  reviewer_id = auth.uid()
  and public.can_submit_question_bank_review()
);

drop policy if exists "question_bank_review_marks_update" on public.question_bank_review_marks;
create policy "question_bank_review_marks_update"
on public.question_bank_review_marks for update
to authenticated
using (
  reviewer_id = auth.uid()
  and public.can_submit_question_bank_review()
)
with check (
  reviewer_id = auth.uid()
  and public.can_submit_question_bank_review()
);

drop policy if exists "question_bank_review_marks_delete_own" on public.question_bank_review_marks;
create policy "question_bank_review_marks_delete_own"
on public.question_bank_review_marks for delete
to authenticated
using (reviewer_id = auth.uid() or public.is_developer());

create or replace function public.touch_question_bank_review_marks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists question_bank_review_marks_updated_at on public.question_bank_review_marks;
create trigger question_bank_review_marks_updated_at
before update on public.question_bank_review_marks
for each row execute function public.touch_question_bank_review_marks_updated_at();

-- Optional: upsert RPC (client can also use insert ... on conflict via PostgREST if unique exposed)
create or replace function public.upsert_question_bank_review_mark(
  p_question_id uuid,
  p_wrong boolean default false,
  p_out_of_syllabus boolean default false,
  p_latex_issue boolean default false,
  p_figure_issue boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_submit_question_bank_review() then
    raise exception 'Not allowed to submit question reviews';
  end if;

  if p_question_id is null then
    raise exception 'question_id required';
  end if;

  if not exists (select 1 from public.question_bank_neet q where q.id = p_question_id) then
    raise exception 'Question not found';
  end if;

  insert into public.question_bank_review_marks (
    question_id,
    reviewer_id,
    mark_wrong,
    mark_out_of_syllabus,
    mark_latex_issue,
    mark_figure_issue,
    notes
  )
  values (
    p_question_id,
    v_uid,
    coalesce(p_wrong, false),
    coalesce(p_out_of_syllabus, false),
    coalesce(p_latex_issue, false),
    coalesce(p_figure_issue, false),
    nullif(trim(p_notes), '')
  )
  on conflict (question_id, reviewer_id) do update
  set
    mark_wrong = excluded.mark_wrong,
    mark_out_of_syllabus = excluded.mark_out_of_syllabus,
    mark_latex_issue = excluded.mark_latex_issue,
    mark_figure_issue = excluded.mark_figure_issue,
    notes = excluded.notes,
    updated_at = timezone('utc'::text, now())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_question_bank_review_mark(uuid, boolean, boolean, boolean, boolean, text)
  to authenticated;

-- Registry row (optional UI / future permissions matrix)
insert into public.role_registry (role_slug, display_name, description, is_system)
values ('reviewer', 'Reviewer', 'Question bank quality review only', true)
on conflict (role_slug) do nothing;
