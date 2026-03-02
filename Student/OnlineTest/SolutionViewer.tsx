
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

const roman = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][n] || (n + 1).toString();
const alpha = (n: number) => String.fromCharCode(97 + n);

const SolutionViewer: React.FC<SolutionViewerProps> = ({ topic, questions, onClose, showAnswers = true }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col font-sans overflow-hidden animate-fade-in">
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

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
                {questions.map((q: any, idx) => {
                    const isMatching = q.type === 'matching';
                    let columnA = q.columnA || q.column_a;
                    let columnB = q.columnB || q.column_b;
                    let questionText = q.text || q.question_text;

                    if (isMatching && (!columnA || columnA.length === 0)) {
                        const col1Regex = /Column I\s*([\s\S]*?)(?=Column II|$)/i;
                        const col2Regex = /Column II\s*([\s\S]*)/i;
                        const col1Match = questionText.match(col1Regex);
                        const col2Match = questionText.match(col2Regex);
                        const mainTextEndIndex = questionText.search(/Column I/i);
                        const mainText = mainTextEndIndex !== -1 ? questionText.substring(0, mainTextEndIndex).trim() : questionText;

                        if (col1Match && col1Match[1] && col2Match && col2Match[1]) {
                            questionText = mainText;
                            const parseItems = (text: string) => text.split(/\s*(?=\([a-z0-9]+\))/i).map(s => s.trim().replace(/^\([a-z0-9]+\)\s*/, '')).filter(Boolean);
                            columnA = parseItems(col1Match[1]);
                            columnB = parseItems(col2Match[1]);
                        }
                    }
                    
                    return (
                    <div key={idx} className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <span className="bg-slate-100 text-black text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">Question {idx + 1}</span>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border ${q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{q.difficulty}</span>
                        </div>

                        <div className="mb-8">
                            <div className="text-lg font-bold text-black leading-relaxed mb-6">{renderWithSmiles(parsePseudoLatexAndMath(questionText), 120)}</div>
                            {q.figureDataUrl && (
                                <div className="mb-6 p-2 bg-slate-50 rounded-xl border border-slate-100 inline-block">
                                    <img src={q.figureDataUrl} alt="Figure" className="max-w-full max-h-[300px] object-contain rounded-lg mix-blend-multiply" />
                                </div>
                            )}
                        </div>
                        
                        {isMatching && columnA && columnB && columnA.length > 0 && (
                            <div className="my-6 border border-black rounded-2xl overflow-hidden">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-black">
                                            <th className="font-black p-3 text-left w-1/2 border-r border-black uppercase tracking-widest text-[10px] text-black">Column A</th>
                                            <th className="font-black p-3 text-left w-1/2 uppercase tracking-widest text-[10px] text-black">Column B</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-black">
                                        {Array.from({ length: Math.max(columnA.length, columnB.length) }).map((_, index) => (
                                            <tr key={index} className="border-b border-slate-200 last:border-b-0">
                                                <td className="p-3 align-top border-r border-black">
                                                    {columnA![index] && (
                                                        <div className="flex gap-3 items-start">
                                                            <span className="font-bold text-black shrink-0">({String.fromCharCode(65+index)})</span>
                                                            <span className="text-black">{renderWithSmiles(parsePseudoLatexAndMath(columnA![index]), 90)}</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top">
                                                    {columnB![index] && (
                                                        <div className="flex gap-3 items-start">
                                                            <span className="font-bold text-black shrink-0">({roman(index).toUpperCase()})</span>
                                                            <span className="text-black">{renderWithSmiles(parsePseudoLatexAndMath(columnB![index]), 90)}</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {q.options.map((opt: string, i: number) => {
                                // Fix: Use `q.correctIndex` which is defined in the `Question` type. `correct_index` is not part of the type.
                                const isCorrect = showAnswers && i === q.correctIndex;
                                return (
                                    <div key={i} className={`p-4 rounded-xl border-2 flex items-start gap-3 transition-all ${isCorrect ? 'bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-500/10' : 'bg-white border-slate-100'}`}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-black'}`}>{String.fromCharCode(65 + i)}</div>
                                        <div className={`text-sm font-medium ${isCorrect ? 'text-emerald-900' : 'text-black'}`}>{renderWithSmiles(parsePseudoLatexAndMath(opt), 90)}</div>
                                        {isCorrect && <iconify-icon icon="mdi:check-circle" className="text-emerald-500 ml-auto text-xl" />}
                                    </div>
                                )
                            })}
                        </div>

                        {showAnswers && (
                            <div className="bg-slate-50 rounded-2xl p-6 border-l-4 border-indigo-500">
                                <div className="flex items-center gap-2 mb-3">
                                    <iconify-icon icon="mdi:lightbulb-on-outline" className="text-indigo-500 text-lg" />
                                    <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Explanation</h4>
                                </div>
                                <div className="text-sm text-black leading-relaxed font-medium">{renderWithSmiles(parsePseudoLatexAndMath(q.explanation), 100)}</div>
                            </div>
                        )}
                    </div>
                )})}
            </div>
        </div>
    </div>
  );
};

export default SolutionViewer;
