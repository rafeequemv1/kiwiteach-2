-- profiles.business_id + org RLS (business members see shared institutes/classes).
-- Admin RPCs: list users with business; assign business (developer or school_admin for own org).

alter table public.profiles
  add column if not exists business_id uuid references public.businesses (id) on delete set null;

create index if not exists profiles_business_id_idx
  on public.profiles (business_id)
  where business_id is not null;

comment on column public.profiles.business_id is
  'Org / franchise the user belongs to; institutes under the same business are visible to all members.';

-- Prevent direct client tampering with business_id (admin uses SECURITY DEFINER RPCs).
create or replace function public.profiles_enforce_business_id_change ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.business_id is not null then
      raise exception 'business_id must be assigned via admin';
    end if;
    return new;
  end if;

  if new.business_id is not distinct from old.business_id then
    return new;
  end if;

  if public.is_developer () then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower (coalesce (p.role, '')) = 'school_admin'
      and p.business_id is not null
  ) then
    if new.business_id is not distinct from (
      select p2.business_id from public.profiles p2 where p2.id = auth.uid () limit 1
    ) then
      return new;
    end if;
    if new.business_id is null and old.business_id is not null then
      if old.business_id is not distinct from (
        select p2.business_id from public.profiles p2 where p2.id = auth.uid () limit 1
      ) then
        return new;
      end if;
    end if;
  end if;

  raise exception 'Changing business_id is not allowed';
end;
$$;

drop trigger if exists profiles_business_id_enforce on public.profiles;
create trigger profiles_business_id_enforce
before insert or update on public.profiles
for each row execute procedure public.profiles_enforce_business_id_change ();

-- Businesses: members + developer can read; owner manages writes.
drop policy if exists "Users manage own businesses" on public.businesses;

drop policy if exists "businesses_select_visible" on public.businesses;
create policy "businesses_select_visible"
on public.businesses for select
to authenticated
using (
  user_id = auth.uid ()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and p.business_id = businesses.id
  )
  or public.is_developer ()
);

drop policy if exists "businesses_insert_owner" on public.businesses;
create policy "businesses_insert_owner"
on public.businesses for insert
to authenticated
with check (user_id = auth.uid ());

drop policy if exists "businesses_update_owner_or_dev" on public.businesses;
create policy "businesses_update_owner_or_dev"
on public.businesses for update
to authenticated
using (user_id = auth.uid () or public.is_developer ())
with check (user_id = auth.uid () or public.is_developer ());

drop policy if exists "businesses_delete_owner_or_dev" on public.businesses;
create policy "businesses_delete_owner_or_dev"
on public.businesses for delete
to authenticated
using (user_id = auth.uid () or public.is_developer ());

-- Institutes
alter table public.institutes enable row level security;

drop policy if exists "institutes_select_member_or_owner" on public.institutes;
create policy "institutes_select_member_or_owner"
on public.institutes for select
to authenticated
using (
  user_id = auth.uid ()
  or (
    business_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid ()
        and p.business_id = institutes.business_id
    )
  )
  or public.is_developer ()
);

drop policy if exists "institutes_insert_owner" on public.institutes;
create policy "institutes_insert_owner"
on public.institutes for insert
to authenticated
with check (
  user_id = auth.uid ()
  and (
    business_id is null
    or exists (
      select 1
      from public.businesses b
      where b.id = business_id
        and (
          b.user_id = auth.uid ()
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid ()
              and p.business_id = b.id
          )
        )
    )
  )
);

drop policy if exists "institutes_update_owner_or_dev" on public.institutes;
create policy "institutes_update_owner_or_dev"
on public.institutes for update
to authenticated
using (user_id = auth.uid () or public.is_developer ())
with check (user_id = auth.uid () or public.is_developer ());

drop policy if exists "institutes_delete_owner_or_dev" on public.institutes;
create policy "institutes_delete_owner_or_dev"
on public.institutes for delete
to authenticated
using (user_id = auth.uid () or public.is_developer ());

-- Org classes (not kb_classes)
alter table public.classes enable row level security;

