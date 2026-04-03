-- Trust model: "developer" is determined only by public.profiles.role for auth.uid().
-- Client-side email allowlists must not grant privileges; RLS and RPCs use these helpers.

create or replace function public.is_developer()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role::text, ''))) = 'developer'
  );
$$;

create or replace function public.is_school_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role::text, ''))) = 'school_admin'
  );
$$;

-- Server routes (e.g. Vercel /api/gemini) should call this with the caller's JWT — not client-computed roles.
create or replace function public.can_use_platform_ai()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_developer() or public.is_school_admin();
$$;

grant execute on function public.is_developer() to authenticated;
grant execute on function public.is_school_admin() to authenticated;
grant execute on function public.can_use_platform_ai() to authenticated;

comment on function public.is_developer() is
  'True when profiles.role is developer for auth.uid(). Used by RLS; not derived from client allowlists.';

comment on function public.can_use_platform_ai() is
  'True for developer or school_admin profile role; for server-side AI proxy authorization.';

-- Block authenticated users from granting themselves developer/school_admin via the profiles table.
-- Trusted paths: signup trigger, security definer RPCs (e.g. admin_set_user_role), service role.

create or replace function public.profiles_block_self_privileged_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_priv boolean;
  old_priv boolean;
begin
  new_priv := lower(trim(coalesce(new.role::text, ''))) in ('developer', 'school_admin');

  if tg_op = 'INSERT' then
    if new.id = auth.uid() and new_priv then
      raise exception 'Privileged roles cannot be set on self-service profile insert';
    end if;
    return new;
  end if;

  if new.id is distinct from auth.uid() then
    return new;
  end if;

  old_priv := lower(trim(coalesce(old.role::text, ''))) in ('developer', 'school_admin');
  if new_priv and not old_priv and not public.is_developer() then
    raise exception 'Elevating own role to developer or school_admin requires an existing developer';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_self_privileged_role on public.profiles;
create trigger profiles_block_self_privileged_role
before insert or update on public.profiles
for each row execute function public.profiles_block_self_privileged_role();
