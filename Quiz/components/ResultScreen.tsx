
import '../../types';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../../supabase/client';
import { Question, BrandingConfig, LayoutConfig } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { PaperRich } from '../../utils/paperRich';
import {
  matchingRowLetter,
  ROMAN_ROW_SUFFIX,
  resolveMatchingPaperColumns,
} from '../../utils/matchingPaperColumns';
import OMRScannerModal from './OCR/OMRScannerModal';
import { generateAnswerKeyPDF } from './AnswerKeyGenerator';
import { fetchEligibleQuestions, isUuid } from '../services/questionUsageService';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';
import { flagReasonTooltip, QuestionFlagReason } from './QuestionPaperItem';
import { prepare, layout } from '@chenglou/pretext';

type BlockType = 'cover-page' | 'question-core' | 'explanation-box' | 'subject-header' | 'answer-key';
type FigureSize = 'small' | 'medium' | 'large';

interface QuizBlock {
  type: BlockType;
  question?: Question & { column_a?: string[]; column_b?: string[]; }; 
  globalIndex?: number;
  content?: string; 
  height: number; 
}

interface PaginationUnit {
  blocks: QuizBlock[];
  heightWithGap: number;
  forceBreak: boolean;
  questionCount: number;
}

interface PageLayout {
    leftCol: QuizBlock[];
    rightCol: QuizBlock[];
    isCover?: boolean;
}

/** Reading order: page by page, left column top→bottom then right column (matches typical NEET booklet). */
function paperQuestionNumberByStableId(pages: PageLayout[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const p of pages) {
    if (p.isCover) continue;
    if (p.leftCol[0]?.type === 'answer-key') continue;
    for (const b of [...p.leftCol, ...p.rightCol]) {
      if (b.type !== 'question-core' || !b.question) continue;
      const id = String(b.question.originalId || b.question.id);
      if (map.has(id)) continue;
      n += 1;
      map.set(id, n);
    }
  }
  return map;
}

function questionsInPaperReadingOrder(pages: PageLayout[], fallback: Question[]): Question[] {
  const ordered: Question[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.isCover) continue;
    if (p.leftCol[0]?.type === 'answer-key') continue;
    for (const b of [...p.leftCol, ...p.rightCol]) {
      if (b.type !== 'question-core' || !b.question) continue;
      const id = String(b.question.originalId || b.question.id);
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(b.question);
    }
  }
  return ordered.length > 0 ? ordered : fallback;
}

function ptToPx(pt: number): number {
  return pt * (96 / 72);
}

