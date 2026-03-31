-- One PYQ upload batch per exam year (merge separate uploads into the same batch).

alter table public.pyq_upload_sets
  add column if not exists ingestion_year int;

comment on column public.pyq_upload_sets.ingestion_year is 'Exam year for this batch; unique when set so imports for the same year merge.';

create unique index if not exists pyq_upload_sets_ingestion_year_unique
  on public.pyq_upload_sets (ingestion_year)
  where ingestion_year is not null;
