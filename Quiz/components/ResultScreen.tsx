
import '../../types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../supabase/client';
import { Question, BrandingConfig, LayoutConfig } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import OMRScannerModal from './OCR/OMRScannerModal';
import { generateAnswerKeyPDF } from './AnswerKeyGenerator';

type BlockType = 'cover-page' | 'question-core' | 'explanation-box' | 'subject-header' | 'answer-key';
type FigureSize = 'small' | 'medium' | 'large';

interface QuizBlock {
  type: BlockType;
  question?: Question & { column_a?: string[]; column_b?: string[]; }; 
  globalIndex?: number;
  content?: string; 
  height: number; 
}

interface PageLayout {
    leftCol: QuizBlock[];
    rightCol: QuizBlock[];
    isCover?: boolean;
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
                <div className="flex justify-center gap-6 mt-1 text-[7pt] font-black uppercase text-slate-500">
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
                                <div key={q.id || qIndex} className="flex items-center justify-between py-1.5 border-b border-dotted border-slate-200">
                                    <span className="font-bold text-[7.5pt] text-slate-400 w-5">{qIndex + 1}.</span>
                                    <div className="flex items-center">
                                        <span className="font-black text-[8pt] text-slate-800 pr-1">
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
                <div className="text-[5pt] font-black uppercase text-slate-400">
                    ID: {Math.random().toString(36).substring(7).toUpperCase()}
                </div>
                <div className="text-right">
                    <p className="text-[7pt] font-bold text-black uppercase leading-none">{brandConfig.name}</p>
                    <p className="text-[5pt] text-slate-400 italic">Authored Assessment Matrix</p>
                </div>
            </div>
        </div>
    );
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; color?: string }> = ({ label, checked, onChange, color = 'indigo' }) => {
    const activeColors: Record<string, string> = {
        indigo: 'bg-indigo-600 border-indigo-600',
        amber: 'bg-amber-500 border-amber-500',
        emerald: 'bg-emerald-600 border-emerald-600',
        rose: 'bg-rose-500 border-rose-500',
        slate: 'bg-slate-700 border-slate-700',
        cyan: 'bg-cyan-600 border-cyan-600'
    };
    return (
        <button 
            onClick={onChange}
            className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all border ${checked ? `${activeColors[color]} text-white shadow-sm` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
        >
            <div className={`w-3 h-3 rounded-full border flex items-center justify-center transition-all ${checked ? 'border-white bg-white/20' : 'border-slate-300 bg-slate-50'}`}>
                {checked && <iconify-icon icon="mdi:check" className="text-[7px] font-black" />}
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
        </button>
    );
};

const NumberControl: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string; step?: number }> = ({ label, value, onChange, min = 0, max = 100, unit, step = 1 }) => (
    <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
            <iconify-icon icon="mdi:ruler-square" className="text-slate-300" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => onChange(Math.max(min, parseFloat((value - step).toFixed(2))))} className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-colors"><iconify-icon icon="mdi:minus" width="12"/></button>
            <span className="text-xs font-bold text-slate-700 w-8 text-center tabular-nums">{value}{unit}</span>
            <button onClick={() => onChange(Math.min(max, parseFloat((value + step).toFixed(2))))} className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-colors"><iconify-icon icon="mdi:plus" width="12"/></button>
        </div>
    </div>
);

