-- Allow a teacher (owner of the class) or developer to set a student's class_id.
-- Use from app when linking a registered student account to a class after bulk import / admin review.

create or replace function public.teacher_set_student_class (p_student_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_student_id
      and lower (coalesce (p.role, '')) = 'student'
  ) then
    raise exception 'Student profile not found';
  end if;

  select c.user_id into v_owner from public.classes c where c.id = p_class_id;
  if v_owner is null then
    raise exception 'Invalid class id';
  end if;

  if v_owner is distinct from v_actor and not public.is_developer () then
    raise exception 'Not allowed to assign this class';
  end if;

  update public.profiles
  set class_id = p_class_id
  where id = p_student_id
    and lower (coalesce (role, '')) = 'student';
end;
$$;

revoke all on function public.teacher_set_student_class (uuid, uuid) from public;
grant execute on function public.teacher_set_student_class (uuid, uuid) to authenticated;

comment on function public.teacher_set_student_class (uuid, uuid) is
  'Teacher who owns the class (or developer) sets profiles.class_id for a student.';
