-- Rename legacy attempt tables to online_test_* (idempotent for DBs that already ran 20260325120000 with old names).

do $rename$
begin
  if to_regclass('public.test_attempts') is not null
     and to_regclass('public.online_test_attempts') is null then
    alter table public.test_attempts rename to online_test_attempts;
  end if;

  if to_regclass('public.test_attempt_responses') is not null
     and to_regclass('public.online_test_attempt_responses') is null then
    alter table public.test_attempt_responses rename to online_test_attempt_responses;
  end if;
end
$rename$;

-- Require attempt tables (apply 20260325120000_student_exams_attempts.sql first).
do $guard$
begin
  if to_regclass('public.online_test_attempts') is null
     or to_regclass('public.online_test_attempt_responses') is null then
    raise exception 'Missing online_test_attempts / online_test_attempt_responses — run student exam migrations first';
  end if;
end
$guard$;

-- Recreate RLS policies (expressions may still reference old table names after rename).
drop policy if exists "online_test_attempts_select_student" on public.online_test_attempts;
drop policy if exists "test_attempts_select_student" on public.online_test_attempts;
create policy "online_test_attempts_select_student" on public.online_test_attempts
  for select to authenticated
  using (student_id = auth.uid ());

drop policy if exists "online_test_attempts_select_teacher" on public.online_test_attempts;
drop policy if exists "test_attempts_select_teacher" on public.online_test_attempts;
create policy "online_test_attempts_select_teacher" on public.online_test_attempts
  for select to authenticated
  using (
    exists (
      select 1
      from public.tests t
      where t.id = online_test_attempts.test_id
        and t.user_id = auth.uid ()
    )
  );

drop policy if exists "online_test_attempts_insert_student" on public.online_test_attempts;
drop policy if exists "test_attempts_insert_student" on public.online_test_attempts;
create policy "online_test_attempts_insert_student" on public.online_test_attempts
  for insert to authenticated
  with check (student_id = auth.uid ());

drop policy if exists "online_test_attempts_update_none" on public.online_test_attempts;
drop policy if exists "test_attempts_update_none" on public.online_test_attempts;

drop policy if exists "online_test_attempt_responses_select" on public.online_test_attempt_responses;
drop policy if exists "test_attempt_responses_select" on public.online_test_attempt_responses;
create policy "online_test_attempt_responses_select" on public.online_test_attempt_responses
  for select to authenticated
  using (
    exists (
      select 1
      from public.online_test_attempts a
      where a.id = online_test_attempt_responses.attempt_id
        and (a.student_id = auth.uid () or exists (
          select 1 from public.tests t
          where t.id = a.test_id and t.user_id = auth.uid ()
        ))
    )
  );

drop policy if exists "online_test_attempt_responses_insert_student" on public.online_test_attempt_responses;
drop policy if exists "test_attempt_responses_insert_student" on public.online_test_attempt_responses;
create policy "online_test_attempt_responses_insert_student" on public.online_test_attempt_responses
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.online_test_attempts a
      where a.id = online_test_attempt_responses.attempt_id
        and a.student_id = auth.uid ()
    )
  );

-- Point submit_test_attempt at renamed tables.
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

  select p.class_id, lower(coalesce(p.role, ''))
    into v_class_id, v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role <> 'student' or v_class_id is null then
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
