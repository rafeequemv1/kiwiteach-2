export interface BlogFaqItem {
  question: string;
  answer: string;
}

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
  published?: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  canonical_path?: string | null;
  og_image_url?: string | null;
  faqs?: BlogFaqItem[] | null;
  keywords?: string | null;
}
