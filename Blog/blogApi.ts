import { supabase } from '../supabase/client';
import { DEMO_BLOG_POSTS } from './demoPosts';
import type { BlogPost } from './types';

export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(
        'id, slug, title, excerpt, content, category, cover_image_url, author_name, published_at'
      )
      .eq('published', true)
      .order('published_at', { ascending: false });

    if (error) {
      console.warn('blog_posts fetch:', error.message);
      return DEMO_BLOG_POSTS;
    }
    if (!data?.length) return DEMO_BLOG_POSTS;
    return data as unknown as BlogPost[];
  } catch {
    return DEMO_BLOG_POSTS;
  }
}

export async function fetchPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (!error && data) return data as unknown as BlogPost;
    return DEMO_BLOG_POSTS.find((p) => p.slug === slug) || null;
  } catch {
    return DEMO_BLOG_POSTS.find((p) => p.slug === slug) || null;
  }
}
