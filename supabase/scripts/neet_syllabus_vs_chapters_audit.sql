-- Audit: NEET syllabus rows vs chapters in the NEET knowledge base.
-- Run in Supabase SQL Editor (service role / postgres) or psql.
--
-- 1) Adjust `kb` CTE if you have multiple KBs matching "neet" (filter by name).
-- 2) Syllabus set: platform (user_id is null) linked to that KB; prefers slug neet-migrated, then neet-default.
-- 3) Class labels: syllabus often uses "Class 11" / "Class 12" / "Class 11 and 12" while chapters may use
--    "Plus 1" / "Plus 2". This script maps 11->Plus 1, 12->Plus 2, and "11 and 12" -> match either.

with
kb as (
  select id, name
  from public.knowledge_bases
  where lower(coalesce(name, '')) like '%neet%'
  order by name
  limit 1
),
syllabus_set as (
  select s.id, s.slug, s.name
  from public.syllabus_sets s
  cross join kb
  where s.knowledge_base_id = kb.id
    and s.user_id is null
  order by
    case coalesce(s.slug, '')
      when 'neet-migrated' then 0
      when 'neet-default' then 1
      else 2
    end,
    s.name
  limit 1
),
syllabus_rows as (
  select
    e.id as syllabus_entry_id,
    e.class_name,
    e.subject_name,
    e.chapter_name,
    e.chapter_number,
    e.unit_number,
    regexp_replace(lower(trim(e.chapter_name)), '\s+', ' ', 'g') as n_chapter,
    regexp_replace(lower(trim(coalesce(e.subject_name, ''))), '\s+', ' ', 'g') as n_subject,
    case
      when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') ~ '11.*12|12.*11|11 and 12|11 & 12' then 'both'
      when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') like '%12%' then 'plus2'
      when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') like '%11%' then 'plus1'
      else regexp_replace(lower(trim(coalesce(e.class_name, ''))), '\s+', ' ', 'g')
    end as class_bucket
  from public.syllabus_entries e
  inner join syllabus_set ss on ss.id = e.syllabus_set_id
)
select
  kb.id as knowledge_base_id,
  kb.name as knowledge_base_name,
  ss.slug as syllabus_set_slug,
  s.syllabus_entry_id,
  s.class_name,
  s.subject_name,
  s.chapter_name,
  s.chapter_number,
  s.unit_number,
  'no KB chapter (mapped class + subject + chapter title)' as reason
from syllabus_rows s
cross join kb
cross join syllabus_set ss
where not exists (
  select 1
  from public.chapters c
  where c.kb_id = kb.id
    and regexp_replace(lower(trim(c.name)), '\s+', ' ', 'g') = s.n_chapter
    and regexp_replace(lower(trim(coalesce(c.subject_name, ''))), '\s+', ' ', 'g') = s.n_subject
    and (
      (s.class_bucket = 'plus1' and c.class_name = 'Plus 1')
      or (s.class_bucket = 'plus2' and c.class_name = 'Plus 2')
      or (s.class_bucket = 'both' and c.class_name in ('Plus 1', 'Plus 2'))
      or (
        s.class_bucket not in ('plus1', 'plus2', 'both')
        and regexp_replace(lower(trim(coalesce(c.class_name, ''))), '\s+', ' ', 'g') = s.class_bucket
      )
    )
)
order by s.class_name, s.subject_name, s.chapter_number nulls last, s.chapter_name;

-- Summary counts (same matching rules as above):
-- with kb as (select id::uuid as kid from public.knowledge_bases where lower(name) like '%neet%' limit 1),
-- syllabus_set as (
--   select s.id from public.syllabus_sets s cross join kb
--   where s.knowledge_base_id = kb.kid and s.user_id is null
--   order by case coalesce(s.slug,'') when 'neet-migrated' then 0 when 'neet-default' then 1 else 2 end limit 1
-- ),
-- syllabus_rows as (
--   select e.id,
--     regexp_replace(lower(trim(e.chapter_name)), '\s+', ' ', 'g') as n_chapter,
--     regexp_replace(lower(trim(coalesce(e.subject_name,''))), '\s+', ' ', 'g') as n_subject,
--     case when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') ~ '11.*12|12.*11|11 and 12|11 & 12' then 'both'
--       when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') like '%12%' then 'plus2'
--       when regexp_replace(lower(trim(e.class_name)), '\s+', ' ', 'g') like '%11%' then 'plus1'
--       else regexp_replace(lower(trim(coalesce(e.class_name,''))), '\s+', ' ', 'g') end as class_bucket
--   from public.syllabus_entries e inner join syllabus_set ss on ss.id = e.syllabus_set_id
-- ),
-- matched as (
--   select s.id from syllabus_rows s cross join kb
--   where exists (
--     select 1 from public.chapters c where c.kb_id = kb.kid
--       and regexp_replace(lower(trim(c.name)), '\s+', ' ', 'g') = s.n_chapter
--       and regexp_replace(lower(trim(coalesce(c.subject_name,''))), '\s+', ' ', 'g') = s.n_subject
--       and ((s.class_bucket = 'plus1' and c.class_name = 'Plus 1') or (s.class_bucket = 'plus2' and c.class_name = 'Plus 2')
--         or (s.class_bucket = 'both' and c.class_name in ('Plus 1','Plus 2'))
--         or (s.class_bucket not in ('plus1','plus2','both')
--           and regexp_replace(lower(trim(coalesce(c.class_name,''))), '\s+', ' ', 'g') = s.class_bucket))
--   )
-- )
-- select (select count(*) from syllabus_rows) as syllabus_rows,
--        (select count(*) from matched) as matched_to_kb_chapter,
--        (select count(*) from syllabus_rows) - (select count(*) from matched) as missing;
