-- Student school/campus on profile (alongside class). Used with bulk import + online exams.

alter table public.profiles
  add column if not exists institute_id uuid references public.institutes (id) on delete set null;

create index if not exists profiles_institute_id_idx
  on public.profiles (institute_id)
  where institute_id is not null;

-- Setting class also sets institute from that class (single source of truth for class → school).
create or replace function public.teacher_set_student_class (p_student_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_owner uuid;
  v_institute uuid;
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

  select c.user_id, c.institute_id into v_owner, v_institute
  from public.classes c
  where c.id = p_class_id;

  if v_owner is null then
    raise exception 'Invalid class id';
  end if;

  if v_owner is distinct from v_actor and not public.is_developer () then
    raise exception 'Not allowed to assign this class';
  end if;

  update public.profiles
  set
    class_id = p_class_id,
    institute_id = v_institute
  where id = p_student_id
    and lower (coalesce (role, '')) = 'student';
end;
$$;

-- Teacher who owns the institute (or developer) can set campus without changing class.
create or replace function public.teacher_set_student_institute (p_student_id uuid, p_institute_id uuid)
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

  select i.user_id into v_owner from public.institutes i where i.id = p_institute_id;
  if v_owner is null then
    raise exception 'Invalid institute id';
  end if;

  if v_owner is distinct from v_actor and not public.is_developer () then
    raise exception 'Not allowed to assign this institute';
  end if;

  update public.profiles
  set institute_id = p_institute_id
  where id = p_student_id
    and lower (coalesce (role, '')) = 'student';
end;
$$;

revoke all on function public.teacher_set_student_institute (uuid, uuid) from public;
grant execute on function public.teacher_set_student_institute (uuid, uuid) to authenticated;

comment on column public.profiles.institute_id is
  'Campus / school for the student; optional if only class_id is set.';

comment on function public.teacher_set_student_institute (uuid, uuid) is
  'Teacher who owns the institute (or developer) sets profiles.institute_id for a student.';
