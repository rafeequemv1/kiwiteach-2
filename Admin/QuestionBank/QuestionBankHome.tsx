import '../../types';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase/client';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { generateQuizQuestions, generateCompositeFigures, generateCompositeStyleVariants, ensureApiKey, downsampleImage } from '../../services/geminiService';
import { QuestionType, TypeDistribution, Question } from '../../Quiz/types';

declare const mammoth: any;

interface QuestionItem extends Question {
    chapter_id: string;
    chapter_name: string;
    subject_name: string;
    class_name: string; // Critical for folder pathing
    question_text: string;
    figure_url?: string;
    page_number?: number;
}

interface ChapterConfig {
    id: string;
    name: string;
    subject_name: string;
    class_name: string;
    count: number;
    figureCount: number;
    doc_path?: string;
}

interface DifficultyDistribution {
    easy: number;
    medium: number;
    hard: number;
}

const QuestionBankHome: React.FC = () => {
  const [kbList, setKbList] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  const [mode, setMode] = useState<'browse' | 'create'>('browse');
  const [questions, setQuestions] = useState<any[]>([]);
  const [targetChapters, setTargetChapters] = useState<ChapterConfig[]>([]);
  
  const [isForging, setIsForging] = useState(false);
  const [forgeSteps, setForgeSteps] = useState<string[]>([]);
  const [forgedPreview, setForgedPreview] = useState<QuestionItem[]>([]);
  const [sourceImagesInDoc, setSourceImagesInDoc] = useState<Record<string, {data: string, mimeType: string}[]>>({});
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  
  const [revealExplanations, setRevealExplanations] = useState(false);
  const [showRefs, setShowRefs] = useState<Record<string, boolean>>({});
  const [showPrompts, setShowPrompts] = useState<Record<string, boolean>>({});

  const [globalDiff, setGlobalDiff] = useState<DifficultyDistribution>({ easy: 30, medium: 50, hard: 20 });
  const [globalTypes, setGlobalTypes] = useState<TypeDistribution>({ mcq: 70, reasoning: 15, matching: 10, statements: 5 });

  const applyNeetPreset = () => {
      setGlobalTypes({ mcq: 70, reasoning: 15, matching: 10, statements: 5 });
      setGlobalDiff({ easy: 30, medium: 50, hard: 20 });
  };

  useEffect(() => {
    supabase.from('knowledge_bases').select('id, name').order('name').then(res => {
        setKbList(res.data || []);
        if (res.data?.length) setSelectedKbId(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedKbId) {
        supabase.from('classes').select('*').eq('kb_id', selectedKbId).then(res => {
            setClasses(res.data || []);
            if (res.data?.length) setSelectedClassId(res.data[0].id);
        });
    }
  }, [selectedKbId]);

  useEffect(() => {
    if (selectedClassId) {
        supabase.from('subjects').select('*').eq('class_id', selectedClassId).then(res => {
            setSubjects(res.data || []);
            if (res.data?.length) setSelectedSubjectId(res.data[0].id);
        });
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedSubjectId) {
        supabase.from('chapters').select('*').eq('subject_id', selectedSubjectId).order('chapter_number').then(res => {
            setChapters(res.data || []);
            if (res.data?.length) setSelectedChapterId(res.data[0].id);
        });
    }
  }, [selectedSubjectId]);

  useEffect(() => {
      if (selectedChapterId) fetchQuestions(selectedChapterId);
  }, [selectedChapterId]);

  const fetchQuestions = async (id: string) => {
      const { data } = await supabase.from('question_bank_neet').select('*').eq('chapter_id', id).order('created_at', { ascending: false });
      setQuestions(data || []);
  };

  const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const extractImagesFromDoc = async (docPath: string): Promise<{ data: string, mimeType: string }[]> => {
      try {
          const { data: blob } = await supabase.storage.from('chapters').download(docPath);
          if (!blob) return [];
          const arrayBuffer = await blob.arrayBuffer();
          const images: { data: string, mimeType: string }[] = [];
          
          const options = {
              convertImage: mammoth.images.imgElement(function(image: any) {
                  return image.read("base64").then(function(imageBuffer: string) {
                      const contentType = image.contentType.startsWith('image/') ? image.contentType : 'image/png';
                      images.push({ data: imageBuffer, mimeType: contentType });
                      return { src: "" }; 
                  });
              })
          };

          await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
          return await Promise.all(images.map(img => downsampleImage(img.data, img.mimeType, 800)));
      } catch (e) {
          console.error("Image extraction failed", e);
          return [];
      }
  };

  const handleToggleChapter = async (c: any) => {
      if (targetChapters.some(tc => tc.id === c.id)) {
          setTargetChapters(prev => prev.filter(x => x.id !== c.id));
          return;
      }

      setExtractingIds(prev => new Set(prev).add(c.id));
      
      const newConfig: ChapterConfig = { 
          id: c.id, 
          name: c.name, 
          subject_name: c.subject_name, 
          class_name: c.class_name,
          count: 10, 
          figureCount: 2,
          doc_path: c.doc_path
      };

      setTargetChapters(prev => [...prev, newConfig]);

      if (c.doc_path && !sourceImagesInDoc[c.id]) {
          const extracted = await extractImagesFromDoc(c.doc_path);
          setSourceImagesInDoc(prev => ({ ...prev, [c.id]: extracted }));
          setTargetChapters(prev => prev.map(tc => tc.id === c.id ? { ...tc, figureCount: Math.min(tc.count, extracted.length) } : tc));
      }
      
      setExtractingIds(prev => {
          const next = new Set(prev);
          next.delete(c.id);
          return next;
      });
  };

  const forgeStats = useMemo(() => {
      const stats = { types: {} as Record<string, number>, figures: [] as {idx: number, count: number, thumb: string, chapId: string}[] };
      
      forgedPreview.forEach(q => {
          stats.types[q.type] = (stats.types[q.type] || 0) + 1;
          if (q.sourceImageIndex !== undefined && q.sourceImageIndex !== -1 && q.chapter_id) {
              const images = sourceImagesInDoc[q.chapter_id] || [];
              const img = images[q.sourceImageIndex];
              const existing = stats.figures.find(f => f.chapId === q.chapter_id && f.idx === q.sourceImageIndex);
              if (existing) {
                  existing.count++;
              } else {
                  stats.figures.push({
                      chapId: q.chapter_id,
                      idx: q.sourceImageIndex,
                      count: 1,
                      thumb: img ? `data:${img.mimeType};base64,${img.data}` : ''
                  });
              }
          }
      });

      return stats;
  }, [forgedPreview, sourceImagesInDoc]);

  const handleAiForge = async () => {
      if (targetChapters.length === 0) return;
      await ensureApiKey();
      setIsForging(true);
      const addStep = (step: string) => setForgeSteps(prev => [...prev, step]);
      setForgeSteps(["Synthesizing Knowledge..."]);
      
      let allResults: QuestionItem[] = [];

      try {
          for (const chap of targetChapters) {
              addStep(`Drafting Items for ${chap.name}...`);
              const { data: chapData } = await supabase.from('chapters').select('raw_text').eq('id', chap.id).single();
              
              const docImages = sourceImagesInDoc[chap.id] || [];
              const context = { text: chapData?.raw_text || "", images: docImages };
              
              const typeKeys: (keyof TypeDistribution)[] = ['mcq', 'reasoning', 'matching', 'statements'];
              let chapQuestions: Question[] = [];

              for (const typeKey of typeKeys) {
                  const percentage = globalTypes[typeKey] || 0;
                  if (percentage <= 0) continue;
                  const typeCount = Math.max(1, Math.round((percentage / 100) * chap.count));
                  
                  addStep(`Forging ${typeKey.toUpperCase()} items...`);
                  const batchFigureTarget = typeKey === 'mcq' ? chap.figureCount : 0;
                  const gen = await generateQuizQuestions(chap.name, globalDiff, typeCount, context, typeKey, undefined, batchFigureTarget);
                  chapQuestions = [...chapQuestions, ...gen];
              }

              const figureQs = chapQuestions.filter(q => q.figurePrompt);
              if (figureQs.length > 0) {
                  addStep(`Stylizing Diagrams...`);
                  const sourceEditGroups: Record<number, Question[]> = {};
                  const purelySynthetic: Question[] = [];
                  
                  figureQs.forEach(q => {
                      if (q.sourceImageIndex !== undefined && q.sourceImageIndex !== -1 && docImages[q.sourceImageIndex]) {
                          if (!sourceEditGroups[q.sourceImageIndex]) sourceEditGroups[q.sourceImageIndex] = [];
                          sourceEditGroups[q.sourceImageIndex].push(q);
                      } else {
                          purelySynthetic.push(q);
                      }
                  });

                  for (const [imgIdx, groupQs] of Object.entries(sourceEditGroups)) {
                      const idx = parseInt(imgIdx);
                      const sourceImg = docImages[idx];
                      if (!sourceImg) continue;

                      for (let i = 0; i < groupQs.length; i += 6) {
                          const chunk = groupQs.slice(i, i + 6);
                          const prompts = chunk.map(q => q.figurePrompt!);
                          const results = await generateCompositeStyleVariants(sourceImg.data, prompts);
                          chunk.forEach((q, cIdx) => {
                              if (results[cIdx]) {
                                  q.figureDataUrl = `data:image/png;base64,${results[cIdx]}`;
                                  q.sourceFigureDataUrl = `data:${sourceImg.mimeType};base64,${sourceImg.data}`;
                              }
                          });
                      }
                  }

                  for (let i = 0; i < purelySynthetic.length; i += 6) {
                      const chunk = purelySynthetic.slice(i, i + 6);
                      const prompts = chunk.map(q => q.figurePrompt!);
                      const results = await generateCompositeFigures(prompts);
                      chunk.forEach((q, cIdx) => {
                          if (results[cIdx]) q.figureDataUrl = `data:image/png;base64,${results[cIdx]}`;
                      });
                  }
              }

              const mapped = chapQuestions.map(q => ({
                  ...q,
                  chapter_id: chap.id,
                  chapter_name: chap.name,
                  subject_name: chap.subject_name,
                  class_name: chap.class_name,
                  question_text: q.text,
                  figure_url: q.figureDataUrl,
                  page_number: q.pageNumber as number
              }));
              allResults = [...allResults, ...mapped];
          }
          setForgedPreview(allResults);
      } catch (e: any) {
          alert("Forge error: " + e.message);
      } finally {
          setIsForging(false);
          setForgeSteps([]);
      }
  };

  const handleSaveToDB = async () => {
      setIsForging(true);
      setForgeSteps(['Committing to Repository...']);
      try {
          const dbRecords = [];
          
          for (const q of forgedPreview) {
              const qId = crypto.randomUUID();
              let finalFigureUrl = null;

              if (q.figure_url?.startsWith('data:')) {
                  const res = await fetch(q.figure_url);
                  const blob = await res.blob();
                  
                  const classSlug = slugify(q.class_name || 'unknown_class');
                  const subjectSlug = slugify(q.subject_name || 'unknown_subject');
                  const chapterSlug = slugify(q.chapter_name || 'unknown_chapter');
                  const storagePath = `${classSlug}/${subjectSlug}/${chapterSlug}/${qId}.png`;

                  const { error: uploadError } = await supabase.storage
                    .from('question-figures')
                    .upload(storagePath, blob, { contentType: 'image/png', upsert: true });
                  
                  if (uploadError) throw uploadError;

                  finalFigureUrl = supabase.storage.from('question-figures').getPublicUrl(storagePath).data.publicUrl;
              }

              dbRecords.push({
                  id: qId,
                  chapter_id: q.chapter_id,
                  chapter_name: q.chapter_name,
                  subject_name: q.subject_name,
                  class_name: q.class_name,
                  question_text: q.question_text,
                  options: q.options,
                  correct_index: q.correctIndex, // Map JS correctIndex to Postgres correct_index
                  difficulty: q.difficulty,
                  question_type: q.type,
                  explanation: q.explanation,
                  figure_url: finalFigureUrl,
                  page_number: q.page_number
              });
          }

          const { error } = await supabase.from('question_bank_neet').insert(dbRecords);
          if (error) throw error;
          
          setForgedPreview([]);
          setMode('browse');
          if (selectedChapterId) fetchQuestions(selectedChapterId);
          alert(`Successfully committed ${dbRecords.length} items to Repository.`);
      } catch (e: any) { 
          alert("Commit failed: " + e.message);
      } finally { 
          setIsForging(false); 
          setForgeSteps([]); 
      }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
        <div className="bg-white border-b p-4 flex gap-4 overflow-x-auto shadow-sm shrink-0 no-print">
            <select value={selectedKbId || ''} onChange={e => setSelectedKbId(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-xs font-black text-slate-600 outline-none hover:border-indigo-300 transition-colors appearance-none px-4">
                {kbList.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
            </select>
            <div className="flex gap-2">
                {classes.map(c => <button key={c.id} onClick={() => setSelectedClassId(c.id)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${selectedClassId === c.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{c.name}</button>)}
            </div>
            <div className="flex gap-2 border-l border-slate-100 pl-4">
                {subjects.map(s => <button key={s.id} onClick={() => setSelectedSubjectId(s.id)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${selectedSubjectId === s.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20' : 'bg-white text-slate-400 hover:border-emerald-300'}`}>{s.name}</button>)}
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            <aside className="w-64 border-r bg-slate-900 text-white overflow-y-auto shrink-0 flex flex-col custom-scrollbar no-print">
                {forgedPreview.length > 0 && mode === 'create' ? (
                    <div className="p-6 animate-fade-in flex flex-col gap-8">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Synthesis Strategy</h4>
                            <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5 space-y-3">
                                <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
                                    <span className="text-[9px] font-bold text-slate-300 uppercase">Total Items</span>
                                    <span className="text-[10px] font-black text-indigo-400">{forgedPreview.length}</span>
                                </div>
                                {Object.entries(forgeStats.types).map(([type, count]) => (
                                    <div key={type} className="flex justify-between items-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{type}</span>
                                        <span className="text-[10px] font-black text-emerald-400">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {forgeStats.figures.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Source Inventory</h4>
                                <div className="space-y-4">
                                    {forgeStats.figures.map((fig) => (
                                        <div key={`${fig.chapId}-${fig.idx}`} className="bg-slate-800/50 rounded-2xl p-3 border border-white/5 flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-lg bg-slate-700 overflow-hidden shrink-0 border border-white/5 flex items-center justify-center shadow-inner">
                                                {fig.thumb ? <img src={fig.thumb} className="w-full h-full object-cover grayscale opacity-60" /> : <iconify-icon icon="mdi:image-outline" className="text-slate-500" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[9px] font-black text-slate-300 uppercase truncate">Source Image #{fig.idx + 1}</p>
                                                <p className="text-[8px] font-bold text-emerald-400 uppercase">{fig.count} Questions Linked</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-auto pt-6 border-t border-white/10 text-center opacity-30">
                             <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pipeline v3.2 Active</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">Chapter Catalog</div>
                        {chapters.map(c => (
                            <div key={c.id} onClick={() => setSelectedChapterId(c.id)} className={`p-4 border-b border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors flex justify-between items-center group ${selectedChapterId === c.id ? 'bg-indigo-600/30 text-indigo-400' : ''}`}>
                                <span className="text-[11px] font-black uppercase truncate pr-2">{c.name}</span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleToggleChapter(c); }} 
                                    className={`w-6 h-6 rounded flex items-center justify-center transition-all ${targetChapters.some(tc => tc.id === c.id) ? 'bg-emerald-50 text-white' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                >
                                    {extractingIds.has(c.id) ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon={targetChapters.some(tc => tc.id === c.id) ? "mdi:check" : "mdi:plus"} />}
                                </button>
                            </div>
                        ))}
                    </>
                )}
            </aside>

            <main className="flex-1 overflow-hidden flex flex-col bg-white">
                <div className="p-4 bg-slate-50/50 border-b flex justify-between items-center shrink-0 no-print">
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button onClick={() => { setMode('browse'); setForgedPreview([]); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'browse' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Repository</button>
                        <button onClick={() => setMode('create')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'create' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>AI Forge Studio</button>
                    </div>
                    {forgedPreview.length > 0 && (
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="text-[9px] font-black uppercase text-slate-400 group-hover:text-slate-700 tracking-widest">Reveal Answers</div>
                                <div className="relative" onClick={() => setRevealExplanations(!revealExplanations)}>
                                    <div className={`w-10 h-5 rounded-full transition-colors ${revealExplanations ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${revealExplanations ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {mode === 'browse' ? (
                        <div className="space-y-4 max-w-4xl mx-auto pb-10">
                            {questions.length === 0 ? (
                                <div className="text-center py-24 text-slate-300"><iconify-icon icon="mdi:database-search" width="64" className="opacity-20 mb-4" /><p className="text-xs font-bold uppercase tracking-widest">Empty Workspace</p></div>
                            ) : questions.map((q, idx) => (
                                <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm group hover:border-indigo-200 transition-all">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className={`text-[8px] font-black px-2.5 py-1 rounded-full uppercase border ${q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{q.difficulty}</span>
                                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-auto">{q.question_type}</span>
                                    </div>
                                    <div className="font-bold text-slate-800 mb-6 leading-relaxed text-lg">{renderWithSmiles(parsePseudoLatexAndMath(q.question_text), 120)}</div>
                                    {q.figure_url && <div className="mb-6"><img src={q.figure_url} className="max-w-md rounded-2xl shadow-inner border border-slate-50 bg-slate-50/30 p-2" /></div>}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {q.options.map((o: any, i: number) => <div key={i} className={`text-xs p-4 rounded-xl border-2 transition-all ${i === q.correct_index ? 'bg-emerald-50 text-emerald-700 border-emerald-400 font-bold' : 'bg-slate-50 text-slate-500 border-slate-100'}`}><span className="opacity-30 mr-2">({String.fromCharCode(65+i)})</span> {renderWithSmiles(parsePseudoLatexAndMath(o), 90)}</div>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : forgedPreview.length > 0 ? (
                        <div className="max-w-5xl mx-auto animate-fade-in pb-10">
                            <div className="flex justify-between items-center mb-10 bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full"></div>
                                <div className="relative z-10">
                                    <h2 className="text-2xl font-black uppercase tracking-tight">Sync Completed</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em] mt-1">{forgedPreview.length} standard NEET items forged</p>
                                </div>
                                <div className="flex gap-4 relative z-10">
                                    <button onClick={() => setForgedPreview([])} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[10px] border border-white/10 transition-all">Discard</button>
                                    <button onClick={handleSaveToDB} className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/40 transition-all active:scale-95">Commit to Repo</button>
                                </div>
                            </div>
                            <div className="space-y-6">
                                {forgedPreview.map((q, i) => (
                                    <div key={i} className="p-8 border border-slate-100 rounded-[3rem] bg-white shadow-sm flex flex-col md:flex-row gap-10 hover:shadow-xl transition-all">
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-3 mb-6">
                                                <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-full uppercase tracking-wider">{q.chapter_name}</span>
                                                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">{q.difficulty}</span>
                                                {q.page_number && <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase border border-slate-100 ml-auto">Pg {q.page_number}</span>}
                                            </div>
                                            <p className="text-xl font-bold text-slate-700 mb-8 leading-relaxed">{q.question_text}</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                {q.options.map((o, oi) => <div key={oi} className={`text-xs p-4 rounded-xl border ${oi === q.correctIndex ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>{String.fromCharCode(65+oi)}. {o}</div>)}
                                            </div>
                                            {revealExplanations && q.explanation && (
                                                <div className="bg-slate-50 rounded-2xl p-6 border-l-4 border-indigo-500 animate-slide-up">
                                                    <h5 className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-2">Scientific Explanation</h5>
                                                    <p className="text-sm text-slate-600 leading-relaxed font-medium italic">{q.explanation}</p>
                                                </div>
                                            )}
                                        </div>
                                        {q.figure_url && (
                                            <div className="flex flex-col gap-4 shrink-0">
                                                <div className="w-64 h-64 rounded-[2.5rem] overflow-hidden border border-slate-100 bg-white flex items-center justify-center p-6 shadow-inner relative">
                                                    <img src={q.figure_url} className="max-h-full max-w-full object-contain" />
                                                    {showPrompts[i] && q.figurePrompt && (
                                                        <div className="absolute inset-4 bg-slate-900/90 backdrop-blur-md rounded-[1.5rem] p-4 text-white animate-fade-in overflow-y-auto custom-scrollbar z-20">
                                                            <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-2">
                                                                <iconify-icon icon="mdi:robot-outline" className="text-indigo-400" />
                                                                <span className="text-[8px] font-black uppercase tracking-widest">Image Instruction</span>
                                                            </div>
                                                            <p className="text-[10px] leading-relaxed font-medium text-slate-200 italic">{q.figurePrompt}</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setShowPrompts(prev => ({...prev, [i]: !prev[i]}))}
                                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${showPrompts[i] ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'}`}
                                                        >
                                                            <iconify-icon icon={showPrompts[i] ? "mdi:eye-off" : "mdi:robot-outline"} />
                                                            {showPrompts[i] ? "Hide Prompt" : "AI Prompt"}
                                                        </button>
                                                        {q.sourceFigureDataUrl && (
                                                            <button 
                                                                onClick={() => setShowRefs(prev => ({...prev, [i]: !prev[i]}))}
                                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${showRefs[i] ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'}`}
                                                            >
                                                                <iconify-icon icon={showRefs[i] ? "mdi:eye-off" : "mdi:eye"} />
                                                                {showRefs[i] ? "Hide Ref" : "Ref Image"}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {showRefs[i] && q.sourceFigureDataUrl && (
                                                        <div className="w-64 p-3 bg-slate-50 border border-slate-200 rounded-[1.5rem] animate-fade-in shadow-inner">
                                                            <p className="text-[7px] font-black text-slate-400 uppercase mb-2 px-1 text-center">Original Reference</p>
                                                            <img src={q.sourceFigureDataUrl} className="w-full h-auto rounded-xl grayscale" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-2xl relative overflow-hidden">
                            {isForging && (
                                <div className="absolute inset-0 bg-white/98 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-12 text-center animate-fade-in">
                                    <div className="w-24 h-24 bg-rose-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-12 animate-pulse"><iconify-icon icon="mdi:lightning-bolt" width="48" /></div>
                                    <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-8 uppercase">Neural Pipeline Active</h3>
                                    <div className="w-full max-w-sm space-y-4">
                                        {forgeSteps.map((step, idx) => (
                                            <div key={idx} className="flex items-center gap-3 animate-slide-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: `${idx * 0.1}s` }}>
                                                <iconify-icon icon={idx === forgeSteps.length - 1 ? "mdi:circle-slice-8" : "mdi:check-circle"} className={idx === forgeSteps.length - 1 ? "text-rose-600 animate-spin" : "text-emerald-500"} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${idx === forgeSteps.length - 1 ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-12 pb-8 border-b border-slate-100">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-rose-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl transform rotate-3"><iconify-icon icon="mdi:database-plus" width="32" /></div>
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none mb-2">NEET Forge Blueprint</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{targetChapters.length} Chapters Prepared</p>
                                    </div>
                                </div>
                                <button onClick={applyNeetPreset} className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black uppercase text-[10px] tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all shadow-sm">NEET Standard Mix</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-10">
                                    <section>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 block ml-1">Complexity Matrix (%)</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            {['easy', 'medium', 'hard'].map(level => (
                                                <div key={level} className="space-y-2">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase block text-center capitalize">{level}</span>
                                                    <input type="number" value={globalDiff[level as keyof DifficultyDistribution]} onChange={e => setGlobalDiff({...globalDiff, [level]: Math.min(100, parseInt(e.target.value)||0)})} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 text-center text-sm font-black text-slate-700 outline-none focus:border-rose-500 shadow-inner" />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                    <section>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 block ml-1">Pattern Array (%)</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[{k:'mcq',l:'Standard MCQ'},{k:'reasoning',l:'Assertion-Reason'},{k:'matching',l:'Matrix Match'},{k:'statements',l:'Statement I/II'}].map(type => (
                                                <div key={type.k} className="space-y-2">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase block px-1 truncate">{type.l}</span>
                                                    <input type="number" value={globalTypes[type.k as keyof TypeDistribution] || 0} onChange={e => setGlobalTypes({...globalTypes, [type.k]: Math.min(100, parseInt(e.target.value)||0)})} className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl py-4 text-center text-sm font-black text-emerald-700 outline-none focus:border-emerald-500 shadow-inner" />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>

                                <div className="space-y-6">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 block ml-1">Synthesis Queue</label>
                                    <div className="bg-slate-50/50 rounded-[2.5rem] border border-slate-100 p-6 space-y-6 max-h-[450px] overflow-y-auto custom-scrollbar shadow-inner">
                                        {targetChapters.length === 0 ? (
                                            <div className="py-24 text-center flex flex-col items-center">
                                                <iconify-icon icon="mdi:playlist-plus" width="48" className="text-slate-200 mb-4" />
                                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] leading-relaxed">Add chapters from the<br/>catalog to begin</p>
                                            </div>
                                        ) : targetChapters.map(c => {
                                            const images = sourceImagesInDoc[c.id] || [];
                                            const isExtracting = extractingIds.has(c.id);
                                            return (
                                                <div key={c.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm animate-fade-in group hover:shadow-md transition-shadow">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="min-w-0 flex-1 pr-4">
                                                            <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight block truncate">{c.name}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase">{c.subject_name}</span>
                                                        </div>
                                                        <button onClick={() => setTargetChapters(targetChapters.filter(x => x.id !== c.id))} className="text-slate-200 hover:text-rose-500 transition-colors shrink-0"><iconify-icon icon="mdi:close-circle" width="20" /></button>
                                                    </div>

                                                    <div className="mb-5">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Source Figures</p>
                                                            <span className="text-[7px] font-black text-indigo-500 bg-indigo-50 px-1.5 rounded-full">{isExtracting ? 'Scanning...' : `${images.length} Detected`}</span>
                                                        </div>
                                                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                                                            {isExtracting ? (
                                                                <div className="flex gap-2">
                                                                    {[1,2,3].map(i => <div key={i} className="w-10 h-10 rounded-lg bg-slate-50 animate-pulse border border-slate-100" />)}
                                                                </div>
                                                            ) : images.length > 0 ? (
                                                                images.map((img, idx) => (
                                                                    <div key={idx} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 shrink-0 bg-slate-50 flex items-center justify-center shadow-sm">
                                                                        <img src={`data:${img.mimeType};base64,${img.data}`} className="w-full h-full object-cover grayscale opacity-70" />
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p className="text-[7px] text-slate-300 italic">No figures found in document</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-3">
                                                        <div className="flex-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                                            <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">Total Qs</span>
                                                            <input type="number" value={c.count} onChange={e => setTargetChapters(targetChapters.map(x => x.id === c.id ? {...x, count: Math.min(100, parseInt(e.target.value)||1)} : x))} className="w-full bg-transparent text-sm font-black text-slate-700 outline-none" />
                                                        </div>
                                                        <div className="flex-1 bg-rose-50 p-3 rounded-2xl border border-rose-100">
                                                            <span className="text-[7px] font-black text-rose-400 uppercase block mb-1">Diagrams</span>
                                                            <input type="number" value={c.figureCount} onChange={e => setTargetChapters(targetChapters.map(x => x.id === c.id ? {...x, figureCount: Math.min(c.count, parseInt(e.target.value)||0)} : x))} className="w-full bg-transparent text-sm font-black text-rose-700 outline-none" />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleAiForge} 
                                disabled={isForging || targetChapters.length === 0} 
                                className="w-full mt-12 bg-rose-600 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.4em] text-sm shadow-2xl shadow-rose-600/30 hover:bg-rose-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-6"
                            >
                                <iconify-icon icon="mdi:lightning-bolt" width="28" />
                                <span>Initiate Synthesis</span>
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    </div>
  );
};

export default QuestionBankHome;