import { Type } from '@google/genai';
import { adminGeminiGenerateContent } from './adminGeminiProxy';
import type { BlogFaqItem } from '../Blog/types';

const MODEL = 'gemini-3-flash-preview';

const faqSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      answer: { type: Type.STRING },
    },
    required: ['question', 'answer'],
  },
};

const metaSchema = {
  type: Type.OBJECT,
  properties: {
    meta_title: { type: Type.STRING },
    meta_description: { type: Type.STRING },
  },
  required: ['meta_title', 'meta_description'],
};

export async function aiGenerateBlogFaqs(params: { title: string; contentHtml: string }): Promise<BlogFaqItem[]> {
  const prompt =
    `You write concise FAQs for generative search and featured snippets (clear questions, direct answers).\n` +
    `Article title: ${params.title}\n\n` +
    `Article HTML (may be long):\n${params.contentHtml.slice(0, 12000)}\n\n` +
    `Return 5–8 distinct question/answer pairs. Answers: 1–4 sentences, factual, no HTML. Questions: natural language users might ask.`;

  const res = await adminGeminiGenerateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: faqSchema,
    },
  });
  const raw = res.text?.trim() || '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const q = String((x as { question?: unknown }).question ?? '').trim();
      const a = String((x as { answer?: unknown }).answer ?? '').trim();
      if (!q || !a) return null;
      return { question: q, answer: a };
    })
    .filter(Boolean) as BlogFaqItem[];
}

export async function aiSuggestBlogMeta(params: {
  title: string;
  excerpt: string;
  contentHtml: string;
}): Promise<{ meta_title: string; meta_description: string }> {
  const prompt =
    `Produce SEO meta for this article. meta_title: max 60 chars, compelling. meta_description: max 155 chars, includes a benefit + CTA tone.\n` +
    `Title: ${params.title}\nExcerpt: ${params.excerpt || '(none)'}\n\nBody excerpt:\n${params.contentHtml.replace(/<[^>]+>/g, ' ').slice(0, 4000)}`;

  const res = await adminGeminiGenerateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: metaSchema,
    },
  });
  const raw = res.text?.trim() || '{}';
  try {
    const o = JSON.parse(raw) as { meta_title?: string; meta_description?: string };
    return {
      meta_title: String(o.meta_title || params.title).slice(0, 70),
      meta_description: String(o.meta_description || params.excerpt || '').slice(0, 200),
    };
  } catch {
    return { meta_title: params.title, meta_description: params.excerpt || '' };
  }
}

export async function aiExpandSelection(params: { selectedText: string; instruction?: string }): Promise<string> {
  const hint = params.instruction?.trim() || 'Expand with one more paragraph; return HTML only (p, strong, em).';
  const prompt =
    `${hint}\n\nSelected excerpt:\n${params.selectedText.slice(0, 8000)}\n\nReturn ONLY an HTML fragment (no markdown fence).`;

  const res = await adminGeminiGenerateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.35 },
  });
  const text = (res.text || '').trim();
  return text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function aiOutlineFromTopic(params: { topic: string }): Promise<string> {
  const prompt =
    `Write a short educational blog article body in HTML only (use h2, h3, p, ul/li, strong). ` +
    `Topic: ${params.topic}\nTone: professional, NEET/teaching audience. 4–8 sections. No outer html/body tags.`;

  const res = await adminGeminiGenerateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.4 },
  });
  const text = (res.text || '').trim();
  return text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}
