-- Link teacher Online Exam ↔ student zone via public.tests:
-- 1) Align class_ids with RLS + submit_test_attempt (jsonb; was text[] in schema.sql).
-- 2) Fix student policies: allow learners whose role is empty/null (matches app default).
-- 3) Let teachers assign class to profiles without role yet; normalize role to student.
-- 4) Clear existing tests (fresh start; cascades online_test_attempts).

-- A) Remove all tests (requested reset)
delete from public.tests;

-- B) class_ids: migrate text[] → jsonb so @> / jsonb_typeof policies work
do $$
declare
  dt text;
begin
  select c.data_type into dt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'tests'
    and c.column_name = 'class_ids';

  if dt = 'ARRAY' then
    alter table public.tests alter column class_ids drop default;
    alter table public.tests
      alter column class_ids type jsonb using (
        case
          when class_ids is null then '[]'::jsonb
          else to_jsonb(class_ids)
        end
      );
    alter table public.tests alter column class_ids set default '[]'::jsonb;
  end if;
end;
$$;

-- C) RLS: students read online exams assigned to their class
drop policy if exists "Students read assigned online tests" on public.tests;
create policy "Students read assigned online tests" on public.tests
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.class_id is not null
        and coalesce(lower(trim(p.role::text)), '') not in ('teacher', 'school_admin')
        and tests.class_ids is not null
        and jsonb_typeof(tests.class_ids) = 'array'
        and jsonb_array_length(tests.class_ids) > 0
        and tests.class_ids @> to_jsonb (array[p.class_id::text])
        and coalesce(tests.config ->> 'mode', '') = 'online'
        and coalesce(tests.status, '') <> 'draft'
    )
  );

-- D) Self-serve class join (optional)
create or replace function public.set_student_class (p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.classes c where c.id = p_class_id) then
    raise exception 'Invalid class id';
  end if;
  update public.profiles
  set
    class_id = p_class_id,
    role = case
      when coalesce(trim(role), '') = '' then 'student'
      else role
    end
  where id = auth.uid ()
    and coalesce(lower(trim(role::text)), '') not in ('teacher', 'school_admin', 'developer');
end;
$$;

-- E) Teacher assigns student to class
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
      and coalesce(lower(trim(p.role::text)), '') not in ('teacher', 'school_admin', 'developer')
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
    institute_id = v_institute,
    role = case
      when coalesce(trim(role), '') = '' then 'student'
      else role
    end
  where id = p_student_id
    and coalesce(lower(trim(role::text)), '') not in ('teacher', 'school_admin', 'developer');
end;
$$;

-- F) Teacher sets institute only
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
      and coalesce(lower(trim(p.role::text)), '') not in ('teacher', 'school_admin', 'developer')
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
  set
    institute_id = p_institute_id,
    role = case
      when coalesce(trim(role), '') = '' then 'student'
      else role
    end
  where id = p_student_id
    and coalesce(lower(trim(role::text)), '') not in ('teacher', 'school_admin', 'developer');
end;
$$;

