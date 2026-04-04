-- Roster: teachers and school_admins with a business_id can see all students in that business.
-- Legacy: users without business_id still match rows where user_id = auth.uid().
-- Staff with business_id cannot use the user_id shortcut (they use business-wide access).

drop policy if exists "Users can manage their own students" on public.students;

create policy "students_tenant_access"
on public.students
for all
to authenticated
using (
  public.is_developer ()
  or (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = students.business_id
        and lower(coalesce(ap.role, '')) in ('teacher', 'school_admin')
    )
  )
  or (
    students.user_id = auth.uid ()
    and not exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and lower(coalesce(ap.role, '')) in ('teacher', 'school_admin')
    )
  )
)
with check (
  public.is_developer ()
  or (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = students.business_id
        and lower(coalesce(ap.role, '')) in ('teacher', 'school_admin')
    )
  )
  or (
    students.user_id = auth.uid ()
    and not exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and lower(coalesce(ap.role, '')) in ('teacher', 'school_admin')
    )
  )
);
