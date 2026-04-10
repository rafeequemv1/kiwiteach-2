-- Persist figure_url from admin figure editor (bypasses RLS like admin_update_question_bank_neet).

create or replace function public.admin_update_question_bank_figure(
  p_question_id uuid,
  p_figure_url text
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

  if p_figure_url is null or length(trim(p_figure_url)) = 0 then
    raise exception 'Figure data is required';
  end if;

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (
    public.is_developer()
    or v_actor_role in ('school_admin', 'teacher')
    or public.is_reviewer()
  ) then
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
  set figure_url = p_figure_url
  where qb.id = p_question_id;
end;
$$;

grant execute on function public.admin_update_question_bank_figure(uuid, text) to authenticated;

comment on function public.admin_update_question_bank_figure(uuid, text) is
  'Updates question_bank_neet.figure_url (e.g. PNG data URL from figure editor). Same access as stem edit RPC.';
