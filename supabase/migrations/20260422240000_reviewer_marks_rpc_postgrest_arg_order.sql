-- PostgREST looks up RPC by argument types in the order it receives them (uuid, text) for
-- (p_reviewer_id, p_scope). The function was defined as (text, uuid) which is a different signature.
-- Recreate with (uuid, text) so the schema cache matches the client.

drop function if exists public.admin_list_question_bank_reviewer_marks(text, uuid);
drop function if exists public.admin_list_question_bank_reviewer_marks(uuid, text);

create or replace function public.admin_list_question_bank_reviewer_marks(
  p_reviewer_id uuid default null,
  p_scope text default 'open'
)
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
    coalesce(qb.id, m.question_id) as question_id,
    coalesce(qb.question_text, '[Question missing from bank]') as question_text,
    coalesce(qb.options, '[]'::jsonb) as options,
    coalesce(qb.correct_index, 0) as correct_index,
    coalesce(qb.explanation, '') as explanation,
    coalesce(qb.difficulty, '—') as difficulty,
    coalesce(qb.question_type, '—') as question_type,
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
  left join public.question_bank_neet qb on qb.id = m.question_id
  left join public.chapters ch on ch.id = qb.chapter_id
  left join public.knowledge_bases kb on kb.id = ch.kb_id
  left join auth.users au on au.id = m.reviewer_id
  left join public.profiles rp on rp.id = m.reviewer_id
  where
    (
      lower(trim(p_scope)) = 'all'
      or m.admin_status = 'open'
    )
    and (p_reviewer_id is null or m.reviewer_id = p_reviewer_id)
    and (
      public.is_developer()
      or v_actor_business is null
      or rp.business_id is null
      or rp.business_id = v_actor_business
      or (
        kb.id is not null
        and (
          exists (
            select 1
            from public.user_knowledge_base_access uka
            where uka.user_id = v_actor
              and uka.knowledge_base_id = kb.id
          )
          or (
            v_actor_business is not null
            and exists (
              select 1
              from public.business_knowledge_base_access bka
              where bka.business_id = v_actor_business
                and bka.knowledge_base_id = kb.id
            )
          )
        )
      )
    )
  order by m.updated_at desc;
end;
$$;

grant execute on function public.admin_list_question_bank_reviewer_marks(uuid, text) to authenticated;
