
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Shield, 
  BarChart3, 
  FileText, 
  ScanLine, 
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Bird,
  Database,
  Users,
  Layout,
  Monitor,
  GraduationCap,
  Mail,
  Globe,
  MessageSquare,
  Sparkles,
  BookOpen,
  Settings,
  Cpu
} from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
  isLoggedIn?: boolean;
  onDashboardClick?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, isLoggedIn, onDashboardClick }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'test-prep'>('home');

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
      {/* Hero Section */}
      <section className="relative min-h-screen bg-[#0A0F1C] flex items-center justify-center overflow-hidden pt-20">
        {/* Abstract Shapes */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[40vw] h-[40vw] bg-blue-600 rounded-full blur-[120px] opacity-40 -translate-x-1/2" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[40vw] h-[40vw] bg-yellow-500 rounded-full blur-[120px] opacity-30 translate-x-1/2" />
        
        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <motion.h1 variants={itemVariants} className="text-6xl md:text-8xl font-black text-white leading-tight tracking-tight mb-8">
            KiwiTeach: Digital <br /> solutions for Educators
          </motion.h1>
          <motion.p variants={itemVariants} className="text-2xl text-slate-300 font-medium mb-12">
            Your innovative STEM technology partner
          </motion.p>

          <motion.div variants={itemVariants} className="space-y-8">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Choose your KiwiTeach solution</p>
            <div className="flex flex-wrap justify-center gap-4">
              {['LessonPlan', 'ExamPrep', 'FeedbackAI'].map((solution) => (
                <div key={solution} className="bg-white px-8 py-4 rounded-xl flex items-center gap-3 shadow-xl">
                  <span className="font-black text-slate-900">{solution}</span>
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Products Section */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl font-black text-slate-900 mb-4">Our products</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* LessonPlan */}
            <div className="bg-slate-50 rounded-[3rem] p-12 space-y-8 hover:shadow-2xl transition-shadow border border-slate-100">
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-slate-900">LessonPlan</h3>
                <p className="text-blue-600 font-bold">Intelligent lesson editor to design learning experiences</p>
                <p className="text-slate-500 leading-relaxed">
                  The leading lesson planner used worldwide by teachers and professionals. LessonPlan ensures a seamless experience in classroom management, curriculum alignment, and resource integration.
                </p>
              </div>
              <button className="text-blue-600 font-black uppercase tracking-widest text-sm flex items-center gap-2 group">
                More info <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <div className="aspect-video bg-slate-200 rounded-2xl overflow-hidden">
                <img src="https://picsum.photos/seed/lesson/800/450" alt="LessonPlan Interface" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>

            {/* ExamPrep */}
            <div className="bg-slate-50 rounded-[3rem] p-12 space-y-8 hover:shadow-2xl transition-shadow border border-slate-100">
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-slate-900">ExamPrep</h3>
                <p className="text-blue-600 font-bold">Automated assessment generator for STEM subjects</p>
                <p className="text-slate-500 leading-relaxed">
                  Create high-quality tests and quizzes in seconds. Our AI-powered engine selects the best questions to match your syllabus and difficulty requirements.
                </p>
              </div>
              <button 
                onClick={() => setActiveTab('test-prep')}
                className="text-blue-600 font-black uppercase tracking-widest text-sm flex items-center gap-2 group"
              >
                Explore ExamPrep <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <div className="aspect-video bg-slate-200 rounded-2xl overflow-hidden">
                <img src="https://picsum.photos/seed/exam/800/450" alt="ExamPrep Interface" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compatibility Section */}
      <section className="py-32 px-6 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl font-black leading-tight">Where do you want to use KiwiTeach' tools?</h2>
            <p className="text-slate-400 text-lg">
              Compatible with LMS (Learning Management System), HTML tools, XML editors, CMS, and many more custom options.
            </p>
            <div className="flex flex-wrap gap-4">
              {['LMS', 'HTML', 'XML', 'CMS', 'Custom'].map(tag => (
                <span key={tag} className="px-6 py-2 bg-white/10 rounded-full text-sm font-bold border border-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="bg-blue-600/20 absolute inset-0 blur-[100px] rounded-full" />
            <img src="https://picsum.photos/seed/laptop/800/600" alt="KiwiTeach on Laptop" className="relative rounded-3xl shadow-2xl border border-white/10" referrerPolicy="no-referrer" />
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-5xl font-black text-slate-900">Discover why thousands trust KiwiTeach</h2>
          <p className="text-xl text-slate-500">Enjoy 30 days of free access to KiwiTeach for Educators.</p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <button className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20">
              Start your free trial
            </button>
            <button className="bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
              Talk to Sales
            </button>
          </div>
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
      {/* Hero Section */}
      <section className="relative min-h-[90vh] bg-[#0A0F1C] flex items-center overflow-hidden pt-20">
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[30vw] h-[30vw] bg-blue-600 rounded-full blur-[100px] opacity-30 -translate-x-1/2" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[30vw] h-[30vw] bg-yellow-500 rounded-full blur-[100px] opacity-20 translate-x-1/2" />

        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-20 items-center relative z-10">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white/5 rounded-2xl border border-white/10">
              <Cpu className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Institute-Grade Automation</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-white leading-[0.9] tracking-tight">
              The Operating System for <br />
              <span className="text-blue-500">NEET Test Series</span>
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed max-w-xl">
              Empower your coaching institute with AI-driven test generation, OMR evaluation, and deep performance analytics. Built for scale, designed for excellence.
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <button 
                onClick={onLoginClick}
                className="bg-white text-slate-900 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all shadow-2xl active:scale-95"
              >
                Get Started Now
              </button>
              <button className="bg-white/5 text-white border border-white/10 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                View Sample Papers
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="bg-blue-500/10 absolute -inset-10 blur-[80px] rounded-full" />
            <div className="relative bg-white/5 rounded-[3rem] p-4 border border-white/10 backdrop-blur-sm">
              <img src="https://picsum.photos/seed/dashboard/800/600" alt="Exam Prep Dashboard" className="rounded-[2.5rem] shadow-2xl" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-32 px-6 bg-white">
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

      {/* Founders Section */}
      <section className="py-32 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl font-black text-slate-900">Meet the Founders</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 text-center space-y-6">
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

            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 text-center space-y-6">
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

      {/* Final CTA */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-5xl font-black text-slate-900">Ready to upgrade your institute?</h2>
          <button className="bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95">
            Contact Sales for Demo
          </button>
        </div>
      </section>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0A0F1C]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div 
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => setActiveTab('home')}
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                <Bird className="text-slate-900 w-6 h-6" />
              </div>
              <span className="text-xl font-black tracking-tighter text-white">KiwiTeach</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => setActiveTab('home')}
                className={`text-sm font-bold transition-colors ${activeTab === 'home' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Home
              </button>
              <button 
                onClick={() => setActiveTab('test-prep')}
                className={`text-sm font-bold transition-colors ${activeTab === 'test-prep' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Test Prep
              </button>
              {isLoggedIn && (
                <button 
                  onClick={onDashboardClick}
                  className="text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
                >
                  <Layout className="w-4 h-4" />
                  Dashboard
                </button>
              )}
              <button className="text-sm font-bold text-slate-400 hover:text-white transition-colors">
                Contact us
              </button>
            </div>
          </div>
          <button 
            onClick={isLoggedIn ? onDashboardClick : onLoginClick}
            className="bg-white/10 text-white border border-white/20 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-white/20 transition-all"
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Contact us'}
          </button>
        </div>
      </nav>

      <main>
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? renderHome() : renderTestPrep()}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-16 mb-24">
            <div className="lg:col-span-2 space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                  <Bird className="text-slate-900 w-6 h-6" />
                </div>
                <span className="text-2xl font-black tracking-tighter">KiwiTeach</span>
              </div>
              <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
                Empowering STEM education. We build intelligent tools that help educators create, manage, and inspire.
              </p>
            </div>
            
            <div className="space-y-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">KiwiTeach</p>
              <ul className="space-y-4">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">LessonPlan</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">ExamPrep</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">FeedbackAI</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Downloads</a></li>
              </ul>
            </div>

            <div className="space-y-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Solutions</p>
              <ul className="space-y-4">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Education</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Publishing</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Technical writers</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Integrations</a></li>
              </ul>
            </div>

            <div className="space-y-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Company</p>
              <ul className="space-y-4">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">About us</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Partnerships</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-slate-500 text-sm font-bold">© 2026 KiwiTeach. All rights reserved.</p>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="#" className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Cookie Policy</a>
              <a href="#" className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Terms of Use</a>
              <a href="#" className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Privacy Policy</a>
              <a href="#" className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Compliance</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

