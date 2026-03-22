-- Finalize NEET legacy syllabus: copy any missing rows (full-row match), verify, drop legacy tables.
-- Handles public."NEET_syllabus" and public.neet_syllabus (separate syllabus_sets if both have data).

do $finalize$
declare
  v_kb uuid;
  v_set_upper uuid;
  v_set_lower uuid;
  v_miss int;
  v_leg bigint;
begin
  select id into v_kb from public.knowledge_bases order by created_at asc nulls last limit 1;

  -- public."NEET_syllabus" -> syllabus_sets slug neet-migrated
  if to_regclass('public."NEET_syllabus"') is not null then
    insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
    select
      null,
      v_kb,
      'NEET (migrated from NEET_syllabus)',
      'neet-migrated',
      'Imported from legacy public."NEET_syllabus".'
    where not exists (select 1 from public.syllabus_sets where slug = 'neet-migrated');

    select id into v_set_upper from public.syllabus_sets where slug = 'neet-migrated' limit 1;

    if v_set_upper is not null then
      insert into public.syllabus_entries (
        syllabus_set_id,
        class_name,
        subject_name,
        chapter_name,
        topic_list,
        unit_number,
        chapter_number,
        unit_name
      )
      select
        v_set_upper,
        coalesce(n.class_name, ''),
        coalesce(n.subject_name, ''),
        coalesce(n.chapter_name, ''),
        coalesce(n.topic_list, ''),
        n.unit_number,
        n.chapter_number,
        coalesce(n.unit_name, '')
      from public."NEET_syllabus" n
      where not exists (
        select 1
        from public.syllabus_entries e
        where e.syllabus_set_id = v_set_upper
          and coalesce(e.class_name, '') = coalesce(n.class_name, '')
          and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
          and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
          and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
          and e.unit_number is not distinct from n.unit_number
          and e.chapter_number is not distinct from n.chapter_number
          and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
      );
    end if;

    if v_set_upper is null then
      raise exception 'syllabus_sets slug neet-migrated is required while public."NEET_syllabus" exists';
    end if;

    select count(*) into v_miss
    from public."NEET_syllabus" n
    where not exists (
      select 1
      from public.syllabus_entries e
      where e.syllabus_set_id = v_set_upper
        and coalesce(e.class_name, '') = coalesce(n.class_name, '')
        and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
        and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
        and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
        and e.unit_number is not distinct from n.unit_number
        and e.chapter_number is not distinct from n.chapter_number
        and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
    );

    if v_miss > 0 then
      raise exception 'NEET_syllabus verification failed: % row(s) not represented in syllabus_entries (neet-migrated)', v_miss;
    end if;
  end if;

  -- public.neet_syllabus -> syllabus_sets slug neet-migrated-lowercase (when table has rows)
  if to_regclass('public.neet_syllabus') is not null then
    select count(*) into v_leg from public.neet_syllabus;

    if v_leg > 0 then
      insert into public.syllabus_sets (user_id, knowledge_base_id, name, slug, description)
      select
        null,
        v_kb,
        'NEET (migrated from neet_syllabus)',
        'neet-migrated-lowercase',
        'Imported from legacy public.neet_syllabus.'
      where not exists (select 1 from public.syllabus_sets where slug = 'neet-migrated-lowercase');

      select id into v_set_lower from public.syllabus_sets where slug = 'neet-migrated-lowercase' limit 1;

      if v_set_lower is null then
        raise exception 'Could not create or load syllabus_sets slug neet-migrated-lowercase';
      end if;

      insert into public.syllabus_entries (
        syllabus_set_id,
        class_name,
        subject_name,
        chapter_name,
        topic_list,
        unit_number,
        chapter_number,
        unit_name
      )
      select
        v_set_lower,
        coalesce(n.class_name, ''),
        coalesce(n.subject_name, ''),
        coalesce(n.chapter_name, ''),
        coalesce(n.topic_list, ''),
        n.unit_number,
        n.chapter_number,
        coalesce(n.unit_name, '')
      from public.neet_syllabus n
      where not exists (
        select 1
        from public.syllabus_entries e
        where e.syllabus_set_id = v_set_lower
          and coalesce(e.class_name, '') = coalesce(n.class_name, '')
          and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
          and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
          and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
          and e.unit_number is not distinct from n.unit_number
          and e.chapter_number is not distinct from n.chapter_number
          and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
      );

      select count(*) into v_miss
      from public.neet_syllabus n
      where not exists (
        select 1
        from public.syllabus_entries e
        where e.syllabus_set_id = v_set_lower
          and coalesce(e.class_name, '') = coalesce(n.class_name, '')
          and coalesce(e.subject_name, '') = coalesce(n.subject_name, '')
          and coalesce(e.chapter_name, '') = coalesce(n.chapter_name, '')
          and coalesce(e.topic_list, '') = coalesce(n.topic_list, '')
          and e.unit_number is not distinct from n.unit_number
          and e.chapter_number is not distinct from n.chapter_number
          and coalesce(e.unit_name, '') = coalesce(n.unit_name, '')
      );

      if v_miss > 0 then
        raise exception 'neet_syllabus verification failed: % row(s) not represented in syllabus_entries (neet-migrated-lowercase)', v_miss;
      end if;
    end if;
  end if;

  -- Drop legacy tables (data verified or empty)
  drop table if exists public."NEET_syllabus";
  drop table if exists public.neet_syllabus;
end
$finalize$;