const QuestionListScreen: React.FC<ResultScreenProps> = ({ topic, onRestart, onSave, onEditBlueprint, questions, brandConfig, initialLayoutConfig }) => {
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>(questions);
  const [editableTopic, setEditableTopic] = useState(topic);
  const [isPaginating, setIsPaginating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  const [saveComplete, setSaveComplete] = useState(false);
  const [isOmrOpen, setIsOmrOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(true);
  
  const [viewMode, setViewMode] = useState<'scroll' | 'grid'>(initialLayoutConfig?.viewMode || 'scroll');
  const [showChoices, setShowChoices] = useState(true);
  const [includeExplanations, setIncludeExplanations] = useState(initialLayoutConfig?.includeExplanations ?? true);
  const [showSourceFigure, setShowSourceFigure] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(initialLayoutConfig?.showDifficulty ?? false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const [showIntroPage, setShowIntroPage] = useState(initialLayoutConfig?.showIntroPage ?? true);
  const [showChapterListOnCover, setShowChapterListOnCover] = useState(initialLayoutConfig?.showChapterListOnCover ?? true);
  const [groupBySubject, setGroupBySubject] = useState(initialLayoutConfig?.groupBySubject ?? true);
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
              figureSizes, viewMode
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

  const handleDeleteQuestion = (id: string) => {
      if (!confirm("Are you sure you want to remove this question from the paper?")) return;
      setCurrentQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleReplaceQuestion = async (q: Question) => {
    if (!q.sourceChapterId) return alert("Source metadata missing for replacement.");
    setIsReplacing(q.id);
    try {
        const currentIds = currentQuestions.map(item => item.originalId || item.id).filter(id => id && id.length === 36);
        let query = supabase.from('question_bank_neet')
            .select('*')
            .eq('chapter_id', q.sourceChapterId)
            .eq('difficulty', q.difficulty);
            
        if (currentIds.length > 0) query = query.not('id', 'in', `(${currentIds.join(',')})`);
        
        const { data, error } = await query.limit(10);
        if (error) throw error;
        
        if (!data || data.length === 0) {
            alert("No more similar questions found in the database for this chapter and difficulty.");
            return;
        }

        const raw = data[Math.floor(Math.random() * data.length)];
        const newQ: Question = {
            id: raw.id, 
            originalId: raw.id, 
            text: raw.question_text, 
            options: raw.options, 
            correctIndex: raw.correct_index, 
            explanation: raw.explanation, 
            difficulty: raw.difficulty, 
            type: raw.question_type || 'mcq', 
            figureDataUrl: raw.figure_url,
            columnA: raw.column_a, 
            columnB: raw.column_b, 
            correctMatches: raw.correct_matches, 
            sourceChapterId: raw.chapter_id,
            sourceChapterName: raw.chapter_name || q.sourceChapterName, 
            sourceSubjectName: raw.subject_name || q.sourceSubjectName, 
            pageNumber: raw.page_number,
            topic_tag: raw.topic_tag
        };
        
        setCurrentQuestions(prev => prev.map(item => item.id === q.id ? newQ : item));
    } catch (e: any) {
        alert("Replacement failed: " + e.message);
    } finally {
        setIsReplacing(null);
    }
  };

  const MM_TO_PX = 3.78; 
  const PAGE_HEIGHT_PX = 297 * MM_TO_PX;
  
  const HEADER_HEIGHT_FIRST = 80;
  const HEADER_HEIGHT_OTHER = 55; 
  const FOOTER_RESERVE_PX = 45; 
  const SAFETY_BUFFER = 15;
  const BLOCK_BUFFER = 6;

  const getColumnHeightLimit = (pIdx: number) => {
      const marginYPx = paperConfig.marginY * MM_TO_PX;
      const availableHeightPx = PAGE_HEIGHT_PX - (2 * marginYPx);
      const isFirstContentPage = showIntroPage ? pIdx === 1 : pIdx === 0;
      const header = isFirstContentPage ? HEADER_HEIGHT_FIRST : HEADER_HEIGHT_OTHER;
      return availableHeightPx - header - FOOTER_RESERVE_PX - SAFETY_BUFFER; 
  };

  useEffect(() => {
    setIsPaginating(true);
    const measureAndPaginate = () => {
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

        const newPages: PageLayout[] = [];
        if (showIntroPage) newPages.push({ leftCol: [], rightCol: [], isCover: true });

        let currentLeft: QuizBlock[] = [];
        let currentRight: QuizBlock[] = [];
        let currentPageIdx = showIntroPage ? 1 : 0;
        let isLeftCol = true;
        let currentHeight = 0;
        
        const heightMap: Record<FigureSize, number> = { small: 80, medium: 120, large: 180 };

        const addBlockToCol = (block: QuizBlock) => {
            const limit = getColumnHeightLimit(currentPageIdx);
            const heightWithGap = block.height + BLOCK_BUFFER;
            const isForced = block.type === 'question-core' && forcedBreaks.has(block.question?.id || '');

            if (currentHeight + heightWithGap > limit || isForced) {
                if (isLeftCol) { 
                    isLeftCol = false; 
                    currentHeight = block.height + BLOCK_BUFFER; 
                    currentRight.push(block); 
                } else { 
                    newPages.push({ leftCol: currentLeft, rightCol: currentRight }); 
                    currentLeft = [block]; 
                    currentRight = []; 
                    currentPageIdx++; 
                    isLeftCol = true; 
                    currentHeight = block.height + BLOCK_BUFFER; 
                }
            } else {
                if (isLeftCol) currentLeft.push(block); else currentRight.push(block);
                currentHeight += block.height + BLOCK_BUFFER;
            }
        };

        const sortedQuestions = groupBySubject ? [...currentQuestions].sort((a,b) => (a.sourceSubjectName||'').localeCompare(b.sourceSubjectName||'')) : currentQuestions;
        let lastSubject = "";

        sortedQuestions.forEach((q: any, qIndex) => {
             if (groupBySubject && q.sourceSubjectName !== lastSubject) {
                 const text = (q.sourceSubjectName || 'GENERAL').toUpperCase();
                 const div = document.createElement('div'); 
                 div.style.width = '100%'; div.style.padding = '2px 0'; div.style.fontSize = '0.9em'; div.style.fontWeight = '900'; div.style.borderTop = '0.5pt solid black'; div.style.borderBottom = '0.5pt solid black'; div.style.textAlign = 'center'; div.style.margin = '4px 0'; div.style.color = 'black';
                 div.innerHTML = `PART: ${text}`;
                 measureContainer.appendChild(div); const h = div.getBoundingClientRect().height; measureContainer.removeChild(div);
                 addBlockToCol({ type: 'subject-header', content: text, height: h });
                 lastSubject = q.sourceSubjectName || '';
             }

             const coreDiv = document.createElement('div'); 
             coreDiv.style.display = 'flex'; coreDiv.style.flexDirection = 'column'; coreDiv.style.marginBottom = '2px'; coreDiv.style.color = 'black';
             const renderedQText = parsePseudoLatexAndMath(q.text);
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

             const colA = q.columnA || q.column_a;
             const colB = q.columnB || q.column_b;

             if (q.type === 'matching' && colA && colB && colA.length > 0) {
                const table = document.createElement('table');
                table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.style.marginTop = '4px'; table.style.fontSize = '0.9em'; table.style.color = 'black'; table.style.border = '0.5pt solid black';
                table.innerHTML = `
                  <thead><tr style="border-bottom: 0.5pt solid black; background-color: #f8fafc;"><th style="text-align: left; width: 50%; padding: 4px; border-right: 0.5pt solid black; color: black;">Column A</th><th style="text-align: left; width: 50%; padding: 4px; color: black;">Column B</th></tr></thead>
                  <tbody>${colA.map((ca: string, i: number) => `<tr style="border-bottom: 0.25pt solid #ddd;"><td style="padding: 4px; border-right: 0.5pt solid black; color: black;">(${String.fromCharCode(65+i)}) ${parsePseudoLatexAndMath(ca)}</td><td style="padding: 4px; color: black;">(${['i','ii','iii','iv','v'][i] || i+1}) ${parsePseudoLatexAndMath(colB[i] || '')}</td></tr>`).join('')}</tbody>
                `;
                coreDiv.appendChild(table);
             }

             if (showChoices) { 
                 const opts = document.createElement('div'); opts.style.marginTop = '4px';
                 opts.innerHTML = q.options.map((o: any, i: number) => `<div style="padding-left: 12px; color: black;">(${i+1}) ${parsePseudoLatexAndMath(o)}</div>`).join(''); 
                 coreDiv.appendChild(opts); 
             }

             measureContainer.appendChild(coreDiv); const coreH = coreDiv.getBoundingClientRect().height; measureContainer.removeChild(coreDiv);
             addBlockToCol({ type: 'question-core', question: q, globalIndex: qIndex, height: coreH });

             if (includeExplanations) {
                 const renderedExp = parsePseudoLatexAndMath(q.explanation);
                 const div = document.createElement('div');
                 
                 div.style.padding = '6px'; 
                 div.style.backgroundColor = '#fcfcfc'; 
                 div.style.border = '0.4pt solid #e5e7eb'; 
                 div.style.marginTop = '2px'; 
                 div.style.marginBottom = '6px';
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
                 measureContainer.appendChild(div); const expH = div.getBoundingClientRect().height; measureContainer.removeChild(div);
                 addBlockToCol({ type: 'explanation-box', question: q, globalIndex: qIndex, content: div.innerHTML, height: expH });
             }
        });

        if (currentLeft.length > 0 || currentRight.length > 0) newPages.push({ leftCol: currentLeft, rightCol: currentRight });
        
        if (showAnswerKey) {
            newPages.push({
                leftCol: [{ type: 'answer-key', content: 'key', height: 0 }],
                rightCol: []
            });
        }
        
        setPages(newPages);
        document.body.removeChild(measureContainer);
        setTimeout(() => setIsPaginating(false), 50);
    };
    const timer = setTimeout(measureAndPaginate, 100);
    return () => clearTimeout(timer);
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
        className="aspect-[1/1.41] w-full bg-slate-50 border border-slate-200 rounded-lg p-1 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-50 transition-all flex flex-col items-center justify-center relative group overflow-hidden"
    >
        {pages[idx]?.isCover ? (
            <iconify-icon icon="mdi:file-certificate" width="18" className="text-slate-300 group-hover:text-indigo-500" />
        ) : (pages[idx]?.leftCol[0]?.type === 'answer-key' ? (
            <iconify-icon icon="mdi:key-variant" width="18" className="text-cyan-400 group-hover:text-cyan-600" />
        ) : (
            <div className="w-full h-full flex flex-col gap-0.5 p-1 opacity-20">
                <div className="flex-1 flex gap-0.5">
                    <div className="w-1/2 bg-slate-400 rounded-sm"></div>
                    <div className="w-1/2 bg-slate-400 rounded-sm"></div>
                </div>
            </div>
        ))}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[14px] font-black text-slate-800 drop-shadow-sm opacity-80 group-hover:opacity-100 group-hover:scale-125 transition-all">{label.replace('P', '')}</span>
        </div>
    </button>
  );

  const BlockRenderer: React.FC<{
      block: QuizBlock; showChoices: boolean; showSourceFigure: boolean; showDifficulty: boolean; onDelete?: (id: string) => void; onReplace?: (q: Question) => void;
  }> = ({ block, showChoices, showSourceFigure, showDifficulty, onDelete, onReplace }) => {
      if (block.type === 'subject-header') return <div className="border-y border-black py-0.25 text-center font-black text-[0.9em] uppercase tracking-widest bg-white mb-3 mt-1 text-black">PART: {block.content}</div>;
      const q = block.question;
      if (!q) return null;
      
      if (block.type === 'explanation-box') {
          return (
              <div 
                  className="p-1.5 px-2 text-black mb-1 leading-tight math-content" 
                  style={{ fontSize: '0.9em', backgroundColor: '#fcfcfc', border: '0.4pt solid #e5e7eb', borderRadius: '2px', color: 'black' }}
                  dangerouslySetInnerHTML={{ __html: block.content || '' }} 
              />
          );
      }

      const colA = q.columnA || q.column_a;
      const colB = q.columnB || q.column_b;
      
      const sizeMap: Record<FigureSize, string> = { small: 'S', medium: 'M', large: 'L' };
      const heightMap: Record<FigureSize, string> = { small: '80px', medium: '120px', large: '180px' };
      const currentSize = figureSizes[q.id] || 'medium';

      return (
          <div className="leading-tight relative group text-black mb-1 break-inside-avoid math-content">
              {/* Question Control Buttons: Positioned top-right to avoid being clipped by page-container overflow */}
              <div className="no-print absolute top-0 right-0 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm pl-2 pb-1 rounded-bl-xl shadow-sm border-l border-b border-slate-100">
                  <button 
                    onClick={() => onDelete && onDelete(q.id)}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-white rounded-lg border border-slate-100 transition-all hover:scale-110 active:scale-95"
                    title="Remove Question"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" width="16" />
                  </button>
                  <button 
                    onClick={() => onReplace && onReplace(q)}
                    disabled={isReplacing === q.id}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 bg-white rounded-lg border border-slate-100 transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                    title="Replace with similar"
                  >
                    {isReplacing === q.id ? (
                        <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    ) : (
                        <iconify-icon icon="mdi:refresh" width="16" />
                    )}
                  </button>
              </div>
  
              <div className="flex gap-1.5 items-start">
                  <b className="shrink-0 text-black">{block.globalIndex! + 1}.</b>
                  <div className="flex-1 text-black">
                      <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(q.text || '') }} />
                      {showDifficulty && <span className="ml-1 px-1 py-0.25 rounded text-[0.6em] font-black uppercase border border-black align-middle inline-block leading-none text-black">{q.difficulty}</span>}
                  </div>
              </div>
              {q.figureDataUrl && (
                  <div className="ml-5 my-1.5 p-1 border border-black/20 rounded inline-block bg-white shadow-sm relative group/figure">
                      <img src={q.figureDataUrl} className="object-contain mix-blend-multiply" style={{ maxHeight: heightMap[currentSize] }} alt="Figure Asset" />
                      <div className="no-print absolute -top-3 right-0 bg-black/60 text-white rounded-full px-1 py-0.5 opacity-0 group-hover/figure:opacity-100 transition-opacity flex items-center gap-0.5 shadow-lg">
                          <button onClick={() => adjustFigureSize(q.id, 'decrease')} className="w-5 h-5 flex items-center justify-center hover:bg-white/20 rounded-full font-bold text-lg leading-none pb-1 disabled:opacity-30" disabled={currentSize === 'small'}>-</button>
                          <span className="text-[9px] font-mono w-5 text-center">{sizeMap[currentSize]}</span>
                          <button onClick={() => adjustFigureSize(q.id, 'increase')} className="w-5 h-5 flex items-center justify-center hover:bg-white/20 rounded-full font-bold text-lg leading-none pb-0.5 disabled:opacity-30" disabled={currentSize === 'large'}>+</button>
                      </div>
                  </div>
              )}
              {showSourceFigure && q.sourceFigureDataUrl && (
                  <div className="ml-5 my-1.5 p-1 border border-indigo-50/30 rounded inline-block bg-indigo-50/10 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 bg-indigo-600 text-white text-[5pt] font-black px-1.5 py-0.5 rounded-br-md uppercase tracking-widest z-10">Reference Source</div>
                      <img src={q.sourceFigureDataUrl} className="max-h-[80px] object-contain mix-blend-multiply opacity-80" alt="Source Asset" />
                  </div>
              )}
              {q.type === 'matching' && colA && colB && colA.length > 0 && (
                  <div className="ml-5 my-2 border border-black overflow-hidden rounded-sm">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em', color: 'black' }}>
                          <thead>
                              <tr style={{ borderBottom: '0.5pt solid black', backgroundColor: '#f8fafc' }}>
                                  <th style={{ textAlign: 'left', width: '50%', padding: '4px', borderRight: '0.5pt solid black', color: 'black' }}>Column A</th>
                                  <th style={{ textAlign: 'left', width: '50%', padding: '4px', color: 'black' }}>Column B</th>
                              </tr>
                          </thead>
                          <tbody>
                              {colA.map((ca: string, i: number) => (
                                  <tr key={i} style={{ borderBottom: '0.25pt solid #eee' }}>
                                      <td style={{ padding: '4px', borderRight: '0.5pt solid black', color: 'black' }}>({String.fromCharCode(65 + i)}) <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(ca) }} /></td>
                                      <td style={{ padding: '4px', color: 'black' }}>({['i', 'ii', 'iii', 'iv', 'v'][i] || i + 1}) <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(colB[i] || '') }} /></td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
              {showChoices && q.options && (
                  <div className="ml-5 mt-1 space-y-0 font-medium text-black">
                      {q.options.map((o: string, i: number) => (
                          <div key={i} className="flex gap-1.5 items-start leading-tight">
                              <span className="shrink-0 text-black">({i + 1})</span>
                              <span dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(o) }} />
                          </div>
                      ))}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans" style={{ colorScheme: 'light' }}>
       {/* Inject dynamic styles for Math sizing consistency */}
       <style>{`
         .math-content .katex { font-size: 1em !important; }
         .math-content .katex .base { margin-top: 2px; margin-bottom: 2px; }
         .math-content .katex-display { margin: 0.2em 0 !important; }
       `}</style>

       {/* ... Header and other components remain unchanged ... */}
       <header className="no-print bg-white border-b border-slate-200 z-30 shadow-sm shrink-0">
          <div className="px-6 py-3 flex justify-between items-center">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 group cursor-pointer" onClick={onRestart}>
                    <iconify-icon icon="mdi:flask" width="24" className="group-hover:rotate-12 transition-transform" />
                </div>
                <div>
                    <input type="text" value={editableTopic} onChange={(e) => setEditableTopic(e.target.value)} className="text-lg font-black text-slate-800 tracking-tight leading-tight bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none px-1 rounded transition-all" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{currentQuestions.length} Items Validated</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => onEditBlueprint && onEditBlueprint(currentQuestions)} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-slate-400 hover:text-indigo-600 bg-slate-50 border border-slate-100">
                <iconify-icon icon="mdi:playlist-edit" /> Edit
              </button>

              <div className="flex items-center gap-2">
                <button onClick={() => setIsOmrOpen(true)} className="bg-rose-50 text-rose-600 border border-rose-100 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md flex items-center gap-2 hover:bg-rose-100 transition-all">
                    <iconify-icon icon="mdi:camera-metering-spot" width="18" /> Evaluate
                </button>
                <button onClick={handleSaveToCloud} disabled={isSaving || saveComplete} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 ${saveComplete ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                    {isSaving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <iconify-icon icon="mdi:cloud-upload" />}
                    {saveComplete ? "Saved" : "Sync Hub"}
                </button>
                <button onClick={() => window.print()} disabled={isPaginating} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50">
                    <iconify-icon icon="mdi:printer" width="18" /> Print
                </button>
                
                <div className="w-px h-6 bg-slate-200 mx-2"></div>
                
                <button onClick={() => setIsControlsOpen(!isControlsOpen)} className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isControlsOpen ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-100 text-slate-400 hover:text-indigo-600 border-slate-200'}`} title="Toggle Layout Controls">
                    <iconify-icon icon="mdi:tune-variant" width="20" />
                </button>
                <button onClick={onRestart} className="w-10 h-10 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center border border-slate-200 transition-colors"><iconify-icon icon="mdi:close" width="20" /></button>
              </div>
            </div>
          </div>
       </header>

       <div className="flex-1 flex overflow-hidden">
            <aside className="no-print w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 animate-fade-in">
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                    
                    <div className="mb-6 bg-slate-900 rounded-2xl p-4 shadow-lg border border-slate-800">
                        <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Paper Matrix</h3>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="bg-white/5 rounded-lg p-1.5 flex flex-col items-center">
                                <span className="text-[7px] font-black text-emerald-400 uppercase">Easy</span>
                                <span className="text-sm font-black text-white">{globalStats.Easy}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-1.5 flex flex-col items-center">
                                <span className="text-[7px] font-black text-amber-400 uppercase">Med</span>
                                <span className="text-sm font-black text-white">{globalStats.Medium}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-1.5 flex flex-col items-center">
                                <span className="text-[7px] font-black text-rose-400 uppercase">Hard</span>
                                <span className="text-sm font-black text-white">{globalStats.Hard}</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                            <span className="text-[7px] font-black text-slate-400 uppercase">MCQ: {globalStats.mcq}</span>
                            <span className="text-[7px] font-black text-slate-400 uppercase">ASR: {globalStats.reasoning}</span>
                            <span className="text-[7px] font-black text-slate-400 uppercase">MT: {globalStats.matching}</span>
                            <span className="text-[7px] font-black text-slate-400 uppercase">ST: {globalStats.statements}</span>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><iconify-icon icon="mdi:chart-box-outline" /> Breakdown</h3>
                        <div className="space-y-1.5">
                            {subjectBreakdown.map(([sub, count]) => (
                                <div key={sub} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-all">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                                        <span className="text-[8px] font-black text-slate-500 uppercase truncate">{sub}</span>
                                    </div>
                                    <span className="text-xl font-black text-indigo-600">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><iconify-icon icon="mdi:layers-triple-outline" /> Navigator</h3>
                    
                    <div className="space-y-6">
                        {showIntroPage && pages.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">PREFACE</span>
                                    <div className="h-px bg-slate-100 flex-1"></div>
                                </div>
                                <div className="w-1/3">
                                    <PageThumbnail idx={0} label="P1" />
                                </div>
                            </div>
                        )}

                        {Object.entries(subjectToPages).map(([sub, pageIndices]) => (
                            <div key={sub}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[7px] font-black text-indigo-400 uppercase tracking-widest truncate">{sub}</span>
                                    <div className="h-px bg-slate-100 flex-1"></div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {pageIndices.map(pIdx => (
                                        <PageThumbnail key={pIdx} idx={pIdx} label={`P${pIdx + 1}`} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto bg-slate-200/50 p-8 custom-scrollbar">
                <div id="printable-paper-area" className={`${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6' : 'max-w-[210mm] mx-auto space-y-12'} pb-40 print:space-y-0 print:pb-0`}>
                    {pages.map((p, idx) => {
                        const isAnswerKeyPage = p.leftCol.length > 0 && p.leftCol[0].type === 'answer-key';
                        return (
                            <div 
                                key={idx} 
                                ref={el => { pageRefs.current[idx] = el; }}
                                onClick={() => viewMode === 'grid' && setViewMode('scroll')}
                                className={`printable-quiz-page mx-auto bg-white shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 text-black box-border transition-all ${viewMode === 'grid' ? 'cursor-zoom-in hover:scale-[1.03] hover:ring-4 hover:ring-indigo-50/20 w-full aspect-[210/297] h-auto' : 'w-[210mm] h-[297mm]'}`} 
                                style={{ 
                                    fontFamily: paperConfig.fontFamily, 
                                    colorScheme: 'light', 
                                    backgroundColor: '#ffffff', 
                                    color: '#000000',
                                }}
                            >
                                <div className={`${viewMode === 'grid' ? 'origin-top-left' : ''} flex flex-col h-full`} style={viewMode === 'grid' ? { transform: `scale(calc(100 / ${210 * MM_TO_PX} * (100 / 100)))`, width: `${210}mm`, height: `${297}mm` } : {}}>
                                <div 
                                  className="flex-1 flex flex-col"
                                  style={{
                                    padding: p.isCover ? `1.5mm` : `${paperConfig.marginY}mm ${paperConfig.marginX}mm`,
                                    fontSize: `${paperConfig.fontSize}pt`,
                                    lineHeight: `${paperConfig.lineHeight}`
                                  }}
                                >
                                {isAnswerKeyPage ? (
                                    <AnswerKeyPage questions={currentQuestions} brandConfig={brandConfig} topic={editableTopic} />
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
                                        <div className="w-full h-[0.5pt] bg-black mb-3 shrink-0"></div>
                                        
                                        <div className="flex-1 relative flex" style={{ gap: `${paperConfig.gap}mm` }}>
                                            <div className="absolute left-1/2 top-0 bottom-0 w-[0.5pt] bg-black -translate-x-1/2 z-0"></div>
                                            
                                            <div className="flex-1 overflow-hidden space-y-2 relative z-10 pr-1">
                                                {p.leftCol.map((b, bi) => <BlockRenderer key={bi} block={b} showChoices={showChoices} showSourceFigure={showSourceFigure} showDifficulty={showDifficulty} onDelete={handleDeleteQuestion} onReplace={handleReplaceQuestion} />)}
                                            </div>
                                            <div className="flex-1 overflow-hidden space-y-2 relative z-10 pl-1">
                                                {p.rightCol.map((b, bi) => <BlockRenderer key={bi} block={b} showChoices={showChoices} showSourceFigure={showSourceFigure} showDifficulty={showDifficulty} onDelete={handleDeleteQuestion} onReplace={handleReplaceQuestion} />)}
                                            </div>
                                        </div>

                                        <div className="w-full h-[0.5pt] bg-black mt-3 shrink-0"></div>
                                    </div>
                                )}
                                </div>
                                <div className="mt-auto pt-1 pb-2 px-6 flex justify-between items-center text-[6pt] font-black text-black/40 uppercase tracking-[0.15em] shrink-0">
                                    <div className="flex flex-col items-start gap-0.5">
                                        <div className="w-full h-[0.5pt] bg-black/10 mb-1"></div>
                                        <span>{editableTopic}</span>
                                    </div>
                                    <span className="font-serif italic text-black font-normal normal-case pt-1">integrated assessment engine</span>
                                    <div className="flex flex-col items-end gap-0.5">
                                        <div className="w-full h-[0.5pt] bg-black/10 mb-1"></div>
                                        <span>Page {idx + 1} / {pages.length}</span>
                                    </div>
                                </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </main>

            {isControlsOpen && (
                <aside className="no-print w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 animate-fade-in">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Layout Controls</h3>
                        <p className="text-[10px] font-bold text-slate-400">Paper & Content Settings</p>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                        <div>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">View Mode</h4>
                            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                                <button 
                                    onClick={() => setViewMode('scroll')}
                                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${viewMode === 'scroll' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                                >
                                    <iconify-icon icon="mdi:view-day-outline" /> Scroll
                                </button>
                                <button 
                                    onClick={() => setViewMode('grid')}
                                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                                >
                                    <iconify-icon icon="mdi:view-grid-outline" /> Grid
                                </button>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Content Options</h4>
                            <div className="flex flex-wrap gap-2">
                                <Toggle label="Cover" checked={showIntroPage} onChange={() => setShowIntroPage(!showIntroPage)} color="indigo" />
                                <Toggle label="Logic" checked={includeExplanations} onChange={() => setIncludeExplanations(!includeExplanations)} color="amber" />
                                <Toggle label="Source" checked={showSourceFigure} onChange={() => setShowSourceFigure(!showSourceFigure)} color="cyan" />
                                <Toggle label="Answer Key" checked={showAnswerKey} onChange={() => setShowAnswerKey(!showAnswerKey)} color="cyan" />
                                <Toggle label="Topics" checked={showTopics} onChange={() => setShowTopics(!showTopics)} color="emerald" />
                                <Toggle label="Chapters" checked={showChapters} onChange={() => setShowChapters(!showChapters)} color="slate" />
                                <Toggle label="Difficulty" checked={showDifficulty} onChange={() => setShowDifficulty(!showDifficulty)} color="rose" />
                                <Toggle label="Choices" checked={showChoices} onChange={() => setShowChoices(!showChoices)} color="rose" />
                                <Toggle label="Sections" checked={groupBySubject} onChange={() => setGroupBySubject(!groupBySubject)} color="slate" />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Paper Formatting</h4>
                            <div className="space-y-3">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider ml-1">Font Face</label>
                                    <select value={paperConfig.fontFamily} onChange={e => setPaperConfig({...paperConfig, fontFamily: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none shadow-sm w-full">
                                        <option value="'Times New Roman', Times, serif">Times New Roman (Serif)</option>
                                        <option value="Georgia, serif">Georgia (Serif)</option>
                                        <option value="Helvetica, Arial, sans-serif">Helvetica (Sans-Serif)</option>
                                        <option value="'Lato', sans-serif">Lato (Sans-Serif)</option>
                                    </select>
                                </div>
                                <NumberControl label="Font Size" value={paperConfig.fontSize} onChange={v => setPaperConfig({...paperConfig, fontSize: v})} min={8} max={14} unit="pt" />
                                <NumberControl label="Line Spacing" value={paperConfig.lineHeight} onChange={v => setPaperConfig({...paperConfig, lineHeight: v})} min={1} max={2.5} step={0.05} />
                                <NumberControl label="Margin (H)" value={paperConfig.marginX} onChange={v => setPaperConfig({...paperConfig, marginX: v})} min={5} max={30} unit="mm" />
                                <NumberControl label="Margin (V)" value={paperConfig.marginY} onChange={v => setPaperConfig({...paperConfig, marginY: v})} min={5} max={30} unit="mm" />
                                <NumberControl label="Column Gap" value={paperConfig.gap} onChange={v => setPaperConfig({...paperConfig, gap: v})} min={2} max={20} unit="mm" />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Utilities</h4>
                            <button onClick={handleDownloadKeys} disabled={isPaginating || isSaving} className="w-full bg-cyan-50 text-cyan-700 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-cyan-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSaving ? <div className="w-4 h-4 border-2 border-cyan-200 border-t-cyan-600 rounded-full animate-spin"></div> : <iconify-icon icon="mdi:key-download-outline" width="16" />}
                                Download Answer Key
                            </button>
                        </div>
                    </div>
                </aside>
            )}
       </div>

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
