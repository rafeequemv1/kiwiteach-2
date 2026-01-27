import '../../types';
import React from 'react';
import { Question } from '../../Quiz/types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';

interface SolutionViewerProps {
  topic: string;
  questions: Question[];
  onClose: () => void;
  showAnswers?: boolean;
}

const SolutionViewer: React.FC<SolutionViewerProps> = ({ topic, questions, onClose, showAnswers = true }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col font-sans overflow-hidden animate-fade-in">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 shrink-0 flex items-center justify-between px-6 shadow-sm z-20">
            <div className="flex items-center gap-4">
                <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-700 transition-colors">
                    <iconify-icon icon="mdi:arrow-left" width="20" />
                </button>
                <div>
                    <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight">{showAnswers ? 'Solution Key' : 'Question Paper'}</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-md">{topic}</p>
                </div>
            </div>
            {showAnswers ? (
                <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg border border-emerald-100 flex items-center gap-2">
                    <iconify-icon icon="mdi:check-decagram" />
                    <span className="text-xs font-black uppercase tracking-wider">Official Key</span>
                </div>
            ) : (
                <div className="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg border border-slate-200 flex items-center gap-2">
                    <iconify-icon icon="mdi:file-document-outline" />
                    <span className="text-xs font-black uppercase tracking-wider">Read Only</span>
                </div>
            )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
                {questions.map((q, idx) => (
                    <div key={idx} className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                        {/* Question Badge */}
                        <div className="flex justify-between items-start mb-6">
                            <span className="bg-slate-100 text-slate-600 text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">
                                Question {idx + 1}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border ${
                                q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>{q.difficulty}</span>
                        </div>

                        {/* Question Content */}
                        <div className="mb-8">
                            <div className="text-lg font-bold text-slate-800 leading-relaxed mb-6">
                                {renderWithSmiles(parsePseudoLatexAndMath(q.text), 120)}
                            </div>
                            {q.figureDataUrl && (
                                <div className="mb-6 p-2 bg-slate-50 rounded-xl border border-slate-100 inline-block">
                                    <img src={q.figureDataUrl} alt="Figure" className="max-w-full max-h-[300px] object-contain rounded-lg mix-blend-multiply" />
                                </div>
                            )}
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {q.options.map((opt, i) => {
                                const isCorrect = showAnswers && i === q.correctIndex;
                                return (
                                    <div key={i} className={`p-4 rounded-xl border-2 flex items-start gap-3 transition-all ${
                                        isCorrect 
                                        ? 'bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-500/10' 
                                        : 'bg-white border-slate-100'
                                    }`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                            isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                        }`}>
                                            {String.fromCharCode(65 + i)}
                                        </div>
                                        <div className={`text-sm font-medium ${isCorrect ? 'text-emerald-900' : 'text-slate-500'}`}>
                                            {renderWithSmiles(parsePseudoLatexAndMath(opt), 90)}
                                        </div>
                                        {isCorrect && <iconify-icon icon="mdi:check-circle" className="text-emerald-500 ml-auto text-xl" />}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Explanation */}
                        {showAnswers && (
                            <div className="bg-slate-50 rounded-2xl p-6 border-l-4 border-indigo-500">
                                <div className="flex items-center gap-2 mb-3">
                                    <iconify-icon icon="mdi:lightbulb-on-outline" className="text-indigo-500 text-lg" />
                                    <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Explanation</h4>
                                </div>
                                <div className="text-sm text-slate-600 leading-relaxed font-medium">
                                    {renderWithSmiles(parsePseudoLatexAndMath(q.explanation), 100)}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};

export default SolutionViewer;