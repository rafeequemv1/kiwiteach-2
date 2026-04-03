/**
 * Server-side Gemini only: POST /api/gemini with the user's Supabase JWT.
 * Requires GEMINI_API_KEY (and Supabase URL + anon key) on the server — never VITE_* for the key in production.
 */

import { supabase } from '../supabase/client';

export type GeminiProxyPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  thoughtSignature?: string;
};

export type GeminiProxyResponse = {
  text?: string | null;
  candidates?: {
    finishReason?: string;
    content?: {
      role?: string;
      parts?: GeminiProxyPart[];
    };
  }[];
};

export type AdminGeminiGenerateBody = {
  model: string;
  contents: unknown;
  config?: unknown;
};

export async function adminGeminiGenerateContent(body: AdminGeminiGenerateBody): Promise<GeminiProxyResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Sign in required for AI features.');
  }

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: string } & GeminiProxyResponse;
  if (!res.ok) {
    throw new Error(json.error || `Gemini proxy failed (${res.status})`);
  }
  return json;
}
