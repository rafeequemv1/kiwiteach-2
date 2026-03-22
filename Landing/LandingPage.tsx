
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Bird, CheckCircle2, Layout, Menu, Sparkles, X } from 'lucide-react';
import { BlogArticlePage, BlogIndexPage } from '../Blog';
import { footerColumns, homePills, landingNavLinks, landingTheme } from './theme';

type LandingTab = 'home' | 'test-prep' | 'blog' | 'blog-post';

interface LandingPageProps {
  onLoginClick: () => void;
  isLoggedIn?: boolean;
  onDashboardClick?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, isLoggedIn, onDashboardClick }) => {
  const [activeTab, setActiveTab] = useState<LandingTab>('home');
  const [blogSlug, setBlogSlug] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        className="relative pt-24 md:pt-28 pb-16 md:pb-24 px-4 md:px-6 border-b border-black/5"
        style={{ background: landingTheme.gradients.hero }}
      >
        <div className="absolute inset-0 opacity-60" style={{ background: landingTheme.gradients.glow }} />
        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-white text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="w-4 h-4 text-teal-500" />
              Building tools to enable teachers
            </div>
            <h1 className={`${landingTheme.fonts.heading} text-4xl md:text-7xl leading-[0.95] text-slate-900`}>
              Reclaim Your Time.
              <br />
              <span className="text-teal-500">Reignite Teaching.</span>
            </h1>
            <p className={`${landingTheme.fonts.body} text-lg max-w-xl text-slate-600 leading-relaxed`}>
              We build intelligent tools that help educators create lesson plans, automate exam prep, and deliver feedback in a fraction of the time.
            </p>
            <div className="flex flex-wrap gap-3">
              {homePills.map((pill) => (
                <span key={pill} className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                  {pill}
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                </span>
              ))}
            </div>
            <button
              onClick={isLoggedIn ? onDashboardClick : onLoginClick}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-white font-black active:scale-95 transition-transform"
              style={{ background: landingTheme.colors.navy }}
            >
              Start For Free <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-white/70 p-3 bg-white/80 backdrop-blur" style={{ boxShadow: landingTheme.shadow.card }}>
              <img
                src="https://images.unsplash.com/photo-1516534775068-ba3e7458af70?auto=format&fit=crop&w=1200&q=80"
                alt="Teacher teaching in class"
                className="rounded-[1.6rem] h-[280px] md:h-[420px] w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute left-8 bottom-5 bg-white/95 rounded-2xl border border-slate-200 px-5 py-3 flex items-center gap-3" style={{ boxShadow: landingTheme.shadow.soft }}>
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 grid place-items-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">Lesson Plan Generated</p>
                <p className="text-xs text-slate-500">Saved 2 hours of prep time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 md:py-24 px-4 md:px-6" style={{ background: landingTheme.gradients.darkPanel }}>
        <div className="max-w-5xl mx-auto text-center mb-10">
          <h2 className={`${landingTheme.fonts.heading} text-3xl md:text-5xl text-white`}>
            Your Classroom <span className="text-teal-400">Command Center</span>
          </h2>
          <p className="text-slate-300 mt-4 text-xl">
            See how easy it is to turn a simple idea into a complete, ready-to-teach lesson in seconds.
          </p>
        </div>
        <div className="max-w-5xl mx-auto rounded-[2rem] border border-white/10 bg-[#0f1b37]/70 p-4" style={{ boxShadow: landingTheme.shadow.card }}>
          <img
            src="https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1400&q=80"
            alt="Classroom dashboard visual"
            className="rounded-[1.5rem] w-full h-[240px] md:h-[420px] object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>

      <section className="py-16 md:py-24 px-4 md:px-6 bg-white">
        <div className="max-w-5xl mx-auto rounded-[2.1rem] px-8 py-16 text-center border border-slate-200" style={{ background: landingTheme.gradients.darkPanel, boxShadow: landingTheme.shadow.card }}>
          <h3 className={`${landingTheme.fonts.heading} text-3xl md:text-6xl leading-tight text-white`}>
            Ready to transform your
            <br />
            <span className="text-yellow-400">classroom?</span>
          </h3>
          <p className="text-slate-300 text-2xl mt-5 mb-9 max-w-3xl mx-auto">
            Join thousands of teachers who are reclaiming their time and focusing on what matters most.
          </p>
          <button
            onClick={isLoggedIn ? onDashboardClick : onLoginClick}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full font-black text-white active:scale-95 transition-transform"
            style={{ background: landingTheme.gradients.button }}
          >
            Start Saving Time <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-slate-400 text-sm mt-5">No credit card required. Free forever plan available.</p>
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
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-20" style={{ background: landingTheme.gradients.testPrepHero }}>
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[30vw] h-[30vw] bg-blue-400 rounded-full blur-[110px] opacity-30 -translate-x-1/2" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[30vw] h-[30vw] bg-cyan-400 rounded-full blur-[110px] opacity-20 translate-x-1/2" />

        <div className="max-w-7xl mx-auto px-4 md:px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white/5 rounded-2xl border border-white/10">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Institute-Grade Automation</span>
            </div>
            <h1 className="text-4xl md:text-7xl font-black text-white leading-[0.9] tracking-tight">
              The Operating System for <br />
              <span className="text-blue-500">NEET Test Series</span>
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed max-w-xl">
              Empower your coaching institute with AI-driven test generation, OMR evaluation, and deep performance analytics. Built for scale, designed for excellence.
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <button 
                onClick={onLoginClick}
                className="bg-white text-slate-900 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all active:scale-95"
              >
                Get Started Now
              </button>
              <button className="bg-white/5 text-white border border-white/10 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                View Sample Papers
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="bg-blue-400/20 absolute -inset-10 blur-[80px] rounded-full" />
            <div className="relative bg-white/5 rounded-[3rem] p-4 border border-white/10 backdrop-blur-sm">
              <img src="https://picsum.photos/seed/dashboard/800/600" alt="Exam Prep Dashboard" className="rounded-[2.5rem]" style={{ boxShadow: landingTheme.shadow.card }} referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 md:py-32 px-4 md:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl font-black text-slate-900">How it Works</h2>
            <div className="w-20 h-1.5 bg-blue-600 mx-auto mt-6 rounded-full" />
          </div>

          <div className="space-y-32">
            {/* Step 1 */}
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="aspect-video bg-slate-100 rounded-[3rem] overflow-hidden">
                <img src="https://picsum.photos/seed/step1/800/450" alt="Syllabus Selection" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="space-y-6">
                <p className="text-blue-600 font-black uppercase tracking-widest text-sm">Step 01</p>
                <h3 className="text-4xl font-black text-slate-900">Syllabus Selection</h3>
                <p className="text-slate-500 text-lg leading-relaxed">
                  Choose your target exam and specific chapters from our exhaustive NCERT-aligned question bank.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-6 lg:order-1 order-2">
                <p className="text-blue-600 font-black uppercase tracking-widest text-sm">Step 02</p>
                <h3 className="text-4xl font-black text-slate-900">Difficulty Balancing</h3>
                <p className="text-slate-500 text-lg leading-relaxed">
                  Set exact percentages for Easy, Medium, and Hard questions to match your batch's level.
                </p>
              </div>
              <div className="aspect-video bg-slate-100 rounded-[3rem] overflow-hidden lg:order-2 order-1">
                <img src="https://picsum.photos/seed/step2/800/450" alt="Difficulty Balancing" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-32 px-4 md:px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl font-black text-slate-900">Meet the Founders</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 text-center space-y-6" style={{ boxShadow: landingTheme.shadow.soft }}>
              <div className="w-32 h-32 bg-slate-200 rounded-full mx-auto overflow-hidden">
                <img src="https://picsum.photos/seed/rafeeque/200/200" alt="Rafeeque Mavoor" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900">Rafeeque Mavoor</h4>
                <p className="text-blue-600 font-bold">CEO & Co-founder</p>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                IISER Thiruvananthapuram Alumni. Passionate about transforming education through technology.
              </p>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 text-center space-y-6" style={{ boxShadow: landingTheme.shadow.soft }}>
              <div className="w-32 h-32 bg-slate-200 rounded-full mx-auto overflow-hidden">
                <img src="https://picsum.photos/seed/favaz/200/200" alt="Favaz Ahammed" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900">Favaz Ahammed</h4>
                <p className="text-blue-600 font-bold">CTO & Co-founder</p>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                IISER Pune Alumni. Expert in AI and machine learning with a focus on educational tools.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-32 px-4 md:px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-5xl font-black text-slate-900">Ready to upgrade your institute?</h2>
          <button className="bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95">
            Contact Sales for Demo
          </button>
        </div>
      </section>
    </motion.div>
  );

  return (
    <div
      className="min-h-screen text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900"
      style={{ backgroundColor: landingTheme.colors.page }}
    >
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div 
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => { setActiveTab('home'); setBlogSlug(null); setMobileMenuOpen(false); }}
            >
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <Bird className="text-slate-900 w-6 h-6" />
              </div>
              <span className="text-xl font-black tracking-tighter text-slate-900">KiwiTeach</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              {landingNavLinks.map((link) => {
                const isActive =
                  (link.id === 'home' && activeTab === 'home') ||
                  (link.id === 'test-prep' && activeTab === 'test-prep');
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => {
                      setBlogSlug(null);
                      setActiveTab(link.id === 'test-prep' ? 'test-prep' : 'home');
                    }}
                    className={`text-sm font-bold transition-colors ${isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    {link.label}
                  </button>
                );
              })}
              {isLoggedIn && (
                <button 
                  onClick={onDashboardClick}
                  className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-2"
                >
                  <Layout className="w-4 h-4" />
                  Dashboard
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={isLoggedIn ? onDashboardClick : onLoginClick}
              className="hidden md:inline-flex text-white border px-6 py-2.5 rounded-full text-sm font-bold transition-all"
              style={{ backgroundColor: landingTheme.colors.navy, borderColor: landingTheme.colors.navySoft }}
            >
              {isLoggedIn ? 'Go to Dashboard' : 'Get Started'}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 grid place-items-center"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
            {landingNavLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setBlogSlug(null);
                  setActiveTab(link.id === 'test-prep' ? 'test-prep' : 'home');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </button>
            ))}
            {isLoggedIn && onDashboardClick && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onDashboardClick();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 flex items-center gap-2"
              >
                <Layout className="w-4 h-4 shrink-0" />
                Dashboard
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                isLoggedIn ? onDashboardClick?.() : onLoginClick();
              }}
              className="w-full text-center px-3 py-2 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: landingTheme.colors.navy }}
            >
              {isLoggedIn ? 'Go to Dashboard' : 'Get Started'}
            </button>
          </div>
        )}
      </nav>

      <main>
        <AnimatePresence mode="wait">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'test-prep' && renderTestPrep()}
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-white text-slate-900 pt-24 pb-10 px-6 border-t border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-14 mb-16">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Bird className="text-slate-900 w-6 h-6" />
                </div>
                <span className="text-2xl font-black tracking-tighter">KiwiTeach</span>
              </div>
              <p className="text-slate-500 text-lg leading-relaxed max-w-sm">
                Empowering educators with AI-driven tools to create, manage, and inspire. Reclaim your time and reignite your passion for teaching.
              </p>
            </div>
            {footerColumns.map((column) => (
              <div key={column.title} className="space-y-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">{column.title}</p>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link}>
                      {link === 'Blog' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBlogSlug(null);
                            setActiveTab('blog');
                          }}
                          className="text-slate-600 hover:text-slate-900 transition-colors text-left"
                        >
                          {link}
                        </button>
                      ) : (
                        <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors">{link}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-slate-400 text-sm font-bold">© 2026 KiwiTeach Learning. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="#" className="text-slate-400 hover:text-slate-900 text-xs font-bold uppercase tracking-widest transition-colors">Privacy Policy</a>
              <a href="#" className="text-slate-400 hover:text-slate-900 text-xs font-bold uppercase tracking-widest transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

