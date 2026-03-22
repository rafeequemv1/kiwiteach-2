export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string;
  cover_image_url?: string | null;
  author_name?: string | null;
  published_at?: string | null;
}
