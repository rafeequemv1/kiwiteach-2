import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { landingTheme } from '../Landing/theme';
import { fetchPostBySlug } from './blogApi';
import type { BlogPost } from './types';

interface BlogArticlePageProps {
  slug: string;
  onBack: () => void;
}

const BlogArticlePage: React.FC<BlogArticlePageProps> = ({ slug, onBack }) => {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await fetchPostBySlug(slug);
      if (!cancelled) {
        setPost(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 sm:pt-24" style={{ backgroundColor: landingTheme.colors.page }}>
        <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen pt-20 sm:pt-24 px-4 sm:px-6 text-center" style={{ backgroundColor: landingTheme.colors.page }}>
        <p className="text-slate-600 mb-6">Article not found.</p>
        <button type="button" onClick={onBack} className="text-indigo-700 font-bold underline">
          Back to journal
        </button>
      </div>
    );
  }

  return (
    <article className="min-h-screen pt-20 sm:pt-24 pb-24 px-4 sm:px-6" style={{ backgroundColor: landingTheme.colors.page }}>
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 mb-10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Journal
        </button>

        {post.cover_image_url && (
          <div className="rounded-2xl overflow-hidden mb-10 border border-slate-200/80" style={{ boxShadow: landingTheme.shadow.soft }}>
            <img
              src={post.cover_image_url}
              alt=""
              className="w-full max-h-[420px] object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <header className="mb-12">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{
                background: `${landingTheme.colors.navy}12`,
                color: landingTheme.colors.navy,
              }}
            >
              {post.category}
            </span>
            <time className="text-sm text-slate-500">{formatDate(post.published_at)}</time>
          </div>
          <h1
            className={`${landingTheme.fonts.heading} text-4xl md:text-5xl lg:text-[3.25rem] text-slate-900 leading-[1.08] tracking-tight`}
          >
            {post.title}
          </h1>
          {post.author_name && (
            <p className="mt-6 text-slate-500 text-sm">
              By <span className="font-semibold text-slate-700">{post.author_name}</span>
            </p>
          )}
        </header>

        <div
          className="blog-prose font-serif text-[1.125rem] leading-[1.85] text-slate-800 space-y-6"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </div>
    </article>
  );
};

export default BlogArticlePage;
