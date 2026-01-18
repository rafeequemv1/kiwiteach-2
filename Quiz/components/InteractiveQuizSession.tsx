
import '../../types';
import React, { useState } from 'react';
import { Question } from '../types';
import QuizScreen from './QuizScreen';

interface InteractiveQuizSessionProps {
  questions: Question[];
  onExit: () => void;
  topic: string;
}

const InteractiveQuizSession: React.FC<InteractiveQuizSessionProps> = ({ questions, onExit, topic }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime] = useState(Date.now());
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const handleAnswer = (selectedIndex: number) => {
    // Record answer
    const newAnswers = [...answers];
    newAnswers[currentIndex] = selectedIndex;
    setAnswers(newAnswers);

    if (selectedIndex === questions[currentIndex].correctIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  if (isFinished) {
    const accuracy = Math.round((score / questions.length) * 100);
    let message = "Good Effort!";
    if (accuracy > 90) message = "Outstanding!";
    else if (accuracy > 70) message = "Great Job!";
    else if (accuracy < 50) message = "Keep Practicing!";

    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center animate-fade-in p-6 font-sans">
        {/* Background Decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-50 rounded-full blur-3xl opacity-50"></div>
        </div>

        <div className="relative z-10 text-center space-y-8 max-w-md w-full">
            <div className="relative">
                <div className="w-32 h-32 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-2xl shadow-emerald-500/30 animate-bounce-subtle">
                    <iconify-icon icon="mdi:trophy-variant" width="64" />
                </div>
                {accuracy === 100 && (
                    <div className="absolute -top-2 -right-2 text-4xl animate-pulse">🌟</div>
                )}
            </div>
            
            <div>
                <h2 className="text-4xl font-black text-slate-800 tracking-tight mb-2">{message}</h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Assessment Complete</p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
                <div className="grid grid-cols-2 gap-8">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Score</p>
                        <p className="text-4xl font-black text-indigo-600">{score}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-4xl font-black text-slate-800">{questions.length}</p>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500">Accuracy</span>
                        <span className="text-xs font-black text-slate-800">{accuracy}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${
                                accuracy > 80 ? 'bg-emerald-500' : accuracy > 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`} 
                            style={{ width: `${accuracy}%` }}
                        />
                    </div>
                </div>
            </div>

            <button onClick={onExit} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-slate-900/20 hover:bg-slate-800 hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-2">
                <iconify-icon icon="mdi:arrow-left" width="16" /> Return to Dashboard
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-white animate-fade-in">
        <button 
            onClick={onExit} 
            className="absolute top-4 right-4 z-50 w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all border border-slate-100 shadow-sm hover:rotate-90 duration-300"
            title="Exit Quiz"
        >
            <iconify-icon icon="mdi:close" width="24" />
        </button>
        
        <QuizScreen 
            question={questions[currentIndex]}
            questionIndex={currentIndex}
            totalQuestions={questions.length}
            onAnswer={handleAnswer}
            onNext={handleNext}
            startTime={startTime}
        />
    </div>
  );
};

export default InteractiveQuizSession;
