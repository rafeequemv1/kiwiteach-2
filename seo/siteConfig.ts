/**
 * Production marketing site (Vercel). Used for canonical URLs, OG tags, and JSON-LD when
 * `VITE_SITE_URL` is unset. Override per environment in Vercel if you use preview domains.
 */
export const PRODUCTION_SITE_ORIGIN = 'https://kiwiteach.com';

export const SITE_NAME = 'KiwiTeach';

export const SITE_TAGLINE = 'Exam-ready NEET practice tests in minutes — for teachers';

/** Default meta description (home / app shell). ICP: NEET/board science teachers. */
export const HOME_DESCRIPTION =
  'KiwiTeach is for teachers who run NEET and board-science batches: go from syllabus to balanced, exam-style MCQs and full practice tests in minutes, then deliver online or on paper. Less copy-paste, more teaching.';

export const HOME_KEYWORDS =
  'KiwiTeach, online exam software, NEET test generator, teacher quiz tool, paper test maker, question bank, OMR, institute exams, India, formative assessment, AI for teachers';

export function getSiteOrigin(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (env) return env.replace(/\/+$/, '');
  if (import.meta.env.PROD) return PRODUCTION_SITE_ORIGIN;
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/+$/, '');
  return '';
}

/** Absolute URL for default Open Graph / Twitter image (raster for crawler compatibility). */
export function getDefaultOgImageUrl(): string {
  const base = getSiteOrigin() || PRODUCTION_SITE_ORIGIN;
  return `${base}/og-default.png`;
}
