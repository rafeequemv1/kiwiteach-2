-- Extend PYQ schema for explicit bulk-upload columns.
-- Keeps existing options/correct_index while adding explicit choice and answer fields.

alter table public.pyq_questions_neet
  add column if not exists choice_a text,
  add column if not exists choice_b text,
  add column if not exists choice_c text,
  add column if not exists choice_d text,
  add column if not exists correct_answer text,
  add column if not exists question_format text not null default 'text';

update public.pyq_questions_neet
set
  choice_a = coalesce(choice_a, options ->> 0),
  choice_b = coalesce(choice_b, options ->> 1),
  choice_c = coalesce(choice_c, options ->> 2),
  choice_d = coalesce(choice_d, options ->> 3),
  correct_answer = coalesce(
    correct_answer,
    case coalesce(correct_index, -1)
      when 0 then 'A'
      when 1 then 'B'
      when 2 then 'C'
      when 3 then 'D'
      else null
    end
  );
