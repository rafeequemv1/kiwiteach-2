import '../../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from '@google/genai';
import { assertGeminiApiKey } from '../../config/env';

declare const mammoth: any;

type SetRow = {
  id: string;
  created_at: string;
  updated_at?: string;
  doc_path: string;
  original_filename: string;
  uploaded_by: string | null;
  ai_status: string;
  ai_error: string | null;
  preview_questions: Draft[] | null;
  committed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type RefRow = {
  id: string;
  created_at: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  question_format?: string | null;
  difficulty: string | null;
  class_name: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  image_url: string | null;
  reference_set_id?: string | null;
  metadata: Record<string, unknown> | null;
};

type Draft = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  question_type: string;
  question_format: string;
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

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\- ()\[\]]+/g, '_').slice(0, 180) || 'document.docx';
}

async function parseDocxBuffer(arrayBuffer: ArrayBuffer): Promise<{
  text: string;
  images: { data: string; mimeType: string }[];
}> {
  const images: { data: string; mimeType: string }[] = [];
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image: any) =>
        image.read('base64').then((b64: string) => {
          const mimeType = image.contentType || 'image/png';
          images.push({ data: b64, mimeType });
          return { src: `IMAGE_${images.length - 1}` };
        })
      ),
    }
  );
  const parser = new DOMParser();
  const doc = parser.parseFromString(result.value || '', 'text/html');
  const txt = doc.body?.innerText || '';
  return { text: txt, images };
}

