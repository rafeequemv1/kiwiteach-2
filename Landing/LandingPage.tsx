
import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Layout,
  Menu,
  Sparkles,
  Star,
  Target,
  Zap,
  X,
} from 'lucide-react';
import { KiwiTeachLogoMark } from './KiwiTeachLogoMark';
import { LandingHowItWorksSection } from './LandingHowItWorksSection';
import { BlogArticlePage, BlogIndexPage } from '../Blog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PricingPage from '../src/pages/PricingPage';
import {
  footerColumns,
  homeBroadPills,
  homePills,
  landingNavLinks,
  landingTheme,
  LANDING_FOOTER_BLURB,
  LANDING_HOME_COMMAND_CAROUSEL,
  LANDING_HOME_HERO_ALTS,
  LANDING_HOME_HERO_SLIDES,
  LANDING_HERO_OUTCOME,
  LANDING_ICP_LINE,
  NEET_PREP_HERO_ALTS,
  NEET_TEST_PREP_HERO_SLIDES,
} from './theme';
import { LandingCtaAnchor, LandingCtaButton, LandingKeywordLine } from './LandingCtaButton';
import { LandingFooterSocial } from './LandingFooterSocial';
import { LandingSeoHelmet } from './LandingSeoHelmet';
import NeetPyqSection from './NeetPyqSection';
import {
  isRecognizedMarketingPath,
  MARKETING_PATH,
  parseMarketingPath,
  pathForMarketingTab,
  type LandingMarketingTab,
} from './marketingRoutes';

const HERO_FLOATING_INSIGHTS = [
  {
    title: 'NEET-style paper, ready to assign',
    subtitle:
      'Syllabus-tight topics + your Easy/Med/Hard mix. One click from “we taught this” to “sit the mock.”',
    Icon: ClipboardList,
  },
  {
    title: 'See weak spots before the next mock',
    subtitle:
      'Know where the batch wobbled. Fix concepts in class instead of guessing from a pile of answer keys.',
    Icon: Target,
  },
  {
    title: 'Reclaim your evenings',
    subtitle: 'Less copy-paste, fewer midnight MCQ marathons. Generate, skim, ship, then go home.',
    Icon: Zap,
  },
] as const;

const HERO_HOME_STACK_CARDS = [
  {
    title: 'Lesson plan generated',
    sub: 'Saved 2 hours of prep time',
    Icon: BookOpen,
  },
  {
    title: 'Class quiz ready',
    sub: 'Aligned to this week’s chapter',
    Icon: ClipboardList,
  },
  {
    title: 'Feedback drafted',
    sub: 'Personalised notes for your batch',
    Icon: Sparkles,
  },
] as const;

function HomeHeroStackCards() {
  const [idx, setIdx] = useState(0);
  const [tickPulse, setTickPulse] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % HERO_HOME_STACK_CARDS.length);
      setTickPulse((p) => p + 1);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  const active = HERO_HOME_STACK_CARDS[idx];
  const Icon = active.Icon;

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 w-[min(100%,17rem)] sm:w-[min(100%,20rem)]">
      <div
        className="absolute bottom-0 left-2 right-0 top-2 translate-x-2 translate-y-2 rounded-xl border border-zinc-200/60 bg-white/50 shadow-md"
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-1 right-0 top-1 translate-x-1 translate-y-1 rounded-xl border border-zinc-200/70 bg-white/70 shadow-md"
        aria-hidden
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={active.title}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-xl border border-zinc-100 bg-white p-3 shadow-lg"
          style={{ boxShadow: landingTheme.shadow.card }}
        >
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <div
                className="grid size-10 place-items-center rounded-lg"
                style={{ backgroundColor: `${landingTheme.colors.accent}22`, color: landingTheme.colors.accent }}
              >
                <Icon className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <motion.span
                key={tickPulse}
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-white shadow-sm"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                aria-hidden
              >
                <CheckCircle2 className="size-4 text-emerald-600" strokeWidth={2.5} />
              </motion.span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{active.title}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{active.sub}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function initialMarketingFromWindow(): { tab: LandingMarketingTab; blogSlug: string | null } {
  if (typeof window === 'undefined') return { tab: 'home', blogSlug: null };
  return parseMarketingPath(window.location.pathname);
}

function landingNavIdToHref(id: string): string {
  switch (id) {
    case 'home':
      return pathForMarketingTab('home');
    case 'test-prep':
      return pathForMarketingTab('test-prep');
    case 'neet':
      return pathForMarketingTab('neet');
    case 'pricing':
      return pathForMarketingTab('pricing');
    case 'blog':
      return pathForMarketingTab('blog');
    default:
      return pathForMarketingTab('home');
  }
}

function footerLinkToMarketing(link: string): { href: string; tab: LandingMarketingTab } | null {
  const map: Record<string, LandingMarketingTab> = {
    Home: 'home',
    'NEET Test Prep': 'test-prep',
    'NEET PYQ': 'neet',
    Pricing: 'pricing',
    Blog: 'blog',
  };
  const tab = map[link];
  if (!tab) return null;
  return { href: pathForMarketingTab(tab), tab };
}

