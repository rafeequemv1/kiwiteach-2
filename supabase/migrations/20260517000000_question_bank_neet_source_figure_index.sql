-- Neural Studio: cheap per–reference-figure question counts (one index + one RPC per chapter).
-- Avoids grouping on huge source_figure_url text.

alter table public.question_bank_neet
  add column if not exists source_figure_index integer;

comment on column public.question_bank_neet.source_figure_index is
  '0-based index into chapter KB reference figures (DOCX/PDF extract order) when the question was generated from a reference image; null for synthetic figures, text-only, or legacy rows.';

create index if not exists question_bank_neet_chapter_source_fig_idx
  on public.question_bank_neet (chapter_id, source_figure_index)
  where source_figure_index is not null;

-- Single round-trip aggregate; respects RLS as invoking user.
create or replace function public.qb_neet_source_figure_question_counts(p_chapter_id uuid)
returns table (figure_index integer, question_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    qb.source_figure_index::integer as figure_index,
    count(*)::bigint as question_count
  from public.question_bank_neet qb
  where qb.chapter_id = p_chapter_id
    and qb.source_figure_index is not null
  group by qb.source_figure_index;
$$;

comment on function public.qb_neet_source_figure_question_counts(uuid) is
  'Returns how many hub questions used each reference figure index for a chapter (grouped; cheap).';

grant execute on function public.qb_neet_source_figure_question_counts(uuid) to authenticated;