async function runGeminiExtract(docText: string): Promise<Draft[]> {
  const ai = new GoogleGenAI({ apiKey: assertGeminiApiKey() });
  const prompt = `You are converting Mathpix-exported questions into strict JSON.

Return ONLY valid JSON (no markdown) as an array of objects with:
- question_text (string)
- options (array of 4 strings if MCQ; otherwise empty array)
- correct_index (0-3 for MCQ; 0 if unknown)
- explanation (string; empty allowed)
- question_type (mcq|reasoning|matching|statements)
- question_format (text|with_figure|table|multi_part) — text-only, uses figure, table layout, or multiple parts
- difficulty (Easy|Medium|Hard)
- class_name, subject_name, chapter_name, topic_tag (strings; infer from context when possible; empty allowed)
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
            question_format: { type: Type.STRING },
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
  return (Array.isArray(parsed) ? parsed : []).map((r) => ({
    question_text: String(r.question_text || '').trim(),
    options: Array.isArray(r.options) ? r.options.map((x) => String(x)) : [],
    correct_index: Math.max(0, Math.min(3, safeInt((r as any).correct_index, 0))),
    explanation: String(r.explanation || '').trim(),
    question_type: String(r.question_type || 'mcq').trim().toLowerCase(),
    question_format: String(r.question_format || 'text').trim().toLowerCase() || 'text',
    difficulty: String(r.difficulty || 'Medium').trim(),
    class_name: String(r.class_name || '').trim(),
    subject_name: String(r.subject_name || '').trim(),
    chapter_name: String(r.chapter_name || '').trim(),
    topic_tag: String(r.topic_tag || '').trim(),
    image_index:
      r.image_index == null || String(r.image_index) === ''
        ? null
        : Math.max(0, safeInt(r.image_index, 0)),
  })).filter((x) => x.question_text.length > 0);
}

const ReferenceQuestionsManager: React.FC = () => {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [rows, setRows] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<SetRow | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [analyzingSetId, setAnalyzingSetId] = useState<string | null>(null);
  const [committingSetId, setCommittingSetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSets = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('reference_question_sets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) throw e;
    setSets((data || []) as SetRow[]);
  }, []);

  const loadQuestions = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('reference_questions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (e) throw e;
    setRows((data || []) as RefRow[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSets(), loadQuestions()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [loadSets, loadQuestions]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const uploadNewSet = async (f: File | null) => {
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setError('Please upload a .docx from Mathpix.');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const setId = crypto.randomUUID();
      const path = `${setId}/${sanitizeFilename(f.name)}`;
      const { error: upErr } = await supabase.storage.from('reference-question-docs').upload(path, f, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('reference_question_sets').insert({
        id: setId,
        doc_path: path,
        original_filename: f.name,
        uploaded_by: user?.id ?? null,
        ai_status: 'pending',
        preview_questions: null,
        ai_error: null,
      });
      if (insErr) throw insErr;
      await loadSets();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadSetFile = async (set: SetRow): Promise<ArrayBuffer> => {
    const { data, error: e } = await supabase.storage.from('reference-question-docs').download(set.doc_path);
    if (e) throw e;
    return await data.arrayBuffer();
  };

  const runAiAnalysis = async (set: SetRow) => {
    setAnalyzingSetId(set.id);
    setError(null);
    try {
      await supabase
        .from('reference_question_sets')
        .update({ ai_status: 'analyzing', ai_error: null, updated_at: new Date().toISOString() })
        .eq('id', set.id);
      setSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, ai_status: 'analyzing' } : s)));

      const buf = await downloadSetFile(set);
      const { text } = await parseDocxBuffer(buf);
      if (!text.trim()) throw new Error('No text extracted from document');

      const drafts = await runGeminiExtract(text);
      const { error: uErr } = await supabase
        .from('reference_question_sets')
        .update({
          ai_status: 'complete',
          preview_questions: drafts as unknown as Record<string, unknown>,
          ai_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', set.id);
      if (uErr) throw uErr;
      await loadSets();
    } catch (e: any) {
      const msg = e?.message || 'AI analysis failed';
      setError(msg);
      await supabase
        .from('reference_question_sets')
        .update({ ai_status: 'failed', ai_error: msg, updated_at: new Date().toISOString() })
        .eq('id', set.id);
      await loadSets();
    } finally {
      setAnalyzingSetId(null);
    }
  };

  const openPreviewModal = async (set: SetRow) => {
    setActiveSet(set);
    setPreviewHtml(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const buf = await downloadSetFile(set);
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      setPreviewHtml(result.value || '<p>(empty)</p>');
    } catch (e: any) {
      setPreviewHtml(`<p class="text-rose-600">Preview failed: ${e?.message || 'unknown'}</p>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const commitSetToLibrary = async (set: SetRow) => {
    const preview = (set.preview_questions || []) as Draft[];
    if (preview.length === 0) {
      setError('Run AI analysis first.');
      return;
    }
    if (set.committed_at) {
      if (!confirm('This set was already committed. Insert questions again?')) return;
    }

    setCommittingSetId(set.id);
    setError(null);
    try {
      const buf = await downloadSetFile(set);
      const { images: docImages } = await parseDocxBuffer(buf);

      const needed = new Set<number>();
      preview.forEach((p) => {
        if (typeof p.image_index === 'number') needed.add(p.image_index);
      });
      const imgUrlByIndex = new Map<number, string>();
      for (const idx of needed) {
        const img = docImages[idx];
        if (!img?.data) continue;
        const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpg' : 'png';
        const path = `${set.id}-${Date.now()}-${idx}.${ext}`;
        const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
        const { error } = await supabase.storage
          .from('reference-question-images')
          .upload(path, bytes, { contentType: img.mimeType, upsert: false });
        if (error) throw error;
        imgUrlByIndex.set(idx, toPublicUrl(path));
      }

      const payload = preview.map((p) => {
        const imgUrl = typeof p.image_index === 'number' ? imgUrlByIndex.get(p.image_index) || null : null;
        return {
          question_text: p.question_text,
          options: p.options.length ? p.options : null,
          correct_index: Number.isFinite(p.correct_index) ? p.correct_index : 0,
          explanation: p.explanation || null,
          question_type: p.question_type || 'mcq',
          question_format: p.question_format || 'text',
          difficulty: p.difficulty || null,
          class_name: p.class_name || null,
          subject_name: p.subject_name || null,
          chapter_name: p.chapter_name || null,
          topic_tag: p.topic_tag || null,
          image_url: imgUrl,
          source_doc_name: set.original_filename,
          reference_set_id: set.id,
          metadata: {
            source: 'mathpix-docx',
            image_indices: p.image_index ?? null,
            set_id: set.id,
          },
        };
      });

      const { error: insErr } = await supabase.from('reference_questions').insert(payload);
      if (insErr) throw insErr;

      await supabase
        .from('reference_question_sets')
        .update({ committed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', set.id);

      await loadSets();
      await loadQuestions();
    } catch (e: any) {
      setError(e?.message || 'Commit failed');
    } finally {
      setCommittingSetId(null);
    }
  };

  const deleteSet = async (set: SetRow) => {
    if (!confirm(`Delete upload "${set.original_filename}" and its stored file?`)) return;
    setSaving(true);
    setError(null);
    try {
      await supabase.storage.from('reference-question-docs').remove([set.doc_path]);
      const { error } = await supabase.from('reference_question_sets').delete().eq('id', set.id);
      if (error) throw error;
      if (activeSet?.id === set.id) {
        setActiveSet(null);
        setPreviewHtml(null);
      }
      await loadSets();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
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

  const previewCount = (s: SetRow) => (Array.isArray(s.preview_questions) ? s.preview_questions.length : 0);

  const statusBadge = (s: SetRow) => {
    if (s.ai_status === 'complete') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <iconify-icon icon="mdi:check-circle" width="14" className="text-emerald-600" />
          AI done
        </span>
      );
    }
    if (s.ai_status === 'analyzing') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Analyzing…
        </span>
      );
    }
    if (s.ai_status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800 ring-1 ring-rose-200">
          <iconify-icon icon="mdi:alert-circle" width="14" />
          Failed
        </span>
      );
    }
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Pending analysis</span>
    );
  };

  const committedBadge = (s: SetRow) =>
    s.committed_at ? (
      <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600" title={s.committed_at}>
        <iconify-icon icon="mdi:database-check" width="12" />
        Saved
      </span>
    ) : null;

  const firstPreviewSlice = useMemo(() => {
    if (!activeSet?.preview_questions?.length) return [];
    return (activeSet.preview_questions as Draft[]).slice(0, 8);
  }, [activeSet]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Reference Questions</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Upload Mathpix <span className="font-mono">.docx</span> sets → store in bucket → run AI → save parsed rows to the library.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => void uploadNewSet(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {parsing ? 'Uploading…' : 'Upload .docx'}
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {(error || parsing) && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            error ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-zinc-200 bg-white text-zinc-700'
          }`}
        >
          {error ? error : 'Uploading document…'}
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Uploaded sets</p>
        {loading && sets.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
        ) : sets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 py-16 text-center text-sm text-zinc-500">
            No documents yet. Use <strong>Upload .docx</strong> to add a set.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900" title={s.original_filename}>
                      {s.original_filename}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                  {s.ai_status === 'complete' && (
                    <iconify-icon
                      icon="mdi:check-decagram"
                      width="22"
                      className="shrink-0 text-emerald-500"
                      title="AI analysis complete"
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {statusBadge(s)}
                  {committedBadge(s)}
                </div>
                {s.ai_error && s.ai_status === 'failed' && (
                  <p className="mt-2 line-clamp-3 text-[10px] text-rose-600">{s.ai_error}</p>
                )}
                <p className="mt-2 text-[11px] text-zinc-600">
                  {s.ai_status === 'complete' ? (
                    <>
                      <span className="font-semibold text-emerald-700">{previewCount(s)}</span> questions parsed
                    </>
                  ) : (
                    'Run AI to extract questions, chapter, difficulty, and types.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void openPreviewModal(s)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Preview doc
                  </button>
                  <button
                    type="button"
                    disabled={analyzingSetId === s.id || s.ai_status === 'analyzing'}
                    onClick={() => void runAiAnalysis(s)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {analyzingSetId === s.id || s.ai_status === 'analyzing'
                      ? 'Analyzing…'
                      : s.ai_status === 'complete'
                        ? 'Re-run AI'
                        : 'Run AI analysis'}
                  </button>
                  <button
                    type="button"
                    disabled={s.ai_status !== 'complete' || previewCount(s) === 0 || committingSetId === s.id}
                    onClick={() => void commitSetToLibrary(s)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {committingSetId === s.id ? 'Saving…' : 'Save to library'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteSet(s)}
                    className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t border-zinc-100 pt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Saved reference questions</p>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">No rows in reference_questions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="w-12 py-2 pl-3">Fig</th>
                    <th className="py-2">Question</th>
                    <th className="w-36 py-2">Meta</th>
                    <th className="w-24 py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 align-top">
                      <td className="py-2 pl-3">
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
                      <td className="py-2 pr-2">
                        <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{r.question_text}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {r.class_name || '—'} · {r.subject_name || '—'} · {r.chapter_name || '—'}
                        </p>
                      </td>
                      <td className="py-2 text-[10px] text-zinc-600">
                        <div>{r.difficulty || '—'}</div>
                        <div className="text-zinc-400">{r.question_type || '—'}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteRow(r.id)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {activeSet && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => {
            setActiveSet(null);
            setPreviewHtml(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">{activeSet.original_filename}</h4>
                <p className="text-[11px] text-zinc-500">Document preview · {statusBadge(activeSet)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSet(null);
                  setPreviewHtml(null);
                }}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <iconify-icon icon="mdi:close" width="20" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-56px)] overflow-y-auto p-4">
              {previewLoading ? (
                <p className="py-12 text-center text-sm text-zinc-500">Loading preview…</p>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-zinc-800"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
                />
              )}
              {activeSet.ai_status === 'complete' && firstPreviewSlice.length > 0 && (
                <div className="mt-6 border-t border-zinc-100 pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">AI preview (first 8)</p>
                  <ul className="space-y-2 text-[11px] text-zinc-700">
                    {firstPreviewSlice.map((p, i) => (
                      <li key={i} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-2">
                        <span className="font-semibold text-zinc-900">{p.chapter_name || 'Chapter ?'}</span> ·{' '}
                        {p.difficulty} · {p.question_type} · {p.question_format}
                        <div className="mt-1 line-clamp-2 text-zinc-600">{p.question_text}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceQuestionsManager;
