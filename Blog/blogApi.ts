import { supabase } from '../supabase/client';
import { FALLBACK_BLOG_POSTS } from './demoPosts';
import type { BlogPost } from './types';

const PUBLISHED_SELECT =
  'id, slug, title, excerpt, content, category, cover_image_url, author_name, published_at, meta_title, meta_description, canonical_path, og_image_url, faqs, keywords';

/**
 * Published posts from Supabase. Empty DB or fetch errors use a single offline fallback article
 * (see `demoPosts.ts`) so the journal UI still loads.
 */
export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(PUBLISHED_SELECT)
      .eq('published', true)
      .order('published_at', { ascending: false });

    if (error) {
      console.warn('blog_posts fetch:', error.message);
      return FALLBACK_BLOG_POSTS;
    }
    if (!data?.length) return FALLBACK_BLOG_POSTS;
    return data as unknown as BlogPost[];
  } catch {
    return FALLBACK_BLOG_POSTS;
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
    return FALLBACK_BLOG_POSTS.find((p) => p.slug === slug) || null;
  } catch {
    return FALLBACK_BLOG_POSTS.find((p) => p.slug === slug) || null;
  }
}
