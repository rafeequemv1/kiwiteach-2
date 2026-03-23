-- Dedicated NEET out-of-syllabus flags with KB tagging for future multi-repo support.

create table if not exists public.out_of_syllabus_question_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  question_id uuid not null references public.question_bank_neet (id) on delete cascade,
  flagged_by uuid not null references auth.users (id) on delete cascade,
  flagged_by_role text,
  reason text,
  exam_tag text not null default 'neet',
  knowledge_base_id uuid references public.knowledge_bases (id) on delete set null,
  chapter_id uuid references public.chapters (id) on delete set null
);

create unique index if not exists out_of_syllabus_question_flags_uq
  on public.out_of_syllabus_question_flags (question_id, flagged_by, exam_tag);

create index if not exists out_of_syllabus_question_flags_question_idx
  on public.out_of_syllabus_question_flags (question_id);

create index if not exists out_of_syllabus_question_flags_exam_idx
  on public.out_of_syllabus_question_flags (exam_tag, created_at desc);

create index if not exists out_of_syllabus_question_flags_kb_idx
  on public.out_of_syllabus_question_flags (knowledge_base_id)
  where knowledge_base_id is not null;

alter table public.out_of_syllabus_question_flags enable row level security;

drop policy if exists "out_of_syllabus_flags_select" on public.out_of_syllabus_question_flags;
create policy "out_of_syllabus_flags_select"
on public.out_of_syllabus_question_flags for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "out_of_syllabus_flags_insert" on public.out_of_syllabus_question_flags;
create policy "out_of_syllabus_flags_insert"
on public.out_of_syllabus_question_flags for insert
to authenticated
with check (flagged_by = auth.uid());

drop policy if exists "out_of_syllabus_flags_delete_own_or_dev" on public.out_of_syllabus_question_flags;
create policy "out_of_syllabus_flags_delete_own_or_dev"
on public.out_of_syllabus_question_flags for delete
to authenticated
using (flagged_by = auth.uid() or public.is_developer());

create or replace function public.flag_question_out_of_syllabus (
  p_question_id uuid,
  p_knowledge_base_id uuid default null,
  p_reason text default null,
  p_exam_tag text default 'neet'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_actor_role text;
  v_flag_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_question_id is null then
    raise exception 'Question id is required';
  end if;

  if not exists (select 1 from public.question_bank_neet qb where qb.id = p_question_id) then
    raise exception 'Question not found';
  end if;

  select coalesce(lower(p.role), 'student')
  into v_actor_role
  from public.profiles p
  where p.id = v_actor;

  insert into public.out_of_syllabus_question_flags (
    question_id,
    flagged_by,
    flagged_by_role,
    reason,
    exam_tag,
    knowledge_base_id,
    chapter_id
  )
  select
    qb.id,
    v_actor,
    v_actor_role,
    nullif(trim(p_reason), ''),
    coalesce(nullif(trim(lower(p_exam_tag)), ''), 'neet'),
    p_knowledge_base_id,
    qb.chapter_id
  from public.question_bank_neet qb
  where qb.id = p_question_id
  on conflict (question_id, flagged_by, exam_tag) do update
  set
    reason = excluded.reason,
    knowledge_base_id = excluded.knowledge_base_id,
    chapter_id = excluded.chapter_id,
    flagged_by_role = excluded.flagged_by_role,
    created_at = timezone('utc'::text, now())
  returning id into v_flag_id;

  return v_flag_id;
end;
$$;

create or replace function public.admin_list_out_of_syllabus_flags ()
returns table (
  flag_id uuid,
  created_at timestamp with time zone,
  question_id uuid,
  question_text text,
  chapter_name text,
  subject_name text,
  class_name text,
  topic_tag text,
  knowledge_base_id uuid,
  knowledge_base_name text,
  flagged_by uuid,
  flagged_by_email text,
  flagged_by_name text,
  flagged_by_role text,
  exam_tag text
)
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

  select lower(coalesce(p.role, 'student')), p.business_id
  into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if not (public.is_developer() or v_actor_role in ('school_admin', 'teacher')) then
    raise exception 'Not allowed';
  end if;

  return query
  select
    f.id as flag_id,
    f.created_at,
    qb.id as question_id,
    qb.question_text,
    qb.chapter_name,
    qb.subject_name,
    qb.class_name,
    qb.topic_tag,
    f.knowledge_base_id,
    kb.name as knowledge_base_name,
    f.flagged_by,
    au.email::text as flagged_by_email,
    p.full_name as flagged_by_name,
    coalesce(f.flagged_by_role, p.role, 'student') as flagged_by_role,
    f.exam_tag
  from public.out_of_syllabus_question_flags f
  join public.question_bank_neet qb on qb.id = f.question_id
  left join public.knowledge_bases kb on kb.id = f.knowledge_base_id
  left join auth.users au on au.id = f.flagged_by
  left join public.profiles p on p.id = f.flagged_by
  where coalesce(f.exam_tag, 'neet') = 'neet'
    and (
      v_actor_business is null
      or p.business_id = v_actor_business
      or public.is_developer()
    )
  order by f.created_at desc;
end;
$$;

create or replace function public.admin_delete_flagged_question (p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
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

  select qb.user_id into v_question_owner
  from public.question_bank_neet qb
  where qb.id = p_question_id;

  if v_question_owner is null then
    raise exception 'Question not found';
  end if;

  if not public.is_developer() and v_actor_business is not null then
    select p.business_id into v_owner_business
    from public.profiles p
    where p.id = v_question_owner;

    if v_owner_business is distinct from v_actor_business then
      raise exception 'Not allowed to delete question from another business';
    end if;
  end if;

  delete from public.question_bank_neet
  where id = p_question_id;
end;
$$;

grant execute on function public.flag_question_out_of_syllabus(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_list_out_of_syllabus_flags() to authenticated;
grant execute on function public.admin_delete_flagged_question(uuid) to authenticated;
