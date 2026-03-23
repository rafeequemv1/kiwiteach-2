import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { landingTheme } from '../Landing/theme';
import { fetchPostBySlug, fetchPublishedPosts } from './blogApi';
import type { BlogPost } from './types';

interface BlogArticlePageProps {
  slug: string;
  onBack: () => void;
  onSelectPost?: (slug: string) => void;
}

const BlogArticlePage: React.FC<BlogArticlePageProps> = ({ slug, onBack, onSelectPost }) => {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);

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

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    (async () => {
      const all = await fetchPublishedPosts();
      const sameCategory = all.filter((p) => p.slug !== post.slug && p.category === post.category);
      const other = all.filter((p) => p.slug !== post.slug);
      const merged = [...sameCategory, ...other].filter((p, idx, arr) => arr.findIndex((x) => x.slug === p.slug) === idx);
      if (!cancelled) setRelatedPosts(merged.slice(0, 4));
    })();
    return () => {
      cancelled = true;
    };
  }, [post]);

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

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const toc = useMemo(() => {
    if (!post?.content) return { items: [] as { id: string; text: string; level: 2 | 3 }[], html: post?.content || '' };
    const parser = new DOMParser();
    const doc = parser.parseFromString(post.content, 'text/html');
    const headings = Array.from(doc.body.querySelectorAll('h2, h3')) as HTMLElement[];
    const used = new Set<string>();

    const items: { id: string; text: string; level: 2 | 3 }[] = [];

    headings.forEach((h, idx) => {
      const text = (h.textContent || '').trim();
      if (!text) return;
      let id = h.getAttribute('id') || slugify(text);
      if (!id) id = `section-${idx + 1}`;
      let candidate = id;
      let i = 1;
      while (used.has(candidate)) {
        candidate = `${id}-${i++}`;
      }
      id = candidate;
      used.add(id);
      h.setAttribute('id', id);
      items.push({
        id,
        text,
        level: h.tagName.toLowerCase() === 'h3' ? 3 : 2,
      });
    });

    return { items, html: doc.body.innerHTML };
  }, [post?.content]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 sm:pt-24" style={{ backgroundColor: landingTheme.colors.page }}>
        <div className="w-10 h-10 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen pt-20 sm:pt-24 px-4 sm:px-6 text-center" style={{ backgroundColor: landingTheme.colors.page }}>
        <p className="text-zinc-600 mb-6">Article not found.</p>
        <button type="button" onClick={onBack} className="text-indigo-700 font-bold underline">
          Back to journal
        </button>
      </div>
    );
  }

  return (
    <article className="min-h-screen pt-20 sm:pt-24 pb-24 px-4 sm:px-6" style={{ backgroundColor: landingTheme.colors.page }}>
      <div className="max-w-6xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 mb-10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Journal
        </button>

        <div className="flex gap-10">
          <aside className="hidden xl:block w-[240px] shrink-0">
            <div className="sticky top-24">
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">On this page</p>
              <div className="mt-3 space-y-2">
                {toc.items.length === 0 ? (
                  <p className="text-xs text-zinc-500">No sections detected.</p>
                ) : (
                  toc.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToId(item.id)}
                      className={`block w-full text-left text-xs font-semibold transition-colors ${
                        item.level === 3 ? 'pl-3 text-zinc-600' : 'text-zinc-700'
                      } hover:text-zinc-900`}
                    >
                      {item.text}
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 max-w-3xl">
            {post.cover_image_url && (
              <div className="rounded-2xl overflow-hidden mb-10 border border-zinc-200/80" style={{ boxShadow: landingTheme.shadow.soft }}>
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
                <time className="text-sm text-zinc-500">{formatDate(post.published_at)}</time>
              </div>
              <h1
                className={`${landingTheme.fonts.heading} text-4xl md:text-5xl lg:text-[3.25rem] text-zinc-900 leading-[1.08] tracking-tight`}
              >
                {post.title}
              </h1>
              {post.author_name && (
                <p className="mt-6 text-zinc-500 text-sm">
                  By <span className="font-semibold text-zinc-700">{post.author_name}</span>
                </p>
              )}
            </header>

            <div
              className="blog-prose font-serif text-[1.125rem] leading-[1.85] text-zinc-800 space-y-6"
              dangerouslySetInnerHTML={{ __html: toc.html || post.content }}
            />
          </div>

          <aside className="hidden lg:block w-[280px] shrink-0">
            <div className="sticky top-24">
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Read next</p>
              <div className="mt-3 space-y-3">
                {relatedPosts.length === 0 ? (
                  <p className="text-xs text-zinc-500">No related articles found.</p>
                ) : (
                  relatedPosts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPost?.(p.slug)}
                      className="w-full text-left rounded-2xl border border-zinc-200 bg-white px-3 py-3 hover:border-zinc-300 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-[54px] h-[54px] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
                          {p.cover_image_url ? (
                            <img src={p.cover_image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 truncate">
                            {p.category}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900 line-clamp-2">
                            {p.title}
                          </p>
                          {p.excerpt ? (
                            <p className="mt-1 text-xs text-zinc-600 line-clamp-2">{p.excerpt}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
};

export default BlogArticlePage;