drop policy if exists "classes_select_member_or_owner" on public.classes;
create policy "classes_select_member_or_owner"
on public.classes for select
to authenticated
using (
  user_id = auth.uid ()
  or exists (
    select 1
    from public.institutes i
    where i.id = classes.institute_id
      and (
        i.user_id = auth.uid ()
        or (
          i.business_id is not null
          and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid ()
              and p.business_id = i.business_id
          )
        )
      )
  )
  or public.is_developer ()
);

drop policy if exists "classes_insert_if_institute_allowed" on public.classes;
create policy "classes_insert_if_institute_allowed"
on public.classes for insert
to authenticated
with check (
  user_id = auth.uid ()
  and exists (
    select 1
    from public.institutes i
    where i.id = institute_id
      and (
        i.user_id = auth.uid ()
        or (
          i.business_id is not null
          and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid ()
              and p.business_id = i.business_id
          )
        )
      )
  )
);

drop policy if exists "classes_update_owner_or_dev" on public.classes;
create policy "classes_update_owner_or_dev"
on public.classes for update
to authenticated
using (user_id = auth.uid () or public.is_developer ())
with check (user_id = auth.uid () or public.is_developer ());

drop policy if exists "classes_delete_owner_or_dev" on public.classes;
create policy "classes_delete_owner_or_dev"
on public.classes for delete
to authenticated
using (user_id = auth.uid () or public.is_developer ());

-- teacher_set_student_class: allow same-business teachers
create or replace function public.teacher_set_student_class (p_student_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_owner uuid;
  v_institute uuid;
  v_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_student_id
      and lower (coalesce (p.role, '')) = 'student'
  ) then
    raise exception 'Student profile not found';
  end if;

  select c.user_id, c.institute_id into v_owner, v_institute
  from public.classes c
  where c.id = p_class_id;

  if v_owner is null then
    raise exception 'Invalid class id';
  end if;

  select i.business_id into v_business
  from public.institutes i
  where i.id = v_institute;

  if v_owner is distinct from v_actor and not public.is_developer () then
    if v_business is null
       or not exists (
         select 1
         from public.profiles p
         where p.id = v_actor
           and p.business_id = v_business
       ) then
      raise exception 'Not allowed to assign this class';
    end if;
  end if;

  update public.profiles
  set
    class_id = p_class_id,
    institute_id = v_institute
  where id = p_student_id
    and lower (coalesce (role, '')) = 'student';
end;
$$;

-- teacher_set_student_institute: allow same-business staff
create or replace function public.teacher_set_student_institute (p_student_id uuid, p_institute_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_owner uuid;
  v_business uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_student_id
      and lower (coalesce (p.role, '')) = 'student'
  ) then
    raise exception 'Student profile not found';
  end if;

  select i.user_id, i.business_id into v_owner, v_business
  from public.institutes i
  where i.id = p_institute_id;

  if v_owner is null then
    raise exception 'Invalid institute id';
  end if;

  if v_owner is distinct from v_actor and not public.is_developer () then
    if v_business is null
       or not exists (
         select 1
         from public.profiles p
         where p.id = v_actor
           and p.business_id = v_business
       ) then
      raise exception 'Not allowed to assign this institute';
    end if;
  end if;

  update public.profiles
  set institute_id = p_institute_id
  where id = p_student_id
    and lower (coalesce (role, '')) = 'student';
end;
$$;

-- Admin: user list includes business_id; school_admin sees their org only.
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

-- Assign user to a business (developer or school_admin for own business only).
create or replace function public.admin_set_user_business (
  target_user_id uuid,
  target_business_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid ();
  v_actor_role text;
  v_actor_business uuid;
  v_updated int;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select p.role, p.business_id into v_actor_role, v_actor_business
  from public.profiles p
  where p.id = v_actor;

  if public.is_developer () then
    null;
  elsif lower (coalesce (v_actor_role, '')) = 'school_admin' and v_actor_business is not null then
    if target_business_id is not null and target_business_id is distinct from v_actor_business then
      raise exception 'School admin can only assign users to their own business';
    end if;
  else
    raise exception 'Not allowed to assign business';
  end if;

  update public.profiles
  set business_id = target_business_id
  where id = target_user_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.profiles (id, role, full_name)
    values (target_user_id, 'student', null);
    update public.profiles
    set business_id = target_business_id
    where id = target_user_id;
  end if;
end;
$$;

grant execute on function public.admin_set_user_business (uuid, uuid) to authenticated;
