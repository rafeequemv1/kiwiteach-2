import '../types';
import React, { useState } from 'react';
import { supabase } from './client';
import { appShellTheme, landingTheme } from '../Landing/theme';

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

interface AuthUIProps {
    onDemoLogin?: () => void;
    onBackHome?: () => void;
    initialMode?: AuthMode;
    recoveryAccessToken?: string | null;
    recoveryRefreshToken?: string | null;
    initialError?: string | null;
}

type SignupRole = 'student' | 'teacher';

const AuthUI: React.FC<AuthUIProps> = ({ onBackHome, initialMode, recoveryAccessToken, recoveryRefreshToken, initialError }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode ?? 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [signupRole, setSignupRole] = useState<SignupRole>('student');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: signupRole,
            },
          },
        });
        if (error) throw error;
        setMessage('Verification email sent! Check your inbox.');
      } else if (mode === 'forgot-password') {
        const redirectTo = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, '');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) throw error;
        setMessage('Password reset link sent to your email!');
      } else if (mode === 'reset-password') {
        if (!recoveryAccessToken || !recoveryRefreshToken) {
          setError('Missing recovery token. Request a new reset link.');
          return;
        }
        const { error: setSessionErr } = await supabase.auth.setSession({
          access_token: recoveryAccessToken,
          refresh_token: recoveryRefreshToken,
        });
        if (setSessionErr) throw setSessionErr;
        const { error: updateErr } = await supabase.auth.updateUser({ password });
        if (updateErr) throw updateErr;
        setMessage('Password updated. You can sign in now.');
        setMode('login');
      }
    } catch (err: any) {
      console.error("Auth Failure Details:", err);
      let errorMsg = err.message || 'Authentication error';
      
      if (errorMsg.toLowerCase().includes('failed to fetch')) {
        errorMsg = 'Network Error: Cannot connect to Supabase. Check if your project is active (not paused) and your internet connection is working.';
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex font-sans"
      style={{ backgroundColor: landingTheme.colors.page }}
    >
      {/* Brand panel — matches homepage dark blue sections */}
      <div
        className="hidden lg:flex lg:w-[44%] xl:w-[40%] flex-col justify-between p-10 xl:p-14 text-white relative overflow-hidden border-r border-white/5"
        style={{ background: appShellTheme.sidebar.gradient }}
      >
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
              <iconify-icon icon="mdi:feather" width="28" className="text-indigo-200" />
            </div>
            <span className="text-2xl font-black tracking-tight">KiwiTeach</span>
          </div>
          <h2 className={`${landingTheme.fonts.heading} text-4xl xl:text-5xl leading-[1.05] text-white mb-6`}>
            Reclaim your time.
            <br />
            <span className="text-indigo-300">Reignite teaching.</span>
          </h2>
          <p className="text-indigo-100/80 text-lg max-w-md leading-relaxed">
            Sign in to your workspace — lesson plans, assessments, and insights in one place.
          </p>
        </div>
        <p className="relative z-10 text-[11px] font-bold text-indigo-300/60 uppercase tracking-[0.2em]">
          Integrated assessment engine
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div
          className="w-full max-w-md bg-white rounded-[2rem] overflow-hidden border flex flex-col animate-slide-up pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          style={{
            borderColor: landingTheme.colors.borderSoft,
            boxShadow: landingTheme.shadow.card,
          }}
        >
          <div className="p-8 sm:p-10">
            {(onBackHome || mode !== 'login') && (
              <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                {onBackHome && (
                  <button
                    type="button"
                    onClick={onBackHome}
                    className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <iconify-icon icon="mdi:arrow-left" />
                    Back to Home
                  </button>
                )}
                {mode !== 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setMessage(null);
                    }}
                    className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <iconify-icon icon="mdi:arrow-left" />
                    Back to Sign In
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-indigo-200"
                style={{ background: appShellTheme.sidebar.gradient }}
              >
                <iconify-icon icon="mdi:feather" width="28" className="text-indigo-100" />
              </div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">KiwiTeach</h1>
            </div>

            <div className="hidden lg:flex flex-col items-center mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {mode === 'login' ? 'Identity Verification' : mode === 'signup' ? 'Enroll in Platform' : 'Reset Credentials'}
              </p>
            </div>
            <div className="lg:hidden text-center mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {mode === 'login' ? 'Identity Verification' : mode === 'signup' ? 'Enroll in Platform' : 'Reset Credentials'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {mode !== 'reset-password' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-400 focus:bg-white text-slate-900 rounded-2xl px-5 py-4 outline-none font-bold text-sm transition-all placeholder:text-slate-300"
                    placeholder="you@school.edu"
                  />
                </div>
              )}

              {mode !== 'forgot-password' && (
                <div>
                  <div className="flex justify-between items-center mb-2 px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {mode === 'reset-password' ? 'New password' : 'Password'}
                    </label>
                    {mode === 'login' && (
                      <button 
                        type="button"
                        onClick={() => { setMode('forgot-password'); setError(null); setMessage(null); }}
                        className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-400 focus:bg-white text-slate-900 rounded-2xl px-5 py-4 outline-none font-bold text-sm transition-all placeholder:text-slate-300"
                    placeholder="••••••••"
                  />
                  {mode === 'reset-password' && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      If this link is expired or already used, request a fresh reset link.
                    </p>
                  )}
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">I am signing up as</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSignupRole('student')}
                      className={`py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        signupRole === 'student'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole('teacher')}
                      className={`py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        signupRole === 'teacher'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      Teacher
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-rose-50 text-rose-600 text-[11px] font-bold p-4 rounded-2xl border border-rose-100 animate-fade-in leading-relaxed">
                  <iconify-icon icon="mdi:alert-circle" className="mr-2"></iconify-icon>
                  {error}
                  {error.includes("Invalid login credentials") && mode === 'login' && (
                      <div className="mt-2 pt-2 border-t border-rose-200">
                          <p className="font-normal">New here? Switch to <span className="font-bold underline cursor-pointer" onClick={() => setMode('signup')}>Sign Up</span> or use Demo mode below.</p>
                      </div>
                  )}
                </div>
              )}

              {message && (
                <div className="bg-emerald-50 text-emerald-600 text-[11px] font-bold p-4 rounded-2xl border border-emerald-100 animate-fade-in">
                  <iconify-icon icon="mdi:check-circle" className="mr-2"></iconify-icon>
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-2xl py-4 transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs min-h-[56px] ${appShellTheme.button.primary}`}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-indigo-200/60 border-t-indigo-700 rounded-full animate-spin"></div>
                ) : (
                  mode === 'login'
                    ? 'Sign In'
                    : mode === 'signup'
                      ? 'Sign Up'
                      : mode === 'reset-password'
                        ? 'Update Password'
                        : 'Send Reset Link'
                )}
              </button>

            </form>

            <div className="mt-10 text-center pt-8 border-t border-slate-100 space-y-4">
              {mode === 'forgot-password' ? (
                <button
                  onClick={() => { setMode('login'); setError(null); setMessage(null); }}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-700 transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                  <iconify-icon icon="mdi:arrow-left" />
                  Return to Log In
                </button>
              ) : (
                <button
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null); }}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                >
                  {mode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthUI;
