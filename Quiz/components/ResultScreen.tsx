import '../../types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../supabase/client';
import { Question, BrandingConfig, LayoutConfig } from '../types';
import { parsePseudoLatexAndMath, stripLatexAndMarkup } from '../../utils/latexParser';
import { generateOMR } from './OMR/OMRGenerator';
import OMRScannerModal from './OCR/OMRScannerModal';
import InteractiveQuizSession from './InteractiveQuizSession';

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

interface School {
  id: string;
  name: string;
  color?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_id: string;
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
  const [isDownloadingOmr, setIsDownloadingOmr] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  
  // Toggles
  const [includeExplanations, setIncludeExplanations] = useState(initialLayoutConfig?.includeExplanations ?? true);
  const [showIntroPage, setShowIntroPage] = useState(initialLayoutConfig?.showIntroPage ?? true);
  const [showChapterListOnCover, setShowChapterListOnCover] = useState(initialLayoutConfig?.showChapterListOnCover ?? true);
  const [groupBySubject, setGroupBySubject] = useState(initialLayoutConfig?.groupBySubject ?? true);
  const [showDifficulty, setShowDifficulty] = useState(initialLayoutConfig?.showDifficulty ?? false);
  const [renderAsPlainText, setRenderAsPlainText] = useState(false);
  
  const [forcedBreaks, setForcedBreaks] = useState<Set<string>>(new Set(initialLayoutConfig?.forcedBreaks || []));
  const [showScanner, setShowScanner] = useState(false);
  const [downloadAnswerKey, setDownloadAnswerKey] = useState(false);
  const [inspectedPrompts, setInspectedPrompts] = useState<Set<string>>(new Set());

  // School/Class Selection State
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('default');
  const [selectedClassId, setSelectedClassId] = useState<string>('default');

  useEffect(() => {
    const localSchools = localStorage.getItem('kt_schools');
    const localClasses = localStorage.getItem('kt_classes');
    if (localSchools) setSchools(JSON.parse(localSchools));
    if (localClasses) setClasses(JSON.parse(localClasses));
  }, []);

  const selectedSchool = useMemo(() => schools.find(s => s.id === selectedSchoolId), [schools, selectedSchoolId]);
  const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);

  useEffect(() => {
    setCurrentQuestions(questions);
    setEditableTopic(topic);
  }, [questions, topic]);

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

  const toggleForcedBreak = (questionId: string) => {
    setForcedBreaks(prev => {
        const next = new Set(prev);
        if (next.has(questionId)) next.delete(questionId);
        else next.add(questionId);
        return next;
    });
  };

  const togglePromptInspection = (questionId: string) => {
      setInspectedPrompts(prev => {
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
      } catch (e: any) { alert("Save failed: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDownloadOMR = async () => {
      setIsDownloadingOmr(true);
      try {
          await generateOMR({
              topic: editableTopic,
              questions: currentQuestions,
              markedAnswers: downloadAnswerKey ? currentQuestions.map(q => q.correctIndex) : [],
              brandConfig
          });
      } catch (err) {
          alert("OMR Generation failed");
      } finally {
          setIsDownloadingOmr(false);
      }
  };

  const MM_TO_PX = 3.78; 
  const PAGE_HEIGHT_PX = 297 * MM_TO_PX;
  const CONTENT_BOTTOM_MARGIN = 35 * MM_TO_PX; 
  const HEADER_HEIGHT_OTHER = 50; 
  const SAFETY_BUFFER = 50;
  const UNIT_GAP = 20; 
  const BLOCK_BUFFER = 8;

  const getColumnHeightLimit = (pIdx: number) => {
      const header = pIdx === 0 ? 80 : HEADER_HEIGHT_OTHER;
      const pad = pIdx === 0 ? 8 * MM_TO_PX : 10 * MM_TO_PX;
      return PAGE_HEIGHT_PX - pad - CONTENT_BOTTOM_MARGIN - header - SAFETY_BUFFER;
  };

  useEffect(() => {
    setIsPaginating(true);
    const measureAndPaginate = () => {
        const measureContainer = document.createElement('div');
        measureContainer.style.width = `82mm`; 
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
                if ((isLeftCol && currentLeft.length > 0) || (!isLeftCol && currentRight.length > 0)) currentHeight += UNIT_GAP;
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
                 sHeaderDiv.style.padding = '4px 0';
                 sHeaderDiv.style.fontSize = '8pt';
                 sHeaderDiv.style.fontWeight = 'black';
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
             const hDiv = document.createElement('div');
             hDiv.innerHTML = `<b>${qIndex + 1}.</b> ${formatText(q.text)}`;
             coreWrapper.appendChild(hDiv);
             if (q.figureDataUrl && !renderAsPlainText) {
                const fDiv = document.createElement('div');
                fDiv.style.height = '75px'; 
                coreWrapper.appendChild(fDiv);
             }
             const oDiv = document.createElement('div');
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
                 const contentHtml = formatText(`**Ans: (${String.fromCharCode(65 + q.correctIndex)})**\n\n` + q.explanation);
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
        setTimeout(() => setIsPaginating(false), 50);
    };
    const timer = setTimeout(measureAndPaginate, 100);
    return () => clearTimeout(timer);
  }, [currentQuestions, includeExplanations, showDifficulty, groupBySubject, forcedBreaks, renderAsPlainText]);

  const renderBlock = (block: QuizBlock, blockIdx: number, isFirstInCol: boolean) => {
      const { question: q, globalIndex, type, content } = block;
      if (type === 'subject-header') return <div key={`sh-${blockIdx}`} className={`${isFirstInCol ? 'mt-0' : 'mt-4'} mb-3 border-y-[1.2px] border-black py-1.5 text-center font-black uppercase text-[7.5pt] tracking-[0.15em] text-black bg-slate-50`}>PART: {content}</div>;
      if (!q) return null;
      const isPushed = forcedBreaks.has(q.id);
      const isPromptInspected = inspectedPrompts.has(q.id);

      if (type === 'question-core') {
          return (
              <div key={`qc-${globalIndex}`} className={`${isFirstInCol ? 'mt-0' : 'mt-4'} relative group text-black`}>
                  <div className="absolute top-0 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-30 no-print">
                      <button onClick={() => handleDeleteQuestion(q.id)} className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-rose-600 transition-colors" title="Delete"><iconify-icon icon="mdi:close" width="12"></iconify-icon></button>
                      <button onClick={() => toggleForcedBreak(q.id)} className={`w-5 h-5 ${isPushed ? 'bg-amber-50' : 'bg-slate-700'} text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-600 transition-colors`} title={isPushed ? "Cancel Push" : "Push to Next Col"}><iconify-icon icon={isPushed ? "mdi:format-page-break" : "mdi:page-next-outline"} width="12"></iconify-icon></button>
                      {q.figureDataUrl && q.figurePrompt && (
                          <button onClick={() => togglePromptInspection(q.id)} className={`w-5 h-5 ${isPromptInspected ? 'bg-indigo-600' : 'bg-slate-700'} text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-500 transition-colors`} title="Show AI Prompt"><iconify-icon icon="mdi:robot-outline" width="12"></iconify-icon></button>
                      )}
                  </div>
                  <div className="flex flex-col gap-2">
                      <div className="flex flex-row gap-1 items-baseline">
                          <b className="w-5 shrink-0 text-right text-[9pt]">{globalIndex! + 1}.</b>
                          <div className="flex-1 text-[9pt] font-medium leading-tight text-justify text-black">
                              <span dangerouslySetInnerHTML={{ __html: formatText(q.text) }} />
                              {showDifficulty && (
                                  <span className="inline-block ml-2 px-1.5 py-0.5 rounded-full text-[6pt] font-black uppercase tracking-wider border border-black align-middle bg-white text-black">{q.difficulty}</span>
                              )}
                          </div>
                      </div>
                      {q.figureDataUrl && !renderAsPlainText && (
                          <div className="ml-6 flex flex-col items-start gap-1 relative">
                              <div className="w-full max-w-[35mm] overflow-hidden border border-black/5 p-0.5">
                                  <img src={q.figureDataUrl} alt="" className="w-full h-auto block" />
                              </div>
                              {isPromptInspected && q.figurePrompt && (
                                  <div className="no-print absolute top-0 left-[37mm] w-[50mm] p-3 bg-indigo-900/95 backdrop-blur shadow-2xl rounded-lg border border-indigo-400/30 z-[100] animate-fade-in">
                                      <p className="text-[7px] font-black text-indigo-300 uppercase mb-2 tracking-widest border-b border-indigo-500/30 pb-1">AI Gen Instructions</p>
                                      <p className="text-[8.5px] leading-relaxed text-white italic font-medium">{q.figurePrompt}</p>
                                  </div>
                              )}
                              <div className="flex gap-2">
                                {q.sourceFigureDataUrl && (
                                    <div className="no-print relative group/source">
                                        <div className="bg-slate-900 text-white text-[6px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest cursor-help flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
                                            <iconify-icon icon="mdi:origin" /> Source Ref
                                        </div>
                                        <div className="absolute top-full left-0 mt-1 hidden group-hover/source:block z-[100] w-[40mm] p-1 bg-white border border-slate-200 shadow-2xl rounded">
                                            <p className="text-[6px] font-black text-slate-400 uppercase mb-1 px-1">Original Material</p>
                                            <img src={q.sourceFigureDataUrl} className="w-full h-auto rounded-sm grayscale" />
                                        </div>
                                    </div>
                                )}
                              </div>
                          </div>
                      )}
                      <div className="pl-6 text-[9pt] leading-tight space-y-0.5 text-black">
                        {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className="flex gap-1.5 text-black"><b className="shrink-0">({String.fromCharCode(65 + optIdx)})</b><span dangerouslySetInnerHTML={{ __html: formatText(opt) }} /></div>
                        ))}
                      </div>
                  </div>
              </div>
          );
      } else if (type === 'explanation-box') {
          return <div key={`exp-${globalIndex}`} className="pl-6 mt-4 mb-2"><div style={{ background: '#f8fafc', border: '1.2px solid #000', padding: '8px 12px', borderRadius: '4px', color: 'black' }}><div className="italic leading-relaxed text-black text-[8.5pt]" dangerouslySetInnerHTML={{ __html: content || '' }} /></div></div>;
      }
      return null;
  };

  const QuizPage: React.FC<{ layout: PageLayout; pIdx: number; isThumbnail?: boolean }> = ({ layout, pIdx, isThumbnail }) => (
    <div 
        ref={el => { if (!isThumbnail) pageRefs.current[pIdx] = el; }} 
        className={`printable-quiz-page w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl relative overflow-hidden flex flex-col shrink-0 ${isThumbnail ? 'thumbnail-mode pointer-events-none scale-[0.25] origin-top-left' : 'animate-fade-in'}`} 
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
        <div className={`h-full w-full px-[15mm] pb-[32mm] ${pIdx === 0 ? 'pt-[8mm]' : 'pt-[10mm]'} box-border flex flex-col relative bg-white`}>
            <div className="shrink-0 mb-4 border-b-[1.2px] border-black pb-2 bg-white">
                <div className="text-center">
                    <h1 className="text-xl font-bold uppercase tracking-wide leading-tight mb-1 text-black">{selectedSchool ? selectedSchool.name : editableTopic}</h1>
                    <div className="flex justify-between items-end text-[8.5pt] font-bold text-black">
                        <span>{pIdx === 0 ? (selectedClass ? `CLASS: ${selectedClass.name}` : `TIME: ${currentQuestions.length} MINS`) : (selectedSchool ? selectedSchool.name : editableTopic)}</span>
                        <span>{pIdx === 0 ? `MARKS: ${currentQuestions.length * 4}` : `Page ${pIdx + 1}`}</span>
                    </div>
                </div>
            </div>
            <div className="flex-1 flex gap-[8mm] items-start relative text-black min-h-0 overflow-hidden bg-white">
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black -translate-x-1/2 z-10 opacity-30"></div>
                <div className="flex-1 w-[82mm] h-full overflow-hidden bg-white">{layout.leftCol.map((b, i) => renderBlock(b, i, i === 0))}</div>
                <div className="flex-1 w-[82mm] h-full overflow-hidden bg-white">{layout.rightCol.map((b, i) => renderBlock(b, i, i === 0))}</div>
            </div>
            <div className="absolute bottom-[8mm] left-0 w-full text-center text-[7.5pt] text-black border-t border-black pt-2 mx-[15mm] box-border uppercase font-bold tracking-widest bg-white z-20" style={{ width: 'calc(100% - 30mm)' }}>
                <div className="flex justify-between items-end h-[10mm] text-black">
                    <span className="text-[7px] opacity-50 font-black">ASSESSMENT MODULE</span>
                    <span className="text-[8.5px] font-black tracking-[0.25em]">PAGE {pIdx + 1} OF {pages.length}</span>
                    <span className="text-[7px] opacity-50 font-black">{selectedSchool ? selectedSchool.name.toUpperCase() : 'KIWITEACH PRO'}</span>
                </div>
            </div>
        </div>
    </div>
  );

  const IntroPage: React.FC<{ isThumbnail?: boolean }> = ({ isThumbnail }) => (
    <div ref={el => { if(!isThumbnail) introRef.current = el; }} className={`printable-quiz-page w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl relative overflow-hidden flex flex-col shrink-0 ${isThumbnail ? 'thumbnail-mode pointer-events-none scale-[0.25] origin-top-left' : 'animate-fade-in'}`} style={{ fontFamily: "'Times New Roman', Times, serif" }}>
        <div className="p-[12mm] h-full flex flex-col border-2 border-black m-[5mm] bg-white relative">
            <div className="text-center border-b border-black pb-4 mb-4">
                <h1 className="text-[22pt] font-black uppercase tracking-wide leading-tight mb-2 text-black">{selectedSchool ? selectedSchool.name : editableTopic}</h1>
                <p className="text-[10pt] font-bold uppercase tracking-[0.4em] text-black opacity-60">OFFICIAL ASSESSMENT MODULE</p>
                {selectedClass && <p className="text-[12pt] font-black uppercase mt-4 text-black">CLASS: {selectedClass.name}</p>}
            </div>
            <div className="grid grid-cols-4 gap-0 border border-black mb-8 text-center divide-x divide-black">
                <div className="p-3"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">Code</span><span className="block text-lg font-black leading-none mt-1 text-black">R4</span></div>
                <div className="p-3"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">ID</span><span className="block text-lg font-mono font-bold leading-none mt-1 text-black">987654321</span></div>
                <div className="p-3"><span className="block text-[7pt] font-bold uppercase text-black opacity-60 tracking-widest">Time</span><span className="block text-lg font-black leading-none mt-1 text-black">{currentQuestions.length}m</span></div>
                <div className="p-3 bg-black text-white"><span className="block text-[7pt] font-bold uppercase text-white opacity-60 tracking-widest">Marks</span><span className="block text-lg font-black leading-none mt-1">{currentQuestions.length * 4}</span></div>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center text-center px-10">
                <h2 className="text-[18pt] font-black uppercase tracking-tight text-black mb-2">{editableTopic}</h2>
                <div className="w-12 h-1 bg-black mb-6"></div>
                <p className="text-[10pt] font-bold italic text-black/70 leading-relaxed">
                    This examination paper contains {currentQuestions.length} multiple-choice questions. 
                    Candidates are advised to read each question carefully and mark their responses 
                    on the provided OMR sheet.
                </p>
            </div>

            <div className="mt-auto">
                <div className="grid grid-cols-2 gap-12 border-t border-black pt-6">
                    <div><div className="flex justify-between items-end border-b border-black border-dotted pb-2 mb-4"><span className="text-[9pt] font-bold uppercase text-black opacity-60">Candidate Name</span></div><div className="flex justify-between items-end border-b border-black border-dotted pb-2"><span className="text-[9pt] font-bold uppercase text-black opacity-60">Roll Number</span></div></div>
                    <div><div className="flex justify-between items-end border-b border-black border-dotted pb-2 mb-4"><span className="text-[9pt] font-bold uppercase text-black opacity-60">Invigilator Sign</span></div><div className="flex justify-between items-end border-b border-black border-dotted pb-2"><span className="text-[9pt] font-bold uppercase text-black opacity-60">Candidate Sign</span></div></div>
                </div>
                <div className="text-center mt-4 pt-2 border-t border-black text-[7pt] font-bold uppercase tracking-[0.2em] text-black opacity-40">Authorized Assessment • {selectedSchool ? selectedSchool.name.toUpperCase() : 'KIWITEACH PRO FORGE'}</div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
       <header className="no-print px-6 py-4 bg-white border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0 shadow-sm z-30 overflow-x-auto">
          <div className="flex items-center gap-4 shrink-0">
              <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-rose-600/20 shrink-0"><iconify-icon icon="mdi:flask-round-bottom" width="24" /></div>
              <div className="min-w-0">
                  <input type="text" value={editableTopic} onChange={(e) => setEditableTopic(e.target.value)} className="text-lg font-black text-slate-800 tracking-tight leading-tight bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-rose-500 outline-none w-full px-1 rounded" />
                  <div className="flex items-center gap-2 mt-0.5 ml-1"><span className="text-[9px] font-black uppercase text-rose-600 tracking-widest whitespace-nowrap">{currentQuestions.length} Questions</span><div className="w-1 h-1 rounded-full bg-slate-300"></div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Nano Banana Pro Pipeline</span></div>
              </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
              {/* Localization Selectors */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner mr-2">
                  <select 
                    value={selectedSchoolId} 
                    onChange={e => { setSelectedSchoolId(e.target.value); setSelectedClassId('default'); }}
                    className="bg-transparent text-[10px] font-black uppercase tracking-wider text-slate-600 px-3 py-1 outline-none border-r border-slate-200"
                  >
                    <option value="default">Select School</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select 
                    value={selectedClassId} 
                    onChange={e => setSelectedClassId(e.target.value)}
                    disabled={selectedSchoolId === 'default'}
                    className="bg-transparent text-[10px] font-black uppercase tracking-wider text-slate-600 px-3 py-1 outline-none disabled:opacity-30"
                  >
                    <option value="default">Select Class</option>
                    {classes.filter(c => c.school_id === selectedSchoolId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl mr-2 border border-slate-200 shadow-inner">
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Cover" checked={showIntroPage} onChange={() => setShowIntroPage(!showIntroPage)} />
                 </div>
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Solution" checked={includeExplanations} onChange={() => setIncludeExplanations(!includeExplanations)} />
                 </div>
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="OMR Key" checked={downloadAnswerKey} onChange={() => setDownloadAnswerKey(!downloadAnswerKey)} />
                 </div>
                 <div className="px-3 border-r border-slate-200 flex flex-col gap-1 py-1">
                    <Toggle label="Sections" checked={groupBySubject} onChange={() => setGroupBySubject(!groupBySubject)} />
                    <Toggle label="Diff" checked={showDifficulty} onChange={() => setShowDifficulty(!showDifficulty)} />
                 </div>
              </div>

              <div className="flex items-center gap-2">
                {onSave && <button onClick={handleSaveToCloud} disabled={isSaving || saveComplete} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md ${saveComplete ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'}`}>{isSaving ? "Saving..." : saveComplete ? "Saved" : "Save to Hub"}</button>}
                
                <button onClick={() => setShowScanner(true)} className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-indigo-100 transition-all">
                    <iconify-icon icon="mdi:camera-metering-spot" width="16" />
                    <span>Evaluate</span>
                </button>

                <button onClick={handleDownloadOMR} disabled={isDownloadingOmr} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50">
                    {isDownloadingOmr ? <div className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" /> : <iconify-icon icon="mdi:file-document-outline" width="16" />}
                    <span>OMR Sheet</span>
                </button>

                <button onClick={() => window.print()} disabled={isPaginating} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-95">
                    {isPaginating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><iconify-icon icon="mdi:printer" width="16" /><span>Print / PDF</span></>}
                </button>
                
                <button onClick={onRestart} className="w-10 h-10 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center border border-slate-200"><iconify-icon icon="mdi:close" width="20" /></button>
              </div>
          </div>
       </header>

       <div className="flex-1 flex overflow-hidden relative">
            <div className="no-print w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Forge Stats</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-100 shadow-sm">
                        <span className="text-[8px] font-black text-indigo-600 block uppercase">Diagrams</span>
                        <span className="text-sm font-black text-indigo-900">{stats.figures}</span>
                      </div>
                      <div className="bg-rose-50 p-2 rounded-lg border border-rose-100 shadow-sm">
                        <span className="text-[8px] font-black text-rose-600 block uppercase">Total Qs</span>
                        <span className="text-sm font-black text-rose-900">{currentQuestions.length}</span>
                      </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                    {showIntroPage && (
                        <button onClick={() => introRef.current?.scrollIntoView({ behavior: 'smooth' })} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group">
                            <iconify-icon icon="mdi:file-certificate" className="text-slate-300 group-hover:text-rose-500" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cover</span>
                        </button>
                    )}
                    {pages.map((layout, idx) => (
                        <button key={idx} onClick={() => pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' })} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group">
                            <div className="w-5 h-5 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400 group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-600 transition-all">{idx + 1}</div>
                            <span className="text-[10px] font-black text-slate-500 uppercase">Page {idx + 1}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar bg-slate-300/50 p-4 md:p-8">
                <div className="max-w-[210mm] mx-auto space-y-12 pb-24">
                    {showIntroPage && <IntroPage />}
                    {pages.map((layout, pIdx) => <QuizPage key={pIdx} layout={layout} pIdx={pIdx} />)}
                </div>
            </div>
       </div>

       {showScanner && (
           <OMRScannerModal questions={currentQuestions} onClose={() => setShowScanner(false)} />
       )}
    </div>
  );
};

export default QuestionListScreen;