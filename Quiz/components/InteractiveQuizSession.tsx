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

const InteractiveQuizSession: React.FC<InteractiveQuizSessionProps> = ({ questions, onExit, topic }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({}); // Map qIndex -> optionIndex
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [marked, setMarked] = useState<Set<number>>(new Set());
  
  const [timeLeft, setTimeLeft] = useState(questions.length * 60); // 1 minute per question default
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Timer
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

  // Mark current as visited
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
    let score = 0;
    let correct = 0;
    let wrong = 0;
    let attempted = 0;

    questions.forEach((q, idx) => {
        if (answers[idx] !== undefined) {
            attempted++;
            if (answers[idx] === q.correctIndex) {
                score += 4;
                correct++;
            } else {
                score -= 1;
                wrong++;
            }
        }
    });
    return { score, correct, wrong, attempted };
  };

  const currentQ = questions[currentQuestionIndex];

  // --- RESULT SCREEN ---
  if (isSubmitted) {
    const { score, correct, wrong, attempted } = calculateScore();
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    
    return (
      <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
         <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-xl border border-white overflow-hidden animate-fade-in">
            <div className="bg-indigo-700 p-8 text-white flex justify-between items-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight">Scorecard</h1>
                    <p className="text-indigo-200 text-sm font-medium mt-1">{topic}</p>
                </div>
                <div className="text-right">
                    <p className="text-4xl font-black">{score} <span className="text-xl font-medium text-indigo-300">/ {questions.length * 4}</span></p>
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

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Q.No</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Correct Answer</th>
                                <th className="px-6 py-4">Your Answer</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {questions.map((q, idx) => {
                                const userAnswer = answers[idx];
                                const isCorrect = userAnswer === q.correctIndex;
                                const isAttempted = userAnswer !== undefined;
                                
                                return (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-black text-slate-700">{idx + 1}</td>
                                        <td className="px-6 py-3">
                                            {!isAttempted ? <span className="text-slate-400 font-bold text-[10px] uppercase bg-slate-100 px-2 py-1 rounded">Skipped</span> :
                                             isCorrect ? <span className="text-emerald-600 font-bold text-[10px] uppercase bg-emerald-50 px-2 py-1 rounded">Correct</span> :
                                             <span className="text-rose-600 font-bold text-[10px] uppercase bg-rose-50 px-2 py-1 rounded">Incorrect</span>}
                                        </td>
                                        <td className="px-6 py-3 font-mono text-slate-600 font-bold">{String.fromCharCode(65 + q.correctIndex)}</td>
                                        <td className="px-6 py-3 font-mono">
                                            {isAttempted ? (
                                                <span className={isCorrect ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                                    {String.fromCharCode(65 + userAnswer)}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-center">
                <button onClick={onExit} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 text-xs">
                    Return to Dashboard
                </button>
            </div>
         </div>
      </div>
    );
  }

  // --- EXAM INTERFACE ---
  const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <header className="bg-slate-900 text-white h-16 shrink-0 flex items-center justify-between px-6 shadow-xl z-20">
            <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2 rounded-xl">
                    <iconify-icon icon="mdi:school" width="20" />
                </div>
                <div>
                    <h1 className="font-black text-sm uppercase tracking-widest leading-none mb-1">KiwiTeach</h1>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Assessment System</span>
                </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-widest">Candidate</span>
                    <span className="font-bold text-xs uppercase tracking-wider">Student User</span>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full border-2 border-white/20 flex items-center justify-center shadow-lg">
                    <iconify-icon icon="mdi:account" width="20" />
                </div>
            </div>
        </header>

        {/* Sub-Header / Timer */}
        <div className="bg-white border-b border-slate-200 h-14 shrink-0 flex items-center justify-between px-6 shadow-sm z-10">
            <div className="font-black text-xs uppercase tracking-widest text-slate-500 truncate max-w-lg flex items-center gap-2">
                <span className="bg-slate-100 px-2 py-1 rounded text-[10px]">Topic</span>
                {topic}
            </div>
            <div className={`flex items-center gap-3 px-4 py-1.5 rounded-lg border ${timeLeft < 300 ? 'bg-red-50 border-red-100 text-red-600 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                <iconify-icon icon="mdi:clock-outline" />
                <span className="text-[10px] uppercase font-bold opacity-60">Time Left</span>
                <span className="font-mono font-black text-lg leading-none">{formatTime(timeLeft)}</span>
            </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-slate-100">
            <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out" 
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            ></div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden bg-slate-50/50">
            {/* Left: Question Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Question Header */}
                <div className="h-16 flex items-center justify-between px-8 pt-4">
                    <div className="flex items-center gap-4">
                        <span className="text-3xl font-black text-slate-200">Q{currentQuestionIndex + 1}</span>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Single Correct Type</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg border border-emerald-100 text-[10px] font-black uppercase tracking-widest shadow-sm">+4 Marks</div>
                        <div className="bg-rose-50 text-rose-600 px-3 py-1 rounded-lg border border-rose-100 text-[10px] font-black uppercase tracking-widest shadow-sm">-1 Neg</div>
                    </div>
                </div>

                {/* Scrollable Question Content */}
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                    <div className="max-w-4xl mx-auto bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                        <div className="text-lg font-bold text-slate-800 leading-relaxed mb-8">
                            {renderWithSmiles(parsePseudoLatexAndMath(currentQ.text), 140)}
                        </div>
                        
                        {currentQ.figureDataUrl && (
                            <div className="mb-8 border border-slate-100 rounded-xl p-2 inline-block bg-slate-50">
                                <img src={currentQ.figureDataUrl} alt="Figure" className="max-w-full max-h-[350px] object-contain rounded-lg mix-blend-multiply" />
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {currentQ.options.map((opt, idx) => {
                                const isSelected = answers[currentQuestionIndex] === idx;
                                return (
                                    <label 
                                        key={idx} 
                                        className={`flex items-center gap-5 p-5 rounded-2xl border-2 cursor-pointer transition-all group ${
                                            isSelected 
                                            ? 'border-indigo-500 bg-indigo-50/30 shadow-md ring-1 ring-indigo-500/20' 
                                            : 'border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-sm bg-slate-50/30'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm transition-all ${
                                            isSelected 
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-110' 
                                            : 'bg-white text-slate-400 border border-slate-200 group-hover:border-indigo-300 group-hover:text-indigo-500'
                                        }`}>
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        
                                        <input 
                                            type="radio" 
                                            name={`q-${currentQuestionIndex}`} 
                                            checked={isSelected} 
                                            onChange={() => handleOptionSelect(idx)} 
                                            className="hidden"
                                        />
                                        
                                        <div className={`text-sm font-bold pt-0.5 transition-colors ${isSelected ? 'text-indigo-900' : 'text-slate-600 group-hover:text-slate-800'}`}>
                                            {renderWithSmiles(parsePseudoLatexAndMath(opt), 100)}
                                        </div>
                                        
                                        {isSelected && <iconify-icon icon="mdi:check-circle" className="text-indigo-500 ml-auto text-2xl animate-fade-in" />}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="h-20 bg-white border-t border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-10">
                    <div className="flex gap-4">
                        <button 
                            onClick={handleMarkReviewNext}
                            className="px-5 py-3 rounded-xl bg-purple-50 text-purple-700 font-black text-[10px] uppercase tracking-widest hover:bg-purple-100 transition-colors border border-purple-100 flex items-center gap-2"
                        >
                            <iconify-icon icon="mdi:bookmark" /> Mark for Review
                        </button>
                        <button 
                            onClick={handleClearResponse}
                            className="px-5 py-3 rounded-xl bg-slate-50 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors border border-slate-100"
                        >
                            Clear
                        </button>
                    </div>
                    
                    <button 
                        onClick={handleSaveNext}
                        className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95 flex items-center gap-3"
                    >
                        Save & Next <iconify-icon icon="mdi:arrow-right" />
                    </button>
                </div>
            </div>

            {/* Right: Question Palette */}
            <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-lg z-20">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Status Legend</h3>
                    <div className="grid grid-cols-2 gap-3 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-100 border border-slate-200"></div> Not Visited</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-rose-100 border border-rose-200 text-rose-500 flex items-center justify-center text-[8px]">!</div> Not Ans</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500"></div> Answered</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Marked</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">Question Palette</h3>
                    <div className="grid grid-cols-4 gap-3">
                        {questions.map((_, idx) => {
                            const status = getStatus(idx);
                            let btnClass = "bg-white text-slate-400 border-slate-200 hover:border-slate-300"; // not_visited
                            let shapeClass = "rounded-lg";
                            
                            if (status === 'not_answered') {
                                btnClass = "bg-rose-50 text-rose-600 border-rose-200";
                            } else if (status === 'answered') {
                                btnClass = "bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20";
                            } else if (status === 'marked') {
                                btnClass = "bg-purple-100 text-purple-600 border-purple-200 rounded-full";
                                shapeClass = "rounded-full";
                            } else if (status === 'marked_answered') {
                                btnClass = "bg-purple-600 text-white border-purple-700 shadow-md relative";
                                shapeClass = "rounded-full";
                            }

                            return (
                                <button 
                                    key={idx}
                                    onClick={() => setCurrentQuestionIndex(idx)}
                                    className={`h-10 w-10 flex items-center justify-center font-black text-xs transition-all border ${shapeClass} ${btnClass} ${currentQuestionIndex === idx ? 'ring-2 ring-offset-2 ring-indigo-500 z-10' : ''}`}
                                >
                                    {idx + 1}
                                    {status === 'marked_answered' && (
                                        <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-purple-600 -translate-y-1 translate-x-1"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-white">
                    <button 
                        onClick={handleSubmit}
                        className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-indigo-100 transition-colors text-[10px] border border-indigo-100"
                    >
                        Submit Assessment
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default InteractiveQuizSession;