-- Strict tenant isolation:
-- If an actor has profiles.business_id, they can only read/list data in that business.
-- Unassigned actors (business_id is null) keep legacy elevated behavior.

-- businesses
drop policy if exists "businesses_select_visible" on public.businesses;
create policy "businesses_select_visible"
on public.businesses for select
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = businesses.id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (businesses.user_id = auth.uid () or public.is_developer ())
  )
);

drop policy if exists "businesses_update_owner_or_dev" on public.businesses;
create policy "businesses_update_owner_or_dev"
on public.businesses for update
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = businesses.id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (businesses.user_id = auth.uid () or public.is_developer ())
  )
)
with check (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = businesses.id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (businesses.user_id = auth.uid () or public.is_developer ())
  )
);

drop policy if exists "businesses_delete_owner_or_dev" on public.businesses;
create policy "businesses_delete_owner_or_dev"
on public.businesses for delete
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = businesses.id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (businesses.user_id = auth.uid () or public.is_developer ())
  )
);

-- institutes
drop policy if exists "institutes_select_member_or_owner" on public.institutes;
create policy "institutes_select_member_or_owner"
on public.institutes for select
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and institutes.business_id = ap.business_id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (institutes.user_id = auth.uid () or public.is_developer ())
  )
);

drop policy if exists "institutes_update_owner_or_dev" on public.institutes;
create policy "institutes_update_owner_or_dev"
on public.institutes for update
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and institutes.business_id = ap.business_id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (institutes.user_id = auth.uid () or public.is_developer ())
  )
)
with check (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and institutes.business_id = ap.business_id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (institutes.user_id = auth.uid () or public.is_developer ())
  )
);

drop policy if exists "institutes_delete_owner_or_dev" on public.institutes;
create policy "institutes_delete_owner_or_dev"
on public.institutes for delete
to authenticated
using (
  (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and institutes.business_id = ap.business_id
    )
  )
  or (
    not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
    and (institutes.user_id = auth.uid () or public.is_developer ())
  )
);

-- classes
drop policy if exists "classes_select_member_or_owner" on public.classes;
create policy "classes_select_member_or_owner"
on public.classes for select
to authenticated
using (
  exists (
    select 1
    from public.institutes i
    where i.id = classes.institute_id
      and (
        (
          exists (
            select 1
            from public.profiles ap
            where ap.id = auth.uid ()
              and ap.business_id is not null
              and i.business_id = ap.business_id
          )
        )
        or (
          not exists (
            select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
          )
          and (i.user_id = auth.uid () or classes.user_id = auth.uid () or public.is_developer ())
        )
      )
  )
);

drop policy if exists "classes_update_owner_or_dev" on public.classes;
create policy "classes_update_owner_or_dev"
on public.classes for update
to authenticated
using (
  exists (
    select 1
    from public.institutes i
    where i.id = classes.institute_id
      and (
        (
          exists (
            select 1
            from public.profiles ap
            where ap.id = auth.uid ()
              and ap.business_id is not null
              and i.business_id = ap.business_id
          )
        )
        or (
          not exists (
            select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
          )
          and (i.user_id = auth.uid () or classes.user_id = auth.uid () or public.is_developer ())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.institutes i
    where i.id = classes.institute_id
      and (
        (
          exists (
            select 1
            from public.profiles ap
            where ap.id = auth.uid ()
              and ap.business_id is not null
              and i.business_id = ap.business_id
          )
        )
        or (
          not exists (
            select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
          )
          and (i.user_id = auth.uid () or classes.user_id = auth.uid () or public.is_developer ())
        )
      )
  )
);

drop policy if exists "classes_delete_owner_or_dev" on public.classes;
create policy "classes_delete_owner_or_dev"
on public.classes for delete
to authenticated
using (
  exists (
    select 1
    from public.institutes i
    where i.id = classes.institute_id
      and (
        (
          exists (
            select 1
            from public.profiles ap
            where ap.id = auth.uid ()
              and ap.business_id is not null
              and i.business_id = ap.business_id
          )
        )
        or (
          not exists (
            select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
          )
          and (i.user_id = auth.uid () or classes.user_id = auth.uid () or public.is_developer ())
        )
      )
  )
);

-- students: strict business visibility for assigned actors
drop policy if exists "Users can manage their own students" on public.students;
create policy "Users can manage their own students"
on public.students for all
to authenticated
using (
  auth.uid () = user_id
  and (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = students.business_id
    )
    or not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
  )
)
with check (
  auth.uid () = user_id
  and (
    exists (
      select 1
      from public.profiles ap
      where ap.id = auth.uid ()
        and ap.business_id is not null
        and ap.business_id = students.business_id
    )
    or not exists (
      select 1 from public.profiles ap where ap.id = auth.uid () and ap.business_id is not null
    )
  )
);

-- admin_list_users: assigned users only list their business members.
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users ()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamp with time zone,
  business_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_actor_role text;
  v_actor_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select p.role, p.business_id into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if v_actor_business is not null then
    return query
    select
      au.id,
      au.email::text as email,
      p.full_name,
      coalesce (p.role, 'student')::text as role,
      au.created_at,
      p.business_id
    from auth.users au
    left join public.profiles p on p.id = au.id
    where p.business_id = v_actor_business
      or au.id = v_actor
    order by au.created_at desc;
    return;
  end if;

  if public.is_developer () then
    return query
    select
      au.id,
      au.email::text as email,
      p.full_name,
      coalesce (p.role, 'student')::text as role,
      au.created_at,
      p.business_id
    from auth.users au
    left join public.profiles p on p.id = au.id
    order by au.created_at desc;
    return;
  end if;

  if lower (coalesce (v_actor_role, '')) = 'school_admin' and v_actor_business is not null then
    return query
    select
      au.id,
      au.email::text as email,
      p.full_name,
      coalesce (p.role, 'student')::text as role,
      au.created_at,
      p.business_id
    from auth.users au
    left join public.profiles p on p.id = au.id
    where p.business_id = v_actor_business
      or au.id = v_actor
    order by au.created_at desc;
    return;
  end if;

  return;
end;
$$;
