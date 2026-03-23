-- Dedicated team profile table (teacher/school_admin membership by business/institute).
-- This stays synced from public.profiles and supports future team workflows.

create table if not exists public.team_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('teacher', 'school_admin')),
  business_id uuid not null references public.businesses (id) on delete cascade,
  institute_id uuid null references public.institutes (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists team_profiles_business_id_idx on public.team_profiles (business_id);
create index if not exists team_profiles_institute_id_idx on public.team_profiles (institute_id);
create index if not exists team_profiles_role_idx on public.team_profiles (role);

alter table public.team_profiles enable row level security;

drop policy if exists "team_profiles_select_same_business" on public.team_profiles;
create policy "team_profiles_select_same_business"
on public.team_profiles for select
to authenticated
using (
  public.is_developer()
  or exists (
    select 1
    from public.profiles ap
    where ap.id = auth.uid()
      and ap.business_id = team_profiles.business_id
  )
);

drop policy if exists "team_profiles_manage_dev_or_school_admin" on public.team_profiles;
create policy "team_profiles_manage_dev_or_school_admin"
on public.team_profiles for all
to authenticated
using (
  public.is_developer()
  or exists (
    select 1
    from public.profiles ap
    where ap.id = auth.uid()
      and lower(coalesce(ap.role, '')) = 'school_admin'
      and ap.business_id = team_profiles.business_id
  )
)
with check (
  public.is_developer()
  or exists (
    select 1
    from public.profiles ap
    where ap.id = auth.uid()
      and lower(coalesce(ap.role, '')) = 'school_admin'
      and ap.business_id = team_profiles.business_id
  )
);

create or replace function public.sync_team_profiles_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.team_profiles where user_id = old.id;
    return old;
  end if;

  if lower(coalesce(new.role, '')) in ('teacher', 'school_admin') and new.business_id is not null then
    insert into public.team_profiles (user_id, role, business_id, institute_id, is_active, updated_at)
    values (
      new.id,
      lower(new.role),
      new.business_id,
      null,
      true,
      timezone('utc'::text, now())
    )
    on conflict (user_id) do update
    set
      role = excluded.role,
      business_id = excluded.business_id,
      institute_id = excluded.institute_id,
      is_active = excluded.is_active,
      updated_at = timezone('utc'::text, now());
  else
    delete from public.team_profiles where user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists team_profiles_sync_on_profiles on public.profiles;
create trigger team_profiles_sync_on_profiles
after insert or update or delete on public.profiles
for each row execute procedure public.sync_team_profiles_from_profiles();

-- Backfill current eligible users.
insert into public.team_profiles (user_id, role, business_id, institute_id, is_active)
select
  p.id,
  lower(p.role),
  p.business_id,
  null,
  true
from public.profiles p
where lower(coalesce(p.role, '')) in ('teacher', 'school_admin')
  and p.business_id is not null
on conflict (user_id) do update
set
  role = excluded.role,
  business_id = excluded.business_id,
  is_active = excluded.is_active,
  updated_at = timezone('utc'::text, now());
