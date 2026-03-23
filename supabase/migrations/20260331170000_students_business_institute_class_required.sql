-- Students must be fully mapped to business -> institute -> class.

alter table public.students
  add column if not exists business_id uuid references public.businesses (id) on delete restrict,
  add column if not exists institute_id uuid references public.institutes (id) on delete restrict;

create index if not exists students_business_id_idx on public.students (business_id);
create index if not exists students_institute_id_idx on public.students (institute_id);
create index if not exists students_class_id_idx on public.students (class_id);

-- Backfill missing institute/business from class where possible.
update public.students s
set institute_id = c.institute_id
from public.classes c
where s.class_id = c.id
  and s.institute_id is null;

update public.students s
set business_id = i.business_id
from public.institutes i
where s.institute_id = i.id
  and s.business_id is null;

-- Keep hierarchy valid on every write.
create or replace function public.students_enforce_org_hierarchy ()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_class_institute uuid;
  v_institute_business uuid;
begin
  if new.class_id is null or new.institute_id is null or new.business_id is null then
    raise exception 'Student must have business_id, institute_id, and class_id';
  end if;

  select c.institute_id into v_class_institute
  from public.classes c
  where c.id = new.class_id;

  if v_class_institute is null then
    raise exception 'Invalid class_id';
  end if;

  if v_class_institute is distinct from new.institute_id then
    raise exception 'class_id does not belong to institute_id';
  end if;

  select i.business_id into v_institute_business
  from public.institutes i
  where i.id = new.institute_id;

  if v_institute_business is null then
    raise exception 'institute_id is not assigned to a business';
  end if;

  if v_institute_business is distinct from new.business_id then
    raise exception 'institute_id does not belong to business_id';
  end if;

  return new;
end;
$$;

drop trigger if exists students_enforce_org_hierarchy_trg on public.students;
create trigger students_enforce_org_hierarchy_trg
before insert or update on public.students
for each row execute procedure public.students_enforce_org_hierarchy ();

alter table public.students
  alter column class_id set not null,
  alter column institute_id set not null,
  alter column business_id set not null;

