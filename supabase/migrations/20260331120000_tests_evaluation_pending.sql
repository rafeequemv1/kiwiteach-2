-- Kanban "Pending evaluation" column: teacher-set flag on tests.
alter table public.tests
  add column if not exists evaluation_pending boolean not null default false;

comment on column public.tests.evaluation_pending is
  'When true, board shows this test in Pending evaluation (e.g. awaiting grading).';