interface LandingPageProps {
  onLoginClick: () => void;
  onSignUpClick: () => void;
  isLoggedIn?: boolean;
  onDashboardClick?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({
  onLoginClick,
  onSignUpClick,
  isLoggedIn,
  onDashboardClick,
}) => {
  const [activeTab, setActiveTab] = useState<LandingMarketingTab>(() => initialMarketingFromWindow().tab);
  const [blogSlug, setBlogSlug] = useState<string | null>(() => initialMarketingFromWindow().blogSlug);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [heroInsightIdx, setHeroInsightIdx] = useState(0);
  const [homeCommandSlideIdx, setHomeCommandSlideIdx] = useState(0);
  const [homeHeroSlideIdx, setHomeHeroSlideIdx] = useState(0);
  const [neetHeroSlideIdx, setNeetHeroSlideIdx] = useState(0);

  const pushMarketingRoute = useCallback((tab: LandingMarketingTab, slug: string | null = null) => {
    const nextSlug = tab === 'blog-post' ? slug : null;
    setBlogSlug(nextSlug);
    setActiveTab(tab);
    const path = pathForMarketingTab(tab, nextSlug);
    window.history.pushState(null, '', path);
    setNavDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isRecognizedMarketingPath(window.location.pathname)) {
      window.history.replaceState(null, '', pathForMarketingTab('home'));
      setActiveTab('home');
    setBlogSlug(null);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      const { tab, blogSlug: slug } = parseMarketingPath(window.location.pathname);
      setActiveTab(tab);
      setBlogSlug(slug);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (activeTab !== 'test-prep') return;
    const id = window.setInterval(() => {
      setHeroInsightIdx((i) => (i + 1) % HERO_FLOATING_INSIGHTS.length);
    }, 4800);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'home') return;
    const id = window.setInterval(() => {
      setHomeCommandSlideIdx((i) => (i + 1) % LANDING_HOME_COMMAND_CAROUSEL.length);
    }, 5500);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'home') return;
    const id = window.setInterval(() => {
      setHomeHeroSlideIdx((i) => (i + 1) % LANDING_HOME_HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'test-prep') return;
    const id = window.setInterval(() => {
      setNeetHeroSlideIdx((i) => (i + 1) % NEET_TEST_PREP_HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(id);
  }, [activeTab]);

  const goToTab = (tabId: string) => {
    if (tabId === 'test-prep') pushMarketingRoute('test-prep');
    else if (tabId === 'blog') pushMarketingRoute('blog');
    else if (tabId === 'pricing') pushMarketingRoute('pricing');
    else if (tabId === 'neet') pushMarketingRoute('neet');
    else pushMarketingRoute('home');
  };

  const isLandingNavLinkActive = (linkId: string) =>
    (linkId === 'home' && activeTab === 'home') ||
    (linkId === 'test-prep' && activeTab === 'test-prep') ||
    (linkId === 'pricing' && activeTab === 'pricing') ||
    (linkId === 'blog' && (activeTab === 'blog' || activeTab === 'blog-post'));

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const closeIfDesktop = () => {
      if (mq.matches) setNavDrawerOpen(false);
    };
    mq.addEventListener('change', closeIfDesktop);
    closeIfDesktop();
    return () => mq.removeEventListener('change', closeIfDesktop);
  }, []);

  useEffect(() => {
    if (!navDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navDrawerOpen]);

  useEffect(() => {
    if (!navDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navDrawerOpen]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  };

  const renderPrivacy = () => (
    <motion.div
      key="privacy"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full"
    >
      <section className="border-b border-border bg-background px-4 pb-20 pt-28 md:px-6 md:pt-24">
        <div className="mx-auto max-w-3xl space-y-10">
          <a
            href={pathForMarketingTab('home')}
            onClick={(e) => {
              e.preventDefault();
              pushMarketingRoute('home');
            }}
            className="inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to home
          </a>
          <header>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Privacy policy</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Last updated: April 2026. This summary explains how KiwiTeach Learning (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
              handles information when you use our websites and teaching tools. It is not legal advice; have qualified counsel
              review before you rely on it in contracts or compliance filings.
            </p>
          </header>

          <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Who we are</h2>
              <p className="mt-3">
                KiwiTeach provides software for educators and institutions—test creation, online exams, lesson workflows,
                and related features. Our services are used by teachers, students, and administrators in schools and coaching
                centres, including in India.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Information we collect</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-foreground">Account data:</strong> name, email, role, and institute or class
                  associations you provide when you sign up or are invited.
                </li>
                <li>
                  <strong className="text-foreground">Content you create:</strong> tests, questions, assignments, files you
                  upload, and messages or metadata needed to run the product.
                </li>
                <li>
                  <strong className="text-foreground">Usage and technical data:</strong> device/browser type, approximate
                  location from IP, log data, cookies or similar technologies used for security, preferences, and product
                  improvement.
                </li>
              </ul>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">How we use information</h2>
              <p className="mt-3">
                We use data to provide and secure the service, authenticate users, personalise your workspace, analyse
                reliability and performance, communicate about your account, comply with law, and improve features. We do
                not sell your personal information.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Sharing</h2>
              <p className="mt-3">
                We share data with subprocessors that host infrastructure, email, analytics, or payments—only as needed to
                operate KiwiTeach and under appropriate agreements. We may disclose information if required by law or to
                protect rights and safety.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Retention &amp; security</h2>
              <p className="mt-3">
                We keep information for as long as your account is active and as needed for backups, disputes, and legal
                obligations. We use industry-standard safeguards, but no method of transmission over the Internet is
                perfectly secure.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Your choices</h2>
              <p className="mt-3">
                You may access, correct, or delete certain account information in the product or by contacting us. You can
                opt out of non-essential communications. Where applicable law grants additional rights (including in India),
                we will honour requests in line with those rules.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Children</h2>
              <p className="mt-3">
                Our services may be used in educational settings. Schools and institutions are responsible for obtaining
                any required consent for student use. If you believe we have collected a child&apos;s data improperly,
                contact us so we can address it.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Contact</h2>
              <p className="mt-3">
                Questions about this policy: use the contact options listed on the KiwiTeach website or your
                administrator&apos;s support channel.
              </p>
            </section>
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Note:</strong> Replace contact details, entity name, and jurisdiction
              with counsel-approved wording before publication.
            </p>
          </div>
        </div>
      </section>
    </motion.div>
  );

  const renderTerms = () => (
    <motion.div
      key="terms"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full"
    >
      <section className="border-b border-border bg-background px-4 pb-20 pt-28 md:px-6 md:pt-24">
        <div className="mx-auto max-w-3xl space-y-10">
          <a
            href={pathForMarketingTab('home')}
            onClick={(e) => {
              e.preventDefault();
              pushMarketingRoute('home');
            }}
            className="inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to home
          </a>
          <header>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Terms of service
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Last updated: April 2026. These terms govern use of KiwiTeach websites and software. They are a practical
              outline for early users—have qualified counsel adapt them for your entity, products, and regions before you
              treat them as binding legal text.
            </p>
          </header>

          <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Agreement</h2>
              <p className="mt-3">
                By accessing or using KiwiTeach, you agree to these terms. If you use the service on behalf of an
                organisation, you confirm you have authority to bind that organisation.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">The service</h2>
              <p className="mt-3">
                We provide online tools for teaching and assessment. Features may change; we may add, modify, or retire
                functionality with reasonable notice where practical. We aim for high availability but do not guarantee
                uninterrupted access.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Accounts &amp; eligibility</h2>
              <p className="mt-3">
                You must provide accurate registration information and keep credentials secure. You are responsible for
                activity under your account. We may suspend or terminate accounts that violate these terms or pose risk to
                the platform or other users.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Acceptable use</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>No unlawful, harmful, or deceptive activity; no attempt to disrupt, scrape, or overload systems.</li>
                <li>No uploading malware or content you do not have rights to use.</li>
                <li>Respect intellectual property and privacy of students, staff, and third parties.</li>
              </ul>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Content &amp; intellectual property</h2>
              <p className="mt-3">
                You retain rights to content you create. You grant us a limited licence to host, process, and display that
                content to operate the service. KiwiTeach name, branding, and software are protected; do not copy or
                reverse engineer except as allowed by law.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Subscriptions &amp; fees</h2>
              <p className="mt-3">
                Paid plans, taxes, and billing cycles are described at checkout or in your order. Failure to pay may
                result in restricted access. Refunds follow the policy shown at purchase unless law requires otherwise.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Disclaimers</h2>
              <p className="mt-3">
                The service is provided &ldquo;as is&rdquo; to the extent permitted by law. We disclaim implied warranties
                where allowed. Educational outcomes depend on many factors beyond software; we are not responsible for exam
                results or institutional decisions.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Limitation of liability</h2>
              <p className="mt-3">
                To the maximum extent permitted by law, our total liability for claims arising from these terms or the
                service is limited to the greater of amounts you paid us in the twelve months before the claim or a modest
                fixed sum. We are not liable for indirect or consequential damages.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Termination</h2>
              <p className="mt-3">
                You may stop using KiwiTeach at any time. We may suspend or end access for breach, risk, or business reasons
                with notice where reasonable. Provisions that should survive (e.g. liability limits) continue after
                termination.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Changes</h2>
              <p className="mt-3">
                We may update these terms. We will post the new date and, for material changes, provide notice through the
                product or email. Continued use after changes means you accept the updated terms.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Governing law &amp; disputes</h2>
              <p className="mt-3">
                Specify your chosen courts and law with counsel—for example, courts in India or another jurisdiction where
                your company is organised. Until then, this section is intentionally generic.
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground">Contact</h2>
              <p className="mt-3">For legal or contractual notices, use the official contact published on kiwiteach.com.</p>
            </section>
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Note:</strong> Insert governing law, dispute resolution, company legal
              name, and registered address after legal review.
            </p>
          </div>
        </div>
      </section>
    </motion.div>
  );

  const renderHome = () => (
    <motion.div 
      key="home"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full"
    >
      <section
        id="features"
        className="relative border-b border-emerald-100/40 bg-gradient-to-br from-emerald-50/90 via-white to-amber-50/60 px-4 pb-20 pt-32 md:px-6 md:pb-28 md:pt-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.85]"
          style={{ background: landingTheme.gradients.homeHeroWash }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: landingTheme.gradients.glow }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Star
            className="absolute right-[8%] top-[14%] size-4 fill-[#f2c44e]/25 text-[#f2c44e]/40 sm:size-5"
            strokeWidth={1}
          />
          <Star
            className="absolute right-[22%] top-[26%] size-3 fill-[#f2c44e]/20 text-[#f2c44e]/35"
            strokeWidth={1}
          />
          <Star
            className="absolute left-[6%] top-[38%] size-3.5 fill-[#f2c44e]/22 text-[#f2c44e]/38"
            strokeWidth={1}
          />
          <Star
            className="absolute bottom-[28%] left-[12%] size-4 fill-[#f2c44e]/18 text-[#f2c44e]/32 sm:bottom-[32%]"
            strokeWidth={1}
          />
          <Star
            className="absolute bottom-[20%] right-[18%] size-3 fill-[#f2c44e]/18 text-[#f2c44e]/30"
            strokeWidth={1}
          />
            </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="h-auto w-fit gap-2 rounded-full border-white/80 bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 shadow-sm sm:text-[11px]"
            >
              <Sparkles className="size-3.5 shrink-0" style={{ color: landingTheme.colors.accent }} aria-hidden />
              Building tools to enable teachers
            </Badge>
            <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight text-zinc-900 md:text-5xl lg:text-[3.25rem]">
              Reclaim your time.
              <br />
              <span style={{ color: landingTheme.colors.accent }}>Reignite teaching.</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-zinc-600 md:text-xl">
              We build intelligent tools that help educators create <LandingKeywordLine>lesson plans</LandingKeywordLine>,
              automate exam prep, and deliver <LandingKeywordLine>feedback</LandingKeywordLine> in a fraction of the time.
            </p>
            <div className="flex flex-wrap gap-2">
              {homeBroadPills.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm"
                >
                  {pill}
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                </span>
              ))}
            </div>
            <LandingCtaButton onClick={isLoggedIn ? onDashboardClick : onSignUpClick}>
              Start for free
              <ArrowRight className="size-4" aria-hidden />
            </LandingCtaButton>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-lg shadow-zinc-200/40">
              <div
                className="relative min-h-[300px] overflow-hidden rounded-xl md:min-h-[420px]"
                role="region"
                aria-roledescription="carousel"
                aria-label="KiwiTeach in classrooms and at home"
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.img
                    key={homeHeroSlideIdx}
                    src={LANDING_HOME_HERO_SLIDES[homeHeroSlideIdx]}
                    alt={LANDING_HOME_HERO_ALTS[homeHeroSlideIdx]}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 h-full w-full object-cover"
                    width={1280}
                    height={960}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    decoding="async"
                    fetchPriority={homeHeroSlideIdx === 0 ? 'high' : 'low'}
                    loading={homeHeroSlideIdx === 0 ? 'eager' : 'lazy'}
                  />
                </AnimatePresence>
              </div>
              <div className="mt-3 flex justify-center gap-2">
                {LANDING_HOME_HERO_SLIDES.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    aria-label={`Hero scene ${i + 1} of ${LANDING_HOME_HERO_SLIDES.length}`}
                    aria-current={i === homeHeroSlideIdx ? 'true' : undefined}
                    onClick={() => setHomeHeroSlideIdx(i)}
                    className="h-2 w-2 rounded-full transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                    style={{
                      backgroundColor:
                        i === homeHeroSlideIdx ? landingTheme.colors.accent : 'rgba(28,36,66,0.22)',
                      opacity: i === homeHeroSlideIdx ? 1 : 0.55,
                    }}
                  />
                ))}
              </div>
            </div>
            <HomeHeroStackCards />
          </div>
        </div>
      </section>

