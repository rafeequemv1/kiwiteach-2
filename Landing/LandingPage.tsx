
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, Layout, Menu, Sparkles, Target, Zap, X } from 'lucide-react';
import { KiwiTeachLogoMark } from './KiwiTeachLogoMark';
import { LandingHowItWorksSection } from './LandingHowItWorksSection';
import { BlogArticlePage, BlogIndexPage } from '../Blog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PricingPage from '../src/pages/PricingPage';
import {
  footerColumns,
  homeBroadPills,
  homePills,
  landingNavLinks,
  landingTheme,
  LANDING_FOOTER_BLURB,
  LANDING_HOME_COMMAND_SLIDES,
  LANDING_HOME_HERO_IMAGE,
  LANDING_HERO_OUTCOME,
  LANDING_ICP_LINE,
  NEET_TEST_PREP_HERO_SLIDES,
} from './theme';
import { LandingSeoHelmet } from './LandingSeoHelmet';
import NeetPyqSection from './NeetPyqSection';

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

const HOME_COMMAND_ALTS = [
  'Indian male teacher planning at laptop — your classroom command center',
  'Four educators collaborating — two men and two women around lesson materials',
] as const;

const NEET_HERO_ALTS = [
  'Teacher organizing NEET practice papers and laptop — calm exam prep',
  'Hand filling bubbles on an OMR answer sheet for a competitive exam',
] as const;

