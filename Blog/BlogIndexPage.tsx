import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { landingTheme } from '../Landing/theme';
import { pathForMarketingTab } from '../Landing/marketingRoutes';
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
    <div className="min-h-screen bg-muted/30 px-4 pb-16 pt-20 sm:px-6 sm:pt-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <aside className="md:w-52 md:shrink-0">
          <div className="md:sticky md:top-24">
            <Card className="border-border/80 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</p>
                <div className="mt-2 flex flex-wrap gap-1.5 md:flex-col md:gap-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors md:rounded-lg md:px-3 md:py-2 ${
                        selectedCategory === cat
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
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
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-8 flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Journal</h1>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">
                Long-form notes on assessment design, classroom rhythm, and thoughtful use of technology.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-fit shrink-0 gap-2 self-start sm:self-center"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div
                className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary"
                aria-hidden
              />
            </div>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPosts.map((post) => (
                <li key={post.id}>
                  <a
                    href={pathForMarketingTab('blog-post', post.slug)}
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectPost(post.slug);
                    }}
                    className="group block h-full no-underline"
                  >
                    <Card className="h-full overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
                      <CardContent className="flex gap-3 p-3 sm:gap-3.5 sm:p-3.5">
                        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:h-[4.5rem] sm:w-28">
                          {post.cover_image_url ? (
                            <img
                              src={post.cover_image_url}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-full w-full" style={{ background: landingTheme.gradients.darkPanel }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider"
                              style={{
                                backgroundColor: `${landingTheme.colors.navy}14`,
                                color: landingTheme.colors.navy,
                              }}
                            >
                              {post.category}
                            </Badge>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                              <Clock className="size-3" aria-hidden />
                              {formatDate(post.published_at)}
                            </span>
                          </div>
                          <h2 className="line-clamp-2 font-serif text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[0.95rem]">
                            {post.title}
                          </h2>
                          {post.excerpt ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {post.excerpt}
                            </p>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlogIndexPage;
