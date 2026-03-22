
import React from 'react';
import { Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

interface QuestionPaperItemProps {
  question: Question;
  index: number;
  showExplanation?: boolean;
  showSource?: boolean;
  onToggleSelect?: (id: string) => void;
  isSelected?: boolean;
}

const QuestionPaperItem: React.FC<QuestionPaperItemProps> = ({ 
  question, 
  index, 
  showExplanation = false, 
  showSource = false,
  onToggleSelect,
  isSelected
}) => {
  const isMatching = (question.type as any) === 'matching';
  const columnA = question.columnA || question.column_a;
  const columnB = question.columnB || question.column_b;

  return (
    <div 
      onClick={() => onToggleSelect && onToggleSelect(question.id)} 
      style={{ colorScheme: 'light' }}
      className={`group relative bg-white rounded-[2rem] border-2 transition-all flex flex-col gap-2 touch-manipulation active:scale-[0.99] px-5 py-6 sm:p-5 min-h-[112px] sm:min-h-0 ${isSelected ? 'border-indigo-500 shadow-xl ring-4 ring-indigo-500/10' : 'border-slate-100 hover:border-indigo-100 hover:shadow-lg'}`}
    >
      {/* Header: Difficulty & Type */}
      <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider">Q{index + 1}</span>
              <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md border ${question.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : question.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{question.difficulty}</span>
              {question.topic_tag && (
                  <span className="text-[8px] font-black uppercase px-2 py-1 rounded-md border bg-indigo-50 text-indigo-600 border-indigo-100 max-w-[150px] truncate" title={question.topic_tag}>
                    {question.topic_tag}
                  </span>
              )}
          </div>
          {isSelected && <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg animate-fade-in"><iconify-icon icon="mdi:check-bold" width="12" /></div>}
      </div>

      {/* Content Body */}
      <div className="math-content text-xs font-bold text-slate-900 leading-relaxed break-words">
          <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(question.text) }} />
      </div>

      {/* Figures */}
      {(question.figureDataUrl || question.figure_url) && (
          <div className="my-3 p-2 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden flex justify-center">
              <img src={question.figureDataUrl || question.figure_url} className="max-h-40 object-contain mix-blend-multiply" alt="Diagram" />
          </div>
      )}

      {/* Matching Table */}
      {isMatching && columnA && columnB && (
          <div className="my-2 border border-slate-200 rounded-xl overflow-hidden text-black shadow-sm bg-white">
              <table className="w-full border-collapse text-[10px] bg-white text-slate-900">
                  <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="font-bold p-2 text-left w-1/2 border-r border-slate-200 uppercase tracking-widest text-[9px] text-slate-600">Column I</th>
                          <th className="font-bold p-2 text-left w-1/2 uppercase tracking-widest text-[9px] text-slate-600">Column II</th>
                      </tr>
                  </thead>
                  <tbody>
                      {Array.from({ length: Math.max(columnA.length, columnB.length) }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-b-0">
                              <td className="p-2 align-top border-r border-slate-100">
                                  {columnA[i] && (
                                      <div className="flex gap-2">
                                          <span className="font-black text-slate-400">({String.fromCharCode(65+i)})</span>
                                          <span className="break-words" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(columnA[i]) }} />
                                      </div>
                                  )}
                              </td>
                              <td className="p-2 align-top">
                                  {columnB[i] && (
                                      <div className="flex gap-2">
                                          <span className="font-black text-slate-400">({['i', 'ii', 'iii', 'iv', 'v'][i] || i + 1})</span>
                                          <span className="break-words" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(columnB[i]) }} />
                                      </div>
                                  )}
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {question.options.map((opt, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-[10px] border ${i === question.correctIndex ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-slate-100 text-slate-600'}`}>
                  <span className={`font-black shrink-0 ${i === question.correctIndex ? 'text-emerald-600' : 'opacity-40'}`}>({String.fromCharCode(65+i)})</span>
                  <div className="leading-tight math-content break-words" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(opt) }} />
              </div>
          ))}
      </div>

      {/* Explanation */}
      {showExplanation && (
          <div className="mt-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-[10px] text-amber-900 leading-relaxed italic break-words">
              <div className="flex items-center gap-1.5 mb-1 text-amber-600 font-black uppercase tracking-widest text-[8px]">
                  <iconify-icon icon="mdi:lightbulb-on" /> Solution Logic
              </div>
              <div dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(question.explanation) }} />
          </div>
      )}

      {/* Source Reference */}
      {showSource && (question.sourceFigureDataUrl || question.source_figure_url) && (
          <div className="mt-2 p-2 bg-indigo-50/30 border border-indigo-100 rounded-xl relative group/source">
              <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest z-10">Reference Source</div>
              <img src={question.sourceFigureDataUrl || question.source_figure_url} className="max-h-24 w-full object-contain opacity-60 mix-blend-multiply group-hover/source:opacity-100 transition-opacity" alt="Source" />
          </div>
      )}
    </div>
  );
};

export default QuestionPaperItem;
