import '../types';
import React, { useState } from 'react';
import { supabase } from './client';

interface AuthUIProps {
    onDemoLogin?: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot-password';

const AuthUI: React.FC<AuthUIProps> = ({ onDemoLogin }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Verification email sent! Check your inbox.');
      } else if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage('Password reset link sent to your email!');
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-slide-up">
        
        <div className="p-10">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-600/20 transform -rotate-6">
              <iconify-icon icon="mdi:feather" width="32"></iconify-icon>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">KiwiTeach</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">
              {mode === 'login' ? 'Identity Verification' : mode === 'signup' ? 'Enroll in Platform' : 'Reset Credentials'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Domain</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 focus:bg-white text-slate-900 rounded-2xl px-5 py-4 outline-none font-bold text-sm transition-all placeholder:text-slate-300"
                placeholder="rebecca@kiwiteach.com"
              />
            </div>

            {mode !== 'forgot-password' && (
              <div>
                <div className="flex justify-between items-center mb-2 px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secure Passkey</label>
                  {mode === 'login' && (
                    <button 
                      type="button"
                      onClick={() => { setMode('forgot-password'); setError(null); setMessage(null); }}
                      className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
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
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 focus:bg-white text-slate-900 rounded-2xl px-5 py-4 outline-none font-bold text-sm transition-all placeholder:text-slate-300"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && (
              <div className="bg-rose-50 text-rose-600 text-[11px] font-bold p-4 rounded-2xl border border-rose-100 animate-fade-in leading-relaxed">
                <iconify-icon icon="mdi:alert-circle" className="mr-2"></iconify-icon>
                {error}
                {error.includes("Invalid login credentials") && mode === 'login' && (
                    <div className="mt-2 pt-2 border-t border-rose-200">
                        <p className="font-normal">New here? Toggle to <span className="font-bold underline cursor-pointer" onClick={() => setMode('signup')}>Join System</span> or use Demo mode below.</p>
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
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs min-h-[56px]"
            >
              {loading ? (
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Join System' : 'Send Reset Link'
              )}
            </button>

            {onDemoLogin && mode !== 'forgot-password' && (
                <button
                    type="button"
                    onClick={onDemoLogin}
                    className="w-full bg-indigo-50 text-indigo-700 font-bold py-3 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center justify-center gap-2"
                >
                    <iconify-icon icon="mdi:eye-outline" />
                    Bypass to Demo Access
                </button>
            )}
          </form>

          <div className="mt-10 text-center pt-8 border-t border-slate-50 space-y-4">
            {mode === 'forgot-password' ? (
              <button
                onClick={() => { setMode('login'); setError(null); setMessage(null); }}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                <iconify-icon icon="mdi:arrow-left" />
                Return to Log In
              </button>
            ) : (
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null); }}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
              >
                {mode === 'login' ? "Generate New Account?" : "Return to Log In?"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthUI;