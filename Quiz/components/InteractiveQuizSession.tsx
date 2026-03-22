
import '../../types';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { submitTestAttempt, type SubmitAttemptResult } from '../services/studentTestService';

interface InteractiveQuizSessionProps {
  questions: Question[];
  onExit: () => void;
  topic: string;
  /** When set, answers are scored on the server and stored in `online_test_attempts` / `online_test_attempt_responses`. */
  testId?: string | null;
  /** Total time for the exam in seconds (default: 60s per question). */
  examDurationSeconds?: number;
}

type QuestionStatus = 'not_visited' | 'not_answered' | 'answered' | 'marked' | 'marked_answered';

const roman = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][n] || (n + 1).toString();
const alpha = (n: number) => String.fromCharCode(65 + n);

const InteractiveQuizSession: React.FC<InteractiveQuizSessionProps> = ({
  questions,
  onExit,
  topic,
  testId,
  examDurationSeconds,
}) => {
  const initialSeconds = Math.max(
    60,
    examDurationSeconds ?? questions.length * 60
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({}); 
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(initialSeconds); 
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [serverSummary, setServerSummary] = useState<SubmitAttemptResult | null>(null);
  const [questionMapOpen, setQuestionMapOpen] = useState(false);
  const [isLgExamLayout, setIsLgExamLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const isSubmittedRef = useRef(false);
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      setIsLgExamLayout(mq.matches);
      if (mq.matches) setQuestionMapOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!questionMapOpen || isLgExamLayout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuestionMapOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [questionMapOpen, isLgExamLayout]);

  const finalizeSubmit = useCallback(
    async (auto: boolean) => {
      if (isSubmittedRef.current) return;
      if (!auto && !window.confirm('Are you sure you want to submit your test?')) return;
      if (!testId) {
        isSubmittedRef.current = true;
        setIsSubmitted(true);
        return;
      }
      isSubmittedRef.current = true;
      setIsSavingResult(true);
      const elapsed = Math.max(0, initialSeconds - timeLeftRef.current);
      try {
        const summary = await submitTestAttempt(testId, answers, questions.length, elapsed);
        setServerSummary(summary);
        setIsSavingResult(false);
        setIsSubmitted(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not save your result';
        isSubmittedRef.current = false;
        setIsSavingResult(false);
        alert(msg);
      }
    },
    [testId, answers, questions.length, initialSeconds]
  );

  const finalizeRef = useRef(finalizeSubmit);
  finalizeRef.current = finalizeSubmit;

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void finalizeRef.current(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  useEffect(() => {
    setVisited(prev => {
        const next = new Set(prev);
        next.add(currentQuestionIndex);
        return next;
    });
  }, [currentQuestionIndex]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatus = useCallback((index: number): QuestionStatus => {
    const hasAnswer = answers[index] !== undefined;
    const isMarked = marked.has(index);
    if (hasAnswer && isMarked) return 'marked_answered';
    if (hasAnswer) return 'answered';
    if (isMarked) return 'marked';
    if (visited.has(index)) return 'not_answered';
    return 'not_visited';
  }, [answers, visited, marked]);

  const handleOptionSelect = (optIndex: number) => {
    setAnswers(prev => ({ ...prev, [currentQuestionIndex]: optIndex }));
  };

  const handleClearResponse = () => {
    const newAnswers = { ...answers };
    delete newAnswers[currentQuestionIndex];
    setAnswers(newAnswers);
  };

  const handleSaveNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleMarkReviewNext = () => {
    setMarked(prev => {
        const next = new Set(prev);
        next.add(currentQuestionIndex);
        return next;
    });
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleSubmit = () => {
    void finalizeSubmit(false);
  };

  const calculateScore = () => {
    let score = 0; let correct = 0; let wrong = 0; let attempted = 0;
    questions.forEach((q, idx) => {
        if (answers[idx] !== undefined) {
            attempted++;
            if (q.correctIndex >= 0 && answers[idx] === q.correctIndex) { score += 4; correct++; } 
            else if (q.correctIndex >= 0) { score -= 1; wrong++; }
        }
    });
    return { score, correct, wrong, attempted };
  };

  const { currentQ, columnA, columnB, isMatching } = useMemo(() => {
    const q = questions[currentQuestionIndex];
    const isMatching = q.type === 'matching';
    return { currentQ: q, columnA: q.columnA, columnB: q.columnB, isMatching };
  }, [currentQuestionIndex, questions]);

  const questionMapButtons = useMemo(
    () => (
      <div className="grid grid-cols-5 gap-2 min-[380px]:grid-cols-6 lg:grid-cols-4 lg:gap-3">
        {questions.map((_, idx) => {
          const status = getStatus(idx);
          let btnClass = 'bg-white text-slate-400 border-2 border-slate-100 hover:border-indigo-200';
          let shapeClass = 'rounded-xl';
          if (status === 'not_answered') btnClass = 'bg-rose-50 text-rose-600 border-2 border-rose-200';
          else if (status === 'answered') btnClass = 'bg-emerald-500 text-white border-2 border-emerald-600 shadow-md shadow-emerald-500/30';
          else if (status === 'marked') {
            btnClass = 'bg-purple-50 text-purple-600 border-2 border-purple-200 rounded-full';
            shapeClass = 'rounded-full';
          } else if (status === 'marked_answered') {
            btnClass = 'bg-purple-600 text-white border-2 border-purple-800 shadow-md';
            shapeClass = 'rounded-full';
          }
          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setCurrentQuestionIndex(idx);
                setQuestionMapOpen(false);
              }}
              className={`relative flex h-10 w-10 items-center justify-center font-black text-[11px] transition-all duration-200 sm:h-12 sm:w-12 sm:text-xs ${shapeClass} ${btnClass} ${currentQuestionIndex === idx ? 'z-10 scale-110 ring-2 ring-indigo-500 ring-offset-2' : 'scale-100'}`}
            >
              {idx + 1}
              {status === 'marked_answered' && (
                <div className="absolute -right-0.5 -top-0.5 h-3 w-3 translate-x-0.5 -translate-y-0.5 rounded-full border-2 border-purple-600 bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
    ),
    [questions, currentQuestionIndex, getStatus]
  );

  const questionMapLegend = (
    <div className="grid grid-cols-2 gap-2 text-[8px] font-bold uppercase tracking-wider text-slate-500 sm:gap-3 sm:text-[9px]">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 shrink-0 rounded-md border-2 border-slate-200 bg-white" />
        Not Visited
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-3 w-3 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-[8px] text-rose-500">
          !
        </div>
        Not Ans
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 shrink-0 rounded-md bg-emerald-500 shadow-sm" />
        Answered
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 shrink-0 rounded-full bg-purple-500 shadow-sm" />
        Marked
      </div>
    </div>
  );

  if (isSavingResult && !isSubmitted) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Saving your result…</p>
      </div>
    );
  }

  if (isSubmitted) {
      const fromServer = serverSummary;
      const local = calculateScore();
      const score = fromServer ? fromServer.score : local.score;
      const correct = fromServer ? fromServer.correct_count : local.correct;
      const wrong = fromServer ? fromServer.wrong_count : local.wrong;
      const attempted = fromServer ? fromServer.attempted_count : local.attempted;
      const maxMarks = fromServer ? fromServer.max_score : questions.length * 4;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      return (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
           <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-xl border border-white overflow-hidden animate-fade-in">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white flex justify-between items-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="relative z-10">
                      <h1 className="text-3xl font-black uppercase tracking-tight">Scorecard</h1>
                      <p className="text-indigo-200 text-sm font-medium mt-1">{topic}</p>
                      {testId && fromServer && (
                        <p className="text-[9px] font-bold text-indigo-200/90 mt-2 uppercase tracking-widest">Saved to your record</p>
                      )}
                  </div>
                  <div className="relative z-10 text-right">
                      <p className="text-4xl font-black">{score} <span className="text-xl font-medium text-indigo-200">/ {maxMarks}</span></p>
                      <p className="text-[10px] uppercase font-bold text-indigo-300 tracking-[0.2em]">Total Marks</p>
                  </div>
              </div>
              <div className="p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Attempted</p>
                          <p className="text-3xl font-black text-slate-700">{attempted}</p>
                      </div>
                      <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Correct</p>
                          <p className="text-3xl font-black text-emerald-700">{correct}</p>
                      </div>
                      <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Wrong</p>
                          <p className="text-3xl font-black text-rose-700">{wrong}</p>
                      </div>
                      <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Accuracy</p>
                          <p className="text-3xl font-black text-blue-700">{accuracy}%</p>
                      </div>
                  </div>
                  {fromServer && fromServer.unanswered_count > 0 && (
                    <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Unanswered: {fromServer.unanswered_count}
                    </p>
                  )}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-center">
                  <button onClick={onExit} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 text-xs">Return to Dashboard</button>
              </div>
           </div>
        </div>
      );
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50 via-purple-50 to-pink-50 font-sans"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
        <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-indigo-100 bg-white/80 px-3 shadow-sm backdrop-blur-md sm:h-16 sm:px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:gap-4">
                <div className="shrink-0 rounded-xl bg-indigo-600 p-1.5 text-white shadow-lg shadow-indigo-600/20 sm:p-2">
                    <iconify-icon icon="mdi:school" width="18" className="sm:w-[20px]" />
                </div>
                <div className="min-w-0">
                    <h1 className="truncate text-xs font-black uppercase leading-none tracking-widest text-slate-800 sm:text-sm">KiwiTeach</h1>
                    <span className="hidden text-[10px] font-bold uppercase tracking-widest text-indigo-400 sm:block">Exam Mode</span>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
                <div
                    className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 sm:gap-3 sm:px-4 sm:py-2 ${
                        timeLeft < 300 ? 'animate-pulse border-rose-200 bg-rose-50 text-rose-600' : 'border-indigo-100 bg-white text-indigo-900 shadow-sm'
                    }`}
                >
                    <iconify-icon icon="mdi:clock-outline" width="16" className="sm:w-[18px]" />
                    <span className="font-mono text-sm font-black leading-none sm:text-lg">{formatTime(timeLeft)}</span>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg sm:h-10 sm:w-10">
                    <iconify-icon icon="mdi:account" width="18" className="sm:w-[20px]" />
                </div>
            </div>
        </header>
        <div className="h-1 w-full shrink-0 bg-indigo-100">
            <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            />
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-end justify-between gap-2 px-3 pb-2 pt-3 sm:px-5 lg:px-8 lg:pt-6">
                    <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
                        <span className="text-2xl font-black text-indigo-900/80 sm:text-3xl lg:text-4xl">Q{currentQuestionIndex + 1}</span>
                        <span className="text-sm font-bold text-indigo-300 sm:text-base lg:text-lg">/ {questions.length}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setQuestionMapOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 lg:hidden"
                    >
                        <iconify-icon icon="mdi:map-outline" width="18" />
                        Map
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4 custom-scrollbar sm:px-5 sm:pb-6 lg:px-8 lg:pb-8">
                    <div className="mx-auto mt-2 w-full min-w-0 max-w-5xl sm:mt-4">
                        <div className="relative w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-white bg-white/70 p-4 shadow-xl shadow-indigo-100/50 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 lg:rounded-[2.5rem] lg:p-8">
                            <div className="relative z-10 mb-6 text-base font-bold leading-relaxed text-slate-800 sm:mb-8 sm:text-lg">
                                {renderWithSmiles(parsePseudoLatexAndMath(currentQ.text), 140)}
                            </div>
                            
                            {isMatching && columnA && columnB && columnA.length > 0 && (
                                <div className="mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-inner sm:mb-8">
                                    <table className="w-full min-w-[280px] border-collapse bg-white text-sm">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="font-bold p-3 text-left w-1/2 border-b-2 border-r border-slate-200 uppercase tracking-widest text-[10px] text-slate-500">Column A</th>
                                                <th className="font-bold p-3 text-left w-1/2 border-b-2 border-slate-200 uppercase tracking-widest text-[10px] text-slate-500">Column B</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: Math.max(columnA.length, columnB.length) }).map((_, index) => (
                                                <tr key={index} className="border-b border-slate-100 last:border-b-0">
                                                    <td className="p-3 align-top border-r border-slate-100">
                                                        {columnA![index] && (
                                                            <div className="flex gap-3 items-start">
                                                                <span className="font-bold text-indigo-600 shrink-0">({alpha(index)})</span>
                                                                <span>{renderWithSmiles(parsePseudoLatexAndMath(columnA![index]), 90)}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 align-top">
                                                        {columnB![index] && (
                                                            <div className="flex gap-3 items-start">
                                                                <span className="font-bold text-indigo-600 shrink-0">({roman(index)})</span>
                                                                <span>{renderWithSmiles(parsePseudoLatexAndMath(columnB![index]), 90)}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-3 sm:gap-4">
                                {currentQ.options.map((opt, idx) => {
                                    const isSelected = answers[currentQuestionIndex] === idx;
                                    return (
                                        <label
                                            key={idx}
                                            className={`group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border-2 p-3 transition-all duration-300 sm:gap-6 sm:p-5 ${
                                                isSelected
                                                    ? 'scale-[1.01] border-transparent bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30'
                                                    : 'border-indigo-50 bg-white text-slate-600 hover:border-indigo-200 hover:shadow-md'
                                            }`}
                                        >
                                            <div
                                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 text-xs font-black transition-all sm:h-10 sm:w-10 sm:text-sm ${
                                                    isSelected
                                                        ? 'border-transparent bg-white/20 text-white'
                                                        : 'border-indigo-100 bg-indigo-50 text-indigo-400 group-hover:border-indigo-200 group-hover:bg-white'
                                                }`}
                                            >
                                                {idx + 1}
                                            </div>
                                            <input type="radio" name={`q-${currentQuestionIndex}`} checked={isSelected} onChange={() => handleOptionSelect(idx)} className="hidden" />
                                            <div className="min-w-0 flex-1 text-sm font-bold leading-snug">{renderWithSmiles(parsePseudoLatexAndMath(opt), 100)}</div>
                                            {isSelected && (
                                                <div className="animate-fade-in rounded-full bg-white/20 p-1.5 backdrop-blur-sm">
                                                    <iconify-icon icon="mdi:check" className="block text-lg text-white sm:text-xl" />
                                                </div>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="z-10 shrink-0 border-t border-indigo-50 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-5 lg:bg-white/80 lg:px-8">
                    <div className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-2 lg:max-w-none lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            <button
                                type="button"
                                onClick={handleMarkReviewNext}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-purple-200 bg-white px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-purple-600 shadow-sm transition-all hover:bg-purple-50 sm:flex-none sm:px-5 sm:py-3.5 sm:text-[10px]"
                            >
                                <iconify-icon icon="mdi:bookmark-outline" className="text-base text-purple-600 sm:text-lg" />
                                <span className="max-[360px]:sr-only">Mark for Review</span>
                                <span className="hidden max-[360px]:inline">Mark</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleClearResponse}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 sm:px-6 sm:py-3.5 sm:text-[10px]"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 lg:contents">
                            <button
                                type="button"
                                onClick={handleSaveNext}
                                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-slate-800 active:scale-95 sm:order-none sm:w-auto sm:px-8 sm:py-3.5 sm:text-xs sm:tracking-[0.2em] lg:ml-auto"
                            >
                                Save & Next{' '}
                                <iconify-icon icon="mdi:arrow-right" className="transition-transform group-hover:translate-x-1" />
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                className="order-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-700 active:scale-95 lg:hidden"
                            >
                                <iconify-icon icon="mdi:check-all" className="text-base" />
                                Submit Test
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <aside className="hidden min-h-0 w-72 shrink-0 flex-col border-l border-indigo-100 bg-white/60 shadow-2xl backdrop-blur-xl lg:flex xl:w-80">
                <div className="border-b border-indigo-50 bg-white/50 p-4 lg:p-6">
                    <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-800 lg:mb-4">Question Map</h3>
                    {questionMapLegend}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar lg:p-6">{questionMapButtons}</div>
                <div className="border-t border-indigo-50 bg-white/80 p-4 lg:p-6">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-700 active:scale-95 lg:py-4"
                    >
                        <iconify-icon icon="mdi:check-all" className="text-lg" />
                        Submit Test
                    </button>
                </div>
            </aside>
        </div>

        {!isLgExamLayout && questionMapOpen && (
            <>
                <button
                    type="button"
                    aria-label="Close question map"
                    className="fixed inset-0 z-[125] animate-fade-in bg-slate-900/50"
                    onClick={() => setQuestionMapOpen(false)}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exam-map-title"
                    className="animate-slide-up fixed inset-x-0 bottom-0 z-[130] flex max-h-[85vh] flex-col rounded-t-2xl border border-slate-200 border-b-0 bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.15)]"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                    <div className="flex justify-center pt-2 pb-1" aria-hidden>
                        <div className="h-1 w-10 rounded-full bg-slate-300" />
                    </div>
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2">
                        <span id="exam-map-title" className="text-xs font-black uppercase tracking-widest text-slate-800">
                            Question map
                        </span>
                        <button
                            type="button"
                            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                            onClick={() => setQuestionMapOpen(false)}
                            aria-label="Close"
                        >
                            <iconify-icon icon="mdi:close" width="22" />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                        <div className="mb-4">{questionMapLegend}</div>
                        {questionMapButtons}
                    </div>
                    <div className="shrink-0 border-t border-slate-100 px-4 pt-3">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg active:scale-[0.99]"
                        >
                            <iconify-icon icon="mdi:check-all" className="text-lg" />
                            Submit Test
                        </button>
                    </div>
                </div>
            </>
        )}
    </div>
  );
};

export default InteractiveQuizSession;
