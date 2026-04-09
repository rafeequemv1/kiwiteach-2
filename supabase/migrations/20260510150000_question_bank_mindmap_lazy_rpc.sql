-- Lazy aggregates for Question DB mind map (expand one level at a time).
-- Depends on reference_questions_admin_access() (developer / school_admin).

create or replace function public.question_bank_mindmap_knowledge_bases()
returns table (kb_id uuid, kb_name text, question_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reference_questions_admin_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select kb.id, kb.name::text, count(q.id)::bigint
  from public.knowledge_bases kb
  left join public.chapters c on c.kb_id = kb.id
  left join public.question_bank_neet q on q.chapter_id = c.id
  group by kb.id, kb.name
  order by kb.name;
end;
$$;

create or replace function public.question_bank_mindmap_classes(p_kb_id uuid)
returns table (class_id uuid, class_name text, question_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reference_questions_admin_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select kc.id, kc.name::text, count(q.id)::bigint
  from public.kb_classes kc
  left join public.subjects s on s.class_id = kc.id
  left join public.chapters c on c.subject_id = s.id and c.kb_id = p_kb_id
  left join public.question_bank_neet q on q.chapter_id = c.id
  where kc.kb_id = p_kb_id
  group by kc.id, kc.name
  order by kc.name;
end;
$$;

create or replace function public.question_bank_mindmap_subjects(p_class_id uuid)
returns table (subject_id uuid, subject_name text, question_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reference_questions_admin_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.name::text, count(q.id)::bigint
  from public.subjects s
  left join public.chapters c on c.subject_id = s.id
  left join public.question_bank_neet q on q.chapter_id = c.id
  where s.class_id = p_class_id
  group by s.id, s.name
  order by s.name;
end;
$$;

create or replace function public.question_bank_mindmap_chapters(p_subject_id uuid)
returns table (chapter_id uuid, chapter_name text, chapter_number int, question_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reference_questions_admin_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id, c.name::text, c.chapter_number, count(q.id)::bigint
  from public.chapters c
  left join public.question_bank_neet q on q.chapter_id = c.id
  where c.subject_id = p_subject_id
  group by c.id, c.name, c.chapter_number
  order by c.chapter_number nulls last, c.name;
end;
$$;

create or replace function public.question_bank_mindmap_topic_tags(p_chapter_id uuid)
returns table (topic_label text, question_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reference_questions_admin_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    coalesce(nullif(trim(q.topic_tag::text), ''), '(untagged)')::text as topic_label,
    count(*)::bigint as question_count
  from public.question_bank_neet q
  where q.chapter_id = p_chapter_id
  group by 1
  order by 1;
end;
$$;

grant execute on function public.question_bank_mindmap_knowledge_bases() to authenticated;
grant execute on function public.question_bank_mindmap_classes(uuid) to authenticated;
grant execute on function public.question_bank_mindmap_subjects(uuid) to authenticated;
grant execute on function public.question_bank_mindmap_chapters(uuid) to authenticated;
grant execute on function public.question_bank_mindmap_topic_tags(uuid) to authenticated;

comment on function public.question_bank_mindmap_knowledge_bases() is
  'Lazy mind map: KB roots with total NEET bank question counts (admin only).';
comment on function public.question_bank_mindmap_topic_tags(uuid) is
  'Lazy mind map: topic_tag breakdown for one chapter (admin only).';
