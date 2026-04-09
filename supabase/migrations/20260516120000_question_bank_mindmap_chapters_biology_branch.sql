-- Expose chapters.biology_branch in mind map RPC for Botany/Zoology labels in admin bank map.
drop function if exists public.question_bank_mindmap_chapters(uuid);

create function public.question_bank_mindmap_chapters(p_subject_id uuid)
returns table (chapter_id uuid, chapter_name text, chapter_number int, biology_branch text, question_count bigint)
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
  select c.id, c.name::text, c.chapter_number, c.biology_branch::text, count(q.id)::bigint
  from public.chapters c
  left join public.question_bank_neet q on q.chapter_id = c.id
  where c.subject_id = p_subject_id
  group by c.id, c.name, c.chapter_number, c.biology_branch
  order by c.chapter_number nulls last, c.name;
end;
$$;

grant execute on function public.question_bank_mindmap_chapters(uuid) to authenticated;
