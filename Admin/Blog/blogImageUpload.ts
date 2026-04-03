import { supabase } from '../../supabase/client';

export async function uploadBlogImage(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
  const path = `posts/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('blog-images').upload(path, file, {
    cacheControl: '86400',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
  return data.publicUrl;
}
