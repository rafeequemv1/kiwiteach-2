
import '../../types';
import React, { useState, useEffect, useMemo } from 'react';
import { Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';

interface InteractiveQuizSessionProps {
  questions: Question[];
  onExit: () => void;
  topic: string;
}

type QuestionStatus = 'not_visited' | 'not_answered' | 'answered' | 'marked' | 'marked_answered';

const roman = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][n] || (n + 1).toString();
const alpha = (n: number) => String.fromCharCode(65 + n);

const InteractiveQuizSession: React.FC<InteractiveQuizSessionProps> = ({ questions, onExit, topic }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({}); 
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(questions.length * 60); 
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
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

  const getStatus = (index: number): QuestionStatus => {
    const hasAnswer = answers[index] !== undefined;
    const isMarked = marked.has(index);
    if (hasAnswer && isMarked) return 'marked_answered';
    if (hasAnswer) return 'answered';
    if (isMarked) return 'marked';
    if (visited.has(index)) return 'not_answered';
    return 'not_visited';
  };

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
    if(window.confirm("Are you sure you want to submit your test?")) {
        setIsSubmitted(true);
    }
  };

  const calculateScore = () => {
    let score = 0; let correct = 0; let wrong = 0; let attempted = 0;
    questions.forEach((q, idx) => {
        if (answers[idx] !== undefined) {
            attempted++;
            if (answers[idx] === q.correctIndex) { score += 4; correct++; } 
            else { score -= 1; wrong++; }
        }
    });
    return { score, correct, wrong, attempted };
  };

  const { currentQ, columnA, columnB, isMatching } = useMemo(() => {
    const q = questions[currentQuestionIndex];
    const isMatching = q.type === 'matching';
    return { currentQ: q, columnA: q.columnA, columnB: q.columnB, isMatching };
  }, [currentQuestionIndex, questions]);

  if (isSubmitted) {
      const { score, correct, wrong, attempted } = calculateScore();
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      return (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
           <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-xl border border-white overflow-hidden animate-fade-in">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white flex justify-between items-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="relative z-10">
                      <h1 className="text-3xl font-black uppercase tracking-tight">Scorecard</h1>
                      <p className="text-indigo-200 text-sm font-medium mt-1">{topic}</p>
                  </div>
                  <div className="relative z-10 text-right">
                      <p className="text-4xl font-black">{score} <span className="text-xl font-medium text-indigo-200">/ {questions.length * 4}</span></p>
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
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-center">
                  <button onClick={onExit} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 text-xs">Return to Dashboard</button>
              </div>
           </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col font-sans overflow-hidden bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50 via-purple-50 to-pink-50">
        <header className="bg-white/80 backdrop-blur-md border-b border-indigo-100 h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-20">
            <div className="flex items-center gap-4">
                <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-600/20">
                    <iconify-icon icon="mdi:school" width="20" />
                </div>
                <div>
                    <h1 className="font-black text-sm uppercase tracking-widest leading-none mb-1 text-slate-800">KiwiTeach</h1>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Exam Mode</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${timeLeft < 300 ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : 'bg-white border-indigo-100 text-indigo-900 shadow-sm'}`}>
                    <iconify-icon icon="mdi:clock-outline" width="18" />
                    <span className="font-mono font-black text-lg leading-none">{formatTime(timeLeft)}</span>
                </div>
                <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg">
                    <iconify-icon icon="mdi:account" width="20" />
                </div>
            </div>
        </header>
        <div className="h-1 w-full bg-indigo-100">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
        </div>
        <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 relative">
                <div className="px-8 pt-6 pb-2 flex justify-between items-end">
                    <div className="flex items-center gap-3">
                        <span className="text-4xl font-black text-indigo-900/80">Q{currentQuestionIndex + 1}</span>
                        <span className="text-lg font-bold text-indigo-300">/ {questions.length}</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                    <div className="max-w-5xl mx-auto mt-4">
                        <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-xl shadow-indigo-100/50 border border-white relative overflow-hidden">
                            <div className="text-lg font-bold text-slate-800 leading-relaxed mb-8 relative z-10">
                                {renderWithSmiles(parsePseudoLatexAndMath(currentQ.text), 140)}
                            </div>
                            
                            {isMatching && columnA && columnB && columnA.length > 0 && (
                                <div className="mb-8 p-1 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
                                    <table className="w-full border-collapse text-sm bg-white">
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

                            <div className="grid grid-cols-1 gap-4">
                                {currentQ.options.map((opt, idx) => {
                                    const isSelected = answers[currentQuestionIndex] === idx;
                                    return (
                                        <label key={idx} className={`flex items-center gap-6 p-5 rounded-2xl border-2 cursor-pointer transition-all group duration-300 relative overflow-hidden ${isSelected ? 'bg-gradient-to-r from-indigo-600 to-purple-600 border-transparent text-white shadow-lg shadow-indigo-500/30 scale-[1.01]' : 'bg-white border-indigo-50 hover:border-indigo-200 hover:shadow-md text-slate-600'}`}>
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm transition-all border-2 ${isSelected ? 'bg-white/20 border-transparent text-white' : 'bg-indigo-50 border-indigo-100 text-indigo-400 group-hover:bg-white group-hover:border-indigo-200'}`}>
                                                {idx + 1}
                                            </div>
                                            <input type="radio" name={`q-${currentQuestionIndex}`} checked={isSelected} onChange={() => handleOptionSelect(idx)} className="hidden" />
                                            <div className="text-sm font-bold flex-1 leading-snug">{renderWithSmiles(parsePseudoLatexAndMath(opt), 100)}</div>
                                            {isSelected && <div className="bg-white/20 p-1.5 rounded-full backdrop-blur-sm animate-fade-in"><iconify-icon icon="mdi:check" className="text-white text-xl block" /></div>}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="h-24 bg-white/80 backdrop-blur-md border-t border-indigo-50 px-8 flex items-center justify-between shrink-0 z-10">
                    <div className="flex gap-4">
                        <button onClick={handleMarkReviewNext} className="px-6 py-3.5 rounded-2xl bg-white border border-purple-200 text-purple-600 font-black text-[10px] uppercase tracking-widest hover:bg-purple-50 transition-all shadow-sm flex items-center gap-2 group"><iconify-icon icon="mdi:bookmark-outline" className="text-lg group-hover:text-purple-700" />Mark for Review</button>
                        <button onClick={handleClearResponse} className="px-6 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">Clear</button>
                    </div>
                    <button onClick={handleSaveNext} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95 flex items-center gap-3 group">Save & Next <iconify-icon icon="mdi:arrow-right" className="group-hover:translate-x-1 transition-transform" /></button>
                </div>
            </div>
            <div className="w-80 bg-white/60 backdrop-blur-xl border-l border-indigo-100 flex flex-col shrink-0 shadow-2xl z-20">
                <div className="p-6 border-b border-indigo-50 bg-white/50">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Question Map</h3>
                    <div className="grid grid-cols-2 gap-3 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-md bg-white border-2 border-slate-200"></div> Not Visited</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-md bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center text-[8px]">!</div> Not Ans</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-md bg-emerald-500 shadow-sm"></div> Answered</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm"></div> Marked</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-4 gap-3">
                        {questions.map((_, idx) => {
                            const status = getStatus(idx);
                            let btnClass = "bg-white text-slate-400 border-2 border-slate-100 hover:border-indigo-200"; 
                            let shapeClass = "rounded-xl";
                            if (status === 'not_answered') btnClass = "bg-rose-50 text-rose-600 border-2 border-rose-200";
                            else if (status === 'answered') btnClass = "bg-emerald-500 text-white border-2 border-emerald-600 shadow-md shadow-emerald-500/30";
                            else if (status === 'marked') { btnClass = "bg-purple-50 text-purple-600 border-2 border-purple-200 rounded-full"; shapeClass = "rounded-full"; }
                            else if (status === 'marked_answered') { btnClass = "bg-purple-600 text-white border-2 border-purple-800 shadow-md relative"; shapeClass = "rounded-full"; }
                            return (
                                <button key={idx} onClick={() => setCurrentQuestionIndex(idx)} className={`h-12 w-12 flex items-center justify-center font-black text-xs transition-all duration-200 ${shapeClass} ${btnClass} ${currentQuestionIndex === idx ? 'ring-2 ring-offset-2 ring-indigo-500 z-10 scale-110' : 'scale-100'}`}>
                                    {idx + 1}
                                    {status === 'marked_answered' && (<div className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-purple-600 -translate-y-1 translate-x-1"></div>)}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="p-6 border-t border-indigo-50 bg-white/80">
                    <button onClick={handleSubmit} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all text-[10px] shadow-lg shadow-indigo-600/30 active:scale-95 flex items-center justify-center gap-2"><iconify-icon icon="mdi:check-all" className="text-lg" />Submit Test</button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default InteractiveQuizSession;
