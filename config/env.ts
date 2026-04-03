/**
 * Environment variables for the Vite client bundle.
 * - Local: copy `.env.example` → `.env` and fill values (gitignored).
 * - Vercel: Project → Settings → Environment Variables (Production / Preview as needed).
 *
 * Only `VITE_*` variables are exposed to the browser by Vite.
 */

function trimOrEmpty(v: string | undefined): string {
  return (v ?? '').trim();
}

/**
 * When `npm run dev` runs without `.env`, use the same Supabase project that was
 * previously hardcoded so the app does not white-screen. Production / `vite build`
 * still requires `VITE_SUPABASE_*` (e.g. on Vercel).
 *
 * Anon key is public to the browser by design; real protection is RLS.
 */
const DEV_FALLBACK_SUPABASE_URL = 'https://vxryarparkhmhzrqdskm.supabase.co';
const DEV_FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4cnlhcnBhcmtobWh6cnFkc2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2ODA3MTgsImV4cCI6MjA4MjI1NjcxOH0.c9hKp97rff6ypQN0XpHGPwkr1M6AcnDsMR9X9Z51hWs';

let devSupabaseFallbackLogged = false;

function logDevSupabaseFallbackOnce(): void {
  if (import.meta.env.DEV && !devSupabaseFallbackLogged) {
    devSupabaseFallbackLogged = true;
    console.warn(
      '[Kiwiteach] Supabase: using dev defaults (no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env). ' +
        'Copy .env.example → .env to override or to match production.'
    );
  }
}

/**
 * Legacy: Gemini used to run in the browser via VITE_* keys.
 * Production AI calls go through `/api/gemini` with `GEMINI_API_KEY` on the server only.
 */
export function getGeminiApiKey(): string {
  return (
    trimOrEmpty(import.meta.env.VITE_GEMINI_API_KEY) ||
    trimOrEmpty(import.meta.env.VITE_GOOGLE_GENAI_API_KEY) ||
    trimOrEmpty(import.meta.env.VITE_GEMINI_KEY) ||
    trimOrEmpty(import.meta.env.VITE_API_KEY)
  );
}

/** @deprecated Use server `/api/gemini`; client code should not rely on a browser Gemini key. */
export function assertGeminiApiKey(): string {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error(
      'No client Gemini key (expected). AI is configured on the server: set GEMINI_API_KEY in Vercel (or use vercel dev with .env).'
    );
  }
  return key;
}

export function getSupabaseUrl(): string {
  const url = trimOrEmpty(import.meta.env.VITE_SUPABASE_URL);
  if (url) return url;
  if (import.meta.env.DEV) {
    logDevSupabaseFallbackOnce();
    return DEV_FALLBACK_SUPABASE_URL;
  }
  throw new Error(
    'Missing VITE_SUPABASE_URL. Set it in Vercel (or in `.env` for local `vite build`).'
  );
}

export function getSupabaseAnonKey(): string {
  const k = trimOrEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (k) return k;
  if (import.meta.env.DEV) {
    logDevSupabaseFallbackOnce();
    return DEV_FALLBACK_SUPABASE_ANON_KEY;
  }
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. Set it in Vercel (or in `.env` for local `vite build`).'
  );
}
