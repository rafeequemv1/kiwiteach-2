-- Admin workflow for reviewer marks: queue, approve/dismiss, edit question (RPC).

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

-- ---------------------------------------------------------------------------
-- admin_list_question_bank_reviewer_marks
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_question_bank_reviewer_marks(p_scope text default 'open')
returns table (
  mark_id uuid,
  mark_updated_at timestamptz,
  admin_status text,
  question_id uuid,
  question_text text,
  options jsonb,
  correct_index int,
  explanation text,
  difficulty text,
  question_type text,
  topic_tag text,
  figure_url text,
  chapter_name text,
  subject_name text,
  class_name text,
  knowledge_base_id uuid,
  knowledge_base_name text,
  mark_wrong boolean,
  mark_out_of_syllabus boolean,
  mark_latex_issue boolean,
  mark_figure_issue boolean,
  notes text,
  reviewer_id uuid,
  reviewer_email text,
  reviewer_name text,
  reviewer_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (public.is_developer() or v_actor_role in ('school_admin', 'teacher')) then
    raise exception 'Not allowed';
  end if;

  if p_scope is null or lower(trim(p_scope)) not in ('open', 'all') then
    raise exception 'Invalid scope (use open or all)';
  end if;

  return query
  select
    m.id as mark_id,
    m.updated_at as mark_updated_at,
    m.admin_status,
    qb.id as question_id,
    qb.question_text,
    qb.options,
    qb.correct_index,
    qb.explanation,
    qb.difficulty,
    qb.question_type,
    qb.topic_tag,
    qb.figure_url,
    qb.chapter_name,
    qb.subject_name,
    qb.class_name,
    kb.id as knowledge_base_id,
    kb.name as knowledge_base_name,
    m.mark_wrong,
    m.mark_out_of_syllabus,
    m.mark_latex_issue,
    m.mark_figure_issue,
    m.notes,
    m.reviewer_id,
    au.email::text as reviewer_email,
    rp.full_name as reviewer_name,
    lower(coalesce(rp.role::text, '')) as reviewer_role
  from public.question_bank_review_marks m
  join public.question_bank_neet qb on qb.id = m.question_id
  left join public.chapters ch on ch.id = qb.chapter_id
  left join public.knowledge_bases kb on kb.id = ch.kb_id
  left join auth.users au on au.id = m.reviewer_id
  left join public.profiles rp on rp.id = m.reviewer_id
  where
    (
      m.mark_wrong
      or m.mark_out_of_syllabus
      or m.mark_latex_issue
      or m.mark_figure_issue
      or coalesce(trim(m.notes), '') <> ''
    )
    and (
      lower(trim(p_scope)) = 'all'
      or m.admin_status = 'open'
    )
    and (
      public.is_developer()
      or v_actor_business is null
      or rp.business_id is null
      or rp.business_id = v_actor_business
    )
  order by m.updated_at desc;
end;
$$;

grant execute on function public.admin_list_question_bank_reviewer_marks(text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_resolve_reviewer_mark
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- admin_update_question_bank_neet (stem / options / answer / explanation)
-- ---------------------------------------------------------------------------

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
