import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import InteractiveQuizSession from '../Quiz/components/InteractiveQuizSession';
import type { Question, QuestionType } from '../Quiz/types';
import { LandingCtaButton } from './LandingCtaButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

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

const selectClass =
  'flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

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
      <div ref={practiceAnchorRef} className="relative flex w-full justify-center px-3 py-4 md:px-4">
        <InteractiveQuizSession
          questions={sessionQuestions}
          topic="NEET PYQ practice"
          onExit={() => setSessionQuestions(null)}
          exitButtonLabel="Back to NEET PYQ"
          layout="embedded"
        />
      </div>
    );
  }

  return (
    <section id="pyqs" className="scroll-mt-24 border-t border-border bg-muted/30 px-4 py-10 md:px-6 md:py-14">
      <div className="mx-auto max-w-lg">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="space-y-1 pb-4">
            <Badge variant="secondary" className="w-fit text-[10px] font-semibold uppercase tracking-wider">
              Practice
            </Badge>
            <CardTitle className="font-heading text-xl md:text-2xl">Previous year questions</CardTitle>
            <CardDescription>
              Filter by year and subject, choose how many questions, then practice in the panel below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isLoggedIn && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="font-medium text-foreground">Sign in to practice</p>
                <p className="mt-1 text-xs text-muted-foreground">Uses your KiwiTeach account.</p>
                <LandingCtaButton className="mt-3 !h-9 !px-5 !text-sm" onClick={onLoginClick}>
                  Sign in
                </LandingCtaButton>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Year</Label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  disabled={loadingMeta}
                  className={selectClass}
                >
                  <option value="">All years</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Subject</Label>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  disabled={loadingMeta}
                  className={selectClass}
                >
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Questions</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value, 10) || 25)}
                  className="max-w-[8rem]"
                />
              </div>
            </div>

            {error && <p className="text-xs font-medium text-destructive">{error}</p>}

            <LandingCtaButton
              type="button"
              className="w-full !text-base"
              onClick={() => void startPractice()}
              disabled={loadingStart || loadingMeta}
            >
              {loadingStart ? 'Loading…' : 'Start practice'}
            </LandingCtaButton>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default NeetPyqSection;