      <section
        className="border-b border-zinc-800/20 px-4 py-20 md:px-6 md:py-28"
        style={{ background: landingTheme.gradients.darkPanel }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-white md:text-5xl lg:text-[2.75rem]">
            Your <LandingKeywordLine tone="light">classroom</LandingKeywordLine>{' '}
            <span style={{ color: landingTheme.colors.accent }}>command center</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
            See how easy it is to turn a simple idea into a complete, ready-to-teach lesson in seconds.
          </p>
          <div
            className="mx-auto mt-12 max-w-4xl"
            role="region"
            aria-roledescription="carousel"
            aria-label="Classroom command center highlights"
          >
            <div className="relative min-h-[240px] overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl md:min-h-[420px]">
              <AnimatePresence initial={false} mode="wait">
                <motion.img
                  key={homeCommandSlideIdx}
                  src={LANDING_HOME_COMMAND_CAROUSEL[homeCommandSlideIdx].src}
                  alt={LANDING_HOME_COMMAND_CAROUSEL[homeCommandSlideIdx].alt}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] rounded-xl object-cover"
                  width={1280}
                  height={720}
                  sizes="(max-width: 896px) 100vw, 896px"
                  decoding="async"
                  loading="lazy"
                />
              </AnimatePresence>
        </div>
            <div className="mx-auto mt-5 min-h-[4.25rem] max-w-2xl md:min-h-[4.5rem]">
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  key={homeCommandSlideIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center text-sm leading-relaxed text-white/88 md:text-base"
                >
                  <LandingKeywordLine className="font-semibold text-white">
                    {LANDING_HOME_COMMAND_CAROUSEL[homeCommandSlideIdx].captionLead}
                  </LandingKeywordLine>
                  <span className="text-white/80">{LANDING_HOME_COMMAND_CAROUSEL[homeCommandSlideIdx].captionRest}</span>
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {LANDING_HOME_COMMAND_CAROUSEL.map((slide, i) => (
                <button
                  key={slide.src}
                  type="button"
                  aria-label={`Show slide ${i + 1} of ${LANDING_HOME_COMMAND_CAROUSEL.length}`}
                  aria-current={i === homeCommandSlideIdx ? 'true' : undefined}
                  onClick={() => setHomeCommandSlideIdx(i)}
                  className="h-2.5 w-2.5 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
                  style={{
                    backgroundColor: i === homeCommandSlideIdx ? landingTheme.colors.accent : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 md:px-6 md:py-24">
        <div
          className="mx-auto max-w-4xl overflow-hidden px-6 py-12 text-center shadow-xl md:px-12 md:py-16"
          style={{ backgroundColor: landingTheme.colors.navy, borderRadius: landingTheme.radius.hero }}
        >
          <h3 className="font-heading text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl">
            Ready to transform your{' '}
            <span style={{ color: landingTheme.colors.accentWarm }}>classroom?</span>
          </h3>
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/85 md:text-lg">
            Join thousands of teachers who are reclaiming their{' '}
            <LandingKeywordLine tone="light">time</LandingKeywordLine> and focusing on what matters most.
          </p>
          <div className="mt-9 flex justify-center">
            <LandingCtaButton
              className="!text-white"
            style={{ background: landingTheme.gradients.button }}
              onClick={isLoggedIn ? onDashboardClick : onSignUpClick}
            >
              Start saving time
              <ArrowRight className="size-4" aria-hidden />
            </LandingCtaButton>
          </div>
          <p className="mt-5 text-sm text-white/60">No credit card required. Free forever plan available.</p>
        </div>
      </section>
    </motion.div>
  );

  const renderTestPrep = () => (
    <motion.div 
      key="test-prep"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full"
    >
      <section
        id="test-prep-hero"
        className="relative border-b border-border bg-gradient-to-br from-muted/80 via-background to-amber-50/30 px-4 pb-16 pt-32 md:px-6 md:pb-24 md:pt-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.9]"
          style={{ background: landingTheme.gradients.testPrepHeroWash }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{ background: landingTheme.gradients.glow }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Star className="absolute right-[10%] top-[18%] size-3 fill-[#f2c44e]/22 text-[#f2c44e]/38" strokeWidth={1} />
          <Star className="absolute bottom-[40%] left-[4%] size-3.5 fill-[#f2c44e]/18 text-[#f2c44e]/32" strokeWidth={1} />
            </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div className="space-y-7">
            <Badge
              variant="outline"
              className="h-auto max-w-full flex-wrap gap-1.5 rounded-full border-border/80 bg-background/90 px-3 py-2 text-[10px] font-semibold uppercase leading-snug tracking-wider text-muted-foreground shadow-sm sm:text-[11px]"
            >
              <Sparkles className="size-3.5 shrink-0 text-emerald-600/90" aria-hidden />
              <span>NEET prep · schools &amp; coaching centres</span>
            </Badge>
            <h1 className="font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Create question papers for NEET prep in minutes.
              <br />
              <span className="mt-1 block text-lg font-normal leading-snug tracking-tight text-muted-foreground sm:text-xl md:text-2xl lg:max-w-xl lg:text-[1.35rem]">
                Pick chapters and topics from what you taught. Choose how many Easy, Medium, and Hard questions you want.
                Then get <LandingKeywordLine>NEET-style MCQs</LandingKeywordLine> for{' '}
                <span className="font-medium text-foreground/90">online class mocks</span> or{' '}
                <span className="font-medium text-foreground/90">print-ready paper tests</span>.
              </span>
            </h1>
            <p className="max-w-xl text-sm font-medium text-foreground/80">{LANDING_ICP_LINE}</p>
            <div className="flex flex-wrap gap-2">
              {homePills.map((pill) => (
                <Badge
                  key={pill}
                  variant="secondary"
                  className="h-auto gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground"
                >
                  {pill}
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                </Badge>
              ))}
            </div>
            <LandingCtaButton onClick={isLoggedIn ? onDashboardClick : onLoginClick}>
              Build tests free
              <ArrowRight className="size-4" aria-hidden />
            </LandingCtaButton>
          </div>

          <div className="relative">
            <Card className="overflow-hidden border border-border/80 bg-card p-3 shadow-md">
              <CardContent className="p-0">
                <div
                  className="relative min-h-[280px] overflow-hidden rounded-xl md:min-h-[420px]"
                  role="region"
                  aria-roledescription="carousel"
                  aria-label="NEET prep in practice"
                >
                  <AnimatePresence initial={false} mode="wait">
                    <motion.img
                      key={neetHeroSlideIdx}
                      src={NEET_TEST_PREP_HERO_SLIDES[neetHeroSlideIdx]}
                      alt={NEET_PREP_HERO_ALTS[neetHeroSlideIdx]}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 h-full w-full rounded-xl object-cover"
                      width={1280}
                      height={960}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      decoding="async"
                      fetchPriority="high"
                      loading="eager"
                    />
                  </AnimatePresence>
            </div>
                <div className="mt-3 flex justify-center gap-2">
                  {NEET_TEST_PREP_HERO_SLIDES.map((_, i) => (
                    <button
                      key={NEET_TEST_PREP_HERO_SLIDES[i]}
                      type="button"
                      aria-label={`Hero image ${i + 1} of ${NEET_TEST_PREP_HERO_SLIDES.length}`}
                      aria-current={i === neetHeroSlideIdx ? 'true' : undefined}
                      onClick={() => setNeetHeroSlideIdx(i)}
                      className="h-2 w-2 rounded-full transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      style={{
                        backgroundColor:
                          i === neetHeroSlideIdx ? landingTheme.colors.navy : 'rgba(28,36,66,0.22)',
                        opacity: i === neetHeroSlideIdx ? 1 : 0.55,
                      }}
                    />
                  ))}
          </div>
              </CardContent>
            </Card>
            <div className="mt-3 max-w-full sm:max-w-md">
              <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
                <AnimatePresence mode="wait">
                  {(() => {
                    const item = HERO_FLOATING_INSIGHTS[heroInsightIdx];
                    const Hi = item.Icon;
                    return (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-start gap-2.5"
                      >
                        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-foreground ring-1 ring-[#f2c44e]/35">
                          <Hi className="size-4" strokeWidth={2} aria-hidden />
        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug text-foreground">{item.title}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{item.subtitle}</p>
          </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
              </div>
            </div>
        </div>
      </section>

      <LandingHowItWorksSection />

      <section className="border-b border-zinc-200 bg-white px-4 py-16 md:px-6 md:py-24">
        <Card
          className="mx-auto max-w-5xl overflow-hidden border-0 text-white shadow-lg"
          style={{ backgroundColor: landingTheme.colors.navy }}
        >
          <CardContent className="px-6 py-12 text-center md:px-10 md:py-16">
            <h3 className="font-heading text-3xl font-semibold leading-tight md:text-5xl lg:text-6xl">
              Same-day tests.
              <br />
              <span className="text-white/90">Sane prep weeks.</span>
            </h3>
            <p className="mx-auto mb-9 mt-5 max-w-3xl text-lg text-white/90 md:text-xl">
              When the hall is booked and the batch is waiting, you shouldn&apos;t still be fixing margins and hunting
              MCQs. Your goal stays simple:{' '}
              <span className="font-medium text-white">{LANDING_HERO_OUTCOME.toLowerCase()}.</span> Start free, run your
              next practice paper from KiwiTeach, and skip the Sunday-night scramble.
            </p>
            <LandingCtaButton variant="white" onClick={isLoggedIn ? onDashboardClick : onLoginClick}>
              Start building tests
              <ArrowRight className="size-4" aria-hidden />
            </LandingCtaButton>
            <p className="mt-5 text-sm text-white/75">No credit card to try. Free tier available.</p>
          </CardContent>
        </Card>
      </section>

      <section className="border-b border-border bg-background px-4 py-20 md:px-6 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Meet the founders
            </h2>
          </div>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 md:gap-8">
            <Card className="border-border/80 text-center shadow-sm">
              <CardContent className="space-y-6 p-8 md:p-10">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
                  <img
                    src="https://picsum.photos/seed/rafeeque/200/200"
                    alt="Rafeeque Mavoor, CEO and co-founder of KiwiTeach"
                    className="h-full w-full object-cover"
                    width={200}
                    height={200}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
              </div>
              <div>
                  <h4 className="font-heading text-xl font-semibold text-foreground">Rafeeque Mavoor</h4>
                  <p className="mt-1 text-sm font-medium text-primary">CEO &amp; Co-founder</p>
              </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  IISER Thiruvananthapuram alumni. Building KiwiTeach so teachers spend less time inventing questions and
                  more time moving students forward.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/80 text-center shadow-sm">
              <CardContent className="space-y-6 p-8 md:p-10">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
                  <img
                    src="https://picsum.photos/seed/favaz/200/200"
                    alt="Favaz Ahammed, CTO and co-founder of KiwiTeach"
                    className="h-full w-full object-cover"
                    width={200}
                    height={200}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
              </div>
              <div>
                  <h4 className="font-heading text-xl font-semibold text-foreground">Favaz Ahammed</h4>
                  <p className="mt-1 text-sm font-medium text-primary">CTO &amp; Co-founder</p>
              </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  IISER Pune alumni. Focused on reliable AI workflows so faculty can trust what ships to the classroom.
              </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </motion.div>
  );

  const renderNeet = () => (
    <motion.div
      key="neet"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full"
    >
      <section
        className="relative overflow-hidden border-b border-border pt-32 pb-14 md:pt-28 md:pb-20"
        style={{ background: landingTheme.gradients.testPrepHero }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{ background: landingTheme.gradients.neetHeroWash }}
        />
        <div className="absolute top-1/2 left-0 h-[40vw] max-h-[420px] w-[40vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-[100px]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Star className="absolute right-[12%] top-[22%] size-3 fill-[#f2c44e]/28 text-[#f2c44e]/45" strokeWidth={1} />
          <Star className="absolute left-[15%] top-[35%] size-2.5 fill-[#f2c44e]/22 text-[#f2c44e]/40" strokeWidth={1} />
          <Star className="absolute bottom-[25%] right-[20%] size-3 fill-[#f2c44e]/20 text-[#f2c44e]/35" strokeWidth={1} />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center md:px-6">
          <Badge
            variant="outline"
            className="rounded-full border-white/25 bg-white/10 text-[11px] font-semibold uppercase tracking-wider text-indigo-100"
          >
            NEET PYQ
          </Badge>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Practice that matches the exam you&apos;re training for
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            For teachers: align drills and full papers with <LandingKeywordLine tone="light">NEET-style</LandingKeywordLine>{' '}
            rigour using the same question workflows as the rest of KiwiTeach: PYQs, syllabus filters, and batches you
            already manage.
          </p>
          <div className="mt-10 flex justify-center">
            <LandingCtaAnchor
              variant="outlineLight"
              href={`${MARKETING_PATH.neetPyq}#pyqs`}
              onClick={(e) => {
                e.preventDefault();
                pushMarketingRoute('neet');
                window.requestAnimationFrame(() => {
                  document.getElementById('pyqs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }}
          >
            Jump to PYQs
            </LandingCtaAnchor>
          </div>
        </div>
      </section>
      <NeetPyqSection isLoggedIn={!!isLoggedIn} onLoginClick={onLoginClick} />
    </motion.div>
  );

  const renderPricing = () => (
    <motion.div
      key="pricing"
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -20 }}
      variants={containerVariants}
      className="w-full min-h-screen bg-muted/30"
    >
      <section className="border-b border-border bg-gradient-to-b from-muted/50 to-background px-4 pb-8 pt-32 md:px-6 md:pb-10 md:pt-28">
        <div className="mx-auto max-w-5xl text-center">
          <Badge
            variant="secondary"
            className="mb-4 rounded-full text-[11px] font-semibold uppercase tracking-wider ring-1 ring-[#f2c44e]/25"
          >
            Pricing
          </Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Plans for teachers &amp; teams
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Pick a tier that matches how many tests you run and how your school or centre works. Checkout is secure via Dodo Payments.
          </p>
        </div>
      </section>
      <div className="px-4 pb-16 md:px-6">
        <PricingPage embedded forceFallback />
      </div>
    </motion.div>
  );

  return (
    <div className="theme landing-marketing-scope min-h-screen bg-white font-sans text-foreground antialiased selection:bg-primary/15 selection:text-foreground">
      <LandingSeoHelmet activeTab={activeTab} />
      {/* Navigation: solid white bar; centered links on lg+; hamburger on smaller screens */}
      <nav className="fixed top-0 z-50 w-full border-b border-zinc-200/90 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
        <div className="relative mx-auto flex min-h-[3.75rem] w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4 md:px-6 py-2">
          <a
            href={pathForMarketingTab('home')}
            aria-current={activeTab === 'home' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              pushMarketingRoute('home');
            }}
            className="relative z-[1] flex min-w-0 shrink-0 cursor-pointer items-center gap-2 sm:gap-3 no-underline"
          >
            <KiwiTeachLogoMark decorative className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="truncate text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
              KiwiTeach
            </span>
          </a>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-zinc-200/80 bg-zinc-50/80 px-1 py-1 shadow-sm">
            {landingNavLinks.map((link) => {
                const active = isLandingNavLinkActive(link.id);
              return (
                  <a
                  key={link.id}
                    href={landingNavIdToHref(link.id)}
                    aria-current={active ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      goToTab(link.id);
                    }}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors no-underline ${
                      active
                        ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80'
                        : 'text-zinc-600 hover:bg-white/80 hover:text-zinc-900 hover:ring-1 hover:ring-[#f2c44e]/35'
                  }`}
                >
                  {link.label}
                  </a>
              );
            })}
            </div>
          </div>

          <div className="relative z-[1] flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="shrink-0 whitespace-nowrap rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-[#f2c44e]/50 hover:bg-amber-50/40 hover:text-zinc-900 sm:px-3.5 sm:text-sm"
                >
                  Sign in
                </button>
                <LandingCtaButton
                  onClick={onSignUpClick}
                  className="!h-10 !px-5 !text-xs sm:!h-11 sm:!px-6 sm:!text-sm"
                >
                  Get started
                </LandingCtaButton>
              </>
            ) : (
              <LandingCtaButton
                onClick={() => onDashboardClick?.()}
                className="!h-9 gap-1 !px-3 !text-xs sm:!h-10 sm:gap-1.5 sm:!px-4 sm:!text-sm"
              >
                <Layout className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
                Dashboard
              </LandingCtaButton>
            )}
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 lg:hidden sm:h-11 sm:w-11"
              aria-expanded={navDrawerOpen}
              aria-controls="landing-nav-drawer"
              aria-label={navDrawerOpen ? 'Close menu' : 'Open page menu'}
              onClick={() => setNavDrawerOpen((o) => !o)}
            >
              {navDrawerOpen ? <X className="h-5 w-5" strokeWidth={2.25} /> : <Menu className="h-5 w-5" strokeWidth={2.25} />}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {navDrawerOpen && (
          <>
            <motion.button
              key="landing-nav-backdrop"
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-zinc-900/35"
              onClick={() => setNavDrawerOpen(false)}
            />
            <motion.aside
              key="landing-nav-panel"
              id="landing-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Site pages"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed right-0 top-0 z-[61] flex h-full w-[min(22rem,calc(100vw-1rem))] max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pages</p>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-50"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 pb-10">
                {landingNavLinks.map((link) => {
                  const isActive = isLandingNavLinkActive(link.id);
                  return (
                    <a
                      key={link.id}
                      href={landingNavIdToHref(link.id)}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        goToTab(link.id);
                      }}
                      className={`rounded-lg px-4 py-3.5 text-left text-base font-medium transition-colors no-underline ${
                        isActive ? 'bg-primary text-primary-foreground' : 'text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      {link.label}
                    </a>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main>
        <AnimatePresence mode="wait">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'neet' && renderNeet()}
          {activeTab === 'test-prep' && renderTestPrep()}
          {activeTab === 'pricing' && renderPricing()}
          {activeTab === 'privacy' && renderPrivacy()}
          {activeTab === 'terms' && renderTerms()}
          {activeTab === 'blog' && (
            <motion.div
              key="blog"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28 }}
              className="w-full"
            >
              <BlogIndexPage
                onBack={() => {
                  pushMarketingRoute('home');
                }}
                onSelectPost={(slug) => {
                  pushMarketingRoute('blog-post', slug);
                }}
              />
            </motion.div>
          )}
          {activeTab === 'blog-post' && blogSlug && (
            <motion.div
              key={`blog-post-${blogSlug}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28 }}
              className="w-full"
            >
              <BlogArticlePage
                slug={blogSlug}
                onBack={() => {
                  pushMarketingRoute('blog');
                }}
                onSelectPost={(nextSlug) => {
                  pushMarketingRoute('blog-post', nextSlug);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-border bg-background px-6 pb-10 pt-24 text-foreground">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-14 mb-16">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <KiwiTeachLogoMark decorative className="h-10 w-10" />
                <span className="text-2xl font-semibold tracking-tight">KiwiTeach</span>
                </div>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">{LANDING_FOOTER_BLURB}</p>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow us</p>
                <LandingFooterSocial />
              </div>
            </div>
            {footerColumns.map((column) => (
              <div key={column.title} className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{column.title}</p>
                <ul className="space-y-3">
                  {column.links.map((link) => {
                    const m = footerLinkToMarketing(link);
                    if (m) {
                      return (
                    <li key={link}>
                          <a
                            href={m.href}
                            onClick={(e) => {
                              e.preventDefault();
                              pushMarketingRoute(m.tab);
                            }}
                            className="text-muted-foreground transition-colors hover:text-foreground no-underline"
                        >
                          {link}
                          </a>
                    </li>
                      );
                    }
                    return (
                      <li key={link}>
                        <span className="text-muted-foreground">{link}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-6 border-t border-border pt-8 md:flex-row">
            <p className="text-sm font-medium text-muted-foreground">© 2026 KiwiTeach Learning. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-8">
              <a
                href={pathForMarketingTab('privacy')}
                onClick={(e) => {
                  e.preventDefault();
                  pushMarketingRoute('privacy');
                }}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground no-underline"
              >
                Privacy Policy
              </a>
              <a
                href={pathForMarketingTab('terms')}
                onClick={(e) => {
                  e.preventDefault();
                  pushMarketingRoute('terms');
                }}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground no-underline"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

