import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const practiceAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionQuestions?.length) {
      practiceAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [sessionQuestions]);

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
      <div ref={practiceAnchorRef} className="relative w-full flex justify-center px-3 py-4 md:px-4">
        <InteractiveQuizSession
          questions={sessionQuestions}
          topic="NEET PYQ practice"
          onExit={() => setSessionQuestions(null)}
          exitButtonLabel="Back to NEET"
          layout="embedded"
        />
      </div>
    );
  }

  return (
    <section id="pyqs" className="scroll-mt-24 border-t border-zinc-200 bg-zinc-50/50 px-4 py-10 md:px-6 md:py-14">
      <div className="mx-auto max-w-lg">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Practice</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 md:text-2xl">Previous year questions</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Filter by year and subject, choose how many questions, then practice in the panel below.
        </p>

        {!isLoggedIn && (
          <div
            className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/90 p-4 text-sm text-indigo-950"
            style={{ boxShadow: landingTheme.shadow.soft }}
          >
            <p className="font-medium">Sign in to practice</p>
            <p className="mt-1 text-xs text-indigo-900/85">Uses your KiwiTeach account.</p>
            <button
              type="button"
              onClick={onLoginClick}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700"
            >
              Sign in
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase text-zinc-500">Year</span>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              disabled={loadingMeta}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-900 outline-none focus:border-indigo-400"
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase text-zinc-500">Subject</span>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              disabled={loadingMeta}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-900 outline-none focus:border-indigo-400"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase text-zinc-500">Questions</span>
            <input
              type="number"
              min={1}
              max={200}
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value, 10) || 25)}
              className="w-full max-w-[8rem] rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-900 outline-none focus:border-indigo-400"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={() => void startPractice()}
          disabled={loadingStart || loadingMeta}
          className="mt-5 w-full rounded-lg bg-zinc-900 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {loadingStart ? 'Loading…' : 'Start practice'}
        </button>
      </div>
    </section>
  );
};

export default NeetPyqSection;
