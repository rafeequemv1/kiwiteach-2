export {
  getDefaultOgImageUrl,
  getSiteOrigin,
  PRODUCTION_SITE_ORIGIN,
  SITE_NAME,
} from '../seo/siteConfig';

export function defaultBlogCanonicalPath(slug: string): string {
  return `/blog/${slug}`;
}