-- G) submit_test_attempt: class_ids jsonb + role alignment
create or replace function public.submit_test_attempt (
  p_test_id uuid,
  p_answers jsonb,
  p_duration_seconds int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid ();
  v_class_id uuid;
  v_role text;
  v_test public.tests%rowtype;
  v_questions jsonb;
  v_teacher uuid;
  v_institute uuid;
  v_class_name text;
  v_institute_name text;
  v_attempt_id uuid;
  v_idx int;
  v_len int;
  v_q jsonb;
  v_selected text;
  v_sel int;
  v_correct int;
  v_correct_n int := 0;
  v_wrong_n int := 0;
  v_unanswered_n int := 0;
  v_attempted_n int := 0;
  v_score numeric := 0;
  v_max numeric;
  v_points numeric;
  v_is_correct boolean;
  v_qtype text;
  v_qid uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select p.class_id, lower(trim(coalesce(p.role::text, '')))
    into v_class_id, v_role
  from public.profiles p
  where p.id = v_uid;

  if v_class_id is null then
    raise exception 'Only students with an assigned class can submit attempts';
  end if;

  if v_role in ('teacher', 'school_admin', 'developer') then
    raise exception 'Only students with an assigned class can submit attempts';
  end if;

  select * into v_test from public.tests t where t.id = p_test_id;
  if not found then
    raise exception 'Test not found';
  end if;

  if not (coalesce(v_test.class_ids, '[]'::jsonb) @> to_jsonb (array[v_class_id::text])) then
    raise exception 'This exam is not assigned to your class';
  end if;

  if coalesce(v_test.config ->> 'mode', '') <> 'online' then
    raise exception 'Not an online exam';
  end if;

  if coalesce(v_test.status, '') = 'draft' then
    raise exception 'Exam is not available';
  end if;

  v_teacher := v_test.user_id;
  v_questions := coalesce(v_test.questions, '[]'::jsonb);
  if jsonb_typeof(v_questions) <> 'array' then
    v_questions := '[]'::jsonb;
  end if;

  v_len := coalesce(jsonb_array_length(v_questions), 0);
  v_max := greatest(v_len * 4, 0);

  select c.name, c.institute_id into v_class_name, v_institute
  from public.classes c
  where c.id = v_class_id;

  select i.name into v_institute_name
  from public.institutes i
  where i.id = v_institute;

  insert into public.online_test_attempts (
    test_id,
    student_id,
    class_id,
    institute_id,
    teacher_user_id,
    test_name_snapshot,
    class_name_snapshot,
    institute_name_snapshot,
    score,
    max_score,
    correct_count,
    wrong_count,
    unanswered_count,
    attempted_count,
    duration_seconds
  ) values (
    p_test_id,
    v_uid,
    v_class_id,
    v_institute,
    v_teacher,
    v_test.name,
    v_class_name,
    v_institute_name,
    0,
    v_max,
    0,
    0,
    0,
    0,
    p_duration_seconds
  )
  returning id into v_attempt_id;

  for v_idx in 0..greatest(v_len - 1, -1) loop
    v_q := v_questions -> v_idx;
    v_correct := coalesce((v_q ->> 'correctIndex')::int, -1);
    v_qtype := coalesce(v_q ->> 'type', 'mcq');
    begin
      v_qid := (v_q ->> 'id')::uuid;
    exception
      when others then
        v_qid := null;
    end;

    v_selected := p_answers ->> v_idx::text;
    if v_selected is null or v_selected = '' or lower(v_selected) = 'null' then
      v_unanswered_n := v_unanswered_n + 1;
      insert into public.online_test_attempt_responses (
        attempt_id,
        question_index,
        question_id,
        question_type,
        selected_option_index,
        correct_option_index,
        is_correct,
        points_earned
      ) values (
        v_attempt_id,
        v_idx,
        v_qid,
        v_qtype,
        null,
        v_correct,
        false,
        0
      );
      continue;
    end if;

    v_sel := v_selected::int;
    v_attempted_n := v_attempted_n + 1;
    v_is_correct := (v_sel = v_correct);
    if v_is_correct then
      v_correct_n := v_correct_n + 1;
      v_points := 4;
      v_score := v_score + 4;
    else
      v_wrong_n := v_wrong_n + 1;
      v_points := -1;
      v_score := v_score - 1;
    end if;

    insert into public.online_test_attempt_responses (
      attempt_id,
      question_index,
      question_id,
      question_type,
      selected_option_index,
      correct_option_index,
      is_correct,
      points_earned
    ) values (
      v_attempt_id,
      v_idx,
      v_qid,
      v_qtype,
      v_sel,
      v_correct,
      v_is_correct,
      v_points
    );
  end loop;

  update public.online_test_attempts
  set
    score = v_score,
    correct_count = v_correct_n,
    wrong_count = v_wrong_n,
    unanswered_count = v_unanswered_n,
    attempted_count = v_attempted_n
  where id = v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_score,
    'max_score', v_max,
    'correct_count', v_correct_n,
    'wrong_count', v_wrong_n,
    'unanswered_count', v_unanswered_n,
    'attempted_count', v_attempted_n,
    'question_count', v_len
  );
end;
$$;

revoke all on function public.submit_test_attempt (uuid, jsonb, int) from public;
grant execute on function public.submit_test_attempt (uuid, jsonb, int) to authenticated;
