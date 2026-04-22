import '../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';
import { workspacePageClass } from '../Teacher/components/WorkspaceChrome';
import { parsePseudoLatexAndMath } from '../utils/latexParser';
import {
  fetchReviewMarkForQuestion,
  upsertQuestionBankReviewMark,
  type ReviewMarkInput,
} from '../services/questionBankReviewService';

const RESUME_STORAGE_KEY = 'kiwiteach_qb_review_resume_v2';

type ResumePayload = { kbId: string; chapterId: string; qIndex: number };

function readResume(): ResumePayload | null {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ResumePayload>;
    if (o && typeof o.kbId === 'string' && typeof o.chapterId === 'string' && typeof o.qIndex === 'number') {
      return { kbId: o.kbId, chapterId: o.chapterId, qIndex: Math.max(0, o.qIndex) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeResume(p: ResumePayload | null) {
  try {
    if (!p) localStorage.removeItem(RESUME_STORAGE_KEY);
    else localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

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

type MarkStatsRow = {
  question_id: string;
  mark_wrong?: boolean | null;
  mark_out_of_syllabus?: boolean | null;
  mark_latex_issue?: boolean | null;
  mark_figure_issue?: boolean | null;
  notes?: string | null;
};

function markRowHasFlagsOrNotes(m: MarkStatsRow): boolean {
  if (m.mark_wrong || m.mark_out_of_syllabus || m.mark_latex_issue || m.mark_figure_issue) return true;
  const n = typeof m.notes === 'string' ? m.notes.trim() : '';
  return n.length > 0;
}

type Stage = 'pick-kb' | 'review';

/**
 * Reviewer flow: pick a knowledge base (cards) → chapters (left) → one question at a time (compact).
 * Resume position (KB / chapter / index) is stored in localStorage.
 */
const QuestionBankReviewWorkspace: React.FC = () => {
  const [stage, setStage] = useState<Stage>('pick-kb');
  const [userId, setUserId] = useState<string | null>(null);
  const [kbList, setKbList] = useState<KbRow[]>([]);
  const [kbId, setKbId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [chapterQCounts, setChapterQCounts] = useState<Record<string, number>>({});
  const [chapterReviewedCounts, setChapterReviewedCounts] = useState<Record<string, number>>({});
  const [chapterMarkedCounts, setChapterMarkedCounts] = useState<Record<string, number>>({});
  const [loadingKb, setLoadingKb] = useState(true);
  const [loadingCh, setLoadingCh] = useState(false);
  const [loadingQs, setLoadingQs] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [marksByQuestion, setMarksByQuestion] = useState<Record<string, ReviewMarkInput>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selectedClassFilters, setSelectedClassFilters] = useState<Set<string>>(new Set());
  const [selectedSubjectFilters, setSelectedSubjectFilters] = useState<Set<string>>(new Set());

  const classFilterOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chapters) {
      const cls = (c.class_name && String(c.class_name).trim()) || 'Unassigned';
      m.set(cls, (m.get(cls) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chapters]);

  const subjectFilterOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chapters) {
      const sub = (c.subject_name && String(c.subject_name).trim()) || 'Unassigned';
      m.set(sub, (m.get(sub) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chapters]);

  const filteredChapters = useMemo(() => {
    return chapters.filter((c) => {
      const cls = (c.class_name && String(c.class_name).trim()) || 'Unassigned';
      const sub = (c.subject_name && String(c.subject_name).trim()) || 'Unassigned';
      if (selectedClassFilters.size > 0 && !selectedClassFilters.has(cls)) return false;
      if (selectedSubjectFilters.size > 0 && !selectedSubjectFilters.has(sub)) return false;
      return true;
    });
  }, [chapters, selectedClassFilters, selectedSubjectFilters]);

  useEffect(() => {
    if (stage !== 'review' || !kbId || loadingCh) return;
    if (filteredChapters.length === 0) {
      if (chapterId !== null) setChapterId(null);
      return;
    }
    if (!chapterId || !filteredChapters.some((c) => c.id === chapterId)) {
      setChapterId(filteredChapters[0].id);
      setQIndex(0);
    }
  }, [filteredChapters, chapterId, stage, kbId, loadingCh]);

  useEffect(() => {
    setSelectedClassFilters(new Set());
    setSelectedSubjectFilters(new Set());
  }, [kbId]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingKb(true);
      setError(null);
      try {
        const { data, error: e } = await supabase.from('knowledge_bases').select('id, name').order('name');
        if (e) throw new Error(e.message || String(e));
        if (cancelled) return;
        const rows = (data || []) as KbRow[];
        setKbList(rows);
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
      setChapters([]);
      setChapterId(null);
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
        const resume = readResume();
        if (resume && resume.kbId === kbId && rows.some((r) => r.id === resume.chapterId)) {
          setChapterId(resume.chapterId);
        } else {
          setChapterId(rows[0]?.id ?? null);
        }
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

  /** Per-chapter question totals + how many this reviewer has saved a mark row for (any flags/notes or not). */
  useEffect(() => {
    if (!userId || chapters.length === 0) {
      setChapterQCounts({});
      setChapterReviewedCounts({});
      setChapterMarkedCounts({});
      return;
    }
    let cancelled = false;
    const chapterIds = chapters.map((c) => c.id);
    (async () => {
      setLoadingStats(true);
      try {
        const { data: qrows, error: qe } = await supabase
          .from('question_bank_neet')
          .select('id, chapter_id')
          .in('chapter_id', chapterIds);
        if (qe) throw new Error(qe.message);
        if (cancelled) return;
        const rows = (qrows || []) as { id: string; chapter_id: string }[];
        const qCount: Record<string, number> = {};
        for (const r of rows) {
          qCount[r.chapter_id] = (qCount[r.chapter_id] || 0) + 1;
        }
        const reviewedByChapter: Record<string, number> = {};
        const markedByChapter: Record<string, number> = {};
        const qids = rows.map((r) => r.id);
        const reviewedIds = new Set<string>();
        const markedIds = new Set<string>();
        const chunk = 400;
        for (let i = 0; i < qids.length; i += chunk) {
          const slice = qids.slice(i, i + chunk);
          if (slice.length === 0) continue;
          const { data: marks, error: me } = await supabase
            .from('question_bank_review_marks')
            .select('question_id, mark_wrong, mark_out_of_syllabus, mark_latex_issue, mark_figure_issue, notes')
            .eq('reviewer_id', userId)
            .in('question_id', slice);
          if (me) throw new Error(me.message);
          (marks || []).forEach((m: MarkStatsRow) => {
            reviewedIds.add(m.question_id);
            if (markRowHasFlagsOrNotes(m)) markedIds.add(m.question_id);
          });
        }
        for (const r of rows) {
          if (reviewedIds.has(r.id)) {
            reviewedByChapter[r.chapter_id] = (reviewedByChapter[r.chapter_id] || 0) + 1;
            if (markedIds.has(r.id)) {
              markedByChapter[r.chapter_id] = (markedByChapter[r.chapter_id] || 0) + 1;
            }
          }
        }
        if (!cancelled) {
          setChapterQCounts(qCount);
          setChapterReviewedCounts(reviewedByChapter);
          setChapterMarkedCounts(markedByChapter);
        }
      } catch {
        if (!cancelled) {
          setChapterQCounts({});
          setChapterReviewedCounts({});
          setChapterMarkedCounts({});
        }
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, chapters, statsNonce]);

  const loadQuestions = useCallback(async (chapId: string) => {
    setLoadingQs(true);
    setError(null);
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
      const list = (data || []) as QuestionRow[];
      setQuestions(list);
      const resume = readResume();
      if (resume && resume.chapterId === chapId && resume.kbId === kbId && list.length > 0) {
        const idx = Math.min(Math.max(0, resume.qIndex), list.length - 1);
        setQIndex(idx);
      } else {
        setQIndex(0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setQuestions([]);
      setQIndex(0);
    } finally {
      setLoadingQs(false);
    }
  }, [kbId]);

  useEffect(() => {
    if (chapterId) void loadQuestions(chapterId);
    else {
      setQuestions([]);
      setQIndex(0);
    }
  }, [chapterId, loadQuestions]);

  const currentQuestion = questions[qIndex] ?? null;

  useEffect(() => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchReviewMarkForQuestion(qid);
        if (cancelled) return;
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
        if (!cancelled) setMarksByQuestion((prev) => ({ ...prev, [qid]: { ...emptyMarks } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentQuestion]);

  /** Persist resume when navigating inside review. */
  useEffect(() => {
    if (stage !== 'review' || !kbId || !chapterId || questions.length === 0) return;
    writeResume({ kbId, chapterId, qIndex });
  }, [stage, kbId, chapterId, qIndex, questions.length]);

  const kbTotals = useMemo(() => {
    let q = 0;
    let r = 0;
    let mk = 0;
    for (const c of chapters) {
      q += chapterQCounts[c.id] || 0;
      r += chapterReviewedCounts[c.id] || 0;
      mk += chapterMarkedCounts[c.id] || 0;
    }
    return { questions: q, reviewed: r, marked: mk };
  }, [chapters, chapterQCounts, chapterReviewedCounts, chapterMarkedCounts]);

  const chapterProgress = useMemo(() => {
    if (!chapterId) return { total: 0, reviewed: 0, marked: 0, index: 0 };
    const total = questions.length;
    const reviewed = chapterReviewedCounts[chapterId] ?? 0;
    const marked = chapterMarkedCounts[chapterId] ?? 0;
    return { total, reviewed, marked, index: qIndex + 1 };
  }, [chapterId, questions.length, chapterReviewedCounts, chapterMarkedCounts, qIndex]);

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
      setStatsNonce((n) => n + 1);
      if (advance === 'next') {
        if (qIndex < questions.length - 1) setQIndex((i) => i + 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const enterKb = (id: string) => {
    setKbId(id);
    setStage('review');
  };

  const leaveReview = () => {
    setStage('pick-kb');
    setChapterId(null);
    setQuestions([]);
    setQIndex(0);
  };

  const chLabel = (c: ChapterRow) =>
    [c.class_name, c.subject_name, c.name].filter(Boolean).join(' · ') || c.name;

  const resume = readResume();
  const resumeKb = resume && kbList.some((k) => k.id === resume.kbId) ? kbList.find((k) => k.id === resume.kbId) : null;

  return (
    <div className={`${workspacePageClass} flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/80`}>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-900">Question bank review</h1>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Pick a bank → chapter list → one question at a time. Your place is saved in this browser.
            </p>
          </div>
          {stage === 'review' && kbId ? (
            <button
              type="button"
              onClick={leaveReview}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-50"
            >
              ← Banks
            </button>
          ) : null}
        </div>
        {stage === 'review' && kbId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-zinc-600">
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 tabular-nums">
              <span className="font-black text-zinc-900">{kbTotals.reviewed}</span>{' '}
              <span className="font-bold text-zinc-600">reviewed</span>
              <span className="mx-1.5 text-zinc-300">·</span>
              <span className="font-black text-amber-900">{kbTotals.marked}</span>{' '}
              <span className="font-bold text-zinc-600">marked</span>
              <span className="mx-1.5 text-zinc-300">·</span>
              <span className="font-black text-zinc-900">{kbTotals.questions}</span>{' '}
              <span className="font-bold text-zinc-600">in bank</span>
            </span>
            {chapterId ? (
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-900 tabular-nums">
                Chapter · {Math.min(chapterProgress.index, chapterProgress.total)}/{chapterProgress.total} position ·{' '}
                <span className="font-black">{chapterProgress.reviewed}</span> reviewed ·{' '}
                <span className="font-black text-indigo-950">{chapterProgress.marked}</span> marked
              </span>
            ) : null}
            {loadingStats ? <span className="text-zinc-400">Updating counts…</span> : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="mx-4 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      {stage === 'pick-kb' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loadingKb ? (
            <p className="text-sm text-zinc-400">Loading banks…</p>
          ) : kbList.length === 0 ? (
            <p className="text-sm text-amber-800">
              No knowledge bases available. A developer must assign reviewer access to knowledge bases (Admin → Users).
            </p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {resumeKb && resume ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">Where you left off</p>
                  <p className="mt-1 text-xs text-indigo-950">
                    {resumeKb.name} — continue from question {resume.qIndex + 1} in your last chapter.
                  </p>
                  <button
                    type="button"
                    onClick={() => enterKb(resumeKb.id)}
                    className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
                  >
                    Continue
                  </button>
                </div>
              ) : null}
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Choose question bank</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {kbList.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => enterKb(k.id)}
                    className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <span className="text-sm font-bold text-zinc-900">{k.name}</span>
                    <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                      Open →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="flex max-h-[40vh] min-h-0 shrink-0 flex-col border-b border-zinc-200 bg-white lg:max-h-none lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-zinc-100 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Chapters</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-600">
                {kbList.find((x) => x.id === kbId)?.name ?? '—'}
              </p>
            </div>
            {!loadingCh && chapters.length > 0 ? (
              <div className="shrink-0 space-y-2 border-b border-zinc-100 px-2 py-2">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Class</span>
                    {selectedClassFilters.size > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedClassFilters(new Set())}
                        className="text-[7px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedClassFilters(new Set())}
                      className={`rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-widest ${
                        selectedClassFilters.size === 0
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                      }`}
                    >
                      All
                    </button>
                    {classFilterOptions.map(([cls, cnt]) => {
                      const active = selectedClassFilters.has(cls);
                      return (
                        <button
                          key={cls}
                          type="button"
                          title={`${cls} (${cnt})`}
                          onClick={() =>
                            setSelectedClassFilters((prev) => {
                              const next = new Set(prev);
                              if (next.has(cls)) next.delete(cls);
                              else next.add(cls);
                              return next;
                            })
                          }
                          className={`rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-widest ${
                            active
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                          }`}
                        >
                          {cls}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Subject</span>
                    {selectedSubjectFilters.size > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedSubjectFilters(new Set())}
                        className="text-[7px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSubjectFilters(new Set())}
                      className={`rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-widest ${
                        selectedSubjectFilters.size === 0
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                      }`}
                    >
                      All
                    </button>
                    {subjectFilterOptions.map(([sub, cnt]) => {
                      const active = selectedSubjectFilters.has(sub);
                      return (
                        <button
                          key={sub}
                          type="button"
                          title={`${sub} (${cnt})`}
                          onClick={() =>
                            setSelectedSubjectFilters((prev) => {
                              const next = new Set(prev);
                              if (next.has(sub)) next.delete(sub);
                              else next.add(sub);
                              return next;
                            })
                          }
                          className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-widest ${
                            active
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                          }`}
                        >
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5 custom-scrollbar">
              {loadingCh ? (
                <p className="p-2 text-[11px] text-zinc-400">Loading…</p>
              ) : chapters.length === 0 ? (
                <p className="p-2 text-[11px] text-zinc-500">No chapters.</p>
              ) : filteredChapters.length === 0 ? (
                <p className="p-2 text-[11px] text-zinc-500">No chapters match filters.</p>
              ) : (
                <ul className="space-y-0.5">
                  {filteredChapters.map((c) => {
                    const active = c.id === chapterId;
                    const tq = chapterQCounts[c.id] ?? 0;
                    const tr = chapterReviewedCounts[c.id] ?? 0;
                    const tm = chapterMarkedCounts[c.id] ?? 0;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setChapterId(c.id);
                            setQIndex(0);
                          }}
                          className={`w-full rounded-lg px-2 py-1.5 text-left text-[10px] font-medium leading-snug transition-colors ${
                            active ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="line-clamp-2">{chLabel(c)}</span>
                          <span
                            className={`mt-0.5 block text-[9px] font-bold tabular-nums ${
                              active ? 'text-indigo-100' : 'text-zinc-400'
                            }`}
                          >
                            {tm} marked · {tr}/{tq} reviewed
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50/50">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-1.5">
              <p className="text-[10px] font-bold text-zinc-700">
                {currentQuestion ? (
                  <>
                    Q {qIndex + 1} / {questions.length}
                  </>
                ) : (
                  '—'
                )}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={qIndex <= 0 || loadingQs}
                  onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                  className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={qIndex >= questions.length - 1 || loadingQs}
                  onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
              {loadingQs ? (
                <div className="flex h-32 items-center justify-center text-xs text-zinc-400">Loading…</div>
              ) : !chapterId ? (
                <p className="text-xs text-zinc-500">Select a chapter.</p>
              ) : questions.length === 0 ? (
                <p className="text-xs text-zinc-500">No questions in this chapter.</p>
              ) : currentQuestion ? (
                <article className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-white">{currentQuestion.difficulty}</span>
                    <span className="rounded border border-zinc-200 px-1.5 py-0.5">{currentQuestion.question_type}</span>
                    {currentQuestion.topic_tag ? (
                      <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5">{currentQuestion.topic_tag}</span>
                    ) : null}
                  </div>
                  <div
                    className="math-content mt-1.5 text-xs font-medium leading-snug text-zinc-900"
                    dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(currentQuestion.question_text) }}
                  />
                  {currentQuestion.figure_url ? (
                    <div className="mt-2 flex justify-center rounded-lg border border-zinc-100 bg-zinc-50 p-1">
                      <img src={currentQuestion.figure_url} alt="" className="max-h-40 max-w-full object-contain" />
                    </div>
                  ) : null}
                  <ul className="mt-2 space-y-1">
                    {(currentQuestion.options || []).map((opt, i) => (
                      <li
                        key={i}
                        className={`rounded-md border px-2 py-1 text-[11px] leading-snug ${
                          i === currentQuestion.correct_index
                            ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
                            : 'border-zinc-100 bg-zinc-50/60 text-zinc-700'
                        }`}
                      >
                        <span className="font-bold text-zinc-400">({String.fromCharCode(65 + i)})</span>{' '}
                        <span
                          className="math-content inline"
                          dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(opt) }}
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowExplanation((v) => !v)}
                    className="mt-2 text-[9px] font-bold uppercase tracking-wide text-amber-800 underline decoration-amber-300"
                  >
                    {showExplanation ? 'Hide explanation' : 'Show explanation'}
                  </button>
                  {showExplanation ? (
                    <div className="mt-1 rounded-lg border border-amber-100 bg-amber-50/80 p-2">
                      <div
                        className="math-content text-[11px] leading-snug text-amber-950"
                        dangerouslySetInnerHTML={{
                          __html: parsePseudoLatexAndMath(currentQuestion.explanation || '—'),
                        }}
                      />
                    </div>
                  ) : null}

                  {(() => {
                    const qid = currentQuestion.id;
                    const mk = marksByQuestion[qid] || emptyMarks;
                    return (
                      <div className="mt-3 border-t border-zinc-100 pt-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Flags</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <label
                            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              mk.wrong ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.wrong}
                              onChange={(e) => setMarkField(qid, { wrong: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            Wrong
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              mk.outOfSyllabus
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.outOfSyllabus}
                              onChange={(e) => setMarkField(qid, { outOfSyllabus: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            OOS
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              mk.latexIssue
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.latexIssue}
                              onChange={(e) => setMarkField(qid, { latexIssue: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            LaTeX
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              mk.figureIssue
                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                : 'border-zinc-200 bg-white text-zinc-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={mk.figureIssue}
                              onChange={(e) => setMarkField(qid, { figureIssue: e.target.checked })}
                              className="rounded border-zinc-300"
                            />
                            Figure
                          </label>
                        </div>
                        <textarea
                          value={mk.notes}
                          onChange={(e) => setMarkField(qid, { notes: e.target.value })}
                          rows={2}
                          placeholder="Notes (optional)"
                          className="mt-1.5 w-full rounded-md border border-zinc-200 px-2 py-1 text-[11px]"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingId === qid}
                            onClick={() => void handleSubmitOne(qid, 'next')}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {savingId === qid ? 'Saving…' : 'Save & next'}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === qid}
                            onClick={() => void handleSubmitOne(qid, 'stay')}
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-zinc-700"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </article>
              ) : null}
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default QuestionBankReviewWorkspace;
