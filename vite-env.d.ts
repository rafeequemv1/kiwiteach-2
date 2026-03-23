/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GOOGLE_GENAI_API_KEY?: string;
  readonly VITE_GEMINI_KEY?: string;
  /** @deprecated Use VITE_GEMINI_API_KEY */
  readonly VITE_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
