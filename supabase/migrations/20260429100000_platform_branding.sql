-- Global KiwiTeach product theme (single row, id = 'default').

create table if not exists public.platform_branding (
  id text primary key default 'default' check (id = 'default'),
  product_name text not null default 'KiwiTeach',
  primary_color text not null default '#6366f1',
  secondary_color text not null default '#35c3ae',
  page_background text not null default '#f5f6fb',
  surface_color text not null default '#ffffff',
  text_primary text not null default '#171a2e',
  text_muted text not null default '#5f6783',
  accent_warm text not null default '#f2c44e',
  sidebar_color_top text not null default '#08132d',
  sidebar_color_mid text not null default '#0b1a3a',
  sidebar_color_bottom text not null default '#0f2248',
  font_family_sans text not null default 'Inter, system-ui, sans-serif',
  font_family_heading text not null default 'Lato, system-ui, sans-serif',
  button_radius text not null default 'lg' check (button_radius in ('none','sm','md','lg','xl','full')),
  button_variant text not null default 'solid' check (button_variant in ('solid','soft','outline')),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.platform_branding is 'Global KiwiTeach product theme (single row id=default).';

insert into public.platform_branding (id) values ('default')
  on conflict (id) do nothing;

alter table public.platform_branding enable row level security;

drop policy if exists platform_branding_select_authenticated on public.platform_branding;
create policy platform_branding_select_authenticated
  on public.platform_branding for select
  to authenticated
  using (true);

drop policy if exists platform_branding_write_admin on public.platform_branding;
create policy platform_branding_write_admin
  on public.platform_branding for all
  to authenticated
  using (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  )
  with check (
    public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );
