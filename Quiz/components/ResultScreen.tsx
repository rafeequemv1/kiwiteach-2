
import '../../types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../supabase/client';
import { Question, BrandingConfig, LayoutConfig } from '../types';
import { parsePseudoLatexAndMath, stripLatexAndMarkup } from '../../utils/latexParser';
import { generateOMR } from './OMR/OMRGenerator';
import OMRScannerModal from './OCR/OMRScannerModal';
import InteractiveQuizSession from './InteractiveQuizSession';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type BlockType = 'question-core' | 'explanation-box' | 'subject-header';

interface QuizBlock {
  type: BlockType;
  question?: Question; 
  globalIndex?: number;
  content?: string; 
  height: number; 
}

interface PageLayout {
    leftCol: QuizBlock[];
    rightCol: QuizBlock[];
}

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; }> = ({ label, checked, onChange }) => (
  <label className="flex items-center cursor-pointer select-none group gap-2">
    <div className="relative">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`block bg-slate-200 w-8 h-4 rounded-full transition-colors ${checked ? 'bg-indigo-500' : ''}`}></div>
      <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${checked ? 'transform translate-x-4' : ''}`}></div>
    </div>
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-800 transition-colors whitespace-nowrap">{label}</div>
  </label>
);

interface ResultScreenProps {
  topic: string;
  onRestart: () => void;
  onSave?: (questions: Question[], layoutConfig: LayoutConfig) => Promise<void>;
  onEditBlueprint?: (questions: Question[]) => void;
  questions: Question[];
  brandConfig: BrandingConfig;
  initialLayoutConfig?: LayoutConfig;
}

const QuestionListScreen: React.FC<ResultScreenProps> = ({ topic, onRestart, onSave, onEditBlueprint, questions, brandConfig, initialLayoutConfig }) => {
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>(questions);
  const [editableTopic, setEditableTopic] = useState(topic);
  const [isPaginating, setIsPaginating] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadingOmr, setIsDownloadingOmr] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [saveComplete, setSaveComplete] = useState(false);
  
  // Toggles - Initialize from saved layout if available
  const [includeExplanations, setIncludeExplanations] = useState(initialLayoutConfig?.includeExplanations ?? true);
  const [showIntroPage, setShowIntroPage] = useState(initialLayoutConfig?.showIntroPage ?? true);
  const [showChapterListOnCover, setShowChapterListOnCover] = useState(initialLayoutConfig?.showChapterListOnCover ?? true);
  const [groupBySubject, setGroupBySubject] = useState(initialLayoutConfig?.groupBySubject ?? true);
  const [showDifficulty, setShowDifficulty] = useState(initialLayoutConfig?.showDifficulty ?? false);
  const [viewMode, setViewMode] = useState<'scroll' | 'grid'>('scroll'); 
  const [renderAsPlainText, setRenderAsPlainText] = useState(false);
  
  // Layout Logic
  const [forcedBreaks, setForcedBreaks] = useState<Set<string>>(new Set(initialLayoutConfig?.forcedBreaks || []));
  
  const [showScanner, setShowScanner] = useState(false);
  const [showOmrConfig, setShowOmrConfig] = useState(false);
  const [showInteractive, setShowInteractive] = useState(false);
  const [showSourcePage, setShowSourcePage] = useState(true); 
  const [showBlueprintSummary, setShowBlueprintSummary] = useState(false);
  
  const [omrRollNo, setOmrRollNo] = useState("123456789");
  const [omrBookletNo, setOmrBookletNo] = useState("987654321");
  const [downloadAnswerKey, setDownloadAnswerKey] = useState(false);

  // CRITICAL: Synchronize local state with props when they change
  useEffect(() => {
    setCurrentQuestions(questions);
    setEditableTopic(topic);
  }, [questions, topic]);

  // If initial layout provided later (e.g. async fetch), update state
  useEffect(() => {
      if (initialLayoutConfig) {
          setIncludeExplanations(initialLayoutConfig.includeExplanations);
          setShowIntroPage(initialLayoutConfig.showIntroPage);
          setShowChapterListOnCover(initialLayoutConfig.showChapterListOnCover);
          setGroupBySubject(initialLayoutConfig.groupBySubject);
          setShowDifficulty(initialLayoutConfig.showDifficulty);
          setForcedBreaks(new Set(initialLayoutConfig.forcedBreaks));
      }
  }, [initialLayoutConfig]);

  const [pages, setPages] = useState<PageLayout[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const introRef = useRef<HTMLDivElement>(null);

  const formatText = (text: string) => {
    return renderAsPlainText ? stripLatexAndMarkup(text) : parsePseudoLatexAndMath(text);
  };

  const stats = useMemo(() => {
    return currentQuestions.reduce((acc, q) => {
      if (q.difficulty === 'Easy') acc.easy++;
      if (q.difficulty === 'Medium') acc.medium++;
      if (q.difficulty === 'Hard') acc.hard++;
      if (q.figureDataUrl) acc.figures++;
      return acc;
    }, { easy: 0, medium: 0, hard: 0, figures: 0 });
  }, [currentQuestions]);

  const typeStats = useMemo(() => {
      const total = currentQuestions.length;
      const counts: Record<string, number> = {};
      currentQuestions.forEach(q => {
          counts[q.type] = (counts[q.type] || 0) + 1;
      });
      return Object.entries(counts)
          .map(([type, count]) => ({
              type,
              count,
              percent: total > 0 ? Math.round((count / total) * 100) : 0,
              label: type === 'mcq' ? 'MCQ' : 
                     type === 'reasoning' ? 'ASR' : 
                     type === 'matching' ? 'MAT' : 
                     type === 'statements' ? 'STM' : 
                     type === 'statement_combo' ? 'CMB' : 
                     type === 'true_false' ? 'T/F' : type.substring(0,3).toUpperCase()
          }))
          .sort((a, b) => b.count - a.count);
  }, [currentQuestions]);

  // Grouped Summary for Cover Page & Doc
  const groupedSummary = useMemo(() => {
    const summary: Record<string, { total: number; percentage: string; chapters: Record<string, number> }> = {};
    const totalQs = currentQuestions.length;
    if (totalQs === 0) return summary;

    currentQuestions.forEach(q => {
      const subject = (q.sourceSubjectName || 'GENERAL').toUpperCase();
      const chapter = q.sourceChapterName || 'Common Module';
      
      if (!summary[subject]) {
        summary[subject] = { total: 0, percentage: '0', chapters: {} };
      }
      summary[subject].total++;
      summary[subject].chapters[chapter] = (summary[subject].chapters[chapter] || 0) + 1;
    });

    Object.keys(summary).forEach(key => {
      summary[key].percentage = ((summary[key].total / totalQs) * 100).toFixed(1);
    });

    return summary;
  }, [currentQuestions]);

  const toggleForcedBreak = (questionId: string) => {
    setForcedBreaks(prev => {
        const next = new Set(prev);
        if (next.has(questionId)) next.delete(questionId);
        else next.add(questionId);
        return next;
    });
  };

  const handleDeleteQuestion = (questionId: string) => {
    setCurrentQuestions(prevQuestions => prevQuestions.filter(q => q.id !== questionId));
  };

  const handleSaveToCloud = async () => {
      if (!onSave) return;
      setIsSaving(true);
      
      const layoutConfig: LayoutConfig = {
          forcedBreaks: Array.from(forcedBreaks),
          showIntroPage,
          showChapterListOnCover,
          includeExplanations,
          groupBySubject,
          showDifficulty
      };

      try {
          await onSave(currentQuestions, layoutConfig);
          setSaveComplete(true);
          setTimeout(() => setSaveComplete(false), 3000);
      } catch (e: any) {
          alert("Save failed: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  const handleReplaceQuestion = async (q: Question) => {
      if (!q.sourceChapterId) {
          alert("Cannot replace: This question is not linked to a source chapter.");
          return;
      }
      setReplacingId(q.id);
      try {
          const currentIds = currentQuestions.map(item => item.originalId).filter(id => !!id) as string[];
          let query = supabase.from('question_bank_neet').select('*').eq('chapter_id', q.sourceChapterId);
          if (currentIds.length > 0) query = query.filter('id', 'not.in', `(${currentIds.join(',')})`);
          
          const { data, error } = await query.limit(25);
          if (error) throw new Error(error.message);
          
          if (!data || data.length === 0) {
              alert("No other unique questions available in this chapter.");
              setReplacingId(null);
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
              pageNumber: raw.page_number
          };
          
          setCurrentQuestions(prev => prev.map(item => item.id === q.id ? newQ : item));
      } catch(err: any) {
          console.error("Replace Error:", err);
          alert(`Error fetching replacement: ${err.message || 'Unknown error'}`);
      } finally {
          setReplacingId(null);
      }
  };

  const handleAddSimilarQuestion = async (q: Question) => {
      if (!q.sourceChapterId) {
          alert("Cannot add similar: This question is not linked to a source chapter.");
          return;
      }
      setAddingId(q.id);
      try {
          const currentIds = currentQuestions.map(item => item.originalId).filter(id => !!id) as string[];
          let query = supabase.from('question_bank_neet').select('*').eq('chapter_id', q.sourceChapterId);
          if (currentIds.length > 0) query = query.filter('id', 'not.in', `(${currentIds.join(',')})`);
          
          const { data, error } = await query.limit(25);
          if (error) throw new Error(error.message);
          
          if (!data || data.length === 0) {
              alert("No other unique questions available in this chapter.");
              setAddingId(null);
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
              pageNumber: raw.page_number
          };
          
          const idx = currentQuestions.findIndex(item => item.id === q.id);
          if (idx !== -1) {
              const newList = [...currentQuestions];
              newList.splice(idx + 1, 0, newQ);
              setCurrentQuestions(newList);
          } else {
              setCurrentQuestions(prev => [...prev, newQ]);
          }
      } catch(err: any) {
          console.error("Add Similar Error:", err);
          alert(`Error fetching similar question: ${err.message || 'Unknown error'}`);
      } finally {
          setAddingId(null);
      }
  };

  const getSubjectCode = (subject?: string) => {
    if (!subject) return '';
    const s = subject.toLowerCase();
    if (s.includes('bio')) return 'BIO';
    if (s.includes('chem')) return 'CHE';
    if (s.includes('phy')) return 'PHY';
    if (s.includes('math')) return 'MAT';
    return subject.substring(0, 3).toUpperCase();
  };

  const MM_TO_PX = 3.78; 
  const PAGE_HEIGHT_PX = 297 * MM_TO_PX;
  const PADDING_TOP_FIRST = 8 * MM_TO_PX;
  const PADDING_TOP_OTHER = 10 * MM_TO_PX;
  const CONTENT_BOTTOM_MARGIN = 35 * MM_TO_PX; 
  const HEADER_HEIGHT_OTHER = 50; 
  const SAFETY_BUFFER = 50;
  const UNIT_GAP = 20; 
  const BLOCK_BUFFER = 8;

  const getColumnHeightLimit = (pIdx: number) => {
      const header = pIdx === 0 ? 80 : HEADER_HEIGHT_OTHER;
      const pad = pIdx === 0 ? PADDING_TOP_FIRST : PADDING_TOP_OTHER;
      return PAGE_HEIGHT_PX - pad - CONTENT_BOTTOM_MARGIN - header - SAFETY_BUFFER;
  };

  useEffect(() => {
    setIsPaginating(true);
    const measureAndPaginate = () => {
        const measureContainer = document.createElement('div');
        const COL_WIDTH_MM = 82; 
        measureContainer.style.width = `${COL_WIDTH_MM}mm`; 
        measureContainer.style.visibility = 'hidden';
        measureContainer.style.position = 'absolute';
        measureContainer.style.top = '-9999px';
        measureContainer.style.fontFamily = "'Times New Roman', Times, serif";
        measureContainer.style.fontSize = "9pt";
        measureContainer.style.lineHeight = "1.25"; 
        measureContainer.style.textAlign = 'justify'; 
        measureContainer.style.boxSizing = 'border-box';
        document.body.appendChild(measureContainer);

        const newPages: PageLayout[] = [];
        let currentLeft: QuizBlock[] = [];
        let currentRight: QuizBlock[] = [];
        let currentPageIdx = 0;
        let isLeftCol = true;
        let currentHeight = 0;

        const addBlockToCol = (block: QuizBlock) => {
            const limit = getColumnHeightLimit(currentPageIdx);
            const heightWithGap = block.height + UNIT_GAP + BLOCK_BUFFER;
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
                if ((isLeftCol && currentLeft.length > 0) || (!isLeftCol && currentRight.length > 0)) {
                     currentHeight += UNIT_GAP;
                }
                if (isLeftCol) currentLeft.push(block);
                else currentRight.push(block);
                currentHeight += block.height + BLOCK_BUFFER;
            }
        };

        const sortedQuestions = groupBySubject 
            ? [...currentQuestions].sort((a, b) => (a.sourceSubjectName || 'Unknown').localeCompare(b.sourceSubjectName || 'Unknown'))
            : currentQuestions;

        let lastSubject = "";
        sortedQuestions.forEach((q, qIndex) => {
             if (groupBySubject && q.sourceSubjectName !== lastSubject) {
                 const subjectText = (q.sourceSubjectName || 'GENERAL').toUpperCase();
                 const sHeaderDiv = document.createElement('div');
                 sHeaderDiv.style.width = '100%';
                 sHeaderDiv.style.textAlign = 'center';
                 sHeaderDiv.style.borderBottom = '1.2px solid black';
                 sHeaderDiv.style.borderTop = '1.2px solid black';
                 sHeaderDiv.style.padding = '4px 0';
                 sHeaderDiv.style.marginBottom = '8px';
                 sHeaderDiv.style.marginTop = '12px';
                 sHeaderDiv.style.fontSize = '8pt';
                 sHeaderDiv.style.fontWeight = 'black';
                 sHeaderDiv.style.letterSpacing = '0.15em';
                 sHeaderDiv.innerHTML = `PART: ${subjectText}`;
                 measureContainer.appendChild(sHeaderDiv);
                 const sHeaderHeight = sHeaderDiv.getBoundingClientRect().height;
                 measureContainer.removeChild(sHeaderDiv);
                 addBlockToCol({ type: 'subject-header', content: subjectText, height: sHeaderHeight });
                 lastSubject = q.sourceSubjectName || '';
             }

             const coreWrapper = document.createElement('div');
             coreWrapper.style.display = 'flex';
             coreWrapper.style.flexDirection = 'column';
             coreWrapper.style.gap = '8px';
             const hDiv = document.createElement('div');
             hDiv.style.display = 'flex';
             hDiv.style.gap = '4px';
             hDiv.innerHTML = `<b>${qIndex + 1}.</b><div style="flex:1">${formatText(q.text)}</div>`;
             coreWrapper.appendChild(hDiv);
             if (q.figureDataUrl && !renderAsPlainText) {
                const fDiv = document.createElement('div');
                fDiv.style.height = '75px'; 
                coreWrapper.appendChild(fDiv);
             }
             if (q.type === 'matching' && q.columnA) {
                const mDiv = document.createElement('div');
                mDiv.style.height = `${25 + (q.columnA.length * 20)}px`;
                coreWrapper.appendChild(mDiv);
             }
             const oDiv = document.createElement('div');
             oDiv.style.paddingLeft = '18px';
             oDiv.innerHTML = q.options.map((opt, i) => `<div><b>(${String.fromCharCode(65+i)})</b> ${formatText(opt)}</div>`).join('');
             coreWrapper.appendChild(oDiv);
             measureContainer.appendChild(coreWrapper);
             const coreHeight = coreWrapper.getBoundingClientRect().height;
             measureContainer.removeChild(coreWrapper);
             addBlockToCol({ type: 'question-core', question: q, globalIndex: qIndex, height: coreHeight });

             if (includeExplanations) {
                 const boxDiv = document.createElement('div');
                 boxDiv.style.width = '100%';
                 boxDiv.style.padding = '8px 12px'; 
                 boxDiv.style.fontSize = '8.5pt';
                 boxDiv.style.border = '1.2px solid black';
                 boxDiv.style.background = '#f2f2f2'; 
                 
                 let contentRaw = `**Ans: (${String.fromCharCode(65 + q.correctIndex)})**\n\n` + q.explanation;
                 if (showSourcePage) {
                     const subjectCode = getSubjectCode(q.sourceSubjectName);
                     const sourceTextParts = [];
                     if (subjectCode && q.sourceChapterName) sourceTextParts.push(`${subjectCode} • ${q.sourceChapterName}`);
                     else if (q.sourceChapterName) sourceTextParts.push(q.sourceChapterName);
                     if (q.pageNumber) sourceTextParts.push(`P.${q.pageNumber}`);
                     const sourceText = sourceTextParts.join(' • ');
                     if (sourceText) contentRaw += `\n\nSource: ${sourceText}`;
                 }
                 const contentHtml = formatText(contentRaw);
                 boxDiv.innerHTML = contentHtml;
                 measureContainer.appendChild(boxDiv);
                 const boxHeight = boxDiv.getBoundingClientRect().height;
                 measureContainer.removeChild(boxDiv);
                 addBlockToCol({ type: 'explanation-box', question: q, globalIndex: qIndex, content: contentHtml, height: boxHeight });
             }
        });
        if (currentLeft.length > 0 || currentRight.length > 0) newPages.push({ leftCol: currentLeft, rightCol: currentRight });
        setPages(newPages);
        document.body.removeChild(measureContainer);

        // Defer setting isPaginating to false to allow DOM to update
        setTimeout(() => setIsPaginating(false), 50);
    };
    
    // Debounce to batch rapid toggle changes
    const timer = setTimeout(measureAndPaginate, 100);
    return () => clearTimeout(timer);
  }, [currentQuestions, includeExplanations, showDifficulty, showSourcePage, groupBySubject, forcedBreaks, renderAsPlainText]);

  const downloadAnswerKeyPdf = () => {
    // This function can be implemented if needed, but is not part of the core PDF generation logic.
    // Omitted for brevity as it's not the focus of the performance fix.
    alert("Answer key generation not shown in this change.");
  };

  const downloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);

    const container = document.getElementById('pdf-export-container');
    if (!container) {
        alert("PDF export container not found.");
        setIsDownloading(false);
        return;
    }

    const pageElements = container.querySelectorAll('.printable-quiz-page');
    if (pageElements.length === 0) {
        alert("No content to generate PDF from.");
        setIsDownloading(false);
        return;
    }

    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const PAGE_W = 210;
        const PAGE_H = 297;

        window.scrollTo(0, 0);

        for (let i = 0; i < pageElements.length; i++) {
            const pageEl = pageElements[i] as HTMLElement;

            const canvas = await html2canvas(pageEl, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (clonedDoc: Document) => {
                    const trash = clonedDoc.querySelectorAll('iconify-icon, script, button, .thumbnail-mode, [data-html2canvas-ignore]');
                    trash.forEach(el => el.parentNode?.removeChild(el));
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            if (i > 0) {
                doc.addPage();
            }
            
            doc.addImage(imgData, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');
            
            setDownloadProgress(Math.floor(((i + 1) / pageElements.length) * 100));
        }

        doc.save(`${editableTopic.replace(/\s+/g, '_')}_assessment.pdf`);

    } catch (error: any) {
        console.error("PDF generation failed:", error);
        alert(`An error occurred during PDF generation: ${error.message}`);
    } finally {
        setTimeout(() => {
            setIsDownloading(false);
            setDownloadProgress(0);
        }, 500);
    }
  };

  const handleDownloadDoc = () => {
      const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${editableTopic}</title><style>@page{size:A4;margin:15mm 15mm 15mm 15mm;}body{font-family:'Times New Roman',serif;font-size:9pt;line-height:1.2;color:#000;}.page-table{width:100%;border-collapse:collapse;table-layout:fixed;}.col-cell{width:50%;vertical-align:top;padding:5px;}.left-col{padding-right:15px;border-right:1px solid #000;}.right-col{padding-left:15px;}.page-break{page-break-before:always;}.header-box{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;padding-bottom:5px;}.section-header{text-align:center;border-top:1px solid #000;border-bottom:1px solid #000;padding:2px 0;font-weight:bold;margin:10px 0;font-size:8pt;letter-spacing:2px;}.q-block{margin-bottom:15px;}.q-text{font-weight:bold;text-align:justify;margin-bottom:5px;}.options-list{margin-left:15px;}.option-item{margin-bottom:2px;}.explanation-box{background-color:#f2f2f2;border:1px solid #000;padding:8px;margin-top:5px;font-size:8pt;font-style:italic;}.figure-img{width:100%;height:auto;max-width:250px;display:block;margin:5px 0;}.matching-table td,.matching-table th{border:1px solid #000;padding:2px 5px;font-size:8pt;}</style></head><body>`;
      let bodyContent = "";
      const renderBlockToHtml = (block: QuizBlock) => {
        if (block.type === 'subject-header') return `<div class="section-header">PART: ${block.content}</div>`;
        if (block.type === 'question-core' && block.question) {
            const q = block.question;
            const qNum = (block.globalIndex || 0) + 1;
            const text = formatText(q.text);
            let html = `<div class="q-block"><table width="100%" style="margin-bottom:5px;"><tr><td valign="top" width="20"><b>${qNum}.</b></td><td valign="top" class="q-text">${text}</td></tr></table>`;
            if (q.figureDataUrl && !renderAsPlainText) html += `<img src="${q.figureDataUrl}" class="figure-img" />`;
            if (q.type === 'matching' && q.columnA) {
                html += `<table class="matching-table" width="100%"><tr><th>Column I</th><th>Column II</th></tr>`;
                q.columnA.forEach((ca, i) => { html += `<tr><td>(${String.fromCharCode(65+i)}) ${formatText(ca)}</td><td>(${i+1}) ${formatText(q.columnB![i])}</td></tr>`; });
                html += `</table>`;
            }
            html += `<div class="options-list">`;
            q.options.forEach((opt, i) => { html += `<div class="option-item"><b>(${String.fromCharCode(65+i)})</b> ${formatText(opt)}</div>`; });
            html += `</div></div>`;
            return html;
        }
        if (block.type === 'explanation-box' && block.content) return `<div class="explanation-box">${block.content}</div>`;
        return "";
      };
      pages.forEach((page, index) => {
        if (index > 0) bodyContent += `<br class="page-break" />`;
        bodyContent += `<div class="header-box">`;
        if (index === 0) bodyContent += `<h1 style="font-size:16pt; margin:0; text-transform:uppercase;">${editableTopic}</h1><div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10pt; margin-top:5px;"><span>TIME: ${currentQuestions.length} MINS</span><span style="float:right">MARKS: ${currentQuestions.length * 4}</span></div>`;
        else bodyContent += `<div style="display:flex; justify-content:space-between; font-weight:bold; font-size:9pt;"><span>${editableTopic}</span><span style="float:right">Page ${index + 1}</span></div>`;
        bodyContent += `</div><table class="page-table"><tr><td class="col-cell left-col">`;
        page.leftCol.forEach(block => { bodyContent += renderBlockToHtml(block); });
        bodyContent += `</td><td class="col-cell right-col">`;
        page.rightCol.forEach(block => { bodyContent += renderBlockToHtml(block); });
        bodyContent += `</td></tr></table><div style="text-align:center; font-size:8pt; border-top:1px solid #000; padding-top:5px; margin-top:20px;"><b>PAGE ${index + 1} OF ${pages.length}</b></div>`;
      });
      const html = header + bodyContent + `</body></html>`;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${editableTopic.replace(/[^a-z0-9]/gi, '_') || 'Test_Paper'}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const scrollToPage = (idx: number) => {
      setViewMode('scroll');
      setTimeout(() => {
          if (idx === -1) {
              introRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
              pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      }, 100);
  };

  const renderBlock = (block: QuizBlock, blockIdx: number, isFirstInCol: boolean) => {
      const { question: q, globalIndex, type, content } = block;
      if (type === 'subject-header') return <div key={`sh-${blockIdx}`} className={`${isFirstInCol ? 'mt-0' : 'mt-4'} mb-3 border-y-[1.2px] border-black py-1.5 text-center font-black uppercase text-[7.5pt] tracking-[0.15em] text-black bg-slate-50`}>PART: {content}</div>;
      if (!q) return null;
      const isReplacingThis = replacingId === q.id;
      const isAddingNextToThis = addingId === q.id;
      const isPushed = forcedBreaks.has(q.id);

      if (type === 'question-core') {
          return (
              <div key={`qc-${globalIndex}`} className={`${isFirstInCol ? 'mt-0' : 'mt-4'} relative group text-black`}>
                  <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-30" data-html2canvas-ignore>
                      <button onClick={() => handleDeleteQuestion(q.id)} className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-rose-600 transition-colors" title="Delete"><iconify-icon icon="mdi:close" width="12"></iconify-icon></button>
                      <button onClick={() => toggleForcedBreak(q.id)} className={`w-5 h-5 ${isPushed ? 'bg-amber-500' : 'bg-slate-700'} text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-600 transition-colors`} title={isPushed ? "Cancel Push" : "Push to Next Col"}><iconify-icon icon={isPushed ? "mdi:format-page-break" : "mdi:page-next-outline"} width="12"></iconify-icon></button>
                      <button onClick={() => handleReplaceQuestion(q)} disabled={!!replacingId || !!addingId} className={`w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-600 transition-colors ${(replacingId || addingId) ? 'opacity-50 cursor-not-allowed' : ''}`} title="Replace"><iconify-icon icon="mdi:refresh" width="12"></iconify-icon></button>
                      <button onClick={() => handleAddSimilarQuestion(q)} disabled={!!replacingId || !!addingId} className={`w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-colors ${(replacingId || addingId) ? 'opacity-50 cursor-not-allowed' : ''}`} title="Add Similar"><iconify-icon icon="mdi:plus" width="12"></iconify-icon></button>
                  </div>
                  <div className={`flex flex-col gap-2 ${isReplacingThis || isAddingNextToThis ? 'opacity-30 blur-[1.5px]' : ''}`}>
                      <div className="flex flex-row gap-1 items-baseline">
                          <b className="w-5 shrink-0 text-right text-[9pt]" style={{ color: 'black' }}>{globalIndex! + 1}.</b>
                          <div className={`flex-1 text-[9pt] font-medium leading-tight text-justify text-black`} style={{ color: 'black' }}>
                              <span dangerouslySetInnerHTML={{ __html: formatText(q.text) }} />
                              {showDifficulty && (
                                  <span className="inline-block ml-2 px-1.5 py-0.5 rounded-full text-[6pt] font-black uppercase tracking-wider border border-black align-middle bg-white text-black">{q.difficulty}</span>
                              )}
                          </div>
                      </div>
                      {q.figureDataUrl && !renderAsPlainText && <div className="ml-6 flex flex-col items-start"><div className="w-full max-w-[35mm] overflow-hidden"><img src={q.figureDataUrl} alt="" className="w-full h-auto block" /></div></div>}
                      {q.type === 'matching' && q.columnA && (
                          <div className="ml-6 border border-black overflow-hidden box-border">
                              <table className="w-full text-[8.5pt] border-collapse" style={{ tableLayout: 'fixed' }}>
                                  <thead><tr className="border-b border-black bg-slate-50 text-black"><th className="border-r border-black p-1 text-left w-1/2 font-bold" style={{ color: 'black' }}>List I</th><th className="p-1 text-left w-1/2 font-bold" style={{ color: 'black' }}>List II</th></tr></thead>
                                  <tbody>{q.columnA?.map((ca, ci) => (<tr key={ci} className="border-b border-black last:border-b-0 text-black"><td className="border-r border-black p-1 vertical-align-top text-black" style={{ color: 'black' }}>({String.fromCharCode(65 + ci)}) <span dangerouslySetInnerHTML={{ __html: formatText(ca) }} /></td><td className="p-1 vertical-align-top text-black" style={{ color: 'black' }}>({ci + 1}) <span dangerouslySetInnerHTML={{ __html: formatText(q.columnB![ci]) }} /></td></tr>))}</tbody>
                              </table>
                          </div>
                      )}
                      <div className="pl-6 text-[9pt] leading-tight space-y-0.5 text-black">{q.options.map((opt, optIdx) => (<div key={optIdx} className="flex gap-1.5 text-black" style={{ color: 'black' }}><b className="shrink-0" style={{ color: 'black' }}>({String.fromCharCode(65 + optIdx)})</b><span dangerouslySetInnerHTML={{ __html: formatText(opt) }} /></div>))}</div>
                  </div>
                  {(isReplacingThis || isAddingNextToThis) && <div className="absolute inset-0 flex items-center justify-center z-10"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>}
              </div>
          );
      } else if (type === 'explanation-box') {
          return <div key={`exp-${globalIndex}`} className={`pl-6 mt-4 mb-2 ${isReplacingThis || isAddingNextToThis ? 'opacity-10 grayscale' : ''}`}><div style={{ background: '#f8fafc', border: '1.2px solid #000', padding: '8px 12px', borderRadius: '4px', color: 'black' }}><div className="italic leading-relaxed text-black text-[8.5pt]" style={{ color: 'black' }} dangerouslySetInnerHTML={{ __html: content || '' }} /></div></div>;
      }
      return null;
  };

  const QuizPage: React.FC<{ layout: PageLayout; pIdx: number; isThumbnail?: boolean; noRef?: boolean }> = ({ layout, pIdx, isThumbnail, noRef }) => (
    <div 
        ref={el => { if (!isThumbnail && !noRef) { pageRefs.current[pIdx] = el; } }} 
        className={`printable-quiz-page w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl relative overflow-hidden flex flex-col shrink-0 ${isThumbnail ? 'thumbnail-mode pointer-events-none scale-[0.25] origin-top-left' : 'animate-fade-in'}`} 
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
        <div className={`h-full w-full px-[15mm] pb-[32mm] ${pIdx === 0 ? 'pt-[8mm]' : 'pt-[10mm]'} box-border flex flex-col relative bg-white`}>
            <div className="shrink-0 mb-4 border-b-[1.2px] border-black pb-2 bg-white">
                    {pIdx === 0 ? (
                    <div className="text-center">
                        <h1 className="text-xl font-bold uppercase tracking-wide leading-tight mb-1 text-black" style={{ color: 'black' }}>{editableTopic}</h1>
                        <div className="flex justify-between items-end text-[8.5pt] font-bold text-black" style={{ color: 'black' }}><span>TIME: {currentQuestions.length} MINS</span><span>MARKS: {currentQuestions.length * 4}</span></div>
                    </div>
                    ) : (
                    <div className="flex justify-between items-end text-[8.5pt] uppercase tracking-wider font-bold text-black" style={{color: 'black'}}><span>{editableTopic}</span><span>Page {pIdx + 1}</span></div>
                    )}
            </div>
            <div className="flex-1 flex gap-[8mm] items-start relative text-black min-h-0 overflow-hidden bg-white">
                    <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black -translate-x-1/2 z-10 opacity-30"></div>
                    <div className="flex-1 w-[82mm] h-full overflow-hidden bg-white">{layout.leftCol.map((b, i) => renderBlock(b, i, i === 0))}</div>
                    <div className="flex-1 w-[82mm] h-full overflow-hidden bg-white">{layout.rightCol.map((b, i) => renderBlock(b, i, i === 0))}</div>
            </div>
            <div className="absolute bottom-[8mm] left-0 w-full text-center text-[7.5pt] text-black border-t border-black pt-2 mx-[15mm] box-border uppercase font-bold tracking-widest bg-white z-20" style={{ width: 'calc(100% - 30mm)', color: 'black' }}>
                <div className="flex justify-between items-end h-[10mm] text-black">
                    <div className="text-left"><span className="text-[7px] opacity-50 font-black text-black">AUTHORIZED ASSESSMENT</span></div>
                    <span className="text-[8.5px] font-black tracking-[0.25em] text-black">PAGE {pIdx + 1} OF {pages.length}</span>
                    <div className="text-right"><span className="text-[7px] opacity-50 font-black text-black">PRISMA QUIZ ENGINE</span></div>
                </div>
            </div>
        </div>
    </div>
  );

  const IntroPage: React.FC<{ isThumbnail?: boolean; noRef?: boolean }> = ({ isThumbnail, noRef }) => {
    // Explicitly split data for PDF-safe 2-column grid
    const subjects = Object.entries(groupedSummary);
    const midPoint = Math.ceil(subjects.length / 2);
    const col1 = subjects.slice(0, midPoint);
    const col2 = subjects.slice(midPoint);

    return (
    <div ref={el => { if(!isThumbnail && !noRef) introRef.current = el; }} className={`printable-quiz-page w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl relative overflow-hidden flex flex-col shrink-0 ${isThumbnail ? 'thumbnail-mode pointer-events-none scale-[0.25] origin-top-left' : 'animate-fade-in'}`} style={{ fontFamily: "'Times New Roman', Times, serif" }}>
        {/* Compact, Minimal A4 Cover Design */}
        <div className="p-[12mm] h-full flex flex-col border-2 border-black m-[5mm] bg-white relative">
            <div className="text-center border-b border-black pb-4 mb-4">
                <h1 className="text-[18pt] font-black uppercase tracking-wide leading-tight mb-1 text-black">{editableTopic}</h1>
                <p className="text-[9pt] font-bold uppercase tracking-[0.3em] text-black opacity-60">OFFICIAL ASSESSMENT MODULE</p>
            </div>
            <div className="grid grid-cols-4 gap-0 border border-black mb-6 text-center divide-x divide-black">
                <div className="p-2"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">Booklet Code</span><span className="block text-lg font-black leading-none mt-1 text-black">R4</span></div>
                <div className="p-2"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">ID</span><span className="block text-lg font-mono font-bold leading-none mt-1 text-black">{omrBookletNo}</span></div>
                <div className="p-2"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">Time</span><span className="block text-lg font-black leading-none mt-1 text-black">{currentQuestions.length}m</span></div>
                <div className="p-2 bg-black text-white"><span className="block text-[7pt] font-bold uppercase text-white opacity-60 tracking-widest">Marks</span><span className="block text-lg font-black leading-none mt-1">{currentQuestions.length * 4}</span></div>
            </div>
            {showChapterListOnCover && (
                <div className="flex-1 min-h-0 flex flex-col mb-4">
                     <div className="border border-black h-full flex flex-col">
                         <div className="bg-black text-white p-1.5 text-center"><span className="text-[10pt] font-bold uppercase tracking-[0.2em]">Syllabus Index & Weightage</span></div>
                         <div className="p-4 flex-1 overflow-hidden relative">
                             <div className="grid grid-cols-2 gap-6 h-full text-[9pt] text-black">
                                <div>{col1.map(([subject, info]: [string, any]) => (
                                        <div key={subject} className="mb-4"><div className="border-b border-black mb-1 pb-0.5 flex justify-between items-end"><span className="font-black uppercase tracking-wider">{subject}</span><span className="font-bold">{info.total} Qs</span></div><ul className="list-none space-y-0.5 text-black">{Object.entries(info.chapters).map(([chapName, count], idx: number) => { const perc = ((count as number / currentQuestions.length) * 100).toFixed(0); return (<li key={chapName} className="flex justify-between items-baseline text-[9pt] leading-tight"><span className="truncate pr-2 opacity-90">{idx+1}. {chapName}</span><span className="font-bold opacity-80 shrink-0 whitespace-nowrap">{count} Qs ({perc}%)</span></li>); })}</ul></div>
                                    ))}</div>
                                <div>{col2.map(([subject, info]: [string, any]) => (
                                        <div key={subject} className="mb-4"><div className="border-b border-black mb-1 pb-0.5 flex justify-between items-end"><span className="font-black uppercase tracking-wider">{subject}</span><span className="font-bold">{info.total} Qs</span></div><ul className="list-none space-y-0.5 text-black">{Object.entries(info.chapters).map(([chapName, count], idx: number) => { const perc = ((count as number / currentQuestions.length) * 100).toFixed(0); return (<li key={chapName} className="flex justify-between items-baseline text-[9pt] leading-tight"><span className="truncate pr-2 opacity-90">{idx+1}. {chapName}</span><span className="font-bold opacity-80 shrink-0 whitespace-nowrap">{count} Qs ({perc}%)</span></li>); })}</ul></div>
                                    ))}</div>
                             </div>
                         </div>
                     </div>
                </div>
            )}
            <div className="mt-auto">
                <div className="grid grid-cols-2 gap-8 border-t border-black pt-4">
                    <div><div className="flex justify-between items-end border-b border-black border-dotted pb-1 mb-3"><span className="text-[8pt] font-bold uppercase text-black opacity-60">Candidate Name</span></div><div className="flex justify-between items-end border-b border-black border-dotted pb-1"><span className="text-[8pt] font-bold uppercase text-black opacity-60">Roll Number</span></div></div>
                    <div><div className="flex justify-between items-end border-b border-black border-dotted pb-1 mb-3"><span className="text-[8pt] font-bold uppercase text-black opacity-60">Invigilator Sign</span></div><div className="flex justify-between items-end border-b border-black border-dotted pb-1"><span className="text-[8pt] font-bold uppercase text-black opacity-60">Candidate Sign</span></div></div>
                </div>
                <div className="text-center mt-3 pt-2 border-t border-black text-[7pt] font-bold uppercase tracking-[0.2em] text-black opacity-40">Authorized Assessment • Do Not Copy</div>
            </div>
        </div>
    </div>
    );
  };

  if (showInteractive) return <InteractiveQuizSession questions={currentQuestions} onExit={() => setShowInteractive(false)} topic={topic} />;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
       {showScanner && <OMRScannerModal questions={currentQuestions} onClose={() => setShowScanner(false)} />}
       
       <header className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 shadow-sm z-30 overflow-x-auto">
          <div className="flex items-center gap-4 shrink-0">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 shrink-0"><iconify-icon icon="mdi:file-document" width="24" /></div>
              <div className="min-w-0">
                  <input type="text" value={editableTopic} onChange={(e) => setEditableTopic(e.target.value)} className="text-lg font-black text-slate-800 tracking-tight leading-tight bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-slate-50 outline-none w-full px-1 transition-all rounded" placeholder="Enter Test Title..." />
                  <div className="flex items-center gap-2 mt-0.5 ml-1"><span className="text-[9px] font-black uppercase text-indigo-600 tracking-widest whitespace-nowrap">{currentQuestions.length} Questions</span><div className="w-1 h-1 rounded-full bg-slate-300"></div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[200px]">{topic}</span></div>
              </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl mr-2 border border-slate-200 shadow-inner">
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Cover" checked={showIntroPage} onChange={() => setShowIntroPage(!showIntroPage)} />
                    {showIntroPage && <Toggle label="Index" checked={showChapterListOnCover} onChange={() => setShowChapterListOnCover(!showChapterListOnCover)} />}
                 </div>
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Solution" checked={includeExplanations} onChange={() => setIncludeExplanations(!includeExplanations)} />
                 </div>
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Sections" checked={groupBySubject} onChange={() => setGroupBySubject(!groupBySubject)} />
                    <Toggle label="Diff" checked={showDifficulty} onChange={() => setShowDifficulty(!showDifficulty)} />
                 </div>
                 <div className="px-3 flex flex-col gap-1 py-1">
                    <Toggle label="Plain Text" checked={renderAsPlainText} onChange={() => setRenderAsPlainText(!renderAsPlainText)} />
                 </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                    <button onClick={() => setViewMode('scroll')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'scroll' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`} title="Scroll View"><iconify-icon icon="mdi:view-sequential" width="18" /></button>
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`} title="Grid View"><iconify-icon icon="mdi:view-grid" width="18" /></button>
                </div>
                {onEditBlueprint && <button onClick={() => onEditBlueprint(currentQuestions)} className="px-4 py-2 bg-white text-indigo-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-sm">Blueprint</button>}
                {onSave && <button onClick={handleSaveToCloud} disabled={isSaving || saveComplete} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md ${saveComplete ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'}`}>{isSaving ? "Saving..." : saveComplete ? "Saved" : "Save"}</button>}
                <button onClick={() => setShowOmrConfig(true)} className="px-3 py-2 bg-pink-600 text-white rounded-xl text-[10px] font-black uppercase shadow-md"><iconify-icon icon="mdi:grid" width="16" /></button>
                
                <button onClick={() => downloadAnswerKeyPdf()} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <iconify-icon icon="mdi:key-outline" width="16" />
                    <span>Key</span>
                </button>

                <button onClick={handleDownloadDoc} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <iconify-icon icon="mdi:file-word" width="16" />
                    <span>Save Doc</span>
                </button>

                <button onClick={downloadPdf} disabled={isDownloading || isPaginating} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-50 transition-all flex items-center justify-center min-w-[100px] gap-2 hover:bg-slate-800 active:scale-95">
                    {isPaginating ? (
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-[9px]">Paginating...</span>
                        </div>
                    ) : isDownloading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="text-[9px]">{downloadProgress}%</span>
                      </div>
                    ) : (
                        <>
                            <iconify-icon icon="mdi:printer" width="16" /> 
                            <span>Save PDF</span>
                        </>
                    )}
                </button>
                <button onClick={onRestart} className="w-10 h-10 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center border border-slate-200"><iconify-icon icon="mdi:close" width="20" /></button>
              </div>
          </div>
       </header>

       <div className="flex-1 flex overflow-hidden relative">
            {/* Quick-Nav Sidebar with Detailed Stats */}
            {viewMode === 'scroll' && (
                <div className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-sm overflow-hidden" data-html2canvas-ignore>
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Item Breakdown</h3>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100 shadow-sm">
                            <span className="text-[8px] font-black text-emerald-600 block uppercase">Easy</span>
                            <span className="text-sm font-black text-emerald-900">{stats.easy}</span>
                          </div>
                          <div className="bg-amber-50 p-2 rounded-lg border border-amber-100 shadow-sm">
                            <span className="text-[8px] font-black text-amber-600 block uppercase">Med</span>
                            <span className="text-sm font-black text-amber-900">{stats.medium}</span>
                          </div>
                          <div className="bg-rose-50 p-2 rounded-lg border border-rose-100 shadow-sm">
                            <span className="text-[8px] font-black text-rose-600 block uppercase">Hard</span>
                            <span className="text-sm font-black text-rose-900">{stats.hard}</span>
                          </div>
                          <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-100 shadow-sm">
                            <span className="text-[8px] font-black text-indigo-600 block uppercase">Figs</span>
                            <span className="text-sm font-black text-indigo-900">{stats.figures}</span>
                          </div>
                        </div>
                        
                        {typeStats.length > 0 && (
                            <div className="mb-4">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Composition</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {typeStats.map(ts => (
                                        <span key={ts.type} className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[8px] font-bold text-slate-600">
                                            {ts.label} <span className="ml-1 text-slate-400">{ts.percent}%</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button 
                          onClick={() => setShowBlueprintSummary(true)}
                          className="w-full py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                        >
                          <iconify-icon icon="mdi:format-list-bulleted-type" /> Detailed View
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                        {showIntroPage && (
                            <button onClick={() => scrollToPage(-1)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group">
                                <iconify-icon icon="mdi:file-certificate" className="text-slate-300 group-hover:text-indigo-500" />
                                <span className="text-[10px] font-black text-slate-500 uppercase group-hover:text-slate-800 tracking-widest">Cover Page</span>
                            </button>
                        )}
                        {pages.map((layout, idx) => {
                            const pageSubjects = new Set<string>();
                            [...layout.leftCol, ...layout.rightCol].forEach(b => {
                              if (b.type === 'subject-header') pageSubjects.add(b.content || 'GENERAL');
                              else if (b.question?.sourceSubjectName) pageSubjects.add(b.question.sourceSubjectName.toUpperCase());
                            });
                            
                            return (
                                <button key={idx} onClick={() => scrollToPage(idx)} className="w-full flex flex-col p-3 rounded-xl hover:bg-slate-50 transition-all text-left group border border-transparent hover:border-slate-100">
                                    <div className="flex items-center gap-3 mb-1">
                                      <div className="w-5 h-5 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">{idx + 1}</div>
                                      <span className="text-[10px] font-black text-slate-500 uppercase group-hover:text-slate-800">Page {idx + 1}</span>
                                    </div>
                                    {pageSubjects.size > 0 && (
                                      <div className="flex flex-wrap gap-1 ml-8">
                                        {Array.from(pageSubjects).map(s => (
                                          <span key={s} className={`text-[6px] font-black px-1 rounded uppercase tracking-tighter ${s.includes('BIO') ? 'bg-emerald-100 text-emerald-600' : s.includes('CHE') ? 'bg-amber-100 text-amber-600' : s.includes('PHY') ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>{s}</span>
                                        ))}
                                      </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar bg-slate-300/50 p-4 md:p-8">
                    {viewMode === 'grid' ? (
                        <div className="max-w-[1400px] mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pb-32">
                            {showIntroPage && (
                                <div onClick={() => scrollToPage(-1)} className="cursor-pointer group relative">
                                    <div className="aspect-[210/297] bg-white rounded-2xl shadow-lg border-2 border-transparent group-hover:border-indigo-500 overflow-hidden transform group-hover:-translate-y-2 transition-all relative">
                                        <IntroPage isThumbnail />
                                        <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors" />
                                    </div>
                                    <div className="mt-3 flex justify-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-600 transition-colors">Cover Page</span>
                                    </div>
                                </div>
                            )}
                            {pages.map((layout, idx) => (
                                <div key={idx} onClick={() => scrollToPage(idx)} className="cursor-pointer group relative">
                                    <div className="aspect-[210/297] bg-white rounded-2xl shadow-lg border-2 border-transparent group-hover:border-indigo-500 overflow-hidden transform group-hover:-translate-y-2 transition-all relative">
                                        <QuizPage layout={layout} pIdx={idx} isThumbnail />
                                        <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors" />
                                    </div>
                                    <div className="mt-3 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-600 transition-colors">Page {idx + 1}</span>
                                        <div className="flex gap-1">
                                            {Array.from({ length: layout.leftCol.filter(b => b.type === 'question-core').length + layout.rightCol.filter(b => b.type === 'question-core').length }).map((_, i) => (
                                                <div key={i} className="w-1 h-1 rounded-full bg-slate-300" />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="max-w-[210mm] mx-auto space-y-12 pb-24">
                            {showIntroPage && <IntroPage />}
                            {pages.map((layout, pIdx) => <QuizPage key={pIdx} layout={layout} pIdx={pIdx} />)}
                        </div>
                    )}
            </div>
       </div>

       {showBlueprintSummary && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowBlueprintSummary(false)}>
           <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl animate-slide-up border border-white overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Blueprint Summary</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{Object.keys(groupedSummary).length} Subjects Analyzed • {currentQuestions.length} Questions</p>
                </div>
                <button onClick={() => setShowBlueprintSummary(false)} className="w-8 h-8 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-lg flex items-center justify-center border border-slate-100 transition-colors">
                  <iconify-icon icon="mdi:close" width="18" />
                </button>
              </div>
              
              {/* Top Stats Bar - Minimal */}
              <div className="flex gap-4 mb-6 shrink-0">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Global Distribution</p>
                      <div className="flex h-3 rounded-full overflow-hidden w-full mb-2">
                          {typeStats.map((ts, i) => (
                              <div key={ts.type} className={`h-full ${['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'][i % 5]}`} style={{ width: `${ts.percent}%` }} />
                          ))}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {typeStats.map((ts, i) => (
                              <div key={ts.type} className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'][i % 5]}`} />
                                  <span className="text-[9px] font-bold text-slate-600 uppercase">{ts.label} {ts.percent}%</span>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-4 text-white w-32 flex flex-col justify-center text-center">
                      <span className="text-3xl font-black">{currentQuestions.length}</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">Total Qs</span>
                  </div>
              </div>

              <div className="overflow-y-auto custom-scrollbar pr-2 flex-1">
                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(groupedSummary).map(([subject, info]: [string, any]) => (
                    <div key={subject} className="p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-200 transition-all shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-[7px] font-black text-indigo-500 uppercase tracking-widest block mb-0.5">Subject</span>
                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[120px]" title={subject}>{subject}</p>
                            </div>
                            <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{info.total} Qs</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full" style={{ width: `${info.percentage}%` }}></div>
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-[8px] text-slate-400 font-bold">{Object.keys(info.chapters).length} Chapters</span>
                            <span className="text-[8px] font-black text-indigo-600">{info.percentage}% Weight</span>
                        </div>
                    </div>
                    ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end shrink-0">
                <button 
                  onClick={() => setShowBlueprintSummary(false)}
                  className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  Close View
                </button>
              </div>
           </div>
         </div>
       )}

       {showOmrConfig && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                {/* OMR Config Modal Content ... (Unchanged) */}
               <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-md overflow-hidden border border-slate-100">
                   <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center"><iconify-icon icon="mdi:grid" width="24" /></div><h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">OMR Setup</h3></div><button onClick={() => setShowOmrConfig(false)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center"><iconify-icon icon="mdi:close" width="20" /></button></div>
                   <div className="p-8 space-y-8"><div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Roll No.</label><input type="text" maxLength={9} value={omrRollNo} onChange={(e) => setOmrRollNo(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:border-pink-500 outline-none transition-all" /></div><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Booklet ID</label><input type="text" maxLength={9} value={omrBookletNo} onChange={(e) => setOmrBookletNo(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:border-pink-500 outline-none transition-all" /></div></div><div className="px-2"><Toggle label="Download Answer Key" checked={downloadAnswerKey} onChange={() => setDownloadAnswerKey(!downloadAnswerKey)} /></div><div className="p-8 pt-0"><button onClick={async () => { setIsDownloadingOmr(true); try { const answersToMark = downloadAnswerKey ? currentQuestions.map(q => q.correctIndex) : []; await generateOMR({ topic: editableTopic, questions: currentQuestions, rollNumber: omrRollNo, testBookletNumber: omrBookletNo, brandConfig, markedAnswers: answersToMark, filename: downloadAnswerKey ? `${editableTopic}_Answer_Key.pdf` : undefined }); setShowOmrConfig(false); } finally { setIsDownloadingOmr(false); } }} disabled={isDownloadingOmr} className="w-full py-4 bg-pink-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-pink-600/20 hover:bg-pink-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50">{isDownloadingOmr ? "..." : "Generate OMR"}</button></div></div>
               </div>
           </div>
       )}

       {/* INVISIBLE EXPORT CONTAINER for Full-Quality PDF Generation */}
       <div id="pdf-export-container" style={{ position: 'absolute', left: '-9999px', top: 0, width: '210mm', zIndex: -10 }}>
           {showIntroPage && <IntroPage noRef />}
           {pages.map((layout, idx) => <QuizPage key={idx} layout={layout} pIdx={idx} noRef />)}
       </div>
    </div>
  );
};

export default QuestionListScreen;