function htmlToPlainText(htmlLike: string | null | undefined): string {
  if (!htmlLike) return '';
  if (typeof document === 'undefined') return htmlLike;
  const div = document.createElement('div');
  div.innerHTML = htmlLike;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Max plain-text length per option to allow exam-style 2×2 choice layout (stem + choices stay one block). */
const COMPACT_OPTION_MAX_PLAIN_LEN = 60;
const COMPACT_OPTION_MAX_PLAIN_LEN_EXAM = 84;
/** When exam-dense, avoid grid if total plain length is huge (one long option can still pass per-option cap). */
const COMPACT_OPTION_TOTAL_PLAIN_MAX_EXAM = 260;

function shouldUseCompactOptionGrid(options: string[] | undefined | null, examDense = false): boolean {
  if (!options || options.length !== 4) return false;
  const maxLen = examDense ? COMPACT_OPTION_MAX_PLAIN_LEN_EXAM : COMPACT_OPTION_MAX_PLAIN_LEN;
  let totalPlain = 0;
  for (const o of options) {
    const raw = String(o || '');
    if (!raw.trim()) return false;
    if (/<img\b/i.test(raw)) return false;
    const plain = htmlToPlainText(parsePseudoLatexAndMath(raw));
    if (plain.length > maxLen) return false;
    totalPlain += plain.length;
  }
  if (examDense && totalPlain > COMPACT_OPTION_TOTAL_PLAIN_MAX_EXAM) return false;
  return true;
}

function choicesInnerHtmlForMeasure(options: string[], compact: boolean): string {
  const cells = options.map(
    (o: string, i: number) =>
      `<div style="display:flex;gap:4px;align-items:flex-start;line-height:1.25;color:black;"><span style="flex-shrink:0">(${i + 1})</span><span>${parsePseudoLatexAndMath(o)}</span></div>`
  );
  if (compact && options.length === 4) {
    return `<div style="display:grid;grid-template-columns:1fr 1fr;column-gap:10px;row-gap:3px;margin-top:6px;color:black;">${cells.join('')}</div>`;
  }
  return `<div style="margin-top:6px;color:black;">${options
    .map(
      (o: string, i: number) =>
        `<div style="padding-left:12px;color:black;display:flex;gap:4px;align-items:flex-start;line-height:1.25;">(${i + 1}) ${parsePseudoLatexAndMath(o)}</div>`
    )
    .join('')}</div>`;
}

/**
 * Consolidated ResultScreenProps interface to avoid redundancy and resolve potential type shadowing issues.
 */
interface ResultScreenProps {
  topic: string;
  questions: Question[];
  onRestart: () => void;
  onSave?: (questions: Question[], layoutConfig?: LayoutConfig, updatedTitle?: string) => Promise<void>;
  onEditBlueprint?: (questions: Question[]) => void;
  brandConfig: BrandingConfig;
  initialLayoutConfig?: LayoutConfig;
  sourceOptions?: {
    targetClassId?: string | null;
    allowPastQuestions?: boolean;
  };
}

const AnswerKeyPage: React.FC<{ questions: Question[]; brandConfig: BrandingConfig; topic: string }> = ({ questions, brandConfig, topic }) => {
    // 5-column layout for extreme density up to 200-250 answers
    const numColumns = 5;
    const itemsPerColumn = Math.ceil(questions.length / numColumns);
    const columns = Array.from({ length: numColumns }, (_, colIndex) => {
        const start = colIndex * itemsPerColumn;
        const end = start + itemsPerColumn;
        return questions.slice(start, end).map((q, qLocalIdx) => ({
            q,
            qIndex: start + qLocalIdx
        }));
    });

    return (
        <div className="flex-1 flex flex-col text-black bg-white p-4 border-[0.5pt] border-black h-full">
            <div className="text-center mb-5 border-b-[0.5pt] border-black pb-2">
                <h1 className="text-base font-black uppercase tracking-[0.2em] text-black">Official Answer Key</h1>
                <div className="flex justify-center gap-6 mt-1 text-[7pt] font-black uppercase text-zinc-500">
                    <span className="truncate max-w-[300px]">{topic}</span>
                    <span className="shrink-0">Questions: {questions.length}</span>
                    <span className="shrink-0">Max Marks: {questions.length * 4}</span>
                </div>
            </div>
            
            <div className="flex-1 flex" style={{ gap: '8mm' }}>
                {columns.map((column, colIdx) => (
                    <div key={colIdx} className="flex-1 flex flex-col">
                        {column.map(({ q, qIndex }) => {
                            const correctOption = (q.correctIndex ?? 0) + 1;
                            return (
                                <div key={q.id || qIndex} className="flex items-center justify-between py-1.5 border-b border-dotted border-zinc-200">
                                    <span className="font-bold text-[7.5pt] text-zinc-400 w-5">{qIndex + 1}.</span>
                                    <div className="flex items-center">
                                        <span className="font-black text-[8pt] text-zinc-800 pr-1">
                                            {correctOption}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            
            <div className="mt-4 pt-2 border-t-[0.5pt] border-black flex justify-between items-end">
                <div className="text-[5pt] font-black uppercase text-zinc-400">
                    ID: {Math.random().toString(36).substring(7).toUpperCase()}
                </div>
                <div className="text-right">
                    <p className="text-[7pt] font-bold text-black uppercase leading-none">{brandConfig.name}</p>
                    <p className="text-[5pt] text-zinc-400 italic">Authored Assessment Matrix</p>
                </div>
            </div>
        </div>
    );
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; color?: string }> = ({ label, checked, onChange, color = 'zinc' }) => {
    const activeColors: Record<string, string> = {
        zinc: 'bg-zinc-900 border-zinc-900',
        indigo: 'bg-zinc-900 border-zinc-900',
        amber: 'bg-amber-500 border-amber-500',
        emerald: 'bg-emerald-600 border-emerald-600',
        rose: 'bg-rose-500 border-rose-500',
        slate: 'bg-zinc-700 border-zinc-700',
        cyan: 'bg-cyan-600 border-cyan-600'
    };
    return (
        <button 
            type="button"
            onClick={onChange}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 transition-all ${checked ? `${activeColors[color]} text-white shadow-sm` : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'}`}
        >
            <div className={`flex h-3 w-3 items-center justify-center rounded-full border transition-all ${checked ? 'border-white bg-white/20' : 'border-zinc-300 bg-zinc-50'}`}>
                {checked && <iconify-icon icon="mdi:check" className="text-[7px] font-black" />}
            </div>
            <span className="text-[8px] font-semibold uppercase tracking-wider">{label}</span>
        </button>
    );
};

const NumberControl: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string; step?: number }> = ({ label, value, onChange, min = 0, max = 100, unit, step = 1 }) => (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
            <iconify-icon icon="mdi:ruler-square" className="text-zinc-400" />
            <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            <button type="button" onClick={() => onChange(Math.max(min, parseFloat((value - step).toFixed(2))))} className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200"><iconify-icon icon="mdi:minus" width="12"/></button>
            <span className="w-8 text-center text-xs font-semibold tabular-nums text-zinc-800">{value}{unit}</span>
            <button type="button" onClick={() => onChange(Math.min(max, parseFloat((value + step).toFixed(2))))} className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200"><iconify-icon icon="mdi:plus" width="12"/></button>
        </div>
    </div>
);

const QuestionListScreen: React.FC<ResultScreenProps> = ({ topic, onRestart, onSave, onEditBlueprint, questions, brandConfig, initialLayoutConfig, sourceOptions }) => {
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>(questions);
  const [editableTopic, setEditableTopic] = useState(topic);
  const [isPaginating, setIsPaginating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  const [saveComplete, setSaveComplete] = useState(false);
  const [isOmrOpen, setIsOmrOpen] = useState(false);
  /** Left rail: paper matrix, breakdown, page navigator (lg+). */
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  /** Right rail: layout & formatting controls (lg+). */
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);

  type ResultMobileSheet = null | 'insights' | 'layout';
  const [resultMobileSheet, setResultMobileSheet] = useState<ResultMobileSheet>(null);
  const [isLgLayout, setIsLgLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLgLayout(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (isLgLayout) setResultMobileSheet(null);
  }, [isLgLayout]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setViewerUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!resultMobileSheet || isLgLayout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResultMobileSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resultMobileSheet, isLgLayout]);
  
  const [viewMode, setViewMode] = useState<'scroll' | 'grid'>(initialLayoutConfig?.viewMode || 'scroll');
  const [showChoices, setShowChoices] = useState(true);
  /** Default off: exam-style packing and print; saved tests restore from `initialLayoutConfig`. */
  const [includeExplanations, setIncludeExplanations] = useState(initialLayoutConfig?.includeExplanations ?? false);
  const [showSourceFigure, setShowSourceFigure] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(initialLayoutConfig?.showDifficulty ?? false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  /** Gap after each question (px); pagination sweeps a range (tighter when explanations are off). */
  const [appliedQuestionGapPx, setAppliedQuestionGapPx] = useState(20);
  const [allowPastReplacements, setAllowPastReplacements] = useState(sourceOptions?.allowPastQuestions ?? false);
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(new Set());
  const [flagReasonsByQuestionId, setFlagReasonsByQuestionId] = useState<Record<string, string>>({});
  const [flaggingQuestionId, setFlaggingQuestionId] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

  const [showIntroPage, setShowIntroPage] = useState(initialLayoutConfig?.showIntroPage ?? false);
  const [showChapterListOnCover, setShowChapterListOnCover] = useState(initialLayoutConfig?.showChapterListOnCover ?? true);
  // Keep saved/imported question order by default; grouping can still be toggled manually.
  const [groupBySubject, setGroupBySubject] = useState(initialLayoutConfig?.groupBySubject ?? false);
  const [forcedBreaks, setForcedBreaks] = useState<Set<string>>(new Set(initialLayoutConfig?.forcedBreaks || []));
  const [figureSizes, setFigureSizes] = useState<Record<string, FigureSize>>(initialLayoutConfig?.figureSizes || {});

  const [pages, setPages] = useState<PageLayout[]>([]);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [paperConfig, setPaperConfig] = useState({
      fontSize: 10,
      marginX: 15,
      marginY: 15,
      gap: 10,
      lineHeight: 1.75, // Increased default line height for better math/fraction display
      fontFamily: "'Times New Roman', Times, serif"
  });

  const adjustFigureSize = (questionId: string, direction: 'increase' | 'decrease') => {
    const sizes: FigureSize[] = ['small', 'medium', 'large'];
    setFigureSizes(prev => {
        const currentSize = prev[questionId] || 'medium';
        const currentIndex = sizes.indexOf(currentSize);
        let nextIndex: number;
        if (direction === 'increase') {
            nextIndex = Math.min(sizes.length - 1, currentIndex + 1);
        } else {
            nextIndex = Math.max(0, currentIndex - 1);
        }
        return { ...prev, [questionId]: sizes[nextIndex] };
    });
  };

  /**
   * Refined type inference for useMemo return type to ensure consistent behavior across components.
   */
  const statsResult = useMemo<{
    subjectBreakdown: [string, number][];
    chapterSummary: Record<string, Record<string, number>>;
    subjectToPages: Record<string, number[]>;
    globalStats: {
        Easy: number;
        Medium: number;
        Hard: number;
        mcq: number;
        reasoning: number;
        matching: number;
        statements: number;
    };
  }>(() => {
    const subjects: Record<string, number> = {};
    const chapMap: Record<string, Record<string, number>> = {};
    const subPages: Record<string, Set<number>> = {};
    const stats = {
        Easy: 0, Medium: 0, Hard: 0,
        mcq: 0, reasoning: 0, matching: 0, statements: 0
    };
    
    currentQuestions.forEach(q => {
      const s = q.sourceSubjectName || 'General';
      const c = q.sourceChapterName || 'Unknown Chapter';
      subjects[s] = (subjects[s] || 0) + 1;
      if (!chapMap[s]) chapMap[s] = {};
      chapMap[s][c] = (chapMap[s][c] || 0) + 1;

      if (q.difficulty) stats[q.difficulty as keyof typeof stats]++;
      if (q.type) stats[q.type as keyof typeof stats]++;
    });

    pages.forEach((p, pIdx) => {
        if (p.isCover) return;
        const subsOnThisPage = new Set<string>();
        [...p.leftCol, ...p.rightCol].forEach(b => {
            if (b.type === 'subject-header' && b.content) subsOnThisPage.add(b.content);
            if (b.question?.sourceSubjectName) subsOnThisPage.add(b.question.sourceSubjectName);
        });
        subsOnThisPage.forEach(s => {
            if (!subPages[s]) subPages[s] = new Set();
            subPages[s].add(pIdx);
        });
    });

    const finalSubPages: Record<string, number[]> = {};
    Object.keys(subPages).forEach(k => finalSubPages[k] = Array.from(subPages[k]).sort((a,b) => a-b));

    return { 
        subjectBreakdown: Object.entries(subjects).sort((a, b) => b[1] - a[1]) as [string, number][],
        chapterSummary: chapMap as Record<string, Record<string, number>>,
        subjectToPages: finalSubPages as Record<string, number[]>,
        globalStats: stats
    };
  }, [currentQuestions, pages]);

  /**
   * Destructured stats with explicit types to prevent "unknown" inference in the JSX blocks.
   */
  const { 
    subjectBreakdown, 
    chapterSummary, 
    subjectToPages, 
    globalStats 
  }: {
    subjectBreakdown: [string, number][];
    chapterSummary: Record<string, Record<string, number>>;
    subjectToPages: Record<string, number[]>;
    globalStats: any;
  } = statsResult;

  const paperQuestionNumberById = useMemo(() => paperQuestionNumberByStableId(pages), [pages]);
  const questionsOrderedForAnswerKey = useMemo(
    () => questionsInPaperReadingOrder(pages, currentQuestions),
    [pages, currentQuestions]
  );

  const totalChaptersCount = useMemo(() => {
    return Object.values(chapterSummary).reduce((acc: number, sub: Record<string, number>) => acc + Object.keys(sub).length, 0);
  }, [chapterSummary]);

  const chapterFontSize = useMemo(() => {
    if (totalChaptersCount > 45) return '6.5pt';
    if (totalChaptersCount > 30) return '8.5pt';
    if (totalChaptersCount > 15) return '9.5pt';
    return '10.5pt';
  }, [totalChaptersCount]);

  useEffect(() => {
    setCurrentQuestions(questions);
    setEditableTopic(topic);
  }, [questions, topic]);

  const handleSaveToCloud = async () => {
      if (!onSave) return;
      setIsSaving(true);
      try {
          const layoutConfig: LayoutConfig = {
              forcedBreaks: Array.from(forcedBreaks),
              showIntroPage, showChapterListOnCover,
              includeExplanations, groupBySubject, showDifficulty,
              figureSizes, viewMode,
          };
          await onSave(currentQuestions, layoutConfig, editableTopic);
          setSaveComplete(true);
          setTimeout(() => setSaveComplete(false), 3000);
      } catch (e: any) { alert("Save failed: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDownloadKeys = async () => {
    setIsSaving(true);
    try {
        await generateAnswerKeyPDF({
            topic: editableTopic,
            questions: currentQuestions,
            brandConfig: brandConfig,
        });
    } catch (e: any) {
        alert("Key PDF generation failed: " + e.message);
    } finally {
        setIsSaving(false);
    }
  };

  const clearPendingPrint = useCallback(() => setPendingPrint(false), []);

  const printFromIsolatedFrame = useCallback(() => {
    const printableArea = document.getElementById('printable-paper-area');
    if (!printableArea) {
      clearPendingPrint();
      return;
    }

    const styleAndLinks = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML)
      .join('\n');

    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('aria-hidden', 'true');
    printFrame.style.position = 'fixed';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    document.body.appendChild(printFrame);

    const printDoc = printFrame.contentDocument;
    if (!printDoc) {
      document.body.removeChild(printFrame);
      clearPendingPrint();
      return;
    }

    const printHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print</title>
          ${styleAndLinks}
          <style>
            @page { size: A4; margin: 0; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
            #printable-paper-area {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              display: block !important;
            }
            .printable-quiz-page {
              width: 210mm !important;
              height: 297mm !important;
              margin: 0 !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
              box-shadow: none !important;
              border: none !important;
              overflow: hidden !important;
            }
            .printable-quiz-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .no-print { display: none !important; }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          </style>
        </head>
        <body>${printableArea.outerHTML}</body>
      </html>
    `;

    printDoc.open();
    printDoc.write(printHtml);
    printDoc.close();

    const frameWindow = printFrame.contentWindow;
    if (!frameWindow) {
      document.body.removeChild(printFrame);
      clearPendingPrint();
      return;
    }

    const cleanup = () => {
      clearPendingPrint();
      if (document.body.contains(printFrame)) {
        document.body.removeChild(printFrame);
      }
    };

    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
      }
    }, 150);
    setTimeout(cleanup, 3000);
  }, [clearPendingPrint]);

  const handlePrint = () => {
    // Keep browser print flow, but always request it from scroll mode.
    if (viewMode !== 'scroll') {
      setViewMode('scroll');
    }
    setPendingPrint(true);
  };

  useEffect(() => {
    const handleAfterPrint = () => clearPendingPrint();
    window.addEventListener('afterprint', handleAfterPrint);

    const mediaQueryList = window.matchMedia('print');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) clearPendingPrint();
    };

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleMediaChange);
    } else {
      mediaQueryList.addListener(handleMediaChange);
    }

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', handleMediaChange);
      } else {
        mediaQueryList.removeListener(handleMediaChange);
      }
    };
  }, [clearPendingPrint]);

  useEffect(() => {
    if (!pendingPrint || viewMode !== 'scroll' || isPaginating) return;

    let cancelled = false;
    const waitForPaint = () => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const runPrint = async () => {
      try {
        if ('fonts' in document && document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch (error) {
        console.warn('Print font readiness check failed:', error);
      }

      await waitForPaint();
      if (cancelled) return;
      printFromIsolatedFrame();
    };

    runPrint();

    return () => {
      cancelled = true;
    };
  }, [pendingPrint, viewMode, isPaginating, printFromIsolatedFrame]);

  const handleDeleteQuestion = (id: string) => {
      if (!confirm("Are you sure you want to remove this question from the paper?")) return;
      setCurrentQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleReplaceQuestion = async (q: Question) => {
    if (!q.sourceChapterId) return alert("Source metadata missing for replacement.");
    setIsReplacing(q.id);
    try {
        const currentIds = currentQuestions
          .map((item) => item.originalId || item.id)
          .filter((id): id is string => isUuid(id));
        const eligible = await fetchEligibleQuestions({
          classId: sourceOptions?.targetClassId || null,
          chapterId: q.sourceChapterId,
          difficulty: q.difficulty,
          excludeIds: currentIds,
          limit: 16,
          allowRepeats: allowPastReplacements,
        });
        if (!eligible.length) {
            alert("No more similar questions found in the database for this chapter and difficulty.");
            return;
        }
        const newQ = eligible[Math.floor(Math.random() * eligible.length)];
        
        setCurrentQuestions(prev => prev.map(item => item.id === q.id ? newQ : item));
    } catch (e: any) {
        alert("Replacement failed: " + e.message);
    } finally {
        setIsReplacing(null);
    }
  };

  useEffect(() => {
    const loadFlagsForCurrentPaper = async () => {
      if (!viewerUserId) {
        setFlaggedQuestionIds(new Set());
        setFlagReasonsByQuestionId({});
        return;
      }
      const ids = currentQuestions
        .map((q) => q.originalId || q.id)
        .filter((id): id is string => isUuid(id));
      if (!ids.length) {
        setFlaggedQuestionIds(new Set());
        setFlagReasonsByQuestionId({});
        return;
      }
      const { data, error } = await supabase
        .from('out_of_syllabus_question_flags')
        .select('question_id, reason')
        .in('question_id', ids)
        .eq('flagged_by', viewerUserId)
        .eq('exam_tag', 'neet');
      if (error) {
        console.warn('Could not load test-paper flags:', error.message);
        return;
      }
      const rows = (data as { question_id: string; reason: string | null }[]) || [];
      const reasons: Record<string, string> = {};
      for (const row of rows) {
        reasons[row.question_id] = (row.reason && row.reason.trim()) || 'out_of_syllabus';
      }
      setFlaggedQuestionIds(new Set(rows.map((r) => r.question_id)));
      setFlagReasonsByQuestionId(reasons);
    };
    void loadFlagsForCurrentPaper();
  }, [currentQuestions, viewerUserId]);

  const handleFlagQuestion = async (q: Question, reason: QuestionFlagReason = 'out_of_syllabus') => {
    const questionId = q.originalId || q.id;
    if (!isUuid(questionId)) {
      alert('Only saved repository questions can be flagged.');
      return;
    }
    setFlaggingQuestionId(q.id);
    try {
      const { error } = await supabase.rpc('flag_question_out_of_syllabus', {
        p_question_id: questionId,
        p_knowledge_base_id: null,
        p_reason: reason,
        p_exam_tag: 'neet',
      });
      if (error) {
        alert(error.message);
        return;
      }
      setFlaggedQuestionIds((prev) => new Set(prev).add(questionId));
      setFlagReasonsByQuestionId((prev) => ({ ...prev, [questionId]: reason }));

      const currentIds = currentQuestions
        .map((item) => item.originalId || item.id)
        .filter((id): id is string => isUuid(id));

      let candidates: Question[] = [];
      if (q.sourceChapterId) {
        candidates = await fetchEligibleQuestions({
          classId: sourceOptions?.targetClassId || null,
          chapterId: q.sourceChapterId,
          difficulty: q.difficulty,
          excludeIds: currentIds,
          limit: 40,
          allowRepeats: allowPastReplacements,
        });
      } else {
        let query = supabase.from('question_bank_neet').select('*');
        if (q.difficulty) query = query.eq('difficulty', q.difficulty);
        if (q.type) query = query.eq('question_type', q.type);
        if (q.topic_tag) query = query.eq('topic_tag', q.topic_tag);
        if (currentIds.length > 0) query = query.not('id', 'in', `(${currentIds.join(',')})`);
        const { data } = await query.limit(40);
        candidates = ((data || []) as any[]).map((bq) => ({
          id: bq.id,
          originalId: bq.id,
          text: bq.question_text,
          type: (bq.question_type || 'mcq') as any,
          difficulty: bq.difficulty as any,
          options: bq.options,
          correctIndex: bq.correct_index,
          explanation: bq.explanation,
          figureDataUrl: bq.figure_url,
          sourceFigureDataUrl: bq.source_figure_url,
          columnA: bq.column_a,
          columnB: bq.column_b,
          correctMatches: bq.correct_matches,
          sourceChapterId: bq.chapter_id,
          sourceSubjectName: bq.subject_name,
          sourceChapterName: bq.chapter_name,
          pageNumber: bq.page_number,
          topic_tag: bq.topic_tag,
        })) as Question[];
      }

      const sameTopic = (c: Question) =>
        (c.topic_tag || '').trim().toLowerCase() === (q.topic_tag || '').trim().toLowerCase();
      const sameType = (c: Question) => (c.type || '') === (q.type || '');
      const sameDifficulty = (c: Question) => (c.difficulty || '') === (q.difficulty || '');

      const priorityBuckets = [
        candidates.filter((c) => sameType(c) && sameDifficulty(c) && sameTopic(c)),
        candidates.filter((c) => sameType(c) && sameDifficulty(c)),
        candidates.filter((c) => sameDifficulty(c) && sameTopic(c)),
        candidates.filter((c) => sameType(c)),
        candidates,
      ];
      const replacement = priorityBuckets.find((b) => b.length > 0)?.[0] || null;

      if (replacement) {
        setCurrentQuestions((prev) => prev.map((item) => (item.id === q.id ? replacement : item)));
      } else {
        setCurrentQuestions((prev) => prev.filter((item) => item.id !== q.id));
        alert('Flag saved. No close replacement found, so this question was removed.');
      }
    } finally {
      setFlaggingQuestionId(null);
    }
  };

  const MM_TO_PX = 3.78;
  const PAGE_WIDTH_PX = 210 * MM_TO_PX;
  const PAGE_HEIGHT_PX = 297 * MM_TO_PX;

  const mainHostRef = useRef<HTMLElement>(null);
  const [scrollPreviewScale, setScrollPreviewScale] = useState(1);
  /** Scale A4 page content to fill each grid cell (matches Tailwind grid-cols-2 / md:3 / lg:4 / xl:6 + gaps). */
  const [gridPreviewScale, setGridPreviewScale] = useState(0.32);

  useEffect(() => {
    if (viewMode !== 'scroll') {
      setScrollPreviewScale(1);
      return;
    }
    const el = mainHostRef.current;
    if (!el) return;
    const pageW = 210 * MM_TO_PX;
    const update = () => {
      const w = el.clientWidth;
      const avail = Math.max(160, w - 12);
      const s = Math.min(1, Math.max(0.22, avail / pageW));
      setScrollPreviewScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, MM_TO_PX]);

  useEffect(() => {
    if (viewMode !== 'grid') return;
    const compute = () => {
      const node = document.getElementById('printable-paper-area');
      if (!node) return;
      const areaW = node.clientWidth;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
      let cols = 2;
      let gap = 16;
      if (vw >= 1280) {
        cols = 6;
        gap = 24;
      } else if (vw >= 1024) {
        cols = 4;
        gap = 24;
      } else if (vw >= 768) {
        cols = 3;
        gap = 24;
      }
      const cellW = Math.max(48, (areaW - gap * (cols - 1)) / cols);
      const s = Math.min(1, Math.max(0.06, cellW / PAGE_WIDTH_PX));
      setGridPreviewScale(s);
    };
    const run = () => {
      requestAnimationFrame(() => requestAnimationFrame(compute));
    };
    run();
    const area = document.getElementById('printable-paper-area');
    if (!area) return undefined;
    const ro = new ResizeObserver(run);
    ro.observe(area);
    window.addEventListener('resize', run);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', run);
    };
  }, [viewMode, PAGE_WIDTH_PX, pages.length]);

  // Pagination height must match the real page DOM or questions break early and leave large bottom gaps.
  const FOOTER_RESERVE_PX = 10;
  const SAFETY_BUFFER = 0;
  const INVISIBLE_FOOTER_FILL_LINES = 24;
  /** mt-auto strip: page number only (tuned vs real DOM for pagination). */
  const PAGE_FOOTER_META_STRIP_PX = 14;
  /** Brand strip + horizontal rule + gap before columns (keep in sync with question-page header DOM). */
  const TOP_COLUMN_CHROME_PX = 36;
  /** Top padding for question pages = marginY × this (65% less whitespace above branding than full marginY). */
  const QUESTION_PAGE_TOP_MARGIN_FRAC = 0.35;

  const getColumnHeightLimit = (_pIdx: number) => {
      const marginBottomPx = paperConfig.marginY * MM_TO_PX;
      const marginTopPx = paperConfig.marginY * MM_TO_PX * QUESTION_PAGE_TOP_MARGIN_FRAC;
      const bodyBelowMeta = PAGE_HEIGHT_PX - PAGE_FOOTER_META_STRIP_PX;
      const innerContentPx = bodyBelowMeta - marginTopPx - marginBottomPx;
      return innerContentPx - TOP_COLUMN_CHROME_PX - SAFETY_BUFFER;
  };

  useEffect(() => {
    setIsPaginating(true);
    const measureAndPaginate = () => {
        const examDensity = !includeExplanations;
        // With explanations, each unit is taller; keep buffers close to exam mode so columns fill to the footer
        // without the large bottom slack from over-estimated heights + high pack gaps.
        const packingBlockBuffer = examDensity ? 0.45 : 0.55;
        const gapCandidates = examDensity
          ? ([6, 7, 8, 9, 10, 11, 12, 13, 14] as const)
          : ([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const);
        const targetQuestionGapPx = examDensity ? 10 : 11;

        const pageWidthMm = 210;
        const availableWidthMm = pageWidthMm - (paperConfig.marginX * 2) - paperConfig.gap;
        const colWidthMm = availableWidthMm / 2;

        const measureContainer = document.createElement('div');
        measureContainer.style.width = `${colWidthMm}mm`; 
        measureContainer.style.visibility = 'hidden';
        measureContainer.style.position = 'absolute';
        measureContainer.style.top = '-9999px';
        measureContainer.style.fontFamily = paperConfig.fontFamily;
        measureContainer.style.fontSize = `${paperConfig.fontSize}pt`;
        measureContainer.style.lineHeight = `${paperConfig.lineHeight}`; 
        measureContainer.style.textAlign = 'left';
        measureContainer.style.boxSizing = 'border-box';
        measureContainer.style.color = 'black';
        document.body.appendChild(measureContainer);

        const heightMap: Record<FigureSize, number> = { small: 80, medium: 120, large: 180 };
        const unitPackList: Array<{
          blocks: QuizBlock[];
          baseSum: number;
          hasQuestionCore: boolean;
          forceBreak: boolean;
          questionCount: number;
        }> = [];
        const pretextCache = new Map<string, ReturnType<typeof prepare>>();
        const colWidthPx = colWidthMm * MM_TO_PX;
        const contentWidthPx = Math.max(40, colWidthPx - 12);
        const fontPx = ptToPx(paperConfig.fontSize);
        const coreFont = `${fontPx}px ${paperConfig.fontFamily}`;
        const optionFont = `${Math.max(10, fontPx * 0.95)}px ${paperConfig.fontFamily}`;
        const explanationFont = `${Math.max(10, fontPx * 0.95)}px ${paperConfig.fontFamily}`;

        const estimateTextHeightWithPretext = (
          text: string,
          maxWidthPx: number,
          lineHeightPx: number,
          font: string,
          whiteSpace: 'normal' | 'pre-wrap' = 'normal'
        ): number | null => {
          const cleaned = (text || '').trim();
          if (!cleaned || maxWidthPx <= 0 || lineHeightPx <= 0) return 0;
          try {
            const key = `${font}|${whiteSpace}|${cleaned}`;
            let prepared = pretextCache.get(key);
            if (!prepared) {
              prepared = prepare(cleaned, font, { whiteSpace });
              pretextCache.set(key, prepared);
            }
            const out = layout(prepared, maxWidthPx, lineHeightPx);
            return Math.max(0, out.height);
          } catch {
            return null;
          }
        };

        const sortedQuestions = groupBySubject ? [...currentQuestions].sort((a,b) => (a.sourceSubjectName||'').localeCompare(b.sourceSubjectName||'')) : currentQuestions;
        let lastSubject = "";

        sortedQuestions.forEach((q: any, qIndex) => {
             const unitBlocks: QuizBlock[] = [];
             const subjectChanged = groupBySubject && q.sourceSubjectName !== lastSubject;
             if (subjectChanged) {
                 const text = (q.sourceSubjectName || 'GENERAL').toUpperCase();
                 const div = document.createElement('div'); 
                 div.style.width = '100%'; div.style.padding = '2px 0'; div.style.fontSize = '0.9em'; div.style.fontWeight = '900'; div.style.borderTop = '0.5pt solid black'; div.style.borderBottom = '0.5pt solid black'; div.style.textAlign = 'center'; div.style.margin = '4px 0'; div.style.color = 'black';
                 div.innerHTML = `PART: ${text}`;
                 measureContainer.appendChild(div); const h = div.getBoundingClientRect().height; measureContainer.removeChild(div);
                 unitBlocks.push({ type: 'subject-header', content: text, height: h });
                 lastSubject = q.sourceSubjectName || '';
             }

             const coreDiv = document.createElement('div'); 
             coreDiv.style.display = 'flex'; coreDiv.style.flexDirection = 'column'; coreDiv.style.marginBottom = '2px'; coreDiv.style.color = 'black';
             const matchingForMeasure = resolveMatchingPaperColumns(q);
             const colA = matchingForMeasure?.colA;
             const colB = matchingForMeasure?.colB;
             const stemRaw = matchingForMeasure?.stemForPaper ?? String(q.text || '');
             const matchHeadL = matchingForMeasure?.headerLeft ?? 'Column A';
             const matchHeadR = matchingForMeasure?.headerRight ?? 'Column B';
             const renderedQText = parsePseudoLatexAndMath(stemRaw);
             const qText = document.createElement('div'); 
             qText.innerHTML = `<b style="color: black;">${qIndex + 1}.</b> ${renderedQText}${showDifficulty ? ` <span style="font-size: 0.7em; font-weight: 900; border: 0.5pt solid black; padding: 1px 2px; text-transform: uppercase; margin-left: 4px; color: black;">${q.difficulty}</span>` : ''}`; 
             coreDiv.appendChild(qText);
             
             if (q.figureDataUrl) { 
                 const currentSize: FigureSize = figureSizes[q.id] || 'medium';
                 const imgHeight = heightMap[currentSize];
                 const img = document.createElement('div'); 
                 img.style.height = `${imgHeight}px`;
                 img.style.width = '100%';
                 coreDiv.appendChild(img); 
             }
             
             if (showSourceFigure && q.sourceFigureDataUrl) {
                 const srcImg = document.createElement('div'); 
                 srcImg.style.height = '80px';
                 srcImg.style.width = '100%';
                 coreDiv.appendChild(srcImg);
             }

             if (colA && colB && colA.length > 0) {
                const table = document.createElement('table');
                table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.style.marginTop = '4px'; table.style.fontSize = '0.9em'; table.style.color = 'black'; table.style.border = '0.5pt solid black';
                table.innerHTML = `
                  <thead><tr style="border-bottom: 0.5pt solid black; background-color: #f8fafc;"><th style="text-align: left; width: 50%; padding: 4px; border-right: 0.5pt solid black; color: black;">${matchHeadL}</th><th style="text-align: left; width: 50%; padding: 4px; color: black;">${matchHeadR}</th></tr></thead>
                  <tbody>${colA.map((ca: string, i: number) => `<tr style="border-bottom: 0.25pt solid #ddd;"><td style="padding: 4px; border-right: 0.5pt solid black; color: black;">(${matchingRowLetter(i)}) ${parsePseudoLatexAndMath(ca)}</td><td style="padding: 4px; color: black;">(${ROMAN_ROW_SUFFIX[i] ?? i + 1}) ${parsePseudoLatexAndMath(colB[i] || '')}</td></tr>`).join('')}</tbody>
                `;
                coreDiv.appendChild(table);
             }

             if (showChoices && Array.isArray(q.options)) {
                 const opts = document.createElement('div');
                 const compactOpts = shouldUseCompactOptionGrid(q.options, examDensity);
                 opts.innerHTML = choicesInnerHtmlForMeasure(q.options, compactOpts);
                 coreDiv.appendChild(opts);
             }

            // Hybrid measurement:
            // - Pretext for text-heavy parts (question stem + options)
            // - DOM fallback for rich/complex pieces (tables) when needed.
            const lineHeightPx = paperConfig.lineHeight * fontPx;
            const qPlain = `${qIndex + 1}. ${htmlToPlainText(renderedQText)}${showDifficulty ? ` ${q.difficulty || ''}` : ''}`;
            let pretextCoreHeight =
              estimateTextHeightWithPretext(qPlain, contentWidthPx, lineHeightPx, coreFont, 'normal') ?? 0;

            if (showChoices && Array.isArray(q.options)) {
              const optionLineHeight = Math.max(14, lineHeightPx * 0.95);
              const compactOpts = shouldUseCompactOptionGrid(q.options, examDensity);
              if (compactOpts) {
                const halfW = Math.max(28, (contentWidthPx - 28) / 2);
                for (const pair of [
                  [0, 1],
                  [2, 3],
                ] as const) {
                  let rowH = 0;
                  for (const i of pair) {
                    const optionPlain = `(${i + 1}) ${htmlToPlainText(parsePseudoLatexAndMath(q.options[i] || ''))}`;
                    rowH = Math.max(
                      rowH,
                      estimateTextHeightWithPretext(optionPlain, halfW, optionLineHeight, optionFont, 'normal') ?? 0
                    );
                  }
                  pretextCoreHeight += rowH + 2;
                }
                pretextCoreHeight += 4;
              } else {
                for (let i = 0; i < q.options.length; i += 1) {
                  const optionPlain = `(${i + 1}) ${htmlToPlainText(parsePseudoLatexAndMath(q.options[i] || ''))}`;
                  pretextCoreHeight +=
                    (estimateTextHeightWithPretext(optionPlain, Math.max(20, contentWidthPx - 12), optionLineHeight, optionFont, 'normal') ??
                      0) + 2;
                }
                pretextCoreHeight += 4;
              }
            }

            if (q.figureDataUrl) {
                const currentSize: FigureSize = figureSizes[q.id] || 'medium';
                pretextCoreHeight += heightMap[currentSize] + 8;
            }

            if (showSourceFigure && q.sourceFigureDataUrl) {
                pretextCoreHeight += 80 + 8;
            }

            let tableHeight = 0;
            if (colA && colB && colA.length > 0) {
              const tableOnly = document.createElement('div');
              const table = document.createElement('table');
              table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.style.marginTop = '4px'; table.style.fontSize = '0.9em'; table.style.color = 'black'; table.style.border = '0.5pt solid black';
              table.innerHTML = `
                <thead><tr style="border-bottom: 0.5pt solid black; background-color: #f8fafc;"><th style="text-align: left; width: 50%; padding: 4px; border-right: 0.5pt solid black; color: black;">${matchHeadL}</th><th style="text-align: left; width: 50%; padding: 4px; color: black;">${matchHeadR}</th></tr></thead>
                <tbody>${colA.map((ca: string, i: number) => `<tr style="border-bottom: 0.25pt solid #ddd;"><td style="padding: 4px; border-right: 0.5pt solid black; color: black;">(${matchingRowLetter(i)}) ${parsePseudoLatexAndMath(ca)}</td><td style="padding: 4px; color: black;">(${ROMAN_ROW_SUFFIX[i] ?? i + 1}) ${parsePseudoLatexAndMath(colB[i] || '')}</td></tr>`).join('')}</tbody>
              `;
              tableOnly.appendChild(table);
              measureContainer.appendChild(tableOnly);
              tableHeight = tableOnly.getBoundingClientRect().height;
              measureContainer.removeChild(tableOnly);
            }

            const pretextFudge = examDensity ? 2 : 3;
            const pretextBasedCoreH = Math.ceil(pretextCoreHeight + tableHeight + pretextFudge);
            measureContainer.appendChild(coreDiv);
            const domCoreH = coreDiv.getBoundingClientRect().height;
            measureContainer.removeChild(coreDiv);
            const isMatchingTable = !!(colA && colB && colA.length > 0);
            // Use measured DOM core height in explanation mode too (except matching tables) — same tight fit as exam.
            const useDomCoreForCoreH =
              !isMatchingTable && domCoreH >= 6 && (examDensity || includeExplanations);
            const coreH = useDomCoreForCoreH
              ? Math.ceil(domCoreH + 1)
              : Math.max(pretextBasedCoreH, domCoreH * 0.92);
            unitBlocks.push({ type: 'question-core', question: q, globalIndex: qIndex, height: coreH });

             if (includeExplanations) {
                 const renderedExp = parsePseudoLatexAndMath(q.explanation);
                 const div = document.createElement('div');
                 
                 div.style.padding = '6px 8px';
                 div.style.backgroundColor = '#fcfcfc';
                 div.style.border = '0.4pt solid #e5e7eb';
                 div.style.marginTop = '4px';
                 div.style.marginBottom = '0px';
                 div.style.borderRadius = '2px';
                 div.style.color = 'black';
                 
                 let metaHtml = '';
                 const metaParts = [];
                 if (showChapters && q.sourceChapterName) metaParts.push(`Chapter: ${q.sourceChapterName}`);
                 if (showTopics && (q.topic_tag || (q as any).topic)) metaParts.push(`Topic: ${q.topic_tag || (q as any).topic}`);
                 
                 if (metaParts.length > 0) {
                     metaHtml = `<div style="font-size:0.8em; font-weight: bold; color: black; margin-top:4px; border-top: 0.25pt dashed #e5e7eb; padding-top: 2px;">${metaParts.join(' | ')}</div>`;
                 }

                 div.innerHTML = `
                    <div style="color: black; font-size: 0.9em; font-weight: bold; margin-bottom: 2px;">Ans: (${(q.correctIndex || 0) + 1})</div>
                    <div style="color: black; font-size: 0.95em; line-height: 1.3;">${renderedExp}</div>
                    ${metaHtml}
                 `;
                const expPlain = `Ans: (${(q.correctIndex || 0) + 1}) ${htmlToPlainText(renderedExp)} ${metaParts.join(' ')}`.trim();
                const expPretextH =
                  estimateTextHeightWithPretext(
                    expPlain,
                    Math.max(20, contentWidthPx - 8),
                    Math.max(14, lineHeightPx * 0.9),
                    explanationFont,
                    'normal'
                  ) ?? 0;
                measureContainer.appendChild(div); const expDomH = div.getBoundingClientRect().height; measureContainer.removeChild(div);
                const expH = Math.max(Math.ceil(expDomH), expPretextH + 8);
                unitBlocks.push({ type: 'explanation-box', question: q, globalIndex: qIndex, content: div.innerHTML, height: expH });
             }

             const hasQuestionCore = unitBlocks.some((b) => b.type === 'question-core');
             unitPackList.push({
               blocks: unitBlocks,
               baseSum: unitBlocks.reduce((sum, b) => sum + b.height + packingBlockBuffer, 0),
               hasQuestionCore,
               forceBreak: forcedBreaks.has(q.id),
               questionCount: unitBlocks.filter((b) => b.type === 'question-core').length,
             });
        });

        type QueueUnit = PaginationUnit & { hasSubjectHeader: boolean };

        const scoreTupleBetter = (a: [number, number], b: [number, number]) => {
          if (a[0] < b[0]) return true;
          if (a[0] > b[0]) return false;
          return a[1] < b[1];
        };

        const paginateForGap = (packGap: number): { draftPages: PageLayout[]; tuple: [number, number] } => {
          const queue: QueueUnit[] = unitPackList.map((u) => ({
            blocks: u.blocks,
            heightWithGap: u.baseSum + (u.hasQuestionCore ? packGap : 0),
            forceBreak: u.forceBreak,
            questionCount: u.questionCount,
            hasSubjectHeader: u.blocks.some((b) => b.type === 'subject-header'),
          }));

          // Strict syllabus order when explanations are on (Q+exp units); exam mode may reorder within a section for density.
          const allowLookaheadReorder = examDensity;
          const lookaheadDepth = 24;

          const sections: QueueUnit[][] = [];
          let activeSection: QueueUnit[] = [];
          for (const unit of queue) {
            if (activeSection.length === 0) {
              activeSection.push(unit);
              continue;
            }
            if (unit.hasSubjectHeader || unit.forceBreak) {
              sections.push(activeSection);
              activeSection = [unit];
            } else {
              activeSection.push(unit);
            }
          }
          if (activeSection.length > 0) sections.push(activeSection);

          const fillColumnFromQueue = (
            q: QueueUnit[],
            heightLimit: number,
            lockFrontUnit: boolean
          ): { usedHeight: number; out: QuizBlock[]; outUnits: QueueUnit[] } => {
            let used = 0;
            const out: QuizBlock[] = [];
            const outUnits: QueueUnit[] = [];
            while (q.length > 0) {
              if (q[0].forceBreak && out.length > 0) break;
              const remaining = heightLimit - used;
              if (lockFrontUnit && out.length === 0) {
                const locked = q[0];
                if (locked.heightWithGap > remaining) break;
                q.shift();
                outUnits.push(locked);
                out.push(...locked.blocks);
                used += locked.heightWithGap;
                continue;
              }

              let pickIndex = -1;
              let bestHeight = -1;
              const maxScan = Math.min(q.length, lookaheadDepth);
              for (let i = 0; i < maxScan; i += 1) {
                const candidate = q[i];
                if (!allowLookaheadReorder && i > 0) break;
                if (i > 0 && candidate.forceBreak) break;
                if (candidate.heightWithGap <= remaining && candidate.heightWithGap > bestHeight) {
                  bestHeight = candidate.heightWithGap;
                  pickIndex = i;
                }
              }

              if (pickIndex === -1) break;
              const [picked] = q.splice(pickIndex, 1);
              outUnits.push(picked);
              out.push(...picked.blocks);
              used += picked.heightWithGap;
            }
            return { usedHeight: used, out, outUnits };
          };

          type WorkingPage = {
            pageIdx: number;
            heightLimit: number;
            leftUnits: QueueUnit[];
            rightUnits: QueueUnit[];
          };
          const workingPages: WorkingPage[] = [];
          const unitsHeight = (arr: QueueUnit[]) => arr.reduce((sum, u) => sum + u.heightWithGap, 0);
          const canMoveUnitIntoColumn = (unit: QueueUnit, destCol: QueueUnit[]) => {
            if (unit.forceBreak && destCol.length > 0) return false;
            if (unit.hasSubjectHeader && destCol.length > 0) return false;
            return true;
          };

          let currentPageIdx = showIntroPage ? 1 : 0;
          for (const section of sections) {
            let mustPlaceSectionHeader = section[0]?.hasSubjectHeader ?? false;
            while (section.length > 0) {
              const limit = getColumnHeightLimit(currentPageIdx);
              const left = fillColumnFromQueue(section, limit, mustPlaceSectionHeader);
              if (mustPlaceSectionHeader && left.out.length > 0) mustPlaceSectionHeader = false;
              const right = fillColumnFromQueue(section, limit, mustPlaceSectionHeader);
              if (mustPlaceSectionHeader && right.out.length > 0) mustPlaceSectionHeader = false;

              if (left.out.length === 0 && right.out.length === 0) {
                const first = section.shift();
                if (!first) break;
                workingPages.push({
                  pageIdx: currentPageIdx,
                  heightLimit: limit,
                  leftUnits: [first],
                  rightUnits: [],
                });
                mustPlaceSectionHeader = false;
                currentPageIdx += 1;
                continue;
              }

              workingPages.push({
                pageIdx: currentPageIdx,
                heightLimit: limit,
                leftUnits: [...left.outUnits],
                rightUnits: [...right.outUnits],
              });
              currentPageIdx += 1;
            }
          }

          for (let p = 0; p < workingPages.length - 1; p += 1) {
            const cur = workingPages[p];
            const nxt = workingPages[p + 1];

            let moved = true;
            while (moved) {
              moved = false;
              const usedLeft = unitsHeight(cur.leftUnits);
              const usedRight = unitsHeight(cur.rightUnits);
              const slackLeft = cur.heightLimit - usedLeft;
              const slackRight = cur.heightLimit - usedRight;
              const nextLeftHead = nxt.leftUnits[0];
              const nextRightHead = nxt.rightUnits[0];

              const candidates: Array<{ from: 'left' | 'right'; to: 'left' | 'right'; unit: QueueUnit; score: number }> = [];
              const addCandidate = (from: 'left' | 'right', unit: QueueUnit | undefined) => {
                if (!unit) return;
                if (unit.heightWithGap <= slackLeft && canMoveUnitIntoColumn(unit, cur.leftUnits)) {
                  candidates.push({ from, to: 'left', unit, score: slackLeft - unit.heightWithGap });
                }
                if (unit.heightWithGap <= slackRight && canMoveUnitIntoColumn(unit, cur.rightUnits)) {
                  candidates.push({ from, to: 'right', unit, score: slackRight - unit.heightWithGap });
                }
              };
              addCandidate('left', nextLeftHead);
              addCandidate('right', nextRightHead);
              if (candidates.length === 0) break;

              candidates.sort((a, b) => a.score - b.score);
              const best = candidates[0];
              const fromCol = best.from === 'left' ? nxt.leftUnits : nxt.rightUnits;
              const toCol = best.to === 'left' ? cur.leftUnits : cur.rightUnits;
              const picked = fromCol.shift();
              if (!picked) break;
              toCol.push(picked);
              moved = true;
            }
          }

          const compactedPages = workingPages.filter((pg) => pg.leftUnits.length > 0 || pg.rightUnits.length > 0);
          let slackSum = 0;
          for (const pg of compactedPages) {
            slackSum +=
              (pg.heightLimit - unitsHeight(pg.leftUnits)) + (pg.heightLimit - unitsHeight(pg.rightUnits));
          }
          const tuple: [number, number] = [compactedPages.length, slackSum];

          const draftPages: PageLayout[] = [];
          if (showIntroPage) draftPages.push({ leftCol: [], rightCol: [], isCover: true });
          compactedPages.forEach((pg) => {
            draftPages.push({
              leftCol: pg.leftUnits.flatMap((u) => u.blocks),
              rightCol: pg.rightUnits.flatMap((u) => u.blocks),
            });
          });
          if (showAnswerKey) {
            draftPages.push({
              leftCol: [{ type: 'answer-key', content: 'key', height: 0 }],
              rightCol: [],
            });
          }
          return { draftPages, tuple };
        };

        let bestTuple: [number, number] = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
        let bestPages: PageLayout[] | null = null;
        let bestGap = targetQuestionGapPx;

        for (const packGap of gapCandidates) {
          const { draftPages, tuple } = paginateForGap(packGap);
          if (!bestPages || scoreTupleBetter(tuple, bestTuple)) {
            bestTuple = tuple;
            bestPages = draftPages;
            bestGap = packGap;
          }
        }

        setAppliedQuestionGapPx(bestGap);
        setPages(bestPages ?? [{ leftCol: [], rightCol: [] }]);
        document.body.removeChild(measureContainer);
        setTimeout(() => setIsPaginating(false), 50);
    };
    let raf1 = 0;
    raf1 = requestAnimationFrame(() => {
      measureAndPaginate();
    });
    return () => cancelAnimationFrame(raf1);
  }, [currentQuestions, includeExplanations, showDifficulty, groupBySubject, forcedBreaks, showChoices, showSourceFigure, showIntroPage, showTopics, showChapters, showAnswerKey, paperConfig, figureSizes]);

  const scrollToPage = (idx: number) => {
    setViewMode('scroll');
    setTimeout(() => {
        pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const PageThumbnail: React.FC<{ idx: number, label: string }> = ({ idx, label }) => (
    <button 
        onClick={() => scrollToPage(idx)}
        className="group relative flex aspect-[1/1.41] w-full flex-col items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-1 transition-all hover:border-zinc-400 hover:ring-2 hover:ring-zinc-200/80"
    >
        {pages[idx]?.isCover ? (
            <iconify-icon icon="mdi:file-certificate" width="18" className="text-zinc-400 group-hover:text-zinc-700" />
        ) : (pages[idx]?.leftCol[0]?.type === 'answer-key' ? (
            <iconify-icon icon="mdi:key-variant" width="18" className="text-cyan-400 group-hover:text-cyan-600" />
        ) : (
            <div className="w-full h-full flex flex-col gap-0.5 p-1 opacity-20">
                <div className="flex-1 flex gap-0.5">
                    <div className="w-1/2 rounded-sm bg-zinc-400"></div>
                    <div className="w-1/2 rounded-sm bg-zinc-400"></div>
                </div>
            </div>
        ))}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[14px] font-semibold text-zinc-800 opacity-80 drop-shadow-sm transition-all group-hover:scale-125 group-hover:opacity-100">{label.replace('P', '')}</span>
        </div>
    </button>
  );

  const questionBlockTailMarginPx = (block: QuizBlock, next: QuizBlock | undefined, gapPx: number): number | undefined => {
    if (gapPx <= 0) return undefined;
    if (block.type === 'subject-header' || block.type === 'answer-key') return undefined;
    if (block.type === 'explanation-box') return Math.round(4 + gapPx);
    if (block.type === 'question-core') {
      if (next?.type === 'explanation-box' && next.question?.id === block.question?.id) return 2;
      // Former Tailwind space-y-1 (~4px) between column blocks is folded into margin so pagination and DOM stay aligned.
      const base = 4.5;
      return Math.round(base + gapPx);
    }
    return undefined;
  };

  const BlockRenderer: React.FC<{
      block: QuizBlock;
      nextBlock?: QuizBlock;
      questionGapPx: number;
      examDensity: boolean;
      showChoices: boolean;
      showSourceFigure: boolean;
      showDifficulty: boolean;
      /** 1-based index following on-paper reading order (pagination / column packing). */
      displayQuestionNumber?: number;
      onDelete?: (id: string) => void;
      onReplace?: (q: Question) => void;
      onFlag?: (q: Question, reason?: QuestionFlagReason) => void;
  }> = ({
    block,
    nextBlock,
    questionGapPx,
    examDensity,
    showChoices,
    showSourceFigure,
    showDifficulty,
    displayQuestionNumber,
    onDelete,
    onReplace,
    onFlag,
  }) => {
      if (block.type === 'subject-header') return <div className="border-y border-black py-0.25 text-center font-black text-[0.9em] uppercase tracking-widest bg-white mb-3 mt-1 text-black">PART: {block.content}</div>;
      const q = block.question;
      if (!q) return null;

      const tailMb = questionBlockTailMarginPx(block, nextBlock, questionGapPx);
      
      if (block.type === 'explanation-box') {
          return (
              <div 
                  className={`p-1.5 px-2 mt-1 text-black leading-tight math-content ${tailMb === undefined ? 'mb-1.5' : ''}`}
                  style={{
                    fontSize: '0.9em',
                    backgroundColor: '#fcfcfc',
                    border: '0.4pt solid #e5e7eb',
                    borderRadius: '2px',
                    color: 'black',
                    ...(tailMb !== undefined ? { marginBottom: tailMb } : {}),
                  }}
                  dangerouslySetInnerHTML={{ __html: block.content || '' }} 
              />
          );
      }

      const matchingPaper = resolveMatchingPaperColumns(q);
      const colA = matchingPaper?.colA;
      const colB = matchingPaper?.colB;
      const displayStem = matchingPaper?.stemForPaper ?? String(q.text || '');
      const matchingTableHeaders = matchingPaper
        ? { left: matchingPaper.headerLeft, right: matchingPaper.headerRight }
        : { left: 'Column A', right: 'Column B' };
      const stableQid = String(q.originalId || q.id);
      /** Remount KaTeX when paper typography changes so layout toggles always re-parse math. */
      const paperMathLayoutKey = `${paperConfig.fontSize}:${paperConfig.lineHeight}:${paperConfig.gap}:${encodeURIComponent(paperConfig.fontFamily)}`;
      const isFlagged = flaggedQuestionIds.has(stableQid);
      const flagReasonStored = flagReasonsByQuestionId[stableQid];
      const flagTip = isFlagged ? flagReasonTooltip(flagReasonStored) : undefined;
      const hasFigure = !!(q.figureDataUrl || q.figure_url);
      
      const sizeMap: Record<FigureSize, string> = { small: 'S', medium: 'M', large: 'L' };
      const heightMap: Record<FigureSize, string> = { small: '80px', medium: '120px', large: '180px' };
      const currentSize = figureSizes[q.id] || 'medium';
      const stemNumber =
        typeof displayQuestionNumber === 'number' ? displayQuestionNumber : (block.globalIndex ?? 0) + 1;

      return (
          <div
            className={`leading-tight relative group text-black break-inside-avoid math-content ${tailMb === undefined ? 'mb-0.5' : ''}`}
            style={tailMb !== undefined ? { marginBottom: tailMb } : undefined}
          >
              {/* Question Control Buttons: Positioned top-right to avoid being clipped by page-container overflow */}
              <div className="no-print absolute right-0 top-0 z-20 flex items-center gap-1 rounded-bl-md border-b border-l border-zinc-200 bg-white/90 pb-1 pl-2 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <button 
                    type="button"
                    onClick={() => onDelete && onDelete(q.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-all hover:scale-110 hover:text-rose-500 active:scale-95"
                    title="Remove Question"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" width="16" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => onReplace && onReplace(q)}
                    disabled={isReplacing === q.id}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-all hover:scale-110 hover:text-zinc-900 active:scale-95 disabled:opacity-50"
                    title="Replace with similar"
                  >
                    {isReplacing === q.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"></div>
                    ) : (
                        <iconify-icon icon="mdi:refresh" width="16" />
                    )}
                  </button>
                  {onFlag && !isFlagged && hasFigure ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onFlag(q, 'out_of_syllabus')}
                        disabled={flaggingQuestionId === q.id}
                        className="flex h-7 items-center justify-center gap-0.5 rounded-md border border-zinc-200 bg-white px-1.5 text-[7px] font-semibold uppercase tracking-wide text-zinc-600 transition-all hover:text-rose-600 active:scale-95 disabled:opacity-50"
                        title="Flag as out of syllabus"
                      >
                        {flaggingQuestionId === q.id ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"></div>
                        ) : (
                          <>
                            <iconify-icon icon="mdi:book-remove-outline" width="12" />
                            <span className="hidden min-[480px]:inline">Syllabus</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onFlag(q, 'incorrect_figure')}
                        disabled={flaggingQuestionId === q.id}
                        className="flex h-7 items-center justify-center gap-0.5 rounded-md border border-zinc-200 bg-white px-1.5 text-[7px] font-semibold uppercase tracking-wide text-zinc-600 transition-all hover:text-rose-600 active:scale-95 disabled:opacity-50"
                        title="Flag as incorrect figure"
                      >
                        {flaggingQuestionId === q.id ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"></div>
                        ) : (
                          <>
                            <iconify-icon icon="mdi:image-broken-variant" width="12" />
                            <span className="hidden min-[480px]:inline">Figure</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onFlag && onFlag(q, 'out_of_syllabus')}
                      disabled={flaggingQuestionId === q.id}
                      className={`flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[8px] font-semibold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50 ${
                        isFlagged ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-zinc-200 bg-white text-zinc-600 hover:text-rose-600'
                      }`}
                      title={isFlagged ? flagTip : 'Flag as out of syllabus'}
                    >
                      {flaggingQuestionId === q.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"></div>
                      ) : (
                        <iconify-icon icon={isFlagged ? 'mdi:flag' : 'mdi:flag-outline'} width="13" />
                      )}
                      {isFlagged ? 'Flagged' : 'Flag'}
                    </button>
                  )}
              </div>
  
              <div className="flex gap-1.5 items-start">
                  <b className="shrink-0 text-black tabular-nums">{stemNumber}.</b>
                  <div className="flex-1 text-black">
                      <PaperRich key={`${paperMathLayoutKey}-stem-${stableQid}`} text={displayStem} />
                      {showDifficulty && <span className="ml-1 px-1 py-0.25 rounded text-[0.6em] font-black uppercase border border-black align-middle inline-block leading-none text-black">{q.difficulty}</span>}
                  </div>
              </div>
              {q.figureDataUrl && (
                  <div
                    className="ml-5 mt-2 mb-1 p-1 border border-black/20 rounded inline-block bg-white shadow-sm relative group/figure"
                    title={isFlagged ? flagTip : undefined}
                  >
                      <img src={q.figureDataUrl} className="object-contain mix-blend-multiply" style={{ maxHeight: heightMap[currentSize] }} alt="Figure Asset" />
                      <div className="no-print absolute -top-3 right-0 bg-black/60 text-white rounded-full px-1 py-0.5 opacity-0 group-hover/figure:opacity-100 transition-opacity flex items-center gap-0.5 shadow-lg">
                          <button onClick={() => adjustFigureSize(q.id, 'decrease')} className="w-5 h-5 flex items-center justify-center hover:bg-white/20 rounded-full font-bold text-lg leading-none pb-1 disabled:opacity-30" disabled={currentSize === 'small'}>-</button>
                          <span className="text-[9px] font-mono w-5 text-center">{sizeMap[currentSize]}</span>
                          <button onClick={() => adjustFigureSize(q.id, 'increase')} className="w-5 h-5 flex items-center justify-center hover:bg-white/20 rounded-full font-bold text-lg leading-none pb-0.5 disabled:opacity-30" disabled={currentSize === 'large'}>+</button>
                      </div>
                  </div>
              )}
              {showSourceFigure && q.sourceFigureDataUrl && (
                  <div className="relative ml-5 mt-1.5 mb-1 inline-block overflow-hidden rounded-md border border-zinc-200 bg-zinc-50/80 p-1 shadow-sm">
                      <div className="absolute left-0 top-0 z-10 rounded-br-md bg-zinc-900 px-1.5 py-0.5 text-[5pt] font-semibold uppercase tracking-widest text-white">Reference Source</div>
                      <img src={q.sourceFigureDataUrl} className="max-h-[80px] object-contain mix-blend-multiply opacity-80" alt="Source Asset" />
                  </div>
              )}
              {colA && colB && colA.length > 0 && (
                  <div className="ml-5 mt-2 mb-1.5 border border-black overflow-hidden rounded-sm">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em', color: 'black' }}>
                          <thead>
                              <tr style={{ borderBottom: '0.5pt solid black', backgroundColor: '#f8fafc' }}>
                                  <th style={{ textAlign: 'left', width: '50%', padding: '4px', borderRight: '0.5pt solid black', color: 'black' }}>{matchingTableHeaders.left}</th>
                                  <th style={{ textAlign: 'left', width: '50%', padding: '4px', color: 'black' }}>{matchingTableHeaders.right}</th>
                              </tr>
                          </thead>
                          <tbody>
                              {colA.map((ca: string, i: number) => (
                                  <tr key={i} style={{ borderBottom: '0.25pt solid #eee' }}>
                                      <td style={{ padding: '4px', borderRight: '0.5pt solid black', color: 'black' }}>
                                        ({matchingRowLetter(i)}){' '}
                                        <PaperRich key={`${paperMathLayoutKey}-ca-${stableQid}-${i}`} text={ca} />
                                      </td>
                                      <td style={{ padding: '4px', color: 'black' }}>
                                        ({ROMAN_ROW_SUFFIX[i] ?? i + 1}){' '}
                                        <PaperRich key={`${paperMathLayoutKey}-cb-${stableQid}-${i}`} text={colB[i] || ''} />
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
              {showChoices && q.options && (
                  shouldUseCompactOptionGrid(q.options, examDensity) ? (
                      <div className="ml-5 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-medium text-black leading-tight">
                          {q.options.map((o: string, i: number) => (
                              <div key={i} className="flex min-w-0 gap-1.5 items-start">
                                  <span className="shrink-0 text-black">({i + 1})</span>
                                  <PaperRich key={`${paperMathLayoutKey}-opt-${stableQid}-${i}`} text={o} className="min-w-0" />
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="ml-5 mt-1.5 space-y-0 font-medium text-black">
                          {q.options.map((o: string, i: number) => (
                              <div key={i} className="flex gap-1.5 items-start leading-tight">
                                  <span className="shrink-0 text-black">({i + 1})</span>
                                  <PaperRich key={`${paperMathLayoutKey}-opt-${stableQid}-${i}`} text={o} />
                              </div>
                          ))}
                      </div>
                  )
              )}
          </div>
      );
  };

  const insightsPanelActive = isLgLayout ? isInsightsOpen : resultMobileSheet === 'insights';
  const layoutControlsActive = isLgLayout ? isControlsOpen : resultMobileSheet === 'layout';
  const scrollPageScaled = viewMode === 'scroll' && scrollPreviewScale < 0.998;
  const previewScale = scrollPageScaled ? scrollPreviewScale : 1;

  const insightsPanelScroll = (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
      <div className="mb-6 rounded-md border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
        <h3 className="mb-3 text-[8px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Paper Matrix</h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="flex flex-col items-center rounded-md bg-white/5 p-1.5">
            <span className="text-[7px] font-black text-emerald-400 uppercase">Easy</span>
            <span className="text-sm font-black text-white">{globalStats.Easy}</span>
          </div>
          <div className="flex flex-col items-center rounded-md bg-white/5 p-1.5">
            <span className="text-[7px] font-black text-amber-400 uppercase">Med</span>
            <span className="text-sm font-black text-white">{globalStats.Medium}</span>
          </div>
          <div className="flex flex-col items-center rounded-md bg-white/5 p-1.5">
            <span className="text-[7px] font-black text-rose-400 uppercase">Hard</span>
            <span className="text-sm font-black text-white">{globalStats.Hard}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          <span className="text-[7px] font-medium uppercase text-zinc-400">MCQ: {globalStats.mcq}</span>
          <span className="text-[7px] font-medium uppercase text-zinc-400">ASR: {globalStats.reasoning}</span>
          <span className="text-[7px] font-medium uppercase text-zinc-400">MT: {globalStats.matching}</span>
          <span className="text-[7px] font-medium uppercase text-zinc-400">ST: {globalStats.statements}</span>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-800"><iconify-icon icon="mdi:chart-box-outline" /> Breakdown</h3>
        <div className="space-y-1.5">
          {subjectBreakdown.map(([sub, count]) => (
            <div key={sub} className="group flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 transition-all hover:border-zinc-300">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600"></div>
                <span className="truncate text-[8px] font-medium uppercase text-zinc-600">{sub}</span>
              </div>
              <span className="text-xl font-semibold text-zinc-900">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-800"><iconify-icon icon="mdi:layers-triple-outline" /> Navigator</h3>

      <div className="space-y-6">
        {showIntroPage && pages.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[7px] font-semibold uppercase tracking-widest text-zinc-400">PREFACE</span>
              <div className="h-px flex-1 bg-zinc-200"></div>
            </div>
            <div className="w-1/3">
              <PageThumbnail idx={0} label="P1" />
            </div>
          </div>
        )}

        {Object.entries(subjectToPages).map(([sub, pageIndices]) => (
          <div key={sub}>
            <div className="flex items-center gap-2 mb-2">
              <span className="truncate text-[7px] font-semibold uppercase tracking-widest text-zinc-600">{sub}</span>
              <div className="h-px flex-1 bg-zinc-200"></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {pageIndices.map((pIdx) => (
                <PageThumbnail key={pIdx} idx={pIdx} label={`P${pIdx + 1}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const layoutControlsPanel = (
    <>
      <div className="border-b border-zinc-200 bg-zinc-50/90 p-6">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Layout controls</h3>
        <p className="text-[10px] font-medium text-zinc-500">Paper &amp; content</p>
      </div>
      <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar p-6">
        <div>
          <h4 className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">View mode</h4>
          <div className="flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('scroll')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[9px] font-medium uppercase tracking-widest transition-all ${viewMode === 'scroll' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
            >
              <iconify-icon icon="mdi:view-day-outline" /> Scroll
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[9px] font-medium uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
            >
              <iconify-icon icon="mdi:view-grid-outline" /> Grid
            </button>
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Content options</h4>
          <div className="flex flex-wrap gap-2">
            <Toggle label="Cover" checked={showIntroPage} onChange={() => setShowIntroPage(!showIntroPage)} color="zinc" />
            <Toggle label="Logic" checked={includeExplanations} onChange={() => setIncludeExplanations(!includeExplanations)} color="amber" />
            <Toggle label="Source" checked={showSourceFigure} onChange={() => setShowSourceFigure(!showSourceFigure)} color="cyan" />
            <Toggle label="Answer Key" checked={showAnswerKey} onChange={() => setShowAnswerKey(!showAnswerKey)} color="cyan" />
            <Toggle label="Topics" checked={showTopics} onChange={() => setShowTopics(!showTopics)} color="emerald" />
            <Toggle label="Chapters" checked={showChapters} onChange={() => setShowChapters(!showChapters)} color="slate" />
            <Toggle label="Difficulty" checked={showDifficulty} onChange={() => setShowDifficulty(!showDifficulty)} color="rose" />
            <Toggle label="Choices" checked={showChoices} onChange={() => setShowChoices(!showChoices)} color="rose" />
            <Toggle label="Sections" checked={groupBySubject} onChange={() => setGroupBySubject(!groupBySubject)} color="slate" />
            <Toggle label="Past Replace" checked={allowPastReplacements} onChange={() => setAllowPastReplacements(!allowPastReplacements)} color="amber" />
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Paper formatting</h4>
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <label className="ml-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Font face</label>
              <select value={paperConfig.fontFamily} onChange={(e) => setPaperConfig({ ...paperConfig, fontFamily: e.target.value })} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium shadow-sm outline-none focus:border-zinc-400">
                <option value="'Times New Roman', Times, serif">Times New Roman (Serif)</option>
                <option value="Georgia, serif">Georgia (Serif)</option>
                <option value="Helvetica, Arial, sans-serif">Helvetica (Sans-Serif)</option>
                <option value="'Lato', sans-serif">Lato (Sans-Serif)</option>
              </select>
            </div>
            <NumberControl label="Font Size" value={paperConfig.fontSize} onChange={(v) => setPaperConfig({ ...paperConfig, fontSize: v })} min={8} max={14} unit="pt" />
            <NumberControl label="Line Spacing" value={paperConfig.lineHeight} onChange={(v) => setPaperConfig({ ...paperConfig, lineHeight: v })} min={1} max={2.5} step={0.05} />
            <NumberControl label="Margin (H)" value={paperConfig.marginX} onChange={(v) => setPaperConfig({ ...paperConfig, marginX: v })} min={5} max={30} unit="mm" />
            <NumberControl label="Margin (V)" value={paperConfig.marginY} onChange={(v) => setPaperConfig({ ...paperConfig, marginY: v })} min={5} max={30} unit="mm" />
            <NumberControl label="Column Gap" value={paperConfig.gap} onChange={(v) => setPaperConfig({ ...paperConfig, gap: v })} min={2} max={20} unit="mm" />
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Packing</h4>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[9px] leading-snug text-zinc-600">
            Question spacing (~20px) is chosen automatically from a small range so pages pack tightly with minimal bottom gap. Typography changes reflow on the next animation frame.
          </p>
        </div>

        <div>
          <h4 className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Utilities</h4>
          <button type="button" onClick={handleDownloadKeys} disabled={isPaginating || isSaving} className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-cyan-800 shadow-sm transition-all hover:bg-cyan-100 disabled:opacity-50">
            {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-700"></div> : <iconify-icon icon="mdi:key-download-outline" width="16" />}
            Download Answer Key
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`print-app-shell h-full min-h-0 w-full overflow-hidden ${workspacePageClass}`} style={{ colorScheme: 'light' }}>
       {/* Inject dynamic styles for Math sizing consistency */}
       <style>{`
         .math-content .katex { font-size: 1em !important; }
         .math-content .katex .base { margin-top: 2px; margin-bottom: 2px; }
         .math-content .katex-display { margin: 0.2em 0 !important; }
         @media print {
           .print-preview-scale-wrap,
           .print-preview-scale-inner { display: contents !important; width: auto !important; height: auto !important; }
           .printable-quiz-page { position: relative !important; transform: none !important; left: auto !important; top: auto !important; }
         }
       `}</style>

       <header className="no-print z-30 shrink-0 border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)] shadow-sm">
          <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:px-6 lg:py-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:gap-4">
                <div
                    className="group flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-zinc-900 text-white shadow-sm transition-colors hover:bg-zinc-800 lg:h-10 lg:w-10"
                    onClick={onRestart}
                    onKeyDown={(e) => e.key === 'Enter' && onRestart()}
                    role="button"
                    tabIndex={0}
                >
                    <iconify-icon icon="mdi:flask" width="22" className="transition-transform group-hover:rotate-12 lg:w-[24px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <input
                        type="text"
                        value={editableTopic}
                        onChange={(e) => setEditableTopic(e.target.value)}
                        className="w-full min-w-0 max-w-full border-b-2 border-transparent bg-transparent px-1 text-base font-semibold leading-tight tracking-tight text-zinc-900 outline-none transition-all hover:border-zinc-200 focus:border-zinc-400 sm:text-lg lg:text-lg"
                    />
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-zinc-500 sm:text-[10px]">{currentQuestions.length} items validated</p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">
                    <button
                        type="button"
                        onClick={() => setResultMobileSheet((s) => (s === 'insights' ? null : 'insights'))}
                        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${insightsPanelActive ? 'border-zinc-300 bg-zinc-100 text-zinc-900' : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-600'}`}
                        title="Paper insights & navigator"
                    >
                        <iconify-icon icon="mdi:chart-box-outline" width="18" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setResultMobileSheet((s) => (s === 'layout' ? null : 'layout'))}
                        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${layoutControlsActive ? 'border-zinc-300 bg-zinc-100 text-zinc-900' : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-600'}`}
                        title="Layout controls"
                    >
                        <iconify-icon icon="mdi:tune-variant" width="18" />
                    </button>
                    <button
                        type="button"
                        onClick={onRestart}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 transition-colors hover:text-rose-600"
                        title="Close"
                    >
                        <iconify-icon icon="mdi:close" width="18" />
                    </button>
                </div>
            </div>

            <div className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => onEditBlueprint && onEditBlueprint(currentQuestions)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[9px] font-medium uppercase tracking-widest text-zinc-600 shadow-sm transition-all hover:border-zinc-300 hover:text-zinc-900 sm:px-4 sm:text-[10px] lg:px-5 lg:py-2.5"
                title="Edit blueprint"
              >
                <iconify-icon icon="mdi:playlist-edit" width="16" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOmrOpen(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[9px] font-medium uppercase tracking-widest text-rose-700 shadow-sm transition-all hover:bg-rose-100 sm:px-4 sm:text-[10px] lg:px-6 lg:py-2.5"
                title="Evaluate (OMR)"
              >
                <iconify-icon icon="mdi:camera-metering-spot" width="16" />
                <span className="max-[340px]:sr-only sm:inline">Evaluate</span>
              </button>
              <button
                type="button"
                onClick={handleSaveToCloud}
                disabled={isSaving || saveComplete}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[9px] font-medium uppercase tracking-widest shadow-sm transition-all sm:px-4 sm:text-[10px] lg:px-6 lg:py-2.5 ${saveComplete ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                title="Sync to hub"
              >
                {isSaving ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <iconify-icon icon="mdi:cloud-upload" width="16" />}
                <span className="max-[380px]:sr-only sm:inline">{saveComplete ? 'Saved' : 'Sync'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPaginating}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-[9px] font-medium uppercase tracking-widest text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50 sm:px-4 sm:text-[10px] lg:px-6 lg:py-2.5"
                title="Print"
              >
                <iconify-icon icon="mdi:printer" width="16" />
                Print
              </button>

              <div className="mx-1 hidden h-6 w-px shrink-0 bg-zinc-200 lg:block" />

              <div className="hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={() => setIsInsightsOpen((o) => !o)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-[9px] font-medium uppercase tracking-widest shadow-sm transition-colors ${insightsPanelActive ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'}`}
                  title="Paper matrix, breakdown & page navigator"
                  aria-pressed={isInsightsOpen}
                >
                    <iconify-icon icon="mdi:chart-box-outline" width="18" />
                    Insights
                </button>
                <button
                  type="button"
                  onClick={() => setIsControlsOpen((o) => !o)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-[9px] font-medium uppercase tracking-widest shadow-sm transition-colors ${layoutControlsActive ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'}`}
                  title="View mode, content toggles & paper formatting"
                  aria-pressed={isControlsOpen}
                >
                    <iconify-icon icon="mdi:tune-variant" width="18" />
                    Layout
                </button>
                <button
                    type="button"
                    onClick={onRestart}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 transition-colors hover:text-rose-600"
                    title="Close"
                >
                    <iconify-icon icon="mdi:close" width="20" />
                </button>
              </div>
            </div>
          </div>
       </header>

       <div className="print-content-shell flex-1 flex min-h-0 overflow-hidden">
            {isInsightsOpen && (
            <aside className="no-print hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white animate-fade-in lg:flex">
                {insightsPanelScroll}
            </aside>
            )}

            <main ref={mainHostRef} className="print-main-host min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-zinc-100 p-3 pb-24 custom-scrollbar sm:p-4 sm:pb-24 lg:p-8 lg:pb-8">
                <div
                    id="printable-paper-area"
                    className={`${
                        viewMode === 'grid'
                            ? 'grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-6'
                            : 'flex w-full max-w-full flex-col items-center space-y-6 sm:space-y-10 lg:space-y-12'
                    } pb-32 sm:pb-40 print:block print:space-y-0 print:pb-0`}
                >
                    {pages.map((p, idx) => {
                        const isAnswerKeyPage = p.leftCol.length > 0 && p.leftCol[0].type === 'answer-key';
                        const pageShellStyle: React.CSSProperties = {
                            fontFamily: paperConfig.fontFamily,
                            colorScheme: 'light',
                            backgroundColor: '#ffffff',
                            color: '#000000',
                        };
                        const innerCol = (
                                <div className="relative flex h-full min-h-0 flex-col">
                                {!isAnswerKeyPage && !p.isCover && (
                                    <div
                                        aria-hidden="true"
                                        className="absolute h-[0.5pt] bg-black z-10 pointer-events-none"
                                        style={{
                                            left: `${paperConfig.marginX}mm`,
                                            right: `${paperConfig.marginX}mm`,
                                            bottom: '6.4mm',
                                        }}
                                    />
                                )}
                                <div 
                                  className="flex-1 flex flex-col"
                                  style={
                                    p.isCover
                                      ? {
                                          padding: '1.5mm',
                                          fontSize: `${paperConfig.fontSize}pt`,
                                          lineHeight: `${paperConfig.lineHeight}`,
                                          transition: 'font-size 0.12s ease-out, line-height 0.12s ease-out',
                                        }
                                      : {
                                          paddingTop: `${paperConfig.marginY * QUESTION_PAGE_TOP_MARGIN_FRAC}mm`,
                                          paddingRight: `${paperConfig.marginX}mm`,
                                          paddingBottom: `${paperConfig.marginY}mm`,
                                          paddingLeft: `${paperConfig.marginX}mm`,
                                          fontSize: `${paperConfig.fontSize}pt`,
                                          lineHeight: `${paperConfig.lineHeight}`,
                                          transition: 'font-size 0.12s ease-out, line-height 0.12s ease-out',
                                        }
                                  }
                                >
                                {isAnswerKeyPage ? (
                                    <AnswerKeyPage
                                      questions={questionsOrderedForAnswerKey}
                                      brandConfig={brandConfig}
                                      topic={editableTopic}
                                    />
                                ) : p.isCover ? (
                                    <div className="flex-1 flex flex-col border-[1.2pt] border-black p-[2.5mm] relative">
                                        <div className="flex flex-col items-center text-center mt-0.5 mb-1 shrink-0">
                                            {brandConfig.logo && <img src={brandConfig.logo} className="h-8 w-8 object-contain mb-0.5" />}
                                            <h1 className="text-xl font-black uppercase tracking-tight text-black mb-0 leading-none">{brandConfig.name}</h1>
                                            <div className="w-8 h-0.5 bg-black mb-0.5"></div>
                                            
                                            <h2 className="text-sm font-black uppercase mb-0 text-black leading-tight">{editableTopic}</h2>
                                            <div className="px-3 py-0.5 bg-black text-white rounded-full text-[6pt] font-black uppercase tracking-[0.2em] mb-1">Authorized Assessment</div>
                                        </div>

                                        {showChapterListOnCover && (
                                            <div className="flex-shrink-0 h-auto flex flex-col mb-1.5 overflow-hidden">
                                                <div className="border-b-[0.8pt] border-black pb-0.5 mb-1">
                                                    <h3 className="text-[7pt] font-black uppercase tracking-[0.15em] text-center">SYLLABUS COVERAGE & WEIGHTAGE</h3>
                                                </div>
                                                
                                                <div className="grid grid-cols-3 gap-1.5 h-auto">
                                                    {(Object.entries(chapterSummary) as Array<[string, Record<string, number>]>).map(([subject, chaps]) => (
                                                        <div key={subject} className="flex flex-col border border-black bg-white h-fit overflow-hidden">
                                                            <div className="bg-black/5 border-b border-black py-0.25 px-1 text-center">
                                                                <h4 className="text-[6pt] font-black uppercase tracking-widest text-black truncate">{subject}</h4>
                                                            </div>
                                                            <div className="p-0.5 space-y-0.25">
                                                                {(Object.entries(chaps) as Array<[string, number]>).map(([name, count]) => (
                                                                    <div key={name} className="flex justify-between items-start gap-1 border-b border-black/5 pb-0.25 last:border-0" style={{ fontSize: chapterFontSize }}>
                                                                        <span className="font-bold leading-none uppercase truncate">{name}</span>
                                                                        <span className="font-black text-black/50 shrink-0">[{count}]</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="shrink-0 mt-auto space-y-1">
                                            <div className="grid grid-cols-3 gap-3 text-black border-y border-black py-1">
                                                <div className="text-center">
                                                    <span className="text-[6pt] font-black uppercase text-black/40 block leading-none">Total Items</span>
                                                    <span className="text-[8pt] font-bold">{currentQuestions.length}</span>
                                                </div>
                                                <div className="text-center border-x border-black/10">
                                                    <span className="text-[6pt] font-black uppercase text-black/40 block leading-none">Duration</span>
                                                    <span className="text-[8pt] font-bold">180 MINS</span>
                                                </div>
                                                <div className="text-center">
                                                    <span className="text-[6pt] font-black uppercase text-black/40 block leading-none">Max Marks</span>
                                                    <span className="text-[8pt] font-bold">{currentQuestions.length * 4}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between items-end pt-0.5 border-t border-black/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-left">
                                                      <p className="text-[5pt] font-black uppercase tracking-widest text-black/30 leading-none">Verification</p>
                                                      <p className="text-[6pt] font-black uppercase leading-tight">Academic Lead</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[4pt] font-mono font-bold text-black/20 uppercase tracking-tighter leading-none mb-0.5">REF-ID: {Math.random().toString(36).substring(7).toUpperCase()}</p>
                                                    <p className="text-[6pt] font-serif italic leading-none">Integrated Assessment System</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col text-black bg-white relative h-full">
                                        <div className="mb-0.5 flex min-h-[6mm] shrink-0 items-center justify-between gap-2 px-0.5">
                                          <span className="max-w-[65%] truncate text-[8pt] font-black uppercase tracking-wide text-black leading-none">
                                            {brandConfig.name}
                                          </span>
                                          {brandConfig.logo ? (
                                            <img
                                              src={brandConfig.logo}
                                              alt=""
                                              className="h-6 max-h-[7mm] w-auto max-w-[30mm] object-contain object-right"
                                            />
                                          ) : (
                                            <span className="shrink-0" aria-hidden />
                                          )}
                                        </div>
                                        <div className="mb-2 h-[0.5pt] w-full shrink-0 bg-black" />

                                        <div
                                            className="relative flex min-h-0 flex-1"
                                            style={{ gap: `${paperConfig.gap}mm` }}
                                        >
                                            <div
                                                aria-hidden="true"
                                                className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-0 w-[0.5pt] -translate-x-1/2 bg-black"
                                            />
                                            <div className="relative z-10 flex-1 overflow-hidden pr-1">
                                                {p.leftCol.map((b, bi) => (
                                                  <BlockRenderer
                                                    key={bi}
                                                    block={b}
                                                    nextBlock={p.leftCol[bi + 1]}
                                                    questionGapPx={appliedQuestionGapPx}
                                                    examDensity={!includeExplanations}
                                                    showChoices={showChoices}
                                                    showSourceFigure={showSourceFigure}
                                                    showDifficulty={showDifficulty}
                                                    displayQuestionNumber={
                                                      b.type === 'question-core' && b.question
                                                        ? paperQuestionNumberById.get(
                                                            String(b.question.originalId || b.question.id)
                                                          )
                                                        : undefined
                                                    }
                                                    onDelete={handleDeleteQuestion}
                                                    onReplace={handleReplaceQuestion}
                                                    onFlag={handleFlagQuestion}
                                                  />
                                                ))}
                                            </div>
                                            <div className="relative z-10 flex-1 overflow-hidden pl-1">
                                                {p.rightCol.map((b, bi) => (
                                                  <BlockRenderer
                                                    key={bi}
                                                    block={b}
                                                    nextBlock={p.rightCol[bi + 1]}
                                                    questionGapPx={appliedQuestionGapPx}
                                                    examDensity={!includeExplanations}
                                                    showChoices={showChoices}
                                                    showSourceFigure={showSourceFigure}
                                                    showDifficulty={showDifficulty}
                                                    displayQuestionNumber={
                                                      b.type === 'question-core' && b.question
                                                        ? paperQuestionNumberById.get(
                                                            String(b.question.originalId || b.question.id)
                                                          )
                                                        : undefined
                                                    }
                                                    onDelete={handleDeleteQuestion}
                                                    onReplace={handleReplaceQuestion}
                                                    onFlag={handleFlagQuestion}
                                                  />
                                                ))}
                                            </div>
                                        </div>

                                        <div
                                            aria-hidden="true"
                                            className="hidden print:block select-none pointer-events-none overflow-hidden"
                                            style={{
                                                color: 'transparent',
                                                fontSize: `${paperConfig.fontSize}pt`,
                                                lineHeight: `${paperConfig.lineHeight}`,
                                                maxHeight: `${FOOTER_RESERVE_PX}px`
                                            }}
                                        >
                                            {Array.from({ length: INVISIBLE_FOOTER_FILL_LINES }).map((_, fillIdx) => (
                                                <div key={`footer-fill-${idx}-${fillIdx}`}>x</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                </div>
                                <div
                                    className="mt-auto flex shrink-0 justify-end pb-0.5 pt-0.5 leading-none"
                                    style={{ paddingRight: `${paperConfig.marginX}mm` }}
                                >
                                    <span className="text-[6pt] font-semibold tabular-nums text-black">
                                        Page {idx + 1} / {pages.length}
                                    </span>
                                </div>
                                </div>
                        );

                        const pageClassGrid =
                            'printable-quiz-page relative mx-auto flex aspect-[210/297] h-auto w-full cursor-zoom-in flex-col overflow-hidden border border-zinc-200 bg-white text-black shadow-lg transition-all hover:scale-[1.03] hover:ring-4 hover:ring-zinc-200/60 box-border';
                        const pageClassScroll =
                            'printable-quiz-page relative mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden border border-zinc-200 bg-white text-black shadow-lg transition-all box-border';

                        if (viewMode === 'grid') {
                            const g = gridPreviewScale;
                            return (
                                <div
                                    key={idx}
                                    ref={(el) => { pageRefs.current[idx] = el; }}
                                    onClick={() => setViewMode('scroll')}
                                    className={pageClassGrid}
                                    style={pageShellStyle}
                                >
                                    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                                        <div
                                            className="absolute left-0 top-0 overflow-hidden"
                                            style={{
                                                width: PAGE_WIDTH_PX * g,
                                                height: PAGE_HEIGHT_PX * g,
                                            }}
                                        >
                                            <div
                                                className="flex flex-col"
                                                style={{
                                                    width: '210mm',
                                                    height: '297mm',
                                                    transform: `scale(${g})`,
                                                    transformOrigin: 'top left',
                                                }}
                                            >
                                                {innerCol}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        if (scrollPageScaled) {
                            return (
                                <div key={idx} className="print-preview-scale-wrap mb-6 flex w-full justify-center sm:mb-10 print:contents">
                                    <div
                                        className="print-preview-scale-inner relative shrink-0 print:contents"
                                        style={{ width: PAGE_WIDTH_PX * previewScale, height: PAGE_HEIGHT_PX * previewScale }}
                                    >
                                        <div
                                            ref={(el) => { pageRefs.current[idx] = el; }}
                                            className={`${pageClassScroll} absolute left-0 top-0`}
                                            style={{
                                                ...pageShellStyle,
                                                transform: `scale(${previewScale})`,
                                                transformOrigin: 'top left',
                                            }}
                                        >
                                            {innerCol}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={idx} className="mb-6 flex w-full justify-center sm:mb-10 print:block print:mb-0">
                                <div
                                    ref={(el) => { pageRefs.current[idx] = el; }}
                                    className={pageClassScroll}
                                    style={pageShellStyle}
                                >
                                    {innerCol}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {isControlsOpen && (
                <aside className="no-print hidden w-72 shrink-0 flex-col border-l border-zinc-200 bg-white animate-fade-in lg:flex">
                    {layoutControlsPanel}
                </aside>
            )}
       </div>

            {!isLgLayout && (
                <div className="no-print flex shrink-0 gap-2 border-t border-zinc-200 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={() => setResultMobileSheet((s) => (s === 'insights' ? null : 'insights'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md text-[10px] font-medium uppercase tracking-widest transition-all ${
                            resultMobileSheet === 'insights' ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 bg-zinc-50 text-zinc-600'
                        }`}
                    >
                        <iconify-icon icon="mdi:chart-box-outline" width="20" />
                        Insights
                    </button>
                    <button
                        type="button"
                        onClick={() => setResultMobileSheet((s) => (s === 'layout' ? null : 'layout'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md text-[10px] font-medium uppercase tracking-widest transition-all ${
                            resultMobileSheet === 'layout' ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 bg-zinc-50 text-zinc-600'
                        }`}
                    >
                        <iconify-icon icon="mdi:tune-variant" width="20" />
                        Layout
                    </button>
                </div>
            )}

            {!isLgLayout && resultMobileSheet && (
                <>
                    <button
                        type="button"
                        aria-label="Close panel"
                        className="no-print animate-fade-in fixed inset-0 z-[55] bg-zinc-950/40"
                        onClick={() => setResultMobileSheet(null)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="result-sheet-title"
                        className="no-print animate-slide-up fixed inset-x-0 bottom-0 z-[60] flex max-h-[90vh] flex-col rounded-t-xl border border-zinc-200 border-b-0 bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.12)]"
                    >
                        <div className="flex justify-center pt-2 pb-1" aria-hidden>
                            <div className="h-1 w-10 rounded-full bg-zinc-300" />
                        </div>
                        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5">
                            <span id="result-sheet-title" className="text-xs font-semibold uppercase tracking-widest text-zinc-800">
                                {resultMobileSheet === 'insights' ? 'Paper insights' : 'Layout controls'}
                            </span>
                            <button
                                type="button"
                                className="rounded-md p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                                onClick={() => setResultMobileSheet(null)}
                                aria-label="Close"
                            >
                                <iconify-icon icon="mdi:close" width="22" />
                            </button>
                        </div>
                        <div className="flex max-h-[min(72vh,calc(90vh-5.5rem))] min-h-[36vh] flex-1 flex-col overflow-hidden">
                            {resultMobileSheet === 'insights' ? (
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{insightsPanelScroll}</div>
                            ) : (
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{layoutControlsPanel}</div>
                            )}
                        </div>
                    </div>
                </>
            )}

       {isOmrOpen && (
           <OMRScannerModal
                questions={currentQuestions}
                onClose={() => setIsOmrOpen(false)}
           />
       )}
    </div>
  );
};

export default QuestionListScreen;
