
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
  onFlagOutOfSyllabus?: (id: string) => void;
  isFlaggedOutOfSyllabus?: boolean;
}

const QuestionPaperItem: React.FC<QuestionPaperItemProps> = ({ 
  question, 
  index, 
  showExplanation = false, 
  showSource = false,
  onToggleSelect,
  isSelected,
  onFlagOutOfSyllabus,
  isFlaggedOutOfSyllabus = false
}) => {
  const isMatching = (question.type as any) === 'matching';
  const columnA = question.columnA || question.column_a;
  const columnB = question.columnB || question.column_b;

  return (
    <div 
      onClick={() => onToggleSelect && onToggleSelect(question.id)} 
      style={{ colorScheme: 'light' }}
      className={`group relative flex min-h-0 min-w-0 max-w-full touch-manipulation flex-col gap-2 overflow-hidden rounded-md border bg-white px-3 py-4 shadow-sm transition-all active:scale-[0.99] sm:px-5 sm:py-6 ${isSelected ? 'border-zinc-900 shadow-md ring-2 ring-zinc-900/15' : 'border-zinc-200 hover:border-zinc-300 hover:shadow-md'}`}
    >
      {/* Header: Difficulty & Type */}
      <div className="flex justify-between items-start mb-2 gap-2 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 flex-1">
              <span className="shrink-0 rounded-md bg-zinc-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white">Q{index + 1}</span>
              <span className={`shrink-0 text-[8px] font-black uppercase px-2 py-1 rounded-md border ${question.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : question.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{question.difficulty}</span>
              {question.topic_tag && (
                  <span className="max-w-full min-w-0 break-words rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[8px] font-medium uppercase leading-snug text-zinc-700 [overflow-wrap:anywhere]" title={question.topic_tag}>
                    {question.topic_tag}
                  </span>
              )}
          </div>
          {isSelected && <div className="flex h-5 w-5 animate-fade-in items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm"><iconify-icon icon="mdi:check-bold" width="12" /></div>}
      </div>
      {onFlagOutOfSyllabus && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFlagOutOfSyllabus(question.id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
              isFlaggedOutOfSyllabus
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
            }`}
            title="Flag this as out-of-syllabus"
          >
            <iconify-icon icon={isFlaggedOutOfSyllabus ? 'mdi:flag' : 'mdi:flag-outline'} width="12" />
            {isFlaggedOutOfSyllabus ? 'Flagged' : 'Out of syllabus'}
          </button>
        </div>
      )}

      {/* Content Body */}
      <div className="math-content max-w-full min-w-0 break-words text-[11px] font-medium leading-relaxed text-zinc-900 sm:text-xs [overflow-wrap:anywhere]">
          <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(question.text) }} />
      </div>

      {/* Figures */}
      {(question.figureDataUrl || question.figure_url) && (
          <div className="my-3 flex justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <img src={question.figureDataUrl || question.figure_url} className="max-h-40 object-contain mix-blend-multiply" alt="Diagram" />
          </div>
      )}

      {/* Matching Table */}
      {isMatching && columnA && columnB && (
          <div className="my-2 overflow-hidden rounded-md border border-zinc-200 bg-white text-black shadow-sm">
              <table className="w-full border-collapse bg-white text-[10px] text-zinc-900">
                  <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                          <th className="w-1/2 border-r border-zinc-200 p-2 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Column I</th>
                          <th className="w-1/2 p-2 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Column II</th>
                      </tr>
                  </thead>
                  <tbody>
                      {Array.from({ length: Math.max(columnA.length, columnB.length) }).map((_, i) => (
                          <tr key={i} className="border-b border-zinc-100 last:border-b-0">
                              <td className="border-r border-zinc-100 p-2 align-top">
                                  {columnA[i] && (
                                      <div className="flex gap-2">
                                          <span className="font-semibold text-zinc-500">({String.fromCharCode(65+i)})</span>
                                          <span className="break-words" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(columnA[i]) }} />
                                      </div>
                                  )}
                              </td>
                              <td className="p-2 align-top">
                                  {columnB[i] && (
                                      <div className="flex gap-2">
                                          <span className="font-semibold text-zinc-500">({['i', 'ii', 'iii', 'iv', 'v'][i] || i + 1})</span>
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

      {/* Options — single column on narrow screens to avoid squashed text */}
      <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-2 mt-2 min-w-0">
          {question.options.map((opt, i) => (
              <div key={i} className={`flex min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-md border p-2.5 text-[10px] ${i === question.correctIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-600'}`}>
                  <span className={`shrink-0 pt-0.5 font-semibold ${i === question.correctIndex ? 'text-emerald-700' : 'text-zinc-400'}`}>({String.fromCharCode(65+i)})</span>
                  <div className="leading-snug math-content min-w-0 flex-1 break-words [overflow-wrap:anywhere] max-w-full" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(opt) }} />
              </div>
          ))}
      </div>

      {/* Explanation */}
      {showExplanation && (
          <div className="mt-3 break-words rounded-md border border-amber-200 bg-amber-50/80 p-3 text-[10px] italic leading-relaxed text-amber-950">
              <div className="mb-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-widest text-amber-800">
                  <iconify-icon icon="mdi:lightbulb-on" /> Solution Logic
              </div>
              <div dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(question.explanation) }} />
          </div>
      )}

      {/* Source Reference */}
      {showSource && (question.sourceFigureDataUrl || question.source_figure_url) && (
          <div className="group/source relative mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <div className="absolute left-1 top-1 z-10 rounded px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-widest text-white bg-zinc-900">Reference Source</div>
              <img src={question.sourceFigureDataUrl || question.source_figure_url} className="max-h-24 w-full object-contain opacity-60 mix-blend-multiply group-hover/source:opacity-100 transition-opacity" alt="Source" />
          </div>
      )}
    </div>
  );
};

export default QuestionPaperItem;
