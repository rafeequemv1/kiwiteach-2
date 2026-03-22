import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { landingTheme } from '../Landing/theme';
import { fetchPublishedPosts } from './blogApi';
import type { BlogPost } from './types';

interface BlogIndexPageProps {
  onBack: () => void;
  onSelectPost: (slug: string) => void;
}

const BlogIndexPage: React.FC<BlogIndexPageProps> = ({ onBack, onSelectPost }) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchPublishedPosts();
      if (!cancelled) {
        setPosts(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-20 px-4 sm:px-6" style={{ backgroundColor: landingTheme.colors.page }}>
      <div className="max-w-5xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 mb-10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <header className="mb-14 text-center max-w-2xl mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 mb-3">Journal</p>
          <h1
            className={`${landingTheme.fonts.heading} text-4xl md:text-5xl text-slate-900 tracking-tight`}
          >
            Ideas for better teaching
          </h1>
          <p className="mt-4 text-lg text-slate-600 leading-relaxed">
            Long-form notes on assessment design, classroom rhythm, and thoughtful use of technology.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group cursor-pointer text-left rounded-2xl overflow-hidden bg-white border border-slate-200/80 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: landingTheme.shadow.soft }}
                onClick={() => onSelectPost(post.slug)}
                onKeyDown={(e) => e.key === 'Enter' && onSelectPost(post.slug)}
                role="button"
                tabIndex={0}
              >
                <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: landingTheme.gradients.darkPanel }}
                    />
                  )}
                </div>
                <div className="p-6 md:p-7">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                      style={{
                        background: `${landingTheme.colors.navy}12`,
                        color: landingTheme.colors.navy,
                      }}
                    >
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(post.published_at)}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug group-hover:text-slate-700 transition-colors font-serif">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-3 text-slate-600 text-sm leading-relaxed line-clamp-3">{post.excerpt}</p>
                  )}
                  <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                    Read article →
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogIndexPage;
