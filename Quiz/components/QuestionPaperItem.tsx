
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { layout, prepare } from '@chenglou/pretext';

export type QuestionFlagReason = 'out_of_syllabus' | 'incorrect_figure';

function normalizeFlagReason(raw: string | null | undefined): QuestionFlagReason {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'incorrect_figure' || (s.includes('incorrect') && s.includes('figure'))) return 'incorrect_figure';
  return 'out_of_syllabus';
}

export function flagReasonTooltip(raw: string | null | undefined): string {
  return normalizeFlagReason(raw) === 'incorrect_figure' ? 'Incorrect figure' : 'Out of syllabus';
}

/** Saved hub rows use UUID ids; skip edit for unsynced / temp items. */
const HUB_QUESTION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function htmlToPlainText(htmlLike: string | null | undefined): string {
  if (!htmlLike) return '';
  if (typeof document === 'undefined') return htmlLike;
  const div = document.createElement('div');
  div.innerHTML = htmlLike;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

interface QuestionPaperItemProps {
  question: Question;
  index: number;
  showExplanation?: boolean;
  showSource?: boolean;
  /** Show prompt provenance chip (cloud set name, built-in, or browser/local). */
  showPromptSet?: boolean;
  promptSetName?: string | null;
  /** Long tooltip explaining prompt_generation_source + set name. */
  promptSourceTooltip?: string | null;
  showGenerationModel?: boolean;
  generationModelLabel?: string | null;
  showChapter?: boolean;
  chapterName?: string | null;
  /** When false, hide topic_tag chip. */
  showTopicTag?: boolean;
  /** When false, hide options (and matching table). */
  showOptions?: boolean;
  /** Highlight correct option + optional “Ans:” line. */
  showCorrectAnswer?: boolean;
  onToggleSelect?: (id: string) => void;
  isSelected?: boolean;
  onFlagOutOfSyllabus?: (id: string, reason?: QuestionFlagReason) => void;
  isFlaggedOutOfSyllabus?: boolean;
  /** Stored `reason` from `out_of_syllabus_question_flags` (drives tooltip when flagged). */
  flagReason?: string | null;
  /**
   * Question DB: figure cards get a small icon to toggle the reference/source image
   * (independent of the global “Source fig” toolbar toggle).
   */
  sourceFigureIconToggle?: boolean;
  /** Question DB browse/review: opens parent confirmation before delete/remove. */
  onRequestDelete?: (id: string) => void;
  /** Question DB: open figure editor modal (paint / crop / save to hub). */
  onEditFigure?: (id: string, imageUrl: string) => void;
}

const QuestionPaperItem: React.FC<QuestionPaperItemProps> = ({ 
  question, 
  index, 
  showExplanation = false, 
  showSource = false,
  showPromptSet = false,
  promptSetName = null,
  promptSourceTooltip = null,
  showGenerationModel = false,
  generationModelLabel = null,
  showChapter = false,
  chapterName = null,
  showTopicTag = true,
  showOptions = true,
  showCorrectAnswer = false,
  onToggleSelect,
  isSelected,
  onFlagOutOfSyllabus,
  isFlaggedOutOfSyllabus = false,
  flagReason = null,
  sourceFigureIconToggle = false,
  onRequestDelete,
  onEditFigure,
}) => {
  const [sourcePeekOpen, setSourcePeekOpen] = useState(false);
  const isMatching = (question.type as any) === 'matching';
  const columnA = question.columnA || question.column_a;
  const columnB = question.columnB || question.column_b;
  const hasFigure = !!(question.figureDataUrl || question.figure_url);
  const sourceFigureUrl = question.sourceFigureDataUrl || question.source_figure_url;
  const showSourcePeekButton = sourceFigureIconToggle && hasFigure && !!sourceFigureUrl;
  const showSourcePanel =
    !!sourceFigureUrl && (showSource || (sourceFigureIconToggle && sourcePeekOpen));
  const flagTooltip = isFlaggedOutOfSyllabus ? flagReasonTooltip(flagReason) : undefined;
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  const [questionTextMinHeight, setQuestionTextMinHeight] = useState<number | undefined>(undefined);
  const preparedCache = useMemo(() => new Map<string, ReturnType<typeof prepare>>(), []);
  const renderedStem = useMemo(() => parsePseudoLatexAndMath(question.text), [question.text]);

  useEffect(() => {
    const el = questionTextRef.current;
    if (!el) return;

    const recompute = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const plain = htmlToPlainText(renderedStem);
      if (!plain) {
        setQuestionTextMinHeight(undefined);
        return;
      }
      const font = '11px Inter, system-ui, sans-serif';
      const lineHeight = 18;
      try {
        const key = `${font}|${plain}`;
        let prepared = preparedCache.get(key);
        if (!prepared) {
          prepared = prepare(plain, font, { whiteSpace: 'normal' });
          preparedCache.set(key, prepared);
        }
        const out = layout(prepared, Math.max(20, width), lineHeight);
        // Keep a small buffer for injected inline math markup.
        setQuestionTextMinHeight(Math.ceil(out.height + 4));
      } catch {
        setQuestionTextMinHeight(undefined);
      }
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderedStem, preparedCache]);

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
              {showChapter && chapterName && (
                  <span
                    className="max-w-full min-w-0 break-words rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[8px] font-semibold uppercase leading-snug text-sky-900 [overflow-wrap:anywhere]"
                    title={`Chapter: ${chapterName}`}
                  >
                    {chapterName.length > 28 ? `${chapterName.slice(0, 28)}…` : chapterName}
                  </span>
              )}
              {showTopicTag && question.topic_tag && (
                  <span className="max-w-full min-w-0 break-words rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[8px] font-medium uppercase leading-snug text-zinc-700 [overflow-wrap:anywhere]" title={question.topic_tag}>
                    {question.topic_tag}
                  </span>
              )}
              {showPromptSet && promptSetName && (
                  <span
                      className="max-w-full min-w-0 break-words rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[8px] font-semibold uppercase leading-snug text-violet-800 [overflow-wrap:anywhere]"
                      title={promptSourceTooltip || `Prompt: ${promptSetName}`}
                  >
                      {promptSetName}
                  </span>
              )}
              {showGenerationModel && generationModelLabel && (
                  <span
                    className="shrink-0 rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-slate-800"
                    title={`Text model: ${generationModelLabel}`}
                  >
                    {generationModelLabel}
                  </span>
              )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onRequestDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(String(question.id));
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="Delete question"
                aria-label="Delete question"
              >
                <iconify-icon icon="mdi:trash-can-outline" width="16" />
              </button>
            )}
            {isSelected && (
              <div className="flex h-5 w-5 animate-fade-in items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm">
                <iconify-icon icon="mdi:check-bold" width="12" />
              </div>
            )}
          </div>
      </div>
      {onFlagOutOfSyllabus && (
        <div className="mb-2 flex justify-end gap-1.5">
          {isFlaggedOutOfSyllabus ? (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex cursor-default items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-rose-700"
              title={flagTooltip}
            >
              <iconify-icon icon="mdi:flag" width="12" />
              Flagged
            </button>
          ) : hasFigure ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFlagOutOfSyllabus(question.id, 'out_of_syllabus');
                }}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="Flag as out of syllabus"
              >
                <iconify-icon icon="mdi:book-remove-outline" width="12" />
                Syllabus
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFlagOutOfSyllabus(question.id, 'incorrect_figure');
                }}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="Flag as incorrect figure"
              >
                <iconify-icon icon="mdi:image-broken-variant" width="12" />
                Figure
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFlagOutOfSyllabus(question.id, 'out_of_syllabus');
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              title="Flag as out of syllabus"
            >
              <iconify-icon icon="mdi:flag-outline" width="12" />
              Out of syllabus
            </button>
          )}
        </div>
      )}

      {/* Content Body */}
      <div
          ref={questionTextRef}
          style={questionTextMinHeight ? { minHeight: `${questionTextMinHeight}px` } : undefined}
          className="math-content max-w-full min-w-0 break-words text-[11px] font-medium leading-relaxed text-zinc-900 sm:text-xs [overflow-wrap:anywhere]"
      >
          <span dangerouslySetInnerHTML={{ __html: renderedStem }} />
      </div>

      {/* Figures */}
      {(question.figureDataUrl || question.figure_url) && (
          <div
            className="relative my-3 flex justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-2"
            title={isFlaggedOutOfSyllabus && onFlagOutOfSyllabus ? flagTooltip : undefined}
          >
              {onEditFigure && HUB_QUESTION_ID_RE.test(String(question.id)) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = String(question.figureDataUrl || question.figure_url || '');
                    if (url) onEditFigure(String(question.id), url);
                  }}
                  className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md border border-violet-200 bg-white/95 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-violet-800 shadow-sm backdrop-blur-sm hover:bg-violet-50"
                  title="Edit figure (draw, crop, save)"
                >
                  <iconify-icon icon="mdi:pencil-outline" width="14" />
                  Edit
                </button>
              )}
              {showSourcePeekButton && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSourcePeekOpen((v) => !v);
                  }}
                  className={`absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-all ${
                    sourcePeekOpen
                      ? 'border-cyan-500 bg-cyan-600 text-white shadow-cyan-600/25'
                      : 'border-zinc-200/90 bg-white/95 text-cyan-700 backdrop-blur-sm hover:border-cyan-300 hover:bg-cyan-50'
                  }`}
                  title={sourcePeekOpen ? 'Hide source figure' : 'View source figure'}
                  aria-expanded={sourcePeekOpen}
                  aria-label={sourcePeekOpen ? 'Hide source figure' : 'Show source figure'}
                >
                  <iconify-icon icon={sourcePeekOpen ? 'mdi:image-off-outline' : 'mdi:image-search-outline'} width="18" />
                </button>
              )}
              <img src={question.figureDataUrl || question.figure_url} className="max-h-40 object-contain mix-blend-multiply" alt="Diagram" />
          </div>
      )}

      {/* Matching Table */}
      {showOptions && isMatching && columnA && columnB && (
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

      {showCorrectAnswer &&
        showOptions &&
        question.options &&
        question.options.length > 0 &&
        typeof question.correctIndex === 'number' &&
        question.correctIndex >= 0 &&
        question.correctIndex < question.options.length && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/90 px-2.5 py-1.5 text-[10px] font-bold text-emerald-900">
            Ans: ({String.fromCharCode(65 + question.correctIndex)})
          </div>
        )}

      {/* Options — single column on narrow screens to avoid squashed text */}
      {showOptions && question.options && question.options.length > 0 && (
      <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-2 mt-2 min-w-0">
          {question.options.map((opt, i) => {
              const isCorrect = showCorrectAnswer && i === question.correctIndex;
              return (
              <div key={i} className={`flex min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-md border p-2.5 text-[10px] ${isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-600'}`}>
                  <span className={`shrink-0 pt-0.5 font-semibold ${isCorrect ? 'text-emerald-700' : 'text-zinc-400'}`}>({String.fromCharCode(65+i)})</span>
                  <div className="leading-snug math-content min-w-0 flex-1 break-words [overflow-wrap:anywhere] max-w-full" dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(opt) }} />
              </div>
              );
          })}
      </div>
      )}

      {/* Explanation */}
      {showExplanation && (
          <div className="mt-3 break-words rounded-md border border-amber-200 bg-amber-50/80 p-3 text-[10px] italic leading-relaxed text-amber-950">
              <div className="mb-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-widest text-amber-800">
                  <iconify-icon icon="mdi:lightbulb-on" /> Solution Logic
              </div>
              <div dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(question.explanation) }} />
          </div>
      )}

      {/* Source Reference (toolbar toggle and/or per-card peek in Question DB) */}
      {showSourcePanel && (
          <div className="group/source relative mt-2 rounded-md border border-cyan-200/80 bg-cyan-50/40 p-2">
              <div className="absolute left-1 top-1 z-10 rounded px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-widest text-white bg-cyan-800">
                Reference source
              </div>
              <img
                src={sourceFigureUrl || undefined}
                className="max-h-48 w-full object-contain opacity-80 mix-blend-multiply group-hover/source:opacity-100 transition-opacity"
                alt="Source figure used for this item"
              />
          </div>
      )}
    </div>
  );
};

export default QuestionPaperItem;
