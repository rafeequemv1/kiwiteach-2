-- Reviewer-queue filter dropdown: everyone who can submit bank reviews (not only users who already have marks).

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
    join public.question_bank_neet qb on qb.id = m.question_id
    left join auth.users au on au.id = m.reviewer_id
    left join public.profiles rp on rp.id = m.reviewer_id
    where
      (
        public.is_developer()
        or v_actor_business is null
        or rp.business_id is null
        or rp.business_id = v_actor_business
      )

    union

    select
      p.id as reviewer_id,
      coalesce(nullif(trim(p.full_name), ''), au.email::text, p.id::text) as reviewer_name,
      au.email::text as reviewer_email
    from public.profiles p
    join auth.users au on au.id = p.id
    where
      lower(trim(coalesce(p.role::text, ''))) in ('reviewer', 'teacher', 'school_admin', 'developer')
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
