
import '../../types';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';
import { generateQuizQuestions, ensureApiKey } from '../../services/geminiService';
import { listKbPromptSets, type KbPromptSetRow } from '../../services/kbPromptService';
import { Question } from '../../Quiz/types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

interface QuestionDbLatexLabProps {
  onBack: () => void;
  embedded?: boolean;
}

const MODEL_OPTIONS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
] as const;

const QuestionDbLatexLab: React.FC<QuestionDbLatexLabProps> = ({ onBack, embedded }) => {
  const [kbList, setKbList] = useState<{ id: string; name: string }[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [promptSets, setPromptSets] = useState<KbPromptSetRow[]>([]);
  /** Empty string = use KB prompt preferences (no override). */
  const [promptSetOverrideId, setPromptSetOverrideId] = useState<string>('');
  const [topic, setTopic] = useState('Organic chemistry — stereochemistry (sample)');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [count, setCount] = useState(2);
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Question[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      void supabase
        .from('knowledge_bases')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setKbList(data || []);
        });
    });
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      setPromptSets([]);
      setPromptSetOverrideId('');
      return;
    }
    let cancelled = false;
    listKbPromptSets(selectedKbId)
      .then((rows) => {
        if (!cancelled) setPromptSets(rows);
      })
      .catch(() => {
        if (!cancelled) setPromptSets([]);
      });
    setPromptSetOverrideId('');
    return () => {
      cancelled = true;
    };
  }, [selectedKbId]);

  const runSample = async () => {
    if (!topic.trim()) {
      alert('Enter a chapter or topic line (same field Neural Studio sends as TARGET CHAPTER).');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus('');
    setResults(null);
    try {
      await ensureApiKey();
      const kbId = selectedKbId.trim() || undefined;
      const override =
        kbId && promptSetOverrideId.trim() ? promptSetOverrideId.trim() : undefined;
      const qs = await generateQuizQuestions(
        topic.trim(),
        difficulty,
        Math.min(3, Math.max(1, count)),
        undefined,
        'mcq',
        (s) => setStatus(s),
        0,
        false,
        undefined,
        model,
        'text',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        kbId ?? null,
        override ?? null
      );
      setResults(qs);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 w-full flex-1 flex-col font-sans'
          : 'mx-auto max-w-6xl animate-fade-in p-2 font-sans md:p-4'
      }
    >
      <div
        className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ${
          embedded ? 'min-h-0 flex-1' : 'min-h-[560px]'
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-gradient-to-r from-violet-950 to-zinc-900 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner">
              <iconify-icon icon="mdi:function-variant" width="24" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-white">Question DB · LaTeX check</h2>
              <p className="mt-0.5 text-[11px] font-medium text-violet-200/90">
                Same forge prompts as the hub, then preview through the student KaTeX path (
                <span className="font-mono text-[10px]">parsePseudoLatexAndMath</span>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white transition-colors hover:bg-white/20"
          >
            Exit
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-b border-zinc-200 bg-zinc-50/90 p-5 md:w-[300px] md:border-b-0 md:border-r">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Knowledge base
              </label>
              <select
                value={selectedKbId}
                onChange={(e) => setSelectedKbId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
              >
                <option value="">None — app default prompts only</option>
                {kbList.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                Choose a KB to load merged <span className="font-medium">Latex</span> (and related) blocks like Neural Studio.
              </p>
            </div>

            {selectedKbId ? (
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Prompt set override
                </label>
                <select
                  value={promptSetOverrideId}
                  onChange={(e) => setPromptSetOverrideId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                >
                  <option value="">KB default (active source in Prompts)</option>
                  {promptSets.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Target chapter / topic
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                placeholder="Chapter name or syllabus line passed to forge…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'Easy' | 'Medium' | 'Hard')}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-xs font-medium shadow-sm outline-none focus:border-violet-500"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Count (1–3)
                </label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={count}
                  onChange={(e) => setCount(Math.min(3, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center text-xs font-semibold shadow-sm outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium shadow-sm outline-none focus:border-violet-500"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-600">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Show raw strings above previews (debug)
            </label>

            <button
              type="button"
              disabled={busy || !topic.trim()}
              onClick={() => void runSample()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-45"
            >
              {busy ? (
                <iconify-icon icon="mdi:loading" className="animate-spin" />
              ) : (
                <iconify-icon icon="mdi:play-circle-outline" />
              )}
              Generate sample
            </button>

            {status ? (
              <p className="text-[10px] leading-snug text-violet-700">{status}</p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">{error}</p>
            ) : null}
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto bg-white p-5">
            {!results?.length && !busy ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-zinc-400">
                <iconify-icon icon="mdi:function-variant" width="48" className="opacity-40" />
                <p className="mt-3 text-sm font-semibold text-zinc-500">No sample yet</p>
                <p className="mt-1 max-w-sm text-xs text-zinc-400">
                  Run a tiny batch and confirm stems, options, and explanations render cleanly before saving to the bank.
                </p>
              </div>
            ) : null}

            {results && results.length > 0 ? (
              <div className="space-y-6">
                {results.map((q, i) => {
                  const opts = Array.isArray(q.options) ? q.options : [];
                  return (
                    <article
                      key={q.id || i}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-5 shadow-sm"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                          Q{i + 1}
                        </span>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200">
                          {q.difficulty || difficulty}
                        </span>
                        <span className="text-[10px] text-zinc-500">KaTeX + SMILES preview</span>
                      </div>

                      {showRaw ? (
                        <pre className="mb-2 max-h-40 overflow-auto rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 font-mono text-[10px] text-zinc-800 whitespace-pre-wrap">
                          {q.text}
                        </pre>
                      ) : null}
                      <div className="math-content mb-4 text-base font-semibold leading-relaxed text-zinc-900">
                        {renderWithSmiles(parsePseudoLatexAndMath(q.text || ''), 160)}
                      </div>

                      <div className="mb-4 grid gap-2 sm:grid-cols-2">
                        {opts.map((opt, oi) => (
                          <div
                            key={oi}
                            className={`rounded-xl border p-3 text-xs font-medium ${
                              oi === q.correctIndex
                                ? 'border-emerald-400 bg-emerald-50/80 text-emerald-900'
                                : 'border-zinc-200 bg-white text-zinc-700'
                            }`}
                          >
                            <span className="mr-2 font-bold opacity-50">({String.fromCharCode(65 + oi)})</span>
                            {showRaw ? (
                              <pre className="mt-1 max-h-20 overflow-auto font-mono text-[9px] whitespace-pre-wrap text-zinc-600">
                                {opt}
                              </pre>
                            ) : null}
                            <span className="math-content inline">
                              {renderWithSmiles(parsePseudoLatexAndMath(opt), 90)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white p-4">
                        <h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                          Explanation
                        </h4>
                        {showRaw ? (
                          <pre className="mb-2 max-h-28 overflow-auto font-mono text-[10px] text-zinc-600 whitespace-pre-wrap">
                            {q.explanation || ''}
                          </pre>
                        ) : null}
                        <div className="math-content text-xs leading-relaxed text-zinc-700">
                          {renderWithSmiles(parsePseudoLatexAndMath(q.explanation || ''), 120)}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
};

export default QuestionDbLatexLab;
