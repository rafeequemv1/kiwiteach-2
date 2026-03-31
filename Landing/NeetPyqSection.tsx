import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import InteractiveQuizSession from '../Quiz/components/InteractiveQuizSession';
import type { Question, QuestionType } from '../Quiz/types';
import { landingTheme } from './theme';

interface NeetPyqSectionProps {
  isLoggedIn: boolean;
  onLoginClick: () => void;
}

type PyqRow = {
  id: string;
  question_text: string;
  options: unknown;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  difficulty: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  year: number | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pyqRowToQuestion(row: PyqRow): Question | null {
  const raw = row.options;
  const opts = Array.isArray(raw) ? raw.map((x) => String(x ?? '')) : [];
  if (opts.length < 2) return null;
  const ci = typeof row.correct_index === 'number' ? row.correct_index : 0;
  if (ci < 0 || ci >= opts.length) return null;
  const d = (row.difficulty || 'medium').toLowerCase();
  const difficulty: 'Easy' | 'Medium' | 'Hard' =
    d === 'easy' ? 'Easy' : d === 'hard' ? 'Hard' : 'Medium';
  const qt = (row.question_type || 'mcq').toLowerCase();
  const type: QuestionType = qt === 'reasoning' ? 'reasoning' : 'mcq';
  return {
    id: row.id,
    type,
    text: row.question_text,
    options: opts,
    correctIndex: ci,
    explanation: row.explanation || '',
    difficulty,
    sourceChapterName: row.chapter_name || undefined,
    sourceSubjectName: row.subject_name || undefined,
    topic_tag: row.topic_tag || undefined,
  };
}

const NeetPyqSection: React.FC<NeetPyqSectionProps> = ({ isLoggedIn, onLoginClick }) => {
  const [yearFilter, setYearFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [questionCount, setQuestionCount] = useState(25);
  const [years, setYears] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingStart, setLoadingStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<Question[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const { data, error: qErr } = await supabase
          .from('pyq_questions_neet')
          .select('year, subject_name')
          .limit(8000);
        if (qErr) throw qErr;
        if (cancelled || !data) return;
        const ySet = new Set<number>();
        const sSet = new Set<string>();
        for (const r of data as { year: number | null; subject_name: string | null }[]) {
          if (typeof r.year === 'number') ySet.add(r.year);
          if (r.subject_name && String(r.subject_name).trim()) sSet.add(String(r.subject_name).trim());
        }
        setYears([...ySet].sort((a, b) => b - a));
        setSubjects([...sSet].sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!cancelled) {
          setYears([]);
          setSubjects([]);
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startPractice = useCallback(async () => {
    if (!isLoggedIn) {
      onLoginClick();
      return;
    }
    setLoadingStart(true);
    setError(null);
    try {
      let q = supabase
        .from('pyq_questions_neet')
        .select(
          'id, question_text, options, correct_index, explanation, question_type, difficulty, subject_name, chapter_name, topic_tag, year'
        )
        .limit(500);
      if (yearFilter) q = q.eq('year', parseInt(yearFilter, 10));
      if (subjectFilter) q = q.eq('subject_name', subjectFilter);
      const { data, error: fetchErr } = await q;
      if (fetchErr) throw fetchErr;
      const rows = (data || []) as PyqRow[];
      const mapped = rows.map(pyqRowToQuestion).filter((x): x is Question => x != null);
      const pool = shuffle(mapped);
      const n = Math.min(Math.max(1, questionCount), pool.length);
      if (n === 0) {
        setError('No practice questions match your filters yet (need valid MCQ rows with options).');
        return;
      }
      setSessionQuestions(pool.slice(0, n));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load questions.');
    } finally {
      setLoadingStart(false);
    }
  }, [isLoggedIn, onLoginClick, yearFilter, subjectFilter, questionCount]);

  if (sessionQuestions && sessionQuestions.length > 0) {
    return (
      <InteractiveQuizSession
        questions={sessionQuestions}
        topic="NEET PYQ practice"
        onExit={() => setSessionQuestions(null)}
        exitButtonLabel="Back to NEET"
      />
    );
  }

  return (
    <section
      id="pyqs"
      className="scroll-mt-24 border-t border-zinc-200 bg-white px-4 py-16 md:px-6 md:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Practice</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">Previous year questions</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Work through NEET PYQs from our bank. Choose a year and subject (optional), set how many questions to include, then start a timed practice session.
        </p>

        {!isLoggedIn && (
          <div
            className="mt-8 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-5 text-sm text-indigo-950"
            style={{ boxShadow: landingTheme.shadow.soft }}
          >
            <p className="font-semibold">Sign in to practice</p>
            <p className="mt-1 text-indigo-900/80">
              PYQ practice uses your KiwiTeach account so attempts stay private. Use the same login as the dashboard.
            </p>
            <button
              type="button"
              onClick={onLoginClick}
              className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700"
            >
              Sign in
            </button>
          </div>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Year</span>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              disabled={loadingMeta}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 outline-none focus:border-indigo-400"
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Subject</span>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              disabled={loadingMeta}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 outline-none focus:border-indigo-400"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Number of questions</span>
            <input
              type="number"
              min={1}
              max={200}
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value, 10) || 25)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 outline-none focus:border-indigo-400"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={() => void startPractice()}
          disabled={loadingStart || loadingMeta}
          className="mt-8 w-full rounded-2xl bg-zinc-900 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-zinc-900/15 transition hover:bg-zinc-800 disabled:opacity-50 sm:w-auto sm:px-12"
        >
          {loadingStart ? 'Loading…' : 'Start practice'}
        </button>
      </div>
    </section>
  );
};

export default NeetPyqSection;
