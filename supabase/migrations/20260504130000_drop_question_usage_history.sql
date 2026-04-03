-- Remove legacy append-only audit table. No-repeat is enforced by question_usage only; the app never read history.

create or replace function public.record_question_usage_for_test(
  target_test_id uuid,
  target_class_ids uuid[],
  target_question_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  class_item uuid;
  question_item uuid;
begin
  if target_class_ids is null or cardinality(target_class_ids) = 0 then
    return;
  end if;

  if target_question_ids is null or cardinality(target_question_ids) = 0 then
    return;
  end if;

  foreach class_item in array target_class_ids loop
    foreach question_item in array target_question_ids loop
      insert into public.question_usage (
        user_id,
        class_id,
        question_id,
        test_id,
        used_at,
        updated_at
      )
      values (
        auth.uid(),
        class_item,
        question_item,
        target_test_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      )
      on conflict (class_id, question_id) do update
      set
        user_id = excluded.user_id,
        test_id = excluded.test_id,
        used_at = excluded.used_at,
        updated_at = excluded.updated_at;
    end loop;
  end loop;
end;
$$;

drop table if exists public.question_usage_history cascade;
