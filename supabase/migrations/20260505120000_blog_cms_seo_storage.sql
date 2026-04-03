-- Blog CMS: SEO/FAQ columns, editor RLS (developer + school_admin), public image bucket.

alter table public.blog_posts
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists canonical_path text,
  add column if not exists og_image_url text,
  add column if not exists faqs jsonb not null default '[]'::jsonb,
  add column if not exists keywords text;

comment on column public.blog_posts.meta_title is 'SEO/OG title; falls back to title when null.';
comment on column public.blog_posts.meta_description is 'Meta and OG description.';
comment on column public.blog_posts.canonical_path is 'Optional path-only canonical e.g. /blog/slug';
comment on column public.blog_posts.og_image_url is 'Open Graph image; falls back to cover_image_url when null.';
comment on column public.blog_posts.faqs is 'JSON array of {question, answer} for FAQ block and FAQPage schema.';
comment on column public.blog_posts.keywords is 'Optional comma-separated or free-text keywords for editors.';

create or replace function public.blog_can_manage_posts()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_developer()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(trim(coalesce(p.role::text, ''))) = 'school_admin'
    );
$$;

grant execute on function public.blog_can_manage_posts() to authenticated;

create or replace function public.blog_posts_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
before update on public.blog_posts
for each row execute procedure public.blog_posts_set_updated_at();

drop policy if exists blog_posts_editor_select on public.blog_posts;
create policy blog_posts_editor_select
  on public.blog_posts for select
  to authenticated
  using (public.blog_can_manage_posts());

drop policy if exists blog_posts_editor_insert on public.blog_posts;
create policy blog_posts_editor_insert
  on public.blog_posts for insert
  to authenticated
  with check (public.blog_can_manage_posts());

drop policy if exists blog_posts_editor_update on public.blog_posts;
create policy blog_posts_editor_update
  on public.blog_posts for update
  to authenticated
  using (public.blog_can_manage_posts())
  with check (public.blog_can_manage_posts());

drop policy if exists blog_posts_editor_delete on public.blog_posts;
create policy blog_posts_editor_delete
  on public.blog_posts for delete
  to authenticated
  using (public.blog_can_manage_posts());

-- Public images for blog body and covers
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists blog_images_read_public on storage.objects;
create policy blog_images_read_public
  on storage.objects for select
  to public
  using (bucket_id = 'blog-images');

drop policy if exists blog_images_insert_editor on storage.objects;
create policy blog_images_insert_editor
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog-images' and public.blog_can_manage_posts());

drop policy if exists blog_images_update_editor on storage.objects;
create policy blog_images_update_editor
  on storage.objects for update
  to authenticated
  using (bucket_id = 'blog-images' and public.blog_can_manage_posts())
  with check (bucket_id = 'blog-images' and public.blog_can_manage_posts());

drop policy if exists blog_images_delete_editor on storage.objects;
create policy blog_images_delete_editor
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog-images' and public.blog_can_manage_posts());
