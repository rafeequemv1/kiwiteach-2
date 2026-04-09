-- Split legacy combined "Biology" subject rows into separate Botany and Zoology subjects per class/KB.
-- Reassign chapters (and related rows) so NEET uses four subjects: Physics, Chemistry, Botany, Zoology.
-- Untagged biology chapters (biology_branch null) default to Botany. Zoology chapters stay on Zoology.
-- Idempotent: second run finds no legacy biology subjects; inserts/updates are no-ops.

create temporary table _kt_bio_subject_ids (
  old_id uuid primary key,
  class_id uuid not null,
  kb_id uuid not null,
  class_name text,
  kb_name text
) on commit drop;

insert into _kt_bio_subject_ids (old_id, class_id, kb_id, class_name, kb_name)
select s.id, s.class_id, s.kb_id, s.class_name, s.kb_name
from public.subjects s
where (
  lower(btrim(coalesce(s.name, ''))) in ('biology', 'bio', 'neet biology')
  or (
    lower(btrim(s.name)) like '%biology%'
    and lower(btrim(s.name)) not like '%biochemistry%'
  )
)
;

-- Ensure Botany / Zoology subject rows exist for each (class_id, kb_id) that had biology.
insert into public.subjects (class_id, class_name, kb_id, kb_name, name)
select distinct b.class_id, b.class_name, b.kb_id, b.kb_name, 'Botany'
from _kt_bio_subject_ids b
where not exists (
  select 1
  from public.subjects s
  where s.class_id = b.class_id
    and s.kb_id = b.kb_id
    and lower(btrim(s.name)) = 'botany'
);

insert into public.subjects (class_id, class_name, kb_id, kb_name, name)
select distinct b.class_id, b.class_name, b.kb_id, b.kb_name, 'Zoology'
from _kt_bio_subject_ids b
where not exists (
  select 1
  from public.subjects s
  where s.class_id = b.class_id
    and s.kb_id = b.kb_id
    and lower(btrim(s.name)) = 'zoology'
);

-- Move chapters off legacy biology onto Botany or Zoology; align biology_branch for exam mix keys (g:bio:*).
update public.chapters c
set
  subject_id = case
    when c.biology_branch = 'zoology' then zo.id
    else bo.id
  end,
  subject_name = case
    when c.biology_branch = 'zoology' then 'Zoology'
    else 'Botany'
  end,
  biology_branch = case
    when c.biology_branch = 'zoology' then 'zoology'
    else 'botany'
  end
from _kt_bio_subject_ids old
join public.subjects bo
  on bo.class_id = old.class_id
  and bo.kb_id = old.kb_id
  and lower(btrim(bo.name)) = 'botany'
join public.subjects zo
  on zo.class_id = old.class_id
  and zo.kb_id = old.kb_id
  and lower(btrim(zo.name)) = 'zoology'
where c.subject_id = old.old_id;

-- Topic exclusions: follow chapter when possible; otherwise Botany subject for that class/KB.
update public.question_topic_exclusions e
set subject_id = c.subject_id
from public.chapters c
where e.chapter_id = c.id
  and e.subject_id in (select old_id from _kt_bio_subject_ids);

update public.question_topic_exclusions e
set subject_id = bo.id
from _kt_bio_subject_ids old
join public.subjects bo
  on bo.class_id = old.class_id
  and bo.kb_id = old.kb_id
  and lower(btrim(bo.name)) = 'botany'
where e.subject_id = old.old_id
  and e.chapter_id is null;

-- Keep question_bank_neet.subject_name in sync with chapter denorm.
update public.question_bank_neet q
set subject_name = c.subject_name
from public.chapters c
where q.chapter_id = c.id
  and c.subject_name is not null
  and (q.subject_name is distinct from c.subject_name);

delete from public.subjects s
where s.id in (select old_id from _kt_bio_subject_ids);
