/** Top nav on marketing site (NEET PYQ lives in footer only for now). */
export const landingNavLinks = [
  { id: 'home', label: 'Home' },
  { id: 'test-prep', label: 'NEET Test Prep' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'blog', label: 'Blog' },
];

/** Bundled in `public/landing/` — avoids blank heroes when external CDNs are blocked. */
export const NEET_TEST_PREP_OMR_IMAGE = '/landing/neet-test-prep-omr-hero.png';

/** On-brand illustrations (navy #1c2442, teal #35c3ae, cream) — home page. */
export const LANDING_HOME_HERO_IMAGE = '/landing/home-hero-classroom.png';

/** Classroom command center band: rotating slides (male teacher → four-person faculty). */
export const LANDING_HOME_COMMAND_SLIDES = [
  '/landing/home-command-slide-male.png',
  '/landing/home-command-slide-team.png',
] as const;

/** NEET Test Prep hero: generic prep scene, then OMR realism. */
export const NEET_TEST_PREP_HERO_SLIDES = [
  '/landing/neet-prep-hero-brand.png',
  NEET_TEST_PREP_OMR_IMAGE,
] as const;

/** NEET Test Prep workflow timeline (four steps). */
export const LANDING_WORKFLOW_STEP_IMAGES = [
  '/landing/workflow-step-01.png',
  '/landing/workflow-step-02.png',
  '/landing/workflow-step-03.png',
  '/landing/workflow-step-04.png',
] as const;

/** Command center card on NEET Test Prep (below workflow). */
export const LANDING_NEET_COMMAND_IMAGE = '/landing/neet-command-center.png';

/** Marketing ICP + hero promise (single user, single outcome) */
export const LANDING_ICP_LINE =
  'Built for NEET & board-science teachers in schools and coaching centres.';
export const LANDING_HERO_OUTCOME = 'Exam-ready practice tests in minutes';

/** Marketing footer blurb (broad KiwiTeach promise). */
export const LANDING_FOOTER_BLURB =
  'Empowering educators with AI-driven tools to create, manage, and inspire. Reclaim your time and reignite your passion for teaching.';

/** Broad “tools for teachers” pills on the main landing hero. */
export const homeBroadPills = ['Lesson plans', 'Assessments', 'Feedback & prep'];

export const homePills = [
  'NEET-style MCQs from your syllabus',
  'Easy · Medium · Hard: you decide the mix',
  'Online mocks + print-ready papers',
];

export const footerColumns = [
  {
    title: 'Product',
    links: ['Home', 'NEET Test Prep', 'NEET PYQ', 'Pricing'],
  },
  {
    title: 'Company',
    links: ['About Us', 'Careers', 'Blog', 'Contact'],
  },
];
