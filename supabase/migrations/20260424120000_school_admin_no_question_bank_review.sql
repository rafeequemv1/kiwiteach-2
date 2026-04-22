-- School admins manage org/admin console; they do not submit question-bank review marks.
-- Aligns DB + role_permission_grant with client canAccessQuestionBankReview (teacher, reviewer, developer).

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

-- Roles UI: remove Question bank review nav for school_admin
update public.role_permission_grant gpg
set allowed = false
from public.role_registry r
join public.permission_registry p on p.perm_key = 'nav.question_bank_review'
where gpg.role_id = r.id
  and gpg.permission_id = p.id
  and r.role_slug = 'school_admin';

-- Admin reviewer dropdown: do not list school_admin as a "potential reviewer" profile row
create or replace function public.admin_list_question_bank_mark_queue_reviewers()
returns table (
  reviewer_id uuid,
  reviewer_name text,
  reviewer_email text
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

  return query
  select distinct on (u.reviewer_id)
    u.reviewer_id,
    u.reviewer_name,
    u.reviewer_email
  from (
    select
      m.reviewer_id,
      coalesce(nullif(trim(rp.full_name), ''), au.email::text, m.reviewer_id::text) as reviewer_name,
      au.email::text as reviewer_email
    from public.question_bank_review_marks m
    left join public.question_bank_neet qb on qb.id = m.question_id
    left join public.chapters ch on ch.id = qb.chapter_id
    left join public.knowledge_bases kb on kb.id = ch.kb_id
    left join auth.users au on au.id = m.reviewer_id
    left join public.profiles rp on rp.id = m.reviewer_id
    where
      (
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

    union

    select
      p.id as reviewer_id,
      coalesce(nullif(trim(p.full_name), ''), au.email::text, p.id::text) as reviewer_name,
      au.email::text as reviewer_email
    from public.profiles p
    join auth.users au on au.id = p.id
    where
      lower(trim(coalesce(p.role::text, ''))) in ('reviewer', 'teacher', 'developer')
      and (
        public.is_developer()
        or v_actor_business is null
        or p.business_id is null
        or p.business_id = v_actor_business
      )
  ) u
  order by u.reviewer_id, u.reviewer_name asc;
end;
$$;

grant execute on function public.admin_list_question_bank_mark_queue_reviewers() to authenticated;
