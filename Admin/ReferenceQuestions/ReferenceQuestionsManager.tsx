import '../../types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from '@google/genai';
import { assertGeminiApiKey } from '../../config/env';

declare const mammoth: any;

type RefRow = {
  id: string;
  created_at: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  difficulty: string | null;
  class_name: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
};

type Draft = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  question_type: string;
  difficulty: string;
  class_name: string;
  subject_name: string;
  chapter_name: string;
  topic_tag: string;
  image_index?: number | null;
};

type GeminiDocRow = Partial<Draft>;

function cleanJson(txt: string) {
  return txt
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function safeInt(v: unknown, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(String(v ?? ''));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toPublicUrl(path: string) {
  const { data } = supabase.storage.from('reference-question-images').getPublicUrl(path);
  return data.publicUrl;
}

const ReferenceQuestionsManager: React.FC = () => {
  const [rows, setRows] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [docText, setDocText] = useState('');
  const [docImages, setDocImages] = useState<{ data: string; mimeType: string }[]>([]);
  const [preview, setPreview] = useState<Draft[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('reference_questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as RefRow[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load reference questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const parseDocx = async (f: File) => {
    setParsing(true);
    setError(null);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const images: { data: string; mimeType: string }[] = [];
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement((image: any) =>
            image.read('base64').then((b64: string) => {
              const mimeType = image.contentType || 'image/png';
              images.push({ data: b64, mimeType });
              // Keep placeholders so Gemini can reference [IMAGE_n]
              return { src: `IMAGE_${images.length - 1}` };
            })
          ),
        }
      );

      const parser = new DOMParser();
      const doc = parser.parseFromString(result.value || '', 'text/html');
      const txt = doc.body?.innerText || '';
      setDocText(txt);
      setDocImages(images);
      setPreview([]);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse document');
      setDocText('');
      setDocImages([]);
    } finally {
      setParsing(false);
    }
  };

  const handlePickFile = async (f: File | null) => {
    setFile(f);
    setPreview([]);
    setDocText('');
    setDocImages([]);
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setError('Please upload a .docx from Mathpix.');
      return;
    }
    await parseDocx(f);
  };

  const buildJsonWithGemini = async () => {
    if (!docText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: assertGeminiApiKey() });
      const prompt = `You are converting Mathpix-exported questions into strict JSON.

Return ONLY valid JSON (no markdown) as an array of objects with:
- question_text (string)
- options (array of 4 strings if MCQ; otherwise empty array)
- correct_index (0-3 for MCQ; 0 if unknown)
- explanation (string; empty allowed)
- question_type (mcq|reasoning|matching|statements)
- difficulty (Easy|Medium|Hard)
- class_name, subject_name, chapter_name, topic_tag (strings; empty allowed)
- image_index (integer or null). If the question references an embedded image, set image_index to the number in the placeholder (e.g. IMAGE_3 => 3). Otherwise null.

Rules:
- Keep wording as close to source as possible.
- If options are labeled A/B/C/D, map to array in that order.
- If answer is given as (A)/(B)/(C)/(D), set correct_index accordingly.
- Do not hallucinate missing answers; use correct_index=0 if unknown.

SOURCE TEXT:
${docText}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question_text: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correct_index: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
                question_type: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                class_name: { type: Type.STRING },
                subject_name: { type: Type.STRING },
                chapter_name: { type: Type.STRING },
                topic_tag: { type: Type.STRING },
                image_index: { type: Type.NUMBER },
              },
              required: ['question_text', 'options', 'correct_index', 'explanation', 'question_type', 'difficulty'],
            },
          },
        },
      });

      const raw = cleanJson(response.text || '[]');
      const parsed = JSON.parse(raw) as GeminiDocRow[];
      const normalized: Draft[] = (Array.isArray(parsed) ? parsed : []).map((r) => ({
        question_text: String(r.question_text || '').trim(),
        options: Array.isArray(r.options) ? r.options.map((x) => String(x)) : [],
        correct_index: Math.max(0, Math.min(3, safeInt((r as any).correct_index, 0))),
        explanation: String(r.explanation || '').trim(),
        question_type: String(r.question_type || 'mcq').trim().toLowerCase(),
        difficulty: String(r.difficulty || 'Medium').trim(),
        class_name: String(r.class_name || '').trim(),
        subject_name: String(r.subject_name || '').trim(),
        chapter_name: String(r.chapter_name || '').trim(),
        topic_tag: String(r.topic_tag || '').trim(),
        image_index:
          r.image_index == null || String(r.image_index) === ''
            ? null
            : Math.max(0, safeInt(r.image_index, 0)),
      }));

      setPreview(normalized.filter((x) => x.question_text.length > 0));
    } catch (e: any) {
      setError(e?.message || 'Failed to build JSON preview');
    } finally {
      setParsing(false);
    }
  };

  const previewStats = useMemo(() => {
    const total = preview.length;
    const withImg = preview.filter((p) => p.image_index != null).length;
    return { total, withImg, imgTotal: docImages.length };
  }, [preview, docImages.length]);

  const uploadPreview = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const uploads: (string | null)[] = new Array(preview.length).fill(null);

      // Upload referenced images first (unique indices).
      const needed = new Set<number>();
      preview.forEach((p) => {
        if (typeof p.image_index === 'number') needed.add(p.image_index);
      });

      const imgUrlByIndex = new Map<number, string>();
      for (const idx of Array.from(needed.values())) {
        const img = docImages[idx];
        if (!img?.data) continue;
        const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpg' : 'png';
        const path = `${Date.now()}-${idx}.${ext}`;
        const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
        const { error } = await supabase.storage
          .from('reference-question-images')
          .upload(path, bytes, { contentType: img.mimeType, upsert: false });
        if (error) throw error;
        imgUrlByIndex.set(idx, toPublicUrl(path));
      }

      const payload = preview.map((p, i) => {
        const imgUrl = typeof p.image_index === 'number' ? imgUrlByIndex.get(p.image_index) || null : null;
        uploads[i] = imgUrl;
        return {
          question_text: p.question_text,
          options: p.options.length ? p.options : null,
          correct_index: Number.isFinite(p.correct_index) ? p.correct_index : 0,
          explanation: p.explanation || null,
          question_type: p.question_type || 'mcq',
          difficulty: p.difficulty || null,
          class_name: p.class_name || null,
          subject_name: p.subject_name || null,
          chapter_name: p.chapter_name || null,
          topic_tag: p.topic_tag || null,
          image_url: imgUrl,
          source_doc_name: file?.name || null,
          metadata: { source: 'mathpix-docx', image_indices: p.image_index ?? null },
        };
      });

      const { error } = await supabase.from('reference_questions').insert(payload);
      if (error) throw error;

      setPreview([]);
      setFile(null);
      setDocText('');
      setDocImages([]);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this reference question?')) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from('reference_questions').delete().eq('id', id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Reference Questions</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Upload Mathpix <span className="font-mono">.docx</span>, preview JSON + figures, then commit to Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      {(error || parsing || saving) && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            error ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-zinc-200 bg-white text-zinc-700'
          }`}
        >
          {error ? error : parsing ? 'Parsing / building preview…' : 'Saving…'}
        </div>
      )}

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
        <div className="min-h-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Upload</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => void handlePickFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Choose .docx
              </button>
              {file && <span className="text-xs font-medium text-zinc-700">{file.name}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!docText.trim() || parsing}
                onClick={() => void buildJsonWithGemini()}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Build JSON preview
              </button>
              <button
                type="button"
                disabled={preview.length === 0 || saving}
                onClick={() => void uploadPreview()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Upload to Supabase
              </button>
              <span className="text-[11px] text-zinc-500">
                Preview: {previewStats.total} rows · {previewStats.withImg} w/ image · {previewStats.imgTotal} images in doc
              </span>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            {!docText.trim() ? (
              <p className="py-10 text-center text-sm text-zinc-400">Upload a Mathpix .docx to extract text & images.</p>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Extracted text (sample)</p>
                <pre className="max-h-56 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-700">
                  {docText.slice(0, 4000)}
                </pre>
                {docImages.length > 0 && (
                  <>
                    <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Extracted images
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {docImages.slice(0, 16).map((img, idx) => (
                        <div key={idx} className="rounded-md border border-zinc-200 bg-white p-1">
                          <img
                            src={`data:${img.mimeType};base64,${img.data}`}
                            alt={`Image ${idx}`}
                            className="aspect-square w-full rounded object-contain"
                          />
                          <p className="mt-1 text-center text-[10px] font-semibold text-zinc-500">#{idx}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preview & existing</p>
          </div>
          <div className="min-h-0 overflow-y-auto p-4">
            {preview.length > 0 ? (
              <div className="space-y-3">
                {preview.slice(0, 50).map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-900">{p.question_text}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {p.class_name || '—'} · {p.subject_name || '—'} · {p.chapter_name || '—'} · {p.topic_tag || '—'}
                        </p>
                      </div>
                      {typeof p.image_index === 'number' && docImages[p.image_index] && (
                        <img
                          src={`data:${docImages[p.image_index].mimeType};base64,${docImages[p.image_index].data}`}
                          alt="figure"
                          className="h-14 w-14 rounded border border-zinc-200 object-contain"
                        />
                      )}
                    </div>
                    {p.options.length > 0 && (
                      <ol className="mt-2 list-decimal pl-4 text-[11px] text-zinc-700">
                        {p.options.map((o, i) => (
                          <li key={i} className={i === p.correct_index ? 'font-semibold text-emerald-700' : ''}>
                            {o}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
                {preview.length > 50 && <p className="text-center text-[11px] text-zinc-500">Showing first 50…</p>}
              </div>
            ) : loading ? (
              <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-400">No reference questions yet.</p>
            ) : (
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="w-14 py-2">Fig</th>
                    <th className="py-2">Question</th>
                    <th className="w-28 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 align-top">
                      <td className="py-2 pr-2">
                        {r.image_url ? (
                          <img
                            src={r.image_url}
                            alt="figure"
                            className="h-10 w-10 rounded border border-zinc-200 object-contain"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border border-zinc-200 bg-zinc-50" />
                        )}
                      </td>
                      <td className="py-2">
                        <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{r.question_text}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {r.class_name || '—'} · {r.subject_name || '—'} · {r.chapter_name || '—'} · {r.topic_tag || '—'}
                        </p>
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteRow(r.id)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferenceQuestionsManager;

