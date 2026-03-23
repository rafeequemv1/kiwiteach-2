import React, { useEffect, useMemo, useState } from 'react';
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
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [posts]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      if (!p.category) return;
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    counts.All = posts.length;
    return counts;
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (selectedCategory === 'All') return posts;
    return posts.filter((p) => p.category === selectedCategory);
  }, [posts, selectedCategory]);

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-20 px-4 sm:px-6" style={{ backgroundColor: landingTheme.colors.page }}>
      <div className="max-w-6xl mx-auto flex gap-10">
        <aside className="hidden md:block w-[240px] shrink-0">
          <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Categories</p>
            <p className="mt-1 text-[12px] text-zinc-500">Filter by topic</p>
            <div className="mt-3 space-y-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    selectedCategory === cat
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      selectedCategory === cat ? 'bg-white/10 text-white' : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {categoryCounts[cat] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 mb-10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <header className="mb-14 text-center max-w-2xl mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400 mb-3">Journal</p>
          <h1
            className={`${landingTheme.fonts.heading} text-4xl md:text-5xl text-zinc-900 tracking-tight`}
          >
            Ideas for better teaching
          </h1>
          <p className="mt-4 text-lg text-zinc-600 leading-relaxed">
            Long-form notes on assessment design, classroom rhythm, and thoughtful use of technology.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
            {filteredPosts.map((post) => (
              <article
                key={post.id}
                className="group cursor-pointer text-left rounded-2xl overflow-hidden bg-white border border-zinc-200/80 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: landingTheme.shadow.soft }}
                onClick={() => onSelectPost(post.slug)}
                onKeyDown={(e) => e.key === 'Enter' && onSelectPost(post.slug)}
                role="button"
                tabIndex={0}
              >
                <div className="aspect-[16/10] overflow-hidden bg-zinc-100">
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
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(post.published_at)}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-zinc-900 leading-snug group-hover:text-zinc-700 transition-colors font-serif">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-3 text-zinc-600 text-sm leading-relaxed line-clamp-3">{post.excerpt}</p>
                  )}
                  <p className="mt-5 text-xs font-black uppercase tracking-widest text-zinc-400 group-hover:text-zinc-600">
                    Read article →
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default BlogIndexPage;
