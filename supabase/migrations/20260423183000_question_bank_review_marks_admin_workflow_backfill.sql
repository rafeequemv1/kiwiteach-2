-- Backfill when question_bank_review_marks existed without admin workflow columns/RPCs
-- (e.g. DB had review marks + newer list RPC migrations but never ran 20260410210000).

alter table public.question_bank_review_marks
  add column if not exists admin_status text not null default 'open';

alter table public.question_bank_review_marks
  add column if not exists admin_reviewed_at timestamptz;

alter table public.question_bank_review_marks
  add column if not exists admin_reviewed_by uuid references auth.users (id) on delete set null;

alter table public.question_bank_review_marks
  drop constraint if exists question_bank_review_marks_admin_status_chk;

alter table public.question_bank_review_marks
  add constraint question_bank_review_marks_admin_status_chk
  check (admin_status in ('open', 'approved', 'dismissed'));

create index if not exists question_bank_review_marks_admin_status_idx
  on public.question_bank_review_marks (admin_status)
  where admin_status = 'open';

create or replace function public.admin_resolve_reviewer_mark(
  p_mark_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_business uuid;
  v_reviewer_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_mark_id is null then
    raise exception 'mark id required';
  end if;

  if lower(trim(coalesce(p_status, ''))) not in ('approved', 'dismissed') then
    raise exception 'status must be approved or dismissed';
  end if;

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (public.is_developer() or v_actor_role in ('school_admin', 'teacher')) then
    raise exception 'Not allowed';
  end if;

  if not exists (select 1 from public.question_bank_review_marks m where m.id = p_mark_id) then
    raise exception 'Review mark not found';
  end if;

  select pr.business_id into v_reviewer_business
  from public.question_bank_review_marks m
  join public.profiles pr on pr.id = m.reviewer_id
  where m.id = p_mark_id;

  if not public.is_developer()
     and v_actor_business is not null
     and v_reviewer_business is not null
     and v_reviewer_business is distinct from v_actor_business then
    raise exception 'Not allowed';
  end if;

  update public.question_bank_review_marks m
  set
    admin_status = lower(trim(p_status)),
    admin_reviewed_at = timezone('utc'::text, now()),
    admin_reviewed_by = v_actor
  where m.id = p_mark_id;
end;
$$;

grant execute on function public.admin_resolve_reviewer_mark(uuid, text) to authenticated;

create or replace function public.admin_update_question_bank_neet(
  p_question_id uuid,
  p_question_text text default null,
  p_options jsonb default null,
  p_correct_index int default null,
  p_explanation text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_business uuid;
  v_question_owner uuid;
  v_owner_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_question_id is null then
    raise exception 'Question id is required';
  end if;

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (public.is_developer() or v_actor_role in ('school_admin', 'teacher')) then
    raise exception 'Not allowed';
  end if;

  if not exists (select 1 from public.question_bank_neet qb where qb.id = p_question_id) then
    raise exception 'Question not found';
  end if;

  select qb.user_id into v_question_owner
  from public.question_bank_neet qb
  where qb.id = p_question_id;

  if not public.is_developer() and v_actor_business is not null and v_question_owner is not null then
    select p.business_id into v_owner_business
    from public.profiles p
    where p.id = v_question_owner;

    if v_owner_business is distinct from v_actor_business then
      raise exception 'Not allowed to edit question from another business';
    end if;
  end if;

  update public.question_bank_neet qb
  set
    question_text = coalesce(p_question_text, qb.question_text),
    options = coalesce(p_options, qb.options),
    correct_index = coalesce(p_correct_index, qb.correct_index),
    explanation = coalesce(p_explanation, qb.explanation)
  where qb.id = p_question_id;
end;
$$;

grant execute on function public.admin_update_question_bank_neet(uuid, text, jsonb, int, text) to authenticated;
