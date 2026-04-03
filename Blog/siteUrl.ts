/** Canonical site origin for SEO (falls back to current page in browser). */
export function getSiteOrigin(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (typeof window !== 'undefined') {
    return (env || window.location.origin).replace(/\/+$/, '');
  }
  return env ? env.replace(/\/+$/, '') : '';
}

export function defaultBlogCanonicalPath(slug: string): string {
  return `/blog/${slug}`;
}
