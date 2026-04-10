import '../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { workspacePageClass } from '../Teacher/components/WorkspaceChrome';
import { parsePseudoLatexAndMath } from '../utils/latexParser';
import {
  fetchReviewMarkForQuestion,
  upsertQuestionBankReviewMark,
  type ReviewMarkInput,
} from '../services/questionBankReviewService';

const PAGE_SIZE = 8;

type KbRow = { id: string; name: string };
type ChapterRow = { id: string; name: string; subject_name?: string | null; class_name?: string | null };
type QuestionRow = {
  id: string;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: string;
  question_type: string;
  topic_tag?: string | null;
  figure_url?: string | null;
};

const emptyMarks: ReviewMarkInput = {
  wrong: false,
  outOfSyllabus: false,
  latexIssue: false,
  figureIssue: false,
  notes: '',
};

/**
 * Review workspace: chapters (left), paginated question cards with explanations,
 * multi-flag review + submit / next (per-question flow).
 */
const QuestionBankReviewWorkspace: React.FC = () => {
  const [kbList, setKbList] = useState<KbRow[]>([]);
  const [kbId, setKbId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [page, setPage] = useState(0);
  const [loadingKb, setLoadingKb] = useState(true);
  const [loadingCh, setLoadingCh] = useState(false);
  const [loadingQs, setLoadingQs] = useState(false);
  const [marksByQuestion, setMarksByQuestion] = useState<Record<string, ReviewMarkInput>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markLoadsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingKb(true);
      setError(null);
      try {
        const { data, error: e } = await supabase
          .from('knowledge_bases')
          .select('id, name')
          .order('name');
        if (e) throw new Error(e.message || String(e));
        if (cancelled) return;
        const rows = (data || []) as KbRow[];
        setKbList(rows);
        setKbId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingKb(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!kbId) {
      setChapters([]);
      setChapterId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCh(true);
      setError(null);
      try {
        const { data, error: e } = await supabase
          .from('chapters')
          .select('id, name, subject_name, class_name')
          .eq('kb_id', kbId)
          .order('name');
        if (e) throw new Error(e.message || String(e));
        if (cancelled) return;
        const rows = (data || []) as ChapterRow[];
        setChapters(rows);
        setChapterId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingCh(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  const loadQuestions = useCallback(async (chapId: string) => {
    markLoadsRef.current = new Set();
    setLoadingQs(true);
    setError(null);
    setPage(0);
    setFocusId(null);
    setMarksByQuestion({});
    try {
      const { data, error: e } = await supabase
        .from('question_bank_neet')
        .select(
          'id, question_text, options, correct_index, explanation, difficulty, question_type, topic_tag, figure_url'
        )
        .eq('chapter_id', chapId)
        .order('created_at', { ascending: true });
      if (e) throw new Error(e.message || String(e));
      setQuestions((data || []) as QuestionRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setQuestions([]);
    } finally {
      setLoadingQs(false);
    }
  }, []);

  useEffect(() => {
    if (chapterId) void loadQuestions(chapterId);
    else {
      setQuestions([]);
      setPage(0);
    }
  }, [chapterId, loadQuestions]);

  const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageQuestions = useMemo(() => {
    const start = pageClamped * PAGE_SIZE;
    return questions.slice(start, start + PAGE_SIZE);
  }, [questions, pageClamped]);

  const ensureMarkLoaded = useCallback(async (qid: string) => {
    if (markLoadsRef.current.has(qid)) return;
    markLoadsRef.current.add(qid);
    try {
      const row = await fetchReviewMarkForQuestion(qid);
      setMarksByQuestion((prev) => ({
        ...prev,
        [qid]: {
          wrong: row.wrong,
          outOfSyllabus: row.outOfSyllabus,
          latexIssue: row.latexIssue,
          figureIssue: row.figureIssue,
          notes: row.notes,
        },
      }));
    } catch {
      setMarksByQuestion((prev) => ({ ...prev, [qid]: { ...emptyMarks } }));
    }
  }, []);

  useEffect(() => {
    for (const q of pageQuestions) {
      void ensureMarkLoaded(q.id);
    }
  }, [pageQuestions, ensureMarkLoaded]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`q-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusId]);

  const setMarkField = (qid: string, patch: Partial<ReviewMarkInput>) => {
    setMarksByQuestion((prev) => ({
      ...prev,
      [qid]: { ...(prev[qid] || { ...emptyMarks }), ...patch },
    }));
  };

  const handleSubmitOne = async (qid: string, advance: 'next' | 'stay' = 'next') => {
    const m = marksByQuestion[qid] || { ...emptyMarks };
    setSavingId(qid);
    setError(null);
    try {
      await upsertQuestionBankReviewMark(qid, m);
      if (advance === 'next') {
        const idx = questions.findIndex((q) => q.id === qid);
        if (idx >= 0 && idx < questions.length - 1) {
          const next = questions[idx + 1];
          const nextPage = Math.floor((idx + 1) / PAGE_SIZE);
          if (nextPage !== pageClamped) setPage(nextPage);
          setFocusId(next.id);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const chLabel = (c: ChapterRow) =>
    [c.class_name, c.subject_name, c.name].filter(Boolean).join(' · ') || c.name;

  return (
    <div className={`${workspacePageClass} flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/80`}>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-bold tracking-tight text-zinc-900">Question bank review</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Flag issues per question; submit saves your review and can advance to the next item in this chapter.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Knowledge base</label>
          {loadingKb ? (
            <span className="text-[10px] text-zinc-400">Loading…</span>
          ) : kbList.length === 0 ? (
            <span className="text-[11px] text-amber-800">
              No knowledge bases available. A developer must assign you access under Admin → Users (reviewer →
              knowledge bases).
            </span>
          ) : (
            <select
              value={kbId || ''}
              onChange={(e) => setKbId(e.target.value || null)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800"
            >
              {kbList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-48 min-h-0 shrink-0 flex-col border-b border-zinc-200 bg-white lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-zinc-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Chapters</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
            {loadingCh ? (
              <p className="p-3 text-xs text-zinc-400">Loading chapters…</p>
            ) : chapters.length === 0 ? (
              <p className="p-3 text-xs text-zinc-500">No chapters in this base.</p>
            ) : (
              <ul className="space-y-0.5">
                {chapters.map((c) => {
                  const active = c.id === chapterId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setChapterId(c.id)}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-medium leading-snug transition-colors ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        {chLabel(c)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 sm:px-4">
            <p className="text-[11px] font-semibold text-zinc-700">
              {chapterId ? (
                <>
                  {questions.length} question{questions.length === 1 ? '' : 's'} · Page {pageClamped + 1} /{' '}
                  {totalPages}
                </>
              ) : (
                'Select a chapter'
              )}
            </p>
            {questions.length > PAGE_SIZE ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pageClamped <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-bold disabled:opacity-40"
                >
                  Prev page
                </button>
                <button
                  type="button"
                  disabled={pageClamped >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-bold disabled:opacity-40"
                >
                  Next page
                </button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
            {loadingQs ? (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-400">Loading questions…</div>
            ) : !chapterId ? (
              <p className="text-sm text-zinc-500">Choose a chapter to load questions.</p>
            ) : questions.length === 0 ? (
              <p className="text-sm text-zinc-500">No questions in this chapter.</p>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {pageQuestions.map((q) => {
                  const mk = marksByQuestion[q.id] || emptyMarks;
                  const focused = focusId === q.id;
                  return (
                    <article
                      key={q.id}
                      id={`q-${q.id}`}
                      className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${
                        focused ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-zinc-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-white">{q.difficulty}</span>
                        <span>{q.question_type}</span>
                        {q.topic_tag ? (
                          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700">
                            {q.topic_tag}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="math-content mt-2 text-sm font-medium leading-relaxed text-zinc-900"
                        dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(q.question_text) }}
                      />
                      {q.figure_url ? (
                        <div className="mt-3 flex justify-center rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                          <img src={q.figure_url} alt="" className="max-h-48 max-w-full object-contain" />
                        </div>
                      ) : null}
                      <ul className="mt-3 space-y-1.5">
                        {(q.options || []).map((opt, i) => (
                          <li
                            key={i}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                              i === q.correct_index
                                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                                : 'border-zinc-100 bg-zinc-50/50 text-zinc-700'
                            }`}
                          >
                            <span className="font-semibold text-zinc-400">({String.fromCharCode(65 + i)})</span>{' '}
                            <span
                              dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(opt) }}
                              className="math-content inline"
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/80 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-800">Explanation</p>
                        <div
                          className="math-content mt-1 text-xs leading-relaxed text-amber-950"
                          dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(q.explanation || '—') }}
                        />
                      </div>

                      <div className="mt-4 border-t border-zinc-100 pt-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Your review</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                              mk.wrong
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.wrong}
                              onChange={(e) => setMarkField(q.id, { wrong: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            Wrong / incorrect
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                              mk.outOfSyllabus
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.outOfSyllabus}
                              onChange={(e) => setMarkField(q.id, { outOfSyllabus: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            Out of syllabus
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                              mk.latexIssue
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.latexIssue}
                              onChange={(e) => setMarkField(q.id, { latexIssue: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            LaTeX issue
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                              mk.figureIssue
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.figureIssue}
                              onChange={(e) => setMarkField(q.id, { figureIssue: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            Figure issue
                          </label>
                        </div>
                        <label className="mt-2 block text-[10px] font-semibold text-zinc-600">
                          Notes (optional)
                          <textarea
                            value={mk.notes}
                            onChange={(e) => setMarkField(q.id, { notes: e.target.value })}
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                            placeholder="Short note for admins…"
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingId === q.id}
                            onClick={() => void handleSubmitOne(q.id, 'next')}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {savingId === q.id ? 'Saving…' : 'Submit & next question'}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === q.id}
                            onClick={() => void handleSubmitOne(q.id, 'stay')}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] font-bold text-zinc-700"
                          >
                            Save only
                          </button>
                          <button
                            type="button"
                            onClick={() => setFocusId(q.id)}
                            className="rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-bold text-zinc-600"
                          >
                            Focus card
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default QuestionBankReviewWorkspace;
