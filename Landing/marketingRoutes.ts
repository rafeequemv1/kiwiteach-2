/**
 * Public marketing URLs for the SPA (History API). Keep in sync with sitemap and LandingSeoHelmet canonicals.
 */

export type LandingMarketingTab =
  | 'home'
  | 'neet'
  | 'test-prep'
  | 'pricing'
  | 'blog'
  | 'blog-post'
  | 'privacy'
  | 'terms';

export const MARKETING_PATH = {
  home: '/',
  neetTestPrep: '/neet-test-prep',
  neetPyq: '/neet-pyq',
  pricing: '/pricing',
  blog: '/blog',
  privacy: '/privacy',
  terms: '/terms',
} as const;

export type ParsedMarketingRoute = {
  tab: LandingMarketingTab;
  blogSlug: string | null;
};

/** Normalize pathname: no query/hash, trim trailing slashes except root. */
export function normalizeMarketingPathname(pathname: string): string {
  const raw = pathname.split('?')[0].split('#')[0];
  if (!raw || raw === '/') return '/';
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

/** Map browser path to landing tab + optional blog slug. Unknown paths → home. */
export function parseMarketingPath(pathname: string): ParsedMarketingRoute {
  const path = normalizeMarketingPathname(pathname);
  if (path === '/') return { tab: 'home', blogSlug: null };

  const segments = path.split('/').filter(Boolean);
  const head = segments[0];

  if (head === 'blog') {
    if (segments.length >= 2) {
      return { tab: 'blog-post', blogSlug: decodeURIComponent(segments.slice(1).join('/')) };
    }
    return { tab: 'blog', blogSlug: null };
  }

  if (path === MARKETING_PATH.neetTestPrep) return { tab: 'test-prep', blogSlug: null };
  if (path === MARKETING_PATH.neetPyq) return { tab: 'neet', blogSlug: null };
  if (path === MARKETING_PATH.pricing) return { tab: 'pricing', blogSlug: null };
  if (path === MARKETING_PATH.privacy) return { tab: 'privacy', blogSlug: null };
  if (path === MARKETING_PATH.terms) return { tab: 'terms', blogSlug: null };

  return { tab: 'home', blogSlug: null };
}

/** True if pathname should be handled by the marketing shell (not e.g. /dashboard). */
export function isRecognizedMarketingPath(pathname: string): boolean {
  const p = normalizeMarketingPathname(pathname);
  if (p === '/') return true;
  const segs = p.split('/').filter(Boolean);
  if (segs[0] === 'blog') return true;
  return (
    p === MARKETING_PATH.neetTestPrep ||
    p === MARKETING_PATH.neetPyq ||
    p === MARKETING_PATH.pricing ||
    p === MARKETING_PATH.privacy ||
    p === MARKETING_PATH.terms
  );
}

/** Path for history / <a href>. */
export function pathForMarketingTab(tab: LandingMarketingTab, blogSlug?: string | null): string {
  if (tab === 'blog-post' && blogSlug) {
    const enc = blogSlug.split('/').map((s) => encodeURIComponent(s)).join('/');
    return `${MARKETING_PATH.blog}/${enc}`;
  }
  switch (tab) {
    case 'home':
      return MARKETING_PATH.home;
    case 'test-prep':
      return MARKETING_PATH.neetTestPrep;
    case 'neet':
      return MARKETING_PATH.neetPyq;
    case 'pricing':
      return MARKETING_PATH.pricing;
    case 'blog':
      return MARKETING_PATH.blog;
    case 'privacy':
      return MARKETING_PATH.privacy;
    case 'terms':
      return MARKETING_PATH.terms;
    case 'blog-post':
      return MARKETING_PATH.blog;
    default:
      return MARKETING_PATH.home;
  }
}
