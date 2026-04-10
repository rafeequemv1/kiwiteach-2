-- Deleting a class must not run ON DELETE SET NULL on students.class_id: the BEFORE UPDATE
-- trigger students_enforce_org_hierarchy rejects null business_id/institute_id/class_id and
-- surfaced as 400 "Student must have business_id, institute_id, and class_id".

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any (con.conkey)
  join pg_class ft on ft.oid = con.confrelid
  where t.relname = 'students'
    and ft.relname = 'classes'
    and con.contype = 'f'
    and a.attname = 'class_id'
  limit 1;

  if cname is not null then
    execute format('alter table public.students drop constraint %I', cname);
  end if;
end $$;

alter table public.students drop constraint if exists students_class_id_classes_fkey;

alter table public.students
  add constraint students_class_id_classes_fkey
  foreign key (class_id)
  references public.classes (id)
  on delete restrict;

comment on constraint students_class_id_classes_fkey on public.students is
  'Block class delete while roster rows reference it; avoids invalid SET NULL updates that fire students_enforce_org_hierarchy.';
