import '../types';
import React, { useState } from 'react';
import { supabase } from './client';
import { landingTheme } from '../Landing/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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

const AuthUI: React.FC<AuthUIProps> = ({
  onBackHome,
  initialMode,
  recoveryAccessToken,
  recoveryRefreshToken,
  initialError,
}) => {
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
            data: { role: signupRole },
          },
        });
        if (error) throw error;
        setMessage('Verification email sent! Check your inbox.');
      } else if (mode === 'forgot-password') {
        const redirectTo = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, '');
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
    } catch (err: unknown) {
      console.error('Auth Failure Details:', err);
      let errorMsg = err instanceof Error ? err.message : 'Authentication error';

      if (errorMsg.toLowerCase().includes('failed to fetch')) {
        errorMsg =
          'Network error: cannot reach Supabase. Check the project is active and your connection.';
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const modeTitle =
    mode === 'login'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'forgot-password'
          ? 'Reset password'
          : 'New password';

  const modeDescription =
    mode === 'login'
      ? 'Enter your email to access your workspace.'
      : mode === 'signup'
        ? 'Start with a student or teacher account.'
        : mode === 'forgot-password'
          ? 'We will email you a reset link.'
          : 'Choose a new password for your account.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50/50 via-[#f5f6fb] to-indigo-50/40 p-4 font-sans">
      <Card
        size="sm"
        className={cn(
          'w-full max-w-[360px] overflow-hidden shadow-md',
          mode === 'signup'
            ? 'ring-2 ring-teal-400/30 shadow-[0_12px_40px_-12px_rgba(20,180,160,0.35)]'
            : 'ring-1 ring-zinc-200/80'
        )}
      >
        <CardHeader
          className={cn(
            'space-y-1 border-b pb-3',
            mode === 'signup'
              ? 'border-teal-200/50 bg-gradient-to-br from-teal-50/95 via-white to-indigo-50/40'
              : 'border-border/60'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle
                className={cn('text-base', mode === 'signup' && 'bg-gradient-to-r from-teal-700 to-indigo-800 bg-clip-text text-transparent')}
              >
                {modeTitle}
              </CardTitle>
              <CardDescription className="text-xs leading-snug">{modeDescription}</CardDescription>
            </div>
            {onBackHome && (
              <Button type="button" variant="ghost" size="xs" className="-mt-1 -mr-1 h-7 px-2 text-xs" onClick={onBackHome}>
                Home
              </Button>
            )}
          </div>
          {mode !== 'login' && mode !== 'signup' && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 w-fit px-2 text-xs text-muted-foreground"
              onClick={() => {
                setMode('login');
                setError(null);
                setMessage(null);
              }}
            >
              ← Back to sign in
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleAuth} className="space-y-3">
            {mode !== 'reset-password' && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  className="h-9"
                />
              </div>
            )}

            {mode !== 'forgot-password' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auth-password" className="text-xs text-muted-foreground">
                    {mode === 'reset-password' ? 'New password' : 'Password'}
                  </Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setMode('forgot-password');
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <Input
                  id="auth-password"
                  type="password"
                  required
                  autoComplete={mode === 'reset-password' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9"
                />
                {mode === 'reset-password' && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    If this link expired, request a fresh reset email.
                  </p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-teal-900/80">I am a</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['student', 'teacher'] as const).map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-8 border-2 text-xs font-medium capitalize transition-all',
                        signupRole === role
                          ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-sm ring-1 ring-teal-400/40'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:border-teal-200 hover:bg-teal-50/50'
                      )}
                      onClick={() => setSignupRole(role)}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div
                className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                {error}
                {error.includes('Invalid login credentials') && mode === 'login' && (
                  <p className="mt-2 border-t border-destructive/20 pt-2 font-normal text-destructive/90">
                    New here?{' '}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => {
                        setMode('signup');
                        setError(null);
                      }}
                    >
                      Sign up
                    </button>
                  </p>
                )}
              </div>
            )}

            {message && (
              <div className="rounded-md border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {message}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className={cn(
                'h-9 w-full text-sm font-medium',
                mode === 'signup' && 'border-0 text-white shadow-md hover:opacity-95',
                mode === 'login' && 'border-0 text-white shadow-sm hover:opacity-95'
              )}
              style={
                mode === 'signup'
                  ? { background: landingTheme.gradients.button }
                  : mode === 'login'
                    ? { backgroundColor: landingTheme.colors.navy }
                    : undefined
              }
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Please wait
                </span>
              ) : mode === 'login' ? (
                'Sign in'
              ) : mode === 'signup' ? (
                'Sign up'
              ) : mode === 'reset-password' ? (
                'Update password'
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter
          className={cn(
            'flex flex-col gap-2 border-t py-3',
            mode === 'signup' ? 'border-teal-100/80 bg-teal-50/20' : 'border-border/60'
          )}
        >
          {mode === 'signup' && (
            <Button
              type="button"
              variant="link"
              className="h-auto py-0 text-xs font-medium text-teal-700 underline-offset-4 hover:text-teal-900"
              onClick={() => {
                setMode('forgot-password');
                setError(null);
                setMessage(null);
              }}
            >
              Forgot password?
            </Button>
          )}
          {mode === 'forgot-password' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => {
                setMode('login');
                setError(null);
                setMessage(null);
              }}
            >
              Return to sign in
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs text-muted-foreground"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
                setMessage(null);
              }}
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthUI;
