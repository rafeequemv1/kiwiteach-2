-- Admin action: ignore flagged question (remove flags, keep question in bank).

create or replace function public.admin_ignore_flagged_question (p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_actor_role text;
  v_actor_business uuid;
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

  delete from public.out_of_syllabus_question_flags f
  where f.question_id = p_question_id
    and coalesce(f.exam_tag, 'neet') = 'neet'
    and (
      v_actor_business is null
      or public.is_developer()
      or exists (
        select 1
        from public.profiles p
        where p.id = f.flagged_by
          and p.business_id = v_actor_business
      )
    );
end;
$$;

grant execute on function public.admin_ignore_flagged_question(uuid) to authenticated;
