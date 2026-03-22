-- My Exams: students read assigned online tests; test attempts + per-question responses (scalable).

-- 1) Student enrollment on profile (single primary class)
alter table public.profiles
  add column if not exists class_id uuid references public.classes (id) on delete set null;

create index if not exists profiles_class_id_idx on public.profiles (class_id) where class_id is not null;

-- 2) Online test attempt header (aggregates + denormalized snapshot for reporting)
create table if not exists public.online_test_attempts (
  id uuid primary key default gen_random_uuid (),
  created_at timestamptz not null default timezone ('utc'::text, now()),
  submitted_at timestamptz not null default timezone ('utc'::text, now()),
  test_id uuid not null references public.tests (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  institute_id uuid references public.institutes (id) on delete set null,
  teacher_user_id uuid references auth.users (id) on delete set null,
  test_name_snapshot text,
  class_name_snapshot text,
  institute_name_snapshot text,
  status text not null default 'submitted',
  score numeric not null default 0,
  max_score numeric,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  unanswered_count int not null default 0,
  attempted_count int not null default 0,
  duration_seconds int
);

create index if not exists online_test_attempts_student_submitted_idx
  on public.online_test_attempts (student_id, submitted_at desc);

create index if not exists online_test_attempts_test_idx on public.online_test_attempts (test_id);

create index if not exists online_test_attempts_class_submitted_idx
  on public.online_test_attempts (class_id, submitted_at desc)
  where class_id is not null;

create index if not exists online_test_attempts_teacher_test_idx
  on public.online_test_attempts (teacher_user_id, test_id)
  where teacher_user_id is not null;

-- 3) One row per question per online test attempt (efficient bulk insert; indexed for analytics)
create table if not exists public.online_test_attempt_responses (
  id uuid primary key default gen_random_uuid (),
  attempt_id uuid not null references public.online_test_attempts (id) on delete cascade,
  question_index int not null,
  question_id uuid,
  question_type text,
  selected_option_index int,
  correct_option_index int not null,
  is_correct boolean not null default false,
  points_earned numeric not null default 0,
  unique (attempt_id, question_index)
);

create index if not exists online_test_attempt_responses_attempt_idx
  on public.online_test_attempt_responses (attempt_id);

alter table public.online_test_attempts enable row level security;
alter table public.online_test_attempt_responses enable row level security;

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
-- No updates by default (immutable results); use service role if ever needed

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

-- 4) Students can read online tests assigned to their class (+ teacher still owns rows)
drop policy if exists "Students read assigned online tests" on public.tests;
create policy "Students read assigned online tests" on public.tests
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid ()
        and lower(coalesce(p.role, '')) = 'student'
        and p.class_id is not null
        and tests.class_ids is not null
        and jsonb_typeof(tests.class_ids) = 'array'
        and jsonb_array_length(tests.class_ids) > 0
        and tests.class_ids @> to_jsonb (array[p.class_id::text])
        and coalesce(tests.config ->> 'mode', '') = 'online'
        and coalesce(tests.status, '') <> 'draft'
    )
  );

-- 5) Student sets own class (UUID shared by teacher) — does not expose other columns
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
  set class_id = p_class_id
  where id = auth.uid ()
    and lower(coalesce(role, '')) = 'student';
end;
$$;

revoke all on function public.set_student_class (uuid) from public;
grant execute on function public.set_student_class (uuid) to authenticated;

-- 6) Server-side scoring + insert (canonical answers from tests.questions)
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
