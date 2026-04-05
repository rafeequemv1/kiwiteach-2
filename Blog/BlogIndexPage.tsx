import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="min-h-screen bg-muted/30 px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
      <div className="mx-auto flex max-w-6xl gap-10">
        <aside className="hidden w-[240px] shrink-0 md:block">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</p>
              <p className="mt-1 text-xs text-muted-foreground">Filter by topic</p>
              <div className="mt-3 space-y-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{cat}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        selectedCategory === cat
                          ? 'bg-primary-foreground/15 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {categoryCounts[cat] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="flex-1">
          <Button variant="ghost" size="sm" className="-ml-2 mb-10 gap-2 text-muted-foreground hover:text-foreground" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>

          <header className="mx-auto mb-14 max-w-2xl text-center">
            <Badge variant="outline" className="mb-4 text-[11px] font-semibold uppercase tracking-wider">
              Journal
            </Badge>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Ideas for better teaching
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Long-form notes on assessment design, classroom rhythm, and thoughtful use of technology.
            </p>
          </header>

          {loading ? (
            <div className="flex justify-center py-24">
              <div
                className="size-10 animate-spin rounded-full border-2 border-muted border-t-primary"
                aria-hidden
              />
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
              {filteredPosts.map((post) => (
                <Card
                  key={post.id}
                  className="group cursor-pointer overflow-hidden border-border/80 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => onSelectPost(post.slug)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectPost(post.slug)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="aspect-[16/10] overflow-hidden bg-muted">
                    {post.cover_image_url ? (
                      <img
                        src={post.cover_image_url}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-full w-full min-h-[140px]" style={{ background: landingTheme.gradients.darkPanel }} />
                    )}
                  </div>
                  <CardContent className="p-6 md:p-7">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${landingTheme.colors.navy}14`,
                          color: landingTheme.colors.navy,
                        }}
                      >
                        {post.category}
                      </Badge>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden />
                        {formatDate(post.published_at)}
                      </span>
                    </div>
                    <h2 className="font-serif text-xl font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground/90 md:text-2xl">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                    )}
                    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                      Read article →
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlogIndexPage;
