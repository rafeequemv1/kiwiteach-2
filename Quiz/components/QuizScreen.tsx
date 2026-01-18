
import '../../types';
import React, { useState, useEffect } from 'react';
import { Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';

interface QuizScreenProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (selectedIndex: number) => void;
  onNext: () => void;
  startTime: number | null;
}

const QuizScreen: React.FC<QuizScreenProps> = ({
  question,
  questionIndex,
  totalQuestions,
  onAnswer,
  onNext,
  startTime,
}) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer logic
  useEffect(() => {
    if (startTime) {
      const timer = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [startTime]);

  // Reset state when question changes
  useEffect(() => {
    setSelectedOption(null);
    setIsRevealed(false);
  }, [question.id]);

  const handleOptionClick = (index: number) => {
    if (isRevealed) return;
    setSelectedOption(index);
    setIsRevealed(true);
    onAnswer(index);
  };

  const getOptionStyles = (index: number) => {
    const baseStyle = "w-full p-6 text-left rounded-[2rem] border-2 transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 hover:shadow-2xl flex items-center gap-6";
    
    if (!isRevealed) {
        // Vibrant neon-pastel backgrounds for options
        const variants = [
            'bg-gradient-to-br from-blue-50 to-white border-blue-100 hover:border-blue-400 text-slate-700 shadow-blue-100/50',
            'bg-gradient-to-br from-indigo-50 to-white border-indigo-100 hover:border-indigo-400 text-slate-700 shadow-indigo-100/50',
            'bg-gradient-to-br from-violet-50 to-white border-violet-100 hover:border-violet-400 text-slate-700 shadow-violet-100/50',
            'bg-gradient-to-br from-fuchsia-50 to-white border-fuchsia-100 hover:border-fuchsia-400 text-slate-700 shadow-fuchsia-100/50'
        ];
        return `${baseStyle} ${variants[index % 4]} shadow-lg`;
    }

    if (index === question.correctIndex) {
      return `${baseStyle} bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400 text-white shadow-xl shadow-emerald-500/40 ring-8 ring-emerald-500/10`;
    }

    if (index === selectedOption && index !== question.correctIndex) {
      return `${baseStyle} bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400 text-white shadow-xl shadow-rose-500/40`;
    }

    return `${baseStyle} bg-slate-50 border-slate-100 text-slate-300 opacity-40 grayscale blur-[0.5px] scale-95`;
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  const getOptionLabel = (index: number) => String.fromCharCode(65 + index);

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-pink-100 overflow-y-auto custom-scrollbar font-sans">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-center">
        
        {/* Progress & Info Bar */}
        <div className="flex items-center justify-between mb-10 bg-white/40 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/60 shadow-2xl shadow-indigo-100/50">
          <div className="flex items-center gap-6">
             <div className="relative w-16 h-16">
                 <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                    <circle className="text-white/80" strokeWidth="10" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
                    <circle 
                        className="text-accent transition-all duration-1000 ease-out" 
                        strokeWidth="10" 
                        strokeDasharray={`${2 * Math.PI * 40}`} 
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - ((questionIndex + 1) / totalQuestions))}`} 
                        strokeLinecap="round" 
                        stroke="currentColor" 
                        fill="transparent" 
                        r="40" 
                        cx="50" 
                        cy="50" 
                    />
                 </svg>
                 <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-sm font-black text-slate-800">
                     {questionIndex + 1}
                 </div>
             </div>
             <div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">Assessment Level</span>
                 <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    Phase {questionIndex + 1}
                    <span className="text-slate-300 font-bold">/ {totalQuestions}</span>
                 </h3>
             </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-6 py-3 bg-white rounded-2xl border border-white shadow-inner flex items-center gap-3">
                <iconify-icon icon="mdi:clock-outline" className="text-indigo-400" width="20"></iconify-icon>
                <span className="text-xl font-mono font-black text-slate-700 tabular-nums">{formatTime(elapsedTime)}</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
            
            {/* Left: Question Card */}
            <div className="lg:col-span-7 flex flex-col">
                <div className="bg-white/80 backdrop-blur-2xl rounded-[3.5rem] p-10 md:p-14 shadow-[0_32px_64px_-16px_rgba(79,70,229,0.1)] border border-white relative overflow-hidden flex-1 flex flex-col justify-center">
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-pink-500/5 rounded-full blur-3xl"></div>

                    <div className="relative z-10">
                        <div className="mb-10 flex flex-wrap gap-4">
                            <span className="bg-slate-900 text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-slate-900/10">
                                {question.type === 'mcq' ? 'CORE MCQ' : question.type.replace('_', ' ')}
                            </span>
                            <span className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] border-2 ${
                                question.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                question.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                                {question.difficulty}
                            </span>
                        </div>

                        <div className="text-3xl md:text-4xl font-bold text-slate-800 mb-12 leading-[1.3] tracking-tight">
                            {renderWithSmiles(parsePseudoLatexAndMath(question.text), 220)}
                        </div>

                        {question.figureDataUrl && (
                            <div className="mb-12 p-2 bg-slate-50 rounded-[2.5rem] border border-slate-100 w-fit shadow-inner group">
                                <img src={question.figureDataUrl} crossOrigin="anonymous" alt="Diagram" className="max-w-full md:max-w-md h-auto rounded-[2rem] mix-blend-multiply transition-transform group-hover:scale-[1.02]" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Options & Feedback */}
            <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="grid grid-cols-1 gap-4 flex-1">
                    {question.options.map((option, index) => (
                        <button
                          key={index}
                          onClick={() => handleOptionClick(index)}
                          disabled={isRevealed}
                          className={getOptionStyles(index)}
                        >
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg transition-all border-2 shrink-0 ${
                                isRevealed 
                                    ? 'bg-white/20 border-white/40 text-white' 
                                    : 'bg-white border-white/50 shadow-sm group-hover:scale-110 group-hover:rotate-6'
                            }`}>
                                {getOptionLabel(index)}
                            </div>
                            
                            <div className="text-lg font-bold flex-1 leading-snug pr-4">
                                {renderWithSmiles(parsePseudoLatexAndMath(option), 140)}
                            </div>
                            
                            {isRevealed && index === question.correctIndex && (
                                <div className="bg-white/20 p-3 rounded-full backdrop-blur-md animate-bounce-subtle shrink-0">
                                    <iconify-icon icon="mdi:check-bold" className="w-8 h-8 text-white"></iconify-icon>
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                {isRevealed && (
                    <div className="animate-slide-up space-y-4">
                        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white shadow-2xl shadow-indigo-100/30">
                            <div className="flex items-start gap-6">
                                <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                                    <iconify-icon icon="mdi:lightbulb" width="28"></iconify-icon>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Expert Solution</p>
                                    <div className="text-slate-600 leading-relaxed text-sm font-medium italic">
                                        {renderWithSmiles(parsePseudoLatexAndMath(question.explanation), 180)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={onNext}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 rounded-[2rem] shadow-2xl transition-all duration-300 flex items-center justify-center gap-4 transform hover:-translate-y-1 active:scale-95 group"
                        >
                            <span className="uppercase tracking-[0.3em] text-xs">
                                {questionIndex === totalQuestions - 1 ? 'Finalize Result' : 'Advance to Next Level'}
                            </span>
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:translate-x-2 transition-transform">
                                <iconify-icon icon="mdi:arrow-right" className="w-6 h-6"></iconify-icon>
                            </div>
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default QuizScreen;
