import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

function serializeGeminiResponse(response: GenerateContentResponse) {
  const text = typeof response.text === 'string' ? response.text : undefined;
  const candidates = response.candidates?.map((c) => ({
    finishReason: c.finishReason,
    content: c.content
      ? {
          role: c.content.role,
          parts: c.content.parts?.map((p) => ({
            text: p.text,
            inlineData: p.inlineData
              ? { mimeType: p.inlineData.mimeType, data: p.inlineData.data }
              : undefined,
            thoughtSignature: (p as { thoughtSignature?: string }).thoughtSignature,
          })),
        }
      : undefined,
  }));
  return { text, candidates };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const geminiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();

  if (!url || !anonKey) {
    res.status(500).json({ error: 'Server missing Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY).' });
    return;
  }
  if (!geminiKey) {
    res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });
    return;
  }

  const rawAuth = req.headers.authorization || '';
  const token = rawAuth.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' });
    return;
  }

  const supabaseAuth = createClient(url, anonKey);
  const {
    data: { user },
    error: userErr,
  } = await supabaseAuth.auth.getUser(token);
  if (userErr || !user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  const supabaseUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: canAi, error: rpcErr } = await supabaseUser.rpc('can_use_platform_ai');
  if (rpcErr) {
    console.error('can_use_platform_ai', rpcErr);
    res.status(500).json({ error: 'Authorization check failed.' });
    return;
  }
  if (!canAi) {
    res.status(403).json({ error: 'AI features are restricted to administrators.' });
    return;
  }

  let body: { model?: string; contents?: unknown; config?: unknown };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  if (!body?.model) {
    res.status(400).json({ error: 'Missing model.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: body.model,
      contents: body.contents as never,
      config: body.config as never,
    });
    res.status(200).json(serializeGeminiResponse(response));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Gemini request failed.';
    console.error('api/gemini error', e);
    res.status(500).json({ error: message });
  }
}
