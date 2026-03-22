-- Class-scoped no-repeat question history and RPC helpers.
-- This migration is compatibility-safe for projects that already have
-- legacy question_usage/question_usage_history tables.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage' and column_name='user_id') then
    alter table public.question_usage add column user_id uuid references auth.users on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage' and column_name='class_id') then
    alter table public.question_usage add column class_id uuid references public.classes on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage' and column_name='updated_at') then
    alter table public.question_usage add column updated_at timestamp with time zone default timezone('utc'::text, now());
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage' and column_name='used_at') then
    alter table public.question_usage add column used_at timestamp with time zone default timezone('utc'::text, now());
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage_history' and column_name='created_at') then
    alter table public.question_usage_history add column created_at timestamp with time zone default timezone('utc'::text, now());
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage_history' and column_name='user_id') then
    alter table public.question_usage_history add column user_id uuid references auth.users on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='question_usage_history' and column_name='class_id') then
    alter table public.question_usage_history add column class_id uuid references public.classes on delete cascade;
  end if;
end $$;

update public.question_usage set user_id = auth.uid() where user_id is null;
update public.question_usage_history set user_id = auth.uid() where user_id is null;

create unique index if not exists question_usage_class_question_uq
  on public.question_usage (class_id, question_id)
  where class_id is not null;

create index if not exists question_usage_class_used_at_idx
  on public.question_usage (class_id, used_at desc);

create index if not exists question_usage_question_id_idx
  on public.question_usage (question_id);

create index if not exists question_usage_history_class_used_at_idx
  on public.question_usage_history (class_id, used_at desc);

create index if not exists question_usage_history_question_id_idx
  on public.question_usage_history (question_id);

alter table if exists public.question_usage enable row level security;
alter table if exists public.question_usage_history enable row level security;

drop policy if exists "Users can manage own question usage" on public.question_usage;
create policy "Users can manage own question usage"
on public.question_usage for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own question usage history" on public.question_usage_history;
create policy "Users can manage own question usage history"
on public.question_usage_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.get_eligible_questions_for_class(
  target_class_id uuid,
  target_chapter_id uuid,
  target_difficulty text default null,
  exclude_question_ids uuid[] default array[]::uuid[],
  row_limit int default 20,
  allow_repeats boolean default false,
  include_used_question_ids uuid[] default array[]::uuid[]
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

      insert into public.question_usage_history (
        user_id,
        class_id,
        question_id,
        test_id,
        used_at
      )
      values (
        auth.uid(),
        class_item,
        question_item,
        target_test_id,
        timezone('utc'::text, now())
      );
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_eligible_questions_for_class(uuid, uuid, text, uuid[], int, boolean, uuid[]) to authenticated;
grant execute on function public.get_used_questions_for_class(uuid, uuid, int) to authenticated;
grant execute on function public.record_question_usage_for_test(uuid, uuid[], uuid[]) to authenticated;
