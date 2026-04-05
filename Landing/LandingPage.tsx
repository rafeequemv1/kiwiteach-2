
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle2, Layout, Menu, Sparkles, X } from 'lucide-react';
import { KiwiTeachLogoMark } from './KiwiTeachLogoMark';
import { LandingHowItWorksSection } from './LandingHowItWorksSection';
import { BlogArticlePage, BlogIndexPage } from '../Blog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PricingPage from '../src/pages/PricingPage';
import {
  footerColumns,
  homePills,
  landingNavLinks,
  landingTheme,
  LANDING_HERO_OUTCOME,
  LANDING_ICP_LINE,
} from './theme';
import { LandingSeoHelmet } from './LandingSeoHelmet';
import NeetPyqSection from './NeetPyqSection';

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

  const goToTab = (tabId: string) => {
    setBlogSlug(null);
    if (tabId === 'test-prep') setActiveTab('test-prep');
    else if (tabId === 'blog') setActiveTab('blog');
    else if (tabId === 'pricing') setActiveTab('pricing');
    else if (tabId === 'neet') setActiveTab('neet');
    else setActiveTab('home');
    setNavDrawerOpen(false);
  };

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
        className="relative border-b border-border bg-gradient-to-br from-muted/80 via-background to-muted/40 px-4 pb-16 pt-32 md:px-6 md:pb-24 md:pt-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: landingTheme.gradients.glow }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div className="space-y-7">
            <Badge variant="outline" className="h-auto max-w-full flex-wrap gap-1.5 border-border/80 bg-background/80 px-3 py-2 text-[10px] font-semibold uppercase leading-snug tracking-wider text-muted-foreground shadow-sm backdrop-blur-sm sm:text-[11px]">
              <Sparkles className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
              <span>For NEET &amp; board-science teachers</span>
            </Badge>
            <h1 className="font-heading text-4xl font-semibold leading-[0.98] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              From syllabus to
              <br />
              <span className="text-emerald-600">exam-ready tests</span>
              <br />
              <span className="text-foreground/90">in minutes.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Stop hand-building every MCQ. Generate balanced, syllabus-linked practice sets, run them online or on paper, and get your batch exam-sharp—without losing your evenings.
            </p>
            <p className="max-w-xl text-sm font-medium text-muted-foreground">{LANDING_ICP_LINE}</p>
            <div className="flex flex-wrap gap-2">
              {homePills.map((pill) => (
                <Badge
                  key={pill}
                  variant="secondary"
                  className="h-auto gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-foreground"
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
            <Card className="overflow-hidden border-border/80 bg-card/95 p-3 shadow-md backdrop-blur-sm">
              <CardContent className="p-0">
                <img
                  src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80"
                  alt="Teacher working with students in a classroom"
                  className="h-[280px] w-full rounded-xl object-cover md:h-[420px]"
                  referrerPolicy="no-referrer"
                />
              </CardContent>
            </Card>
            <Card className="absolute bottom-5 left-4 right-4 flex flex-row items-center gap-3 border-border bg-card/95 px-4 py-3 shadow-md backdrop-blur-sm sm:left-8 sm:right-auto sm:max-w-sm">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700">
                <Sparkles className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">Practice test assembled</p>
                <p className="truncate text-xs text-muted-foreground">Chapters + difficulty mix — ready to assign</p>
              </div>
            </Card>
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
            <p className="mx-auto mb-9 mt-5 max-w-3xl text-lg text-primary-foreground/80 md:text-xl">
              Your goal is simple: {LANDING_HERO_OUTCOME.toLowerCase()}. Start free and run your next practice paper from
              KiwiTeach.
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
            <p className="mt-5 text-sm text-primary-foreground/65">No credit card to try. Free tier available.</p>
          </CardContent>
        </Card>
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
      <section className="relative flex min-h-[90vh] items-center overflow-hidden border-b border-border pt-28 md:pt-20" style={{ background: landingTheme.gradients.testPrepHero }}>
        <div className="absolute top-1/2 left-0 h-[30vw] w-[30vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/30 blur-[110px]" />
        <div className="absolute top-1/2 right-0 h-[30vw] w-[30vw] translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-[110px]" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2 lg:gap-20">
          <div className="space-y-10">
            <Badge variant="outline" className="h-auto gap-2 border-white/25 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
              <Sparkles className="size-3.5 text-indigo-200" aria-hidden />
              For teachers who run mocks
            </Badge>
            <h1 className="font-heading text-4xl font-semibold leading-[0.95] tracking-tight text-white md:text-6xl lg:text-7xl">
              Full-length tests
              <br />
              <span className="text-indigo-300">without the weekend</span>
            </h1>
            <p className="max-w-xl text-xl leading-relaxed text-white/70">
              Same primary job as the home page: ship papers your NEET batch can sit for—balanced difficulty, syllabus-faithful items, online or print—without losing your Friday night to formatting.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Button
                size="lg"
                variant="secondary"
                className="h-12 rounded-lg px-8 text-base font-semibold"
                onClick={onLoginClick}
              >
                Get started
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-lg border-white/25 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
                onClick={() => goToTab('neet')}
              >
                NEET &amp; PYQs
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-10 rounded-full bg-indigo-500/15 blur-[80px]" />
            <Card className="relative overflow-hidden border-white/15 bg-white/10 p-4 shadow-lg backdrop-blur-sm">
              <CardContent className="p-0">
                <img
                  src="https://picsum.photos/seed/dashboard/800/600"
                  alt="Exam Prep Dashboard"
                  className="rounded-xl"
                  referrerPolicy="no-referrer"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-muted/30 px-4 py-20 md:px-6 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center md:mb-24">
            <Badge variant="secondary" className="mb-4">
              Workflow
            </Badge>
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              How you ship a test
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Two decisions teachers already make—what you taught, how hard it should feel—then KiwiTeach does the heavy lifting.
            </p>
          </div>

          <div className="space-y-12 md:space-y-16">
            <Card className="overflow-hidden border-border/80 shadow-sm">
              <div className="grid items-stretch lg:grid-cols-2">
                <div className="aspect-video bg-muted lg:aspect-auto lg:min-h-[280px]">
                  <img src="https://picsum.photos/seed/step1/800/450" alt="Select chapters for a test" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <CardHeader className="justify-center border-t border-border p-8 lg:border-l lg:border-t-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 01</p>
                  <CardTitle className="mt-2 font-heading text-2xl md:text-3xl">Anchor to what you taught</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    Pick chapters and topics from your syllabus-aligned bank so every item matches this week&apos;s board—not a generic PDF from three years ago.
                  </CardDescription>
                </CardHeader>
              </div>
            </Card>

            <Card className="overflow-hidden border-border/80 shadow-sm">
              <div className="grid items-stretch lg:grid-cols-2">
                <CardHeader className="order-2 justify-center border-t border-border p-8 lg:order-1 lg:border-r lg:border-t-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 02</p>
                  <CardTitle className="mt-2 font-heading text-2xl md:text-3xl">Dial the difficulty mix</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    Set Easy, Medium, and Hard counts (or ratios) so the paper feels fair for <em>this</em> batch—then generate in one pass.
                  </CardDescription>
                </CardHeader>
                <div className="order-1 aspect-video bg-muted lg:order-2 lg:aspect-auto lg:min-h-[280px]">
                  <img src="https://picsum.photos/seed/step2/800/450" alt="Difficulty mix for a test" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background px-4 py-20 md:px-6 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Meet the founders</h2>
          </div>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 md:gap-8">
            <Card className="border-border/80 text-center shadow-sm">
              <CardContent className="space-y-6 p-8 md:p-10">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
                  <img src="https://picsum.photos/seed/rafeeque/200/200" alt="Rafeeque Mavoor" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h4 className="font-heading text-xl font-semibold text-foreground">Rafeeque Mavoor</h4>
                  <p className="mt-1 text-sm font-medium text-primary">CEO &amp; Co-founder</p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  IISER Thiruvananthapuram alumni. Building KiwiTeach so teachers spend less time inventing questions and more time moving students forward.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/80 text-center shadow-sm">
              <CardContent className="space-y-6 p-8 md:p-10">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
                  <img src="https://picsum.photos/seed/favaz/200/200" alt="Favaz Ahammed" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
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

      <section className="bg-muted/30 px-4 py-20 md:px-6 md:py-32">
        <Card className="mx-auto max-w-4xl border-border/80 text-center shadow-md">
          <CardContent className="space-y-6 p-8 md:p-12">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Teach the batch. We&apos;ll help with the paper.
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">{LANDING_ICP_LINE}</p>
            <Button size="lg" className="h-12 rounded-lg px-10 text-base font-semibold" onClick={onLoginClick}>
              Start building tests
            </Button>
          </CardContent>
        </Card>
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
            NEET
          </Badge>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Practice that matches the exam you&apos;re training for
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            For teachers: align drills and full papers with NEET-style rigour using the same question workflows as the rest of KiwiTeach—PYQs, syllabus filters, and batches you already manage.
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
    <div className="theme min-h-screen bg-muted/40 font-sans text-foreground antialiased selection:bg-primary/15 selection:text-foreground">
      <LandingSeoHelmet activeTab={activeTab} />
      {/* Navigation — logo left; page links live in hamburger drawer on all breakpoints */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex min-h-[3.75rem] w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4 md:px-6 py-2">
          <div
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 sm:gap-3"
            onClick={() => {
              setActiveTab('home');
              setBlogSlug(null);
            }}
          >
            <KiwiTeachLogoMark decorative className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              KiwiTeach
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-2.5 sm:text-sm"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={onSignUpClick}
                  className="shrink-0 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted sm:px-2.5 sm:text-sm"
                  style={{ borderColor: `${landingTheme.colors.navySoft}40` }}
                >
                  Sign up
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
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted sm:h-11 sm:w-11"
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
              className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
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
              className="fixed right-0 top-0 z-[61] flex h-full w-[min(22rem,calc(100vw-1rem))] max-w-md flex-col border-l border-border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 pb-10">
                {landingNavLinks.map((link) => {
                  const isActive =
                    (link.id === 'home' && activeTab === 'home') ||
                    (link.id === 'neet' && activeTab === 'neet') ||
                    (link.id === 'test-prep' && activeTab === 'test-prep') ||
                    (link.id === 'pricing' && activeTab === 'pricing') ||
                    (link.id === 'blog' && (activeTab === 'blog' || activeTab === 'blog-post'));
                  return (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => goToTab(link.id)}
                      className={`rounded-lg px-4 py-3.5 text-left text-base font-medium transition-colors ${
                        isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
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
              <p className="max-w-sm text-lg leading-relaxed text-muted-foreground">
                {LANDING_ICP_LINE} One promise: {LANDING_HERO_OUTCOME.toLowerCase()}—stay with students, not spreadsheets.
              </p>
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
                      link === 'NEET' ||
                      link === 'Test prep' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (link === 'Blog') goToTab('blog');
                            else if (link === 'Pricing') goToTab('pricing');
                            else if (link === 'Home') goToTab('home');
                            else if (link === 'NEET') goToTab('neet');
                            else if (link === 'Test prep') goToTab('test-prep');
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

