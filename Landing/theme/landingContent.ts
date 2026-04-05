/** Top nav on marketing site (NEET PYQ lives in footer only for now). */
export const landingNavLinks = [
  { id: 'home', label: 'Home' },
  { id: 'test-prep', label: 'NEET Test Prep' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'blog', label: 'Blog' },
];

/** WebP assets in `public/landing/` — run `npm run optimize:landing-images` after replacing PNG sources. */
export const NEET_TEST_PREP_OMR_IMAGE = '/landing/neet-test-prep-omr-hero.webp';

/** On-brand illustrations (navy #1c2442, teal #35c3ae, cream) — home page. */
export const LANDING_HOME_HERO_IMAGE = '/landing/home-hero-classroom.webp';

/** SEO / accessibility: descriptive alts (keywords natural, India + teaching context). */
export const LANDING_HOME_HERO_ALT =
  'Indian teacher in a bright modern classroom — KiwiTeach AI tools for lesson plans, assessments, and NEET prep for schools';

/** Classroom command center carousel: WebP in `public/landing/` (run `npm run optimize:landing-images` after new PNGs). */
export const LANDING_HOME_COMMAND_CAROUSEL = [
  {
    src: '/landing/home-command-slide-male.webp',
    alt: 'Male teacher planning lessons on a laptop — KiwiTeach classroom command center for Indian educators',
    captionLead: 'Plan faster',
    captionRest: ' — turn ideas into lesson-ready material without the Sunday scramble.',
  },
  {
    src: '/landing/home-command-slide-team.webp',
    alt: 'Four teachers collaborating — two men and two women reviewing lesson and test materials together',
    captionLead: 'Align your faculty',
    captionRest: ' on papers, pacing, and what each batch needs before the next mock.',
  },
  {
    src: '/landing/home-command-slide-hijab-class.webp',
    alt: 'Stylised illustration: Muslim teacher in hijab with diverse students at desks, laptop and notebooks, navy and teal KiwiTeach brand colours',
    captionLead: 'Inclusive classrooms',
    captionRest: ' where every learner stays seen—from desk work to fair, syllabus-true assessments.',
  },
  {
    src: '/landing/home-command-slide-hijab-group.webp',
    alt: 'Stylised illustration: Muslim teacher in hijab leading a small-group discussion with students around a table',
    captionLead: 'Confidence where it counts',
    captionRest: ' — guided practice and honest feedback before students walk into the hall.',
  },
] as const;

/** NEET Test Prep hero: generic prep scene, then OMR realism. */
export const NEET_TEST_PREP_HERO_SLIDES = [
  '/landing/neet-prep-hero-brand.webp',
  NEET_TEST_PREP_OMR_IMAGE,
] as const;

export const NEET_PREP_HERO_ALTS = [
  'NEET teacher organizing practice test papers and laptop — medical entrance exam prep for coaching centres in India',
  'Student filling OMR bubbles on a multiple-choice answer sheet for NEET and competitive exams',
] as const;

/** NEET Test Prep workflow timeline (four steps). */
export const LANDING_WORKFLOW_STEP_IMAGES = [
  '/landing/workflow-step-01.webp',
  '/landing/workflow-step-02.webp',
  '/landing/workflow-step-03.webp',
  '/landing/workflow-step-04.webp',
] as const;

/** Rich alts for workflow step images (match on-page titles). */
export const LANDING_WORKFLOW_STEP_ALTS = [
  'Teacher mapping NEET syllabus chapters and topics to a practice paper aligned with what was taught in class',
  'Close-up of teacher using KiwiTeach Test Studio on a laptop to set Easy Medium Hard mix and MCQ question styles',
  'Stack of generated NEET-style MCQ test papers ready to print or assign as online class tests',
  'Indian students writing a classroom test — deliver mocks on paper or screen with KiwiTeach',
] as const;

/** Command center card on NEET Test Prep (below workflow). */
export const LANDING_NEET_COMMAND_IMAGE = '/landing/neet-command-center.webp';

export const LANDING_NEET_COMMAND_ALT =
  'KiwiTeach NEET command centre — teacher with laptop and printed practice tests in one organised workspace';

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
