-- Optional tag for Biology chapters: botany vs zoology (null for other subjects or unspecified).
alter table public.chapters
  add column if not exists biology_branch text;

alter table public.chapters
  drop constraint if exists chapters_biology_branch_check;

alter table public.chapters
  add constraint chapters_biology_branch_check
  check (biology_branch is null or biology_branch in ('botany', 'zoology'));

comment on column public.chapters.biology_branch is 'For Biology subject chapters: botany, zoology, or null (unset / not applicable).';
