-- Stricter figure sampling for class-scoped bank picks:
-- optional require_figure filter + random() order so LIMIT returns a representative mix (not always lowest qb.id).

drop function if exists public.get_eligible_questions_for_class(uuid, uuid, text, uuid[], int, boolean, uuid[], text);

create or replace function public.get_eligible_questions_for_class(
  target_class_id uuid,
  target_chapter_id uuid,
  target_difficulty text default null,
  exclude_question_ids uuid[] default array[]::uuid[],
  row_limit int default 20,
  allow_repeats boolean default false,
  include_used_question_ids uuid[] default array[]::uuid[],
  target_question_type text default null,
  require_figure boolean default false
)
returns setof public.question_bank_neet
language sql
security definer
set search_path = public
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
      not coalesce(require_figure, false)
      or (qb.figure_url is not null and length(trim(qb.figure_url)) > 0)
    )
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
  order by random()
  limit greatest(coalesce(row_limit, 20), 1);
$$;

grant execute on function public.get_eligible_questions_for_class(uuid, uuid, text, uuid[], int, boolean, uuid[], text, boolean) to authenticated;

comment on function public.get_eligible_questions_for_class(uuid, uuid, text, uuid[], int, boolean, uuid[], text, boolean) is
  'Eligible bank rows per chapter/class usage; optional question_type and require_figure; random sample within row_limit.';
