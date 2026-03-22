-- Syllabus sets (per KB, multiple per user/platform), entries, topic exclusions for AI generation.
-- Migrates rows from legacy NEET_syllabus when present.

create table if not exists public.syllabus_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  user_id uuid references auth.users (id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_bases (id) on delete set null,
  name text not null,
  slug text,
  description text
);

create index if not exists syllabus_sets_kb_idx on public.syllabus_sets (knowledge_base_id);
create index if not exists syllabus_sets_user_idx on public.syllabus_sets (user_id);

create table if not exists public.syllabus_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  syllabus_set_id uuid not null references public.syllabus_sets (id) on delete cascade,
  class_name text not null default '',
  subject_name text not null default '',
  chapter_name text not null default '',
  topic_list text not null default '',
  unit_number int,
  chapter_number int,
  unit_name text
);

create index if not exists syllabus_entries_set_idx on public.syllabus_entries (syllabus_set_id);
create index if not exists syllabus_entries_chapter_idx on public.syllabus_entries (chapter_name);

-- Negative listing: do not generate AI questions tagged with these topics (user-scoped).
create table if not exists public.question_topic_exclusions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  user_id uuid not null references auth.users (id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_bases (id) on delete set null,
  kb_class_id uuid references public.kb_classes (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  topic_label text not null,
  note text
);

create index if not exists question_topic_exclusions_user_idx on public.question_topic_exclusions (user_id);
create index if not exists question_topic_exclusions_kb_idx on public.question_topic_exclusions (knowledge_base_id);

alter table public.syllabus_sets enable row level security;
alter table public.syllabus_entries enable row level security;
alter table public.question_topic_exclusions enable row level security;

drop policy if exists "syllabus_sets_select" on public.syllabus_sets;
create policy "syllabus_sets_select" on public.syllabus_sets
  for select to authenticated using (true);

drop policy if exists "syllabus_sets_insert" on public.syllabus_sets;
create policy "syllabus_sets_insert" on public.syllabus_sets
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "syllabus_sets_update" on public.syllabus_sets;
create policy "syllabus_sets_update" on public.syllabus_sets
  for update to authenticated using (
    user_id = auth.uid() or (user_id is null and public.is_developer())
  );

drop policy if exists "syllabus_sets_delete" on public.syllabus_sets;
create policy "syllabus_sets_delete" on public.syllabus_sets
  for delete to authenticated using (
    user_id = auth.uid() or (user_id is null and public.is_developer())
  );

drop policy if exists "syllabus_entries_select" on public.syllabus_entries;
create policy "syllabus_entries_select" on public.syllabus_entries
  for select to authenticated using (
    exists (
      select 1 from public.syllabus_sets s
      where s.id = syllabus_entries.syllabus_set_id
        and (s.user_id is null or s.user_id = auth.uid() or public.is_developer())
    )
  );

drop policy if exists "syllabus_entries_insert" on public.syllabus_entries;
create policy "syllabus_entries_insert" on public.syllabus_entries
  for insert to authenticated with check (
    exists (
      select 1 from public.syllabus_sets s
      where s.id = syllabus_set_id
        and (s.user_id = auth.uid() or (s.user_id is null and public.is_developer()))
    )
  );

drop policy if exists "syllabus_entries_update" on public.syllabus_entries;
create policy "syllabus_entries_update" on public.syllabus_entries
  for update to authenticated using (
    exists (
      select 1 from public.syllabus_sets s
      where s.id = syllabus_set_id
        and (s.user_id = auth.uid() or (s.user_id is null and public.is_developer()))
    )
  );

drop policy if exists "syllabus_entries_delete" on public.syllabus_entries;
create policy "syllabus_entries_delete" on public.syllabus_entries
  for delete to authenticated using (
    exists (
      select 1 from public.syllabus_sets s
      where s.id = syllabus_set_id
        and (s.user_id = auth.uid() or (s.user_id is null and public.is_developer()))
    )
  );

drop policy if exists "question_topic_exclusions_all" on public.question_topic_exclusions;
create policy "question_topic_exclusions_all" on public.question_topic_exclusions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Migrate legacy NEET tables into syllabus_sets / syllabus_entries (full-row dedup).
-- public."NEET_syllabus" -> slug neet-migrated; public.neet_syllabus (if both exist) -> neet-migrated-lowercase; only lowercase -> neet-migrated.
do $migrate$
declare
  v_kb uuid;
  v_set uuid;
  v_has_upper boolean;
  v_leg_lower bigint;
begin
  select id into v_kb from public.knowledge_bases order by created_at asc nulls last limit 1;

  v_has_upper := to_regclass('public."NEET_syllabus"') is not null;

  if v_has_upper then
    insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
    select null, v_kb, 'NEET (migrated)', 'neet-migrated', 'Imported from legacy public."NEET_syllabus".'
    where not exists (select 1 from public.syllabus_sets where slug = 'neet-migrated');

    select id into v_set from public.syllabus_sets where slug = 'neet-migrated' limit 1;

    if v_set is not null then
      insert into public.syllabus_entries (
        syllabus_set_id, class_name, subject_name, chapter_name, topic_list,
        unit_number, chapter_number, unit_name
      )
      select v_set,
             coalesce(n.class_name, ''),
             coalesce(n.subject_name, ''),
             coalesce(n.chapter_name, ''),
             coalesce(n.topic_list, ''),
             n.unit_number,
             n.chapter_number,
             coalesce(n.unit_name, '')
      from public."NEET_syllabus" n
      where not exists (
        select 1 from public.syllabus_entries e
        where e.syllabus_set_id = v_set
          and coalesce(e.class_name, '') = coalesce(n.class_name, '')
          and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
          and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
          and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
          and e.unit_number is not distinct from n.unit_number
          and e.chapter_number is not distinct from n.chapter_number
          and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
      );
    end if;
  end if;

  if to_regclass('public.neet_syllabus') is not null then
    select count(*) into v_leg_lower from public.neet_syllabus;

    if v_leg_lower > 0 then
      if v_has_upper then
        insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
        select null, v_kb, 'NEET (migrated from neet_syllabus)', 'neet-migrated-lowercase', 'Imported from legacy public.neet_syllabus.'
        where not exists (select 1 from public.syllabus_sets where slug = 'neet-migrated-lowercase');

        select id into v_set from public.syllabus_sets where slug = 'neet-migrated-lowercase' limit 1;
      else
        insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
        select null, v_kb, 'NEET (migrated)', 'neet-migrated', 'Imported from legacy public.neet_syllabus.'
        where not exists (select 1 from public.syllabus_sets where slug = 'neet-migrated');

        select id into v_set from public.syllabus_sets where slug = 'neet-migrated' limit 1;
      end if;

      if v_set is not null then
        insert into public.syllabus_entries (
          syllabus_set_id, class_name, subject_name, chapter_name, topic_list,
          unit_number, chapter_number, unit_name
        )
        select v_set,
               coalesce(n.class_name, ''),
               coalesce(n.subject_name, ''),
               coalesce(n.chapter_name, ''),
               coalesce(n.topic_list, ''),
               n.unit_number,
               n.chapter_number,
               coalesce(n.unit_name, '')
        from public.neet_syllabus n
        where not exists (
          select 1 from public.syllabus_entries e
          where e.syllabus_set_id = v_set
            and coalesce(e.class_name, '') = coalesce(n.class_name, '')
            and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
            and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
            and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
            and e.unit_number is not distinct from n.unit_number
            and e.chapter_number is not distinct from n.chapter_number
            and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
        );
      end if;
    end if;
  end if;

  if not v_has_upper and to_regclass('public.neet_syllabus') is null then
    insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
    select null, v_kb, 'NEET default', 'neet-default', 'Platform syllabus; add entries in Syllabus manager.'
    where not exists (select 1 from public.syllabus_sets where slug = 'neet-default');
  end if;
end $migrate$;
