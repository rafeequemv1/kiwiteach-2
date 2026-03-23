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
 * Gemini API key for @google/genai in the browser.
 * Also accepts legacy `VITE_API_KEY` for older setups.
 */
export function getGeminiApiKey(): string {
  return (
    trimOrEmpty(import.meta.env.VITE_GEMINI_API_KEY) ||
    trimOrEmpty(import.meta.env.VITE_GOOGLE_GENAI_API_KEY) ||
    trimOrEmpty(import.meta.env.VITE_GEMINI_KEY) ||
    trimOrEmpty(import.meta.env.VITE_API_KEY)
  );
}

export function assertGeminiApiKey(): string {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error(
      'Missing Gemini API key. Set VITE_GEMINI_API_KEY in `.env` (see `.env.example`) or in Vercel → Project → Settings → Environment Variables, then redeploy.'
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
