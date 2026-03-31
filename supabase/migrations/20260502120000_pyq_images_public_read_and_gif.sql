-- After pyq-images bucket exists: allow public object URLs in <img>; allow GIF MIME from some DOCX exports.

update storage.buckets
set
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
  ]::text[]
where id = 'pyq-images';

drop policy if exists pyq_images_read_public on storage.objects;
create policy pyq_images_read_public
on storage.objects for select
to public
using (bucket_id = 'pyq-images');
