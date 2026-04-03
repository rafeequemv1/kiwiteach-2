import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  getDefaultOgImageUrl,
  getSiteOrigin,
  HOME_DESCRIPTION,
  HOME_KEYWORDS,
  PRODUCTION_SITE_ORIGIN,
  SITE_NAME,
  SITE_TAGLINE,
} from '../seo/siteConfig';

export type LandingSeoTab = 'home' | 'neet' | 'test-prep' | 'pricing' | 'blog' | 'blog-post';

interface LandingSeoHelmetProps {
  activeTab: LandingSeoTab;
}

const NEET_DESCRIPTION =
  'NEET-oriented practice workflows, syllabus-aware question tooling, and institute-ready assessment patterns with KiwiTeach — built for serious medical entrance prep.';

const TEST_PREP_DESCRIPTION =
  'Design high-quality test papers, mix question types, and scale online exams for your cohort. KiwiTeach streamlines authoring and delivery for teachers and coaching centres.';

const PRICING_DESCRIPTION =
  'KiwiTeach pricing for institutes (B2B) and students (B2C): transparent feature bundles for test generation, online exams, and question management.';

const BLOG_INDEX_DESCRIPTION =
  'KiwiTeach journal: ideas for assessment design, classroom rhythm, AI-assisted quiz workflows, and GEO-friendly teaching notes for educators.';

export const LandingSeoHelmet: React.FC<LandingSeoHelmetProps> = ({ activeTab }) => {
  const origin = getSiteOrigin() || PRODUCTION_SITE_ORIGIN;
  const ogImage = getDefaultOgImageUrl();

  const pack = useMemo(() => {
    if (activeTab === 'blog-post') {
      return null;
    }
    switch (activeTab) {
      case 'neet':
        return {
          title: `NEET test prep & assessments | ${SITE_NAME}`,
          description: NEET_DESCRIPTION,
          keywords: `${HOME_KEYWORDS}, NEET, medical entrance, biology chemistry physics`,
          canonical: `${origin}/`,
        };
      case 'test-prep':
        return {
          title: `Test paper & online exam tools for teachers | ${SITE_NAME}`,
          description: TEST_PREP_DESCRIPTION,
          keywords: `${HOME_KEYWORDS}, test prep, coaching centre, exam software`,
          canonical: `${origin}/`,
        };
      case 'pricing':
        return {
          title: `Pricing & plans | ${SITE_NAME}`,
          description: PRICING_DESCRIPTION,
          keywords: `${HOME_KEYWORDS}, pricing, B2B education SaaS, institute software`,
          canonical: `${origin}/`,
        };
      case 'blog':
        return {
          title: `Journal & teaching ideas | ${SITE_NAME}`,
          description: BLOG_INDEX_DESCRIPTION,
          keywords: `${HOME_KEYWORDS}, teacher blog, assessment design, AI quizzes, FAQ, classroom technology`,
          canonical: `${origin}/blog`,
        };
      default:
        return {
          title: `${SITE_NAME} — ${SITE_TAGLINE}`,
          description: HOME_DESCRIPTION,
          keywords: HOME_KEYWORDS,
          canonical: `${origin}/`,
        };
    }
  }, [activeTab, origin]);

  const jsonLd = useMemo(() => {
    if (activeTab === 'blog-post') return null;
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'EducationalOrganization',
          '@id': `${origin}/#organization`,
          name: SITE_NAME,
          url: origin,
          logo: `${origin}/favicon.svg`,
          description: HOME_DESCRIPTION,
          areaServed: { '@type': 'Country', name: 'India' },
        },
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          url: origin,
          name: SITE_NAME,
          description: SITE_TAGLINE,
          inLanguage: 'en',
          publisher: { '@id': `${origin}/#organization` },
        },
        {
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Web',
          url: origin,
          description: HOME_DESCRIPTION,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
        },
      ],
    });
  }, [activeTab, origin]);

  if (!pack) return null;

  return (
    <>
      <Helmet htmlAttributes={{ lang: 'en' }}>
        <title>{pack.title}</title>
        <meta name="description" content={pack.description} />
        <meta name="keywords" content={pack.keywords} />
        <link rel="canonical" href={pack.canonical} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={pack.title} />
        <meta property="og:description" content={pack.description} />
        <meta property="og:url" content={pack.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="en_IN" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pack.title} />
        <meta name="twitter:description" content={pack.description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
      </Helmet>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
    </>
  );
};
