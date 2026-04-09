-- Eligibility RPCs must see all question_usage rows for the target class (not only the
-- caller's rows under RLS), otherwise another teacher's usage—or any row invisible to RLS—
-- would not exclude questions. SECURITY DEFINER + row_security off matches class-wide pool.

create or replace function public.get_eligible_questions_for_class(
  target_class_id uuid,
  target_chapter_id uuid,
  target_difficulty text default null,
  exclude_question_ids uuid[] default array[]::uuid[],
  row_limit int default 20,
  allow_repeats boolean default false,
  include_used_question_ids uuid[] default array[]::uuid[],
  target_question_type text default null
)
returns setof public.question_bank_neet
language sql
security definer
set search_path = public
set row_security = off
as $$
  select qb.*
  from public.question_bank_neet qb
  left join public.question_usage qu
    on qu.class_id = target_class_id
   and qu.question_id = qb.id
  where qb.chapter_id = target_chapter_id
    and (target_difficulty is null or qb.difficulty = target_difficulty)
    and (target_question_type is null or qb.question_type = target_question_type)
    and (
      cardinality(exclude_question_ids) = 0
      or not (qb.id = any(exclude_question_ids))
    )
    and (
      allow_repeats
      or qu.question_id is null
      or (
        cardinality(include_used_question_ids) > 0
        and qb.id = any(include_used_question_ids)
      )
    )
  order by qb.id
  limit greatest(coalesce(row_limit, 20), 1);
$$;

create or replace function public.get_used_questions_for_class(
  target_class_id uuid,
  target_chapter_id uuid default null,
  row_limit int default 100
)
returns setof public.question_bank_neet
language sql
security definer
set search_path = public
set row_security = off
as $$
  select qb.*
  from public.question_usage qu
  join public.question_bank_neet qb
    on qb.id = qu.question_id
  where qu.class_id = target_class_id
    and (target_chapter_id is null or qb.chapter_id = target_chapter_id)
  order by qu.used_at desc
  limit greatest(coalesce(row_limit, 100), 1);
$$;

grant execute on function public.get_eligible_questions_for_class(uuid, uuid, text, uuid[], int, boolean, uuid[], text) to authenticated;
grant execute on function public.get_used_questions_for_class(uuid, uuid, int) to authenticated;