type LandingTab = 'home' | 'neet' | 'test-prep' | 'pricing' | 'blog' | 'blog-post';

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
  const [activeTab, setActiveTab] = useState<LandingTab>('home');
  const [blogSlug, setBlogSlug] = useState<string | null>(null);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [heroInsightIdx, setHeroInsightIdx] = useState(0);
  const [homeCommandSlideIdx, setHomeCommandSlideIdx] = useState(0);
  const [neetHeroSlideIdx, setNeetHeroSlideIdx] = useState(0);

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
      setHomeCommandSlideIdx((i) => (i + 1) % LANDING_HOME_COMMAND_SLIDES.length);
    }, 5500);
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
    setBlogSlug(null);
    if (tabId === 'test-prep') setActiveTab('test-prep');
    else if (tabId === 'blog') setActiveTab('blog');
    else if (tabId === 'pricing') setActiveTab('pricing');
    else if (tabId === 'neet') setActiveTab('neet');
    else setActiveTab('home');
    setNavDrawerOpen(false);
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
        className="relative border-b border-emerald-100/40 bg-gradient-to-br from-emerald-50/85 via-white to-amber-50/50 px-4 pb-20 pt-32 md:px-6 md:pb-28 md:pt-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: landingTheme.gradients.glow }}
        />
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
              We build intelligent tools that help educators create lesson plans, automate exam prep, and deliver feedback
              in a fraction of the time.
            </p>
            <div className="flex flex-wrap gap-2">
              {homeBroadPills.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm"
                >
                  {pill}
                  <CheckCircle2 className="size-4 shrink-0 text-sky-600" aria-hidden />
                </span>
              ))}
            </div>
            <Button
              size="lg"
              className="h-12 gap-2 rounded-xl px-8 text-base font-semibold shadow-md"
              style={{ backgroundColor: landingTheme.colors.navy, color: '#fff' }}
              onClick={isLoggedIn ? onDashboardClick : onSignUpClick}
            >
              Start for free
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-lg shadow-zinc-200/40">
              <img
                src={LANDING_HOME_HERO_IMAGE}
                alt="Indian teacher in a bright modern classroom, welcoming and ready to teach"
                className="h-[300px] w-full rounded-xl object-cover md:h-[420px]"
                width={1200}
                height={900}
                decoding="async"
              />
            </div>
            <div
              className="absolute bottom-5 left-5 max-w-[14.5rem] rounded-xl border border-zinc-100 bg-white p-3 shadow-lg sm:max-w-xs"
              style={{ boxShadow: landingTheme.shadow.card }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="grid size-10 shrink-0 place-items-center rounded-lg"
                  style={{ backgroundColor: `${landingTheme.colors.accent}22`, color: landingTheme.colors.accent }}
                >
                  <BookOpen className="size-5" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Lesson plan generated</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Saved 2 hours of prep time</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-b border-zinc-800/20 px-4 py-20 md:px-6 md:py-28"
        style={{ background: landingTheme.gradients.darkPanel }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-white md:text-5xl lg:text-[2.75rem]">
            Your classroom{' '}
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
                  src={LANDING_HOME_COMMAND_SLIDES[homeCommandSlideIdx]}
                  alt={HOME_COMMAND_ALTS[homeCommandSlideIdx]}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] rounded-xl object-cover"
                  width={1200}
                  height={675}
                  decoding="async"
                />
              </AnimatePresence>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {LANDING_HOME_COMMAND_SLIDES.map((_, i) => (
                <button
                  key={LANDING_HOME_COMMAND_SLIDES[i]}
                  type="button"
                  aria-label={`Show slide ${i + 1} of ${LANDING_HOME_COMMAND_SLIDES.length}`}
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
            Join thousands of teachers who are reclaiming their time and focusing on what matters most.
          </p>
          <Button
            size="lg"
            className="mt-9 h-12 gap-2 rounded-full border-0 px-10 text-base font-semibold text-white shadow-lg"
            style={{ background: landingTheme.gradients.button }}
            onClick={isLoggedIn ? onDashboardClick : onSignUpClick}
          >
            Start saving time
            <ArrowRight className="size-4" aria-hidden />
          </Button>
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
        className="relative border-b border-border bg-gradient-to-br from-muted/80 via-background to-muted/40 px-4 pb-16 pt-32 md:px-6 md:pb-24 md:pt-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: landingTheme.gradients.glow }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div className="space-y-7">
            <Badge
              variant="outline"
              className="h-auto max-w-full flex-wrap gap-1.5 border-border/80 bg-background/90 px-3 py-2 text-[10px] font-semibold uppercase leading-snug tracking-wider text-muted-foreground shadow-sm sm:text-[11px]"
            >
              <Sparkles className="size-3.5 shrink-0 text-emerald-600/90" aria-hidden />
              <span>NEET prep · schools &amp; coaching centres</span>
            </Badge>
            <h1 className="font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Create question papers for NEET prep in minutes.
              <br />
              <span className="mt-1 block text-lg font-normal leading-snug tracking-tight text-muted-foreground sm:text-xl md:text-2xl lg:max-w-xl lg:text-[1.35rem]">
                Pick chapters and topics from what you taught. Choose how many Easy, Medium, and Hard questions you want.
                Then get NEET-style MCQs for{' '}
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
                  className="h-auto gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground"
                >
                  {pill}
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                </Badge>
              ))}
            </div>
            <Button
              size="lg"
              className="h-12 gap-2 rounded-lg px-8 text-base font-semibold shadow-sm"
              style={{ backgroundColor: landingTheme.colors.navy, color: '#fff' }}
              onClick={isLoggedIn ? onDashboardClick : onLoginClick}
            >
              Build tests free
              <ArrowRight className="size-4" aria-hidden />
            </Button>
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
                      alt={NEET_HERO_ALTS[neetHeroSlideIdx]}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 h-full w-full rounded-xl object-cover"
                      width={1200}
                      height={900}
                      decoding="async"
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
                        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-foreground">
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

      <section className="border-b border-border bg-background px-4 py-16 md:px-6 md:py-24">
        <Card className="mx-auto max-w-5xl overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg">
          <CardContent className="px-6 py-12 text-center md:px-10 md:py-16">
            <h3 className="font-heading text-3xl font-semibold leading-tight md:text-5xl lg:text-6xl">
              Same-day tests.
              <br />
              <span className="text-primary-foreground/85">Sane prep weeks.</span>
            </h3>
            <p className="mx-auto mb-9 mt-5 max-w-3xl text-lg text-primary-foreground/85 md:text-xl">
              When the hall is booked and the batch is waiting, you shouldn&apos;t still be fixing margins and hunting
              MCQs. Your goal stays simple:{' '}
              <span className="font-medium text-primary-foreground">{LANDING_HERO_OUTCOME.toLowerCase()}.</span> Start free,
              run your next practice paper from KiwiTeach, and skip the Sunday-night scramble.
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="h-12 gap-2 rounded-lg px-10 text-base font-semibold shadow-sm"
              onClick={isLoggedIn ? onDashboardClick : onLoginClick}
            >
              Start building tests
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="mt-5 text-sm text-primary-foreground/70">No credit card to try. Free tier available.</p>
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
                    alt="Rafeeque Mavoor"
                    className="h-full w-full object-cover"
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
                    alt="Favaz Ahammed"
                    className="h-full w-full object-cover"
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
        <div className="absolute top-1/2 left-0 h-[40vw] max-h-[420px] w-[40vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-[100px]" />
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center md:px-6">
          <Badge variant="outline" className="border-white/25 bg-white/10 text-[11px] font-semibold uppercase tracking-wider text-indigo-100">
            NEET PYQ
          </Badge>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Practice that matches the exam you&apos;re training for
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            For teachers: align drills and full papers with NEET-style rigour using the same question workflows as the rest
            of KiwiTeach: PYQs, syllabus filters, and batches you already manage.
          </p>
          <Button
            variant="outline"
            size="lg"
            className="mt-10 h-11 rounded-lg border-white/25 bg-white/10 px-8 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/15"
            asChild
          >
            <a href="#pyqs">Jump to PYQs</a>
          </Button>
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
          <Badge variant="secondary" className="mb-4 text-[11px] font-semibold uppercase tracking-wider">
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
        <PricingPage embedded />
      </div>
    </motion.div>
  );

  return (
    <div className="theme min-h-screen bg-white font-sans text-foreground antialiased selection:bg-primary/15 selection:text-foreground">
      <LandingSeoHelmet activeTab={activeTab} />
      {/* Navigation: solid white bar; centered links on lg+; hamburger on smaller screens */}
      <nav className="fixed top-0 z-50 w-full border-b border-zinc-200/90 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.03)]">
        <div className="relative mx-auto flex min-h-[3.75rem] w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4 md:px-6 py-2">
          <div
            className="relative z-[1] flex min-w-0 shrink-0 cursor-pointer items-center gap-2 sm:gap-3"
            onClick={() => {
              setActiveTab('home');
              setBlogSlug(null);
            }}
          >
            <KiwiTeachLogoMark decorative className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="truncate text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
              KiwiTeach
            </span>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-zinc-200/80 bg-zinc-50/80 px-1 py-1 shadow-sm">
              {landingNavLinks.map((link) => {
                const active = isLandingNavLinkActive(link.id);
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => goToTab(link.id)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80'
                        : 'text-zinc-600 hover:bg-white/80 hover:text-zinc-900'
                    }`}
                  >
                    {link.label}
                  </button>
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
                  className="shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 sm:px-2.5 sm:text-sm"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={onSignUpClick}
                  className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-95 sm:px-5 sm:text-sm"
                  style={{ backgroundColor: landingTheme.colors.navy }}
                >
                  Get started
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onDashboardClick?.()}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-95 sm:gap-1.5 sm:px-3 sm:text-sm"
                style={{ backgroundColor: landingTheme.colors.navy, borderColor: landingTheme.colors.navySoft }}
              >
                <Layout className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Dashboard
              </button>
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
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => goToTab(link.id)}
                      className={`rounded-lg px-4 py-3.5 text-left text-base font-medium transition-colors ${
                        isActive ? 'bg-primary text-primary-foreground' : 'text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      {link.label}
                    </button>
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
                onBack={() => { setActiveTab('home'); setBlogSlug(null); }}
                onSelectPost={(slug) => {
                  setBlogSlug(slug);
                  setActiveTab('blog-post');
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
                  setActiveTab('blog');
                  setBlogSlug(null);
                }}
                onSelectPost={(nextSlug) => {
                  setBlogSlug(nextSlug);
                  setActiveTab('blog-post');
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
            </div>
            {footerColumns.map((column) => (
              <div key={column.title} className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{column.title}</p>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link}>
                      {link === 'Blog' ||
                      link === 'Pricing' ||
                      link === 'Home' ||
                      link === 'NEET Test Prep' ||
                      link === 'NEET PYQ' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (link === 'Blog') goToTab('blog');
                            else if (link === 'Pricing') goToTab('pricing');
                            else if (link === 'Home') goToTab('home');
                            else if (link === 'NEET Test Prep') goToTab('test-prep');
                            else if (link === 'NEET PYQ') goToTab('neet');
                          }}
                          className="text-left text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link}
                        </button>
                      ) : (
                        <a href="#" className="text-muted-foreground transition-colors hover:text-foreground">
                          {link}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-6 border-t border-border pt-8 md:flex-row">
            <p className="text-sm font-medium text-muted-foreground">© 2026 KiwiTeach Learning. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="#" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">Privacy Policy</a>
              <a href="#" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

