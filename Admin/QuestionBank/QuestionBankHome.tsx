
import '../../types';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase/client';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { generateQuizQuestions, generateCompositeFigures } from '../../services/geminiService';

interface DetailedStats {
    total: number;
    easy: number;
    medium: number;
    hard: number;
    figures: number;
}

interface KbStats {
    total: number;
    easy: number;
    medium: number;
    hard: number;
    types: Record<string, number>;
}

interface QuestionItem {
    id?: string;
    question_text: string;
    options: string[];
    correct_index: number;
    difficulty: string;
    question_type: string;
    explanation?: string;
    chapter_id: string;
    figure_url?: string;
    column_a?: string[];
    column_b?: string[];
    correct_matches?: number[];
    page_number?: number; // Added to store source page
}

interface TypeDistribution {
    mcq: number;
    reasoning: number;
    matching: number;
    statement: number;
}

interface DifficultyDistribution {
    easy: number;
    medium: number;
    hard: number;
}

interface ChapterConfig {
    id: string;
    name: string;
    count: number;
    useGlobal: boolean; 
    localDiff: DifficultyDistribution;
    localTypes: TypeDistribution;
    localFigureCount?: number;
}

const QuestionBankHome: React.FC = () => {
  const [kbList, setKbList] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [chapterStats, setChapterStats] = useState<Record<string, DetailedStats>>({});
  
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  // Lazy Loading States
  const [isKBLoading, setIsKBLoading] = useState(true);
  const [isClassesLoading, setIsClassesLoading] = useState(false);
  const [isSubjectsLoading, setIsSubjectsLoading] = useState(false);
  const [isChaptersLoading, setIsChaptersLoading] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const [mode, setMode] = useState<'browse' | 'create'>('browse');
  
  // Pagination State
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalChapterQuestions, setTotalChapterQuestions] = useState(0);
  const ITEMS_PER_PAGE = 50;

  const [globalCount, setGlobalCount] = useState(10);
  const [globalFigureCount, setGlobalFigureCount] = useState(0); 
  const [topicFocus, setTopicFocus] = useState('');
  
  const [globalDiff, setGlobalDiff] = useState<DifficultyDistribution>({ easy: 30, medium: 50, hard: 20 });
  const [globalTypes, setGlobalTypes] = useState<TypeDistribution>({ mcq: 100, reasoning: 0, matching: 0, statement: 0 });
  
  const [targetChapters, setTargetChapters] = useState<ChapterConfig[]>([]);
  const [isForging, setIsForging] = useState(false);
  const [forgeStatus, setForgeStatus] = useState('');
  const [forgeProgress, setForgeProgress] = useState(0);
  const [forgedPreview, setForgedPreview] = useState<QuestionItem[]>([]);

  // KB Stats State
  const [showKbStats, setShowKbStats] = useState(false);
  const [kbStats, setKbStats] = useState<KbStats | null>(null);
  const [isKbStatsLoading, setIsKbStatsLoading] = useState(false);

  // 1. Initial Load: Knowledge Bases only
  useEffect(() => {
    const fetchKBs = async () => {
        setIsKBLoading(true);
        try {
            const { data, error } = await supabase.from('knowledge_bases').select('id, name').order('name');
            if (error) throw error;
            setKbList(data || []);
            if (data && data.length > 0) setSelectedKbId(data[0].id);
        } catch (e) {
            console.error("KB Fetch Error:", e);
        } finally {
            setIsKBLoading(false);
        }
    };
    fetchKBs();
  }, []);

  // 2. KB Selection -> Fetch Classes + Reset Stats
  useEffect(() => {
    if (!selectedKbId) return;
    setKbStats(null); // Reset stats on KB change
    const fetchClasses = async () => {
        setIsClassesLoading(true);
        try {
            const { data, error } = await supabase.from('classes').select('*').eq('kb_id', selectedKbId).order('name');
            if (error) throw error;
            setClasses(data || []);
            if (data && data.length > 0) setSelectedClassId(data[0].id);
            else {
                setSelectedClassId(null);
                setSubjects([]);
                setChapters([]);
            }
        } finally {
            setIsClassesLoading(false);
        }
    };
    fetchClasses();
  }, [selectedKbId]);

  // 3. Class Selection -> Fetch Subjects
  useEffect(() => {
      if (!selectedClassId) {
          setSubjects([]);
          setSelectedSubjectId(null);
          return;
      }
      const fetchSubjects = async () => {
          setIsSubjectsLoading(true);
          try {
              const { data, error } = await supabase.from('subjects').select('*').eq('class_id', selectedClassId).order('name');
              if (error) throw error;
              setSubjects(data || []);
              if (data && data.length > 0) setSelectedSubjectId(data[0].id);
              else {
                  setSelectedSubjectId(null);
                  setChapters([]);
              }
          } finally {
              setIsSubjectsLoading(false);
          }
      };
      fetchSubjects();
  }, [selectedClassId]);

  // 4. Subject Selection -> Fetch Chapters & Specific Stats
  useEffect(() => {
      if (!selectedSubjectId) {
          setChapters([]);
          setChapterStats({});
          return;
      }
      const fetchChapterData = async () => {
          setIsChaptersLoading(true);
          try {
              // OPTIMIZATION: Only select minimal fields. Exclude 'raw_text'.
              const [chapsRes, statsRes] = await Promise.all([
                  supabase.from('chapters')
                    .select('id, name, chapter_number, subject_id, subject_name, class_id, class_name')
                    .eq('subject_id', selectedSubjectId)
                    .order('chapter_number', { ascending: true }),
                  supabase.rpc('get_subject_chapter_stats', { target_subject_id: selectedSubjectId })
              ]);

              if (chapsRes.error) throw chapsRes.error;
              setChapters(chapsRes.data || []);

              const stats: Record<string, DetailedStats> = {};
              if (!statsRes.error && statsRes.data) {
                  statsRes.data.forEach((s: any) => {
                      stats[s.chapter_id] = {
                          total: Number(s.total_count),
                          easy: Number(s.easy_count),
                          medium: Number(s.medium_count),
                          hard: Number(s.hard_count),
                          figures: Number(s.figure_count)
                      };
                  });
              }
              setChapterStats(stats);
              
              if (chapsRes.data && chapsRes.data.length > 0) {
                  setSelectedChapterId(chapsRes.data[0].id);
              } else {
                  setSelectedChapterId(null);
              }
          } finally {
              setIsChaptersLoading(false);
          }
      };
      fetchChapterData();
  }, [selectedSubjectId]);

  // 5. Chapter Selection -> Fetch Questions (Initial)
  useEffect(() => {
      if (selectedChapterId) {
          setQuestions([]);
          setPage(0);
          setHasMore(false);
          setTotalChapterQuestions(0);
          fetchQuestions(selectedChapterId, 0);
          
          if (mode === 'create') {
              const chap = chapters.find(c => c.id === selectedChapterId);
              if (chap) addChapterToForge(chap);
          }
      } else {
          setQuestions([]);
      }
  }, [selectedChapterId]);

  const fetchQuestions = async (chapterId: string, pageNum: number) => {
      setIsLoadingQuestions(true);
      try {
          const from = pageNum * ITEMS_PER_PAGE;
          const to = from + ITEMS_PER_PAGE - 1;

          const { data, error, count } = await supabase
            .from('question_bank_neet')
            .select('*', { count: 'exact' })
            .eq('chapter_id', chapterId)
            .order('created_at', { ascending: false })
            .range(from, to);
            
          if (error) throw error;
          
          if (pageNum === 0) {
              setQuestions(data || []);
          } else {
              setQuestions(prev => [...prev, ...(data || [])]);
          }

          if (count !== null) setTotalChapterQuestions(count);
          
          if (count && (from + (data?.length || 0)) < count) {
              setHasMore(true);
          } else {
              setHasMore(false);
          }
      } catch (e) {
          console.warn("Fetch Questions Warning:", e);
      } finally {
          setIsLoadingQuestions(false);
      }
  };

  const handleLoadMore = () => {
      if (!selectedChapterId) return;
      const nextPage = page + 1;
      setPage(nextPage);
      fetchQuestions(selectedChapterId, nextPage);
  };

  const fetchKbStats = async () => {
      if (!selectedKbId) return;
      setIsKbStatsLoading(true);
      try {
          // Fetch wider range to ensure we capture >1000 items if they exist
          const { data, error } = await supabase
              .from('question_bank_neet')
              .select('difficulty, question_type, chapters!inner(kb_id)')
              .eq('chapters.kb_id', selectedKbId)
              .range(0, 9999); // Explicitly request up to 10k rows to bypass default 1000 limit

          if (error) throw error;

          const stats: KbStats = {
              total: data?.length || 0,
              easy: 0,
              medium: 0,
              hard: 0,
              types: {}
          };

          data?.forEach((q: any) => {
              if (q.difficulty === 'Easy') stats.easy++;
              else if (q.difficulty === 'Medium') stats.medium++;
              else if (q.difficulty === 'Hard') stats.hard++;

              const type = q.question_type || 'unknown';
              stats.types[type] = (stats.types[type] || 0) + 1;
          });

          setKbStats(stats);
      } catch (err) {
          console.error("Failed to load KB stats", err);
      } finally {
          setIsKbStatsLoading(false);
      }
  };

  const handleToggleStats = () => {
      if (!showKbStats && !kbStats) {
          fetchKbStats();
      }
      setShowKbStats(!showKbStats);
  };

  const addChapterToForge = (chap: any) => {
      if (!targetChapters.find(tc => tc.id === chap.id)) {
          setTargetChapters(prev => [...prev, {
              id: chap.id,
              name: chap.name,
              count: globalCount,
              useGlobal: true,
              localDiff: { ...globalDiff },
              localTypes: { ...globalTypes },
              localFigureCount: globalFigureCount
          }]);
      }
  };

  const removeChapterFromForge = (id: string) => {
      setTargetChapters(prev => prev.filter(tc => tc.id !== id));
  };

  const handleAiForge = async () => {
      if (targetChapters.length === 0) return alert("Select at least one chapter.");
      setIsForging(true);
      setForgeProgress(0);
      setForgedPreview([]);
      let progressStep = 0;
      let allGeneratedItems: QuestionItem[] = [];

      try {
          for (const chapConfig of targetChapters) {
              setForgeStatus(`Processing: ${chapConfig.name}`);
              const diff = chapConfig.useGlobal ? globalDiff : chapConfig.localDiff;
              const types = chapConfig.useGlobal ? globalTypes : chapConfig.localTypes;
              const count = chapConfig.count;
              const figCount = chapConfig.useGlobal ? globalFigureCount : (chapConfig.localFigureCount || 0);

              // Correctly lazy load raw text only when needed for generation
              const { data: chapData } = await supabase.from('chapters').select('raw_text').eq('id', chapConfig.id).single();
              let context = undefined;
              if (chapData?.raw_text) {
                   context = { data: chapData.raw_text, mimeType: 'text/plain' };
              }

              const topicPrompt = topicFocus || chapConfig.name;
              const typeKeys: (keyof TypeDistribution)[] = ['mcq', 'reasoning', 'matching', 'statement'];
              let figuresGeneratedSoFar = 0;
              
              for (const typeKey of typeKeys) {
                  const typeCount = Math.round((types[typeKey] / 100) * count);
                  if (typeCount <= 0) continue;

                  let batchFigureTarget = 0;
                  if (typeKey === 'mcq') {
                      batchFigureTarget = Math.max(0, figCount - figuresGeneratedSoFar);
                      batchFigureTarget = Math.min(batchFigureTarget, typeCount);
                  }

                  setForgeStatus(`Forging ${typeCount} ${typeKey.toUpperCase()}s...`);
                  const apiType = typeKey === 'statement' ? 'statements' : typeKey; 

                  const generated = await generateQuizQuestions(
                      topicPrompt,
                      diff, 
                      typeCount,
                      context,
                      apiType as any,
                      (s) => setForgeStatus(`${chapConfig.name}: ${s}`),
                      batchFigureTarget
                  );

                  if (batchFigureTarget > 0) {
                       setForgeStatus(`Synthesizing Diagrams...`);
                       const figCandidates = generated.filter(q => !!q.figurePrompt);
                       if (figCandidates.length > 0) {
                           const prompts = figCandidates.map(q => q.figurePrompt!);
                           const images = await generateCompositeFigures(prompts);
                           figCandidates.forEach((q, i) => {
                               if (images[i]) q.figureDataUrl = `data:image/png;base64,${images[i]}`;
                           });
                           figuresGeneratedSoFar += figCandidates.length;
                       }
                  }

                  const previewItems = generated.map(q => ({
                      chapter_id: chapConfig.id,
                      question_text: q.text,
                      options: q.options,
                      correct_index: q.correctIndex,
                      difficulty: q.difficulty,
                      question_type: q.type,
                      explanation: q.explanation,
                      figure_url: q.figureDataUrl, // Map generation result directly
                      column_a: q.columnA,
                      column_b: q.columnB,
                      correct_matches: q.correctMatches,
                      page_number: typeof q.pageNumber === 'number' ? q.pageNumber : undefined // Correctly map page number
                  }));
                  allGeneratedItems = [...allGeneratedItems, ...previewItems];
              }
              progressStep++;
              setForgeProgress((progressStep / targetChapters.length) * 100);
          }
          setForgedPreview(allGeneratedItems);
      } catch (e: any) {
          alert("Forge Process Halted: " + e.message);
      } finally {
          setIsForging(false);
          setForgeStatus('');
      }
  };

  const handleSavePreviewToDB = async () => {
      if (forgedPreview.length === 0) return;
      setIsForging(true); 
      setForgeStatus('Initializing Save...');
      
      try {
          let uploadedCount = 0;
          const totalImages = forgedPreview.filter(q => q.figure_url?.startsWith('data:')).length;

          const processedItems = await Promise.all(forgedPreview.map(async (q) => {
              let finalFigureUrl = q.figure_url;
              if (q.figure_url && q.figure_url.startsWith('data:')) {
                  if(totalImages > 0) setForgeStatus(`Uploading Assets (${uploadedCount + 1}/${totalImages})...`);
                  try {
                      const res = await fetch(q.figure_url);
                      const blob = await res.blob();
                      const fileName = `forge_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
                      await supabase.storage.from('question-images').upload(fileName, blob, { contentType: 'image/png' });
                      const { data } = supabase.storage.from('question-images').getPublicUrl(fileName);
                      finalFigureUrl = data.publicUrl;
                      uploadedCount++;
                  } catch (err) {
                      finalFigureUrl = null; 
                  }
              }
              const { id, ...rest } = q; 
              // rest contains page_number if mapped correctly in handleAiForge
              return { ...rest, figure_url: finalFigureUrl };
          }));

          setForgeStatus('Committing to Database...');
          const { error } = await supabase.from('question_bank_neet').insert(processedItems);
          if (error) throw error;
          
          alert(`Successfully saved ${processedItems.length} questions.`);
          setForgedPreview([]); 
          if (selectedSubjectId) {
             const statsRes = await supabase.rpc('get_subject_chapter_stats', { target_subject_id: selectedSubjectId });
             if (!statsRes.error && statsRes.data) {
                const stats: Record<string, DetailedStats> = {};
                statsRes.data.forEach((s: any) => {
                    stats[s.chapter_id] = { total: Number(s.total_count), easy: Number(s.easy_count), medium: Number(s.medium_count), hard: Number(s.hard_count), figures: Number(s.figure_count) };
                });
                setChapterStats(stats);
             }
          }
          if (selectedChapterId) {
              setQuestions([]);
              setPage(0);
              fetchQuestions(selectedChapterId, 0);
          }
          setMode('browse'); 
      } catch (e: any) {
          alert("Save Failed: " + e.message);
      } finally {
          setIsForging(false);
      }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Delete this question permanently?")) return;
      const { error } = await supabase.from('question_bank_neet').delete().eq('id', id);
      if (!error) {
          setQuestions(prev => prev.filter(q => q.id !== id));
          if (selectedSubjectId) {
              const statsRes = await supabase.rpc('get_subject_chapter_stats', { target_subject_id: selectedSubjectId });
              if (!statsRes.error && statsRes.data) {
                  const stats: Record<string, DetailedStats> = {};
                  statsRes.data.forEach((s: any) => {
                      stats[s.chapter_id] = { total: Number(s.total_count), easy: Number(s.easy_count), medium: Number(s.medium_count), hard: Number(s.hard_count), figures: Number(s.figure_count) };
                  });
                  setChapterStats(stats);
              }
          }
      }
  };

  const getTypeBadgeStyle = (type: string) => {
      switch(type) {
          case 'mcq': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'matching': return 'bg-orange-100 text-orange-700 border-orange-200';
          case 'reasoning': return 'bg-purple-100 text-purple-700 border-purple-200';
          case 'statements': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
          default: return 'bg-slate-100 text-slate-600 border-slate-200';
      }
  };

  const getTypeShortName = (type: string) => {
      switch(type) {
          case 'mcq': return 'MCQ';
          case 'matching': return 'MAT';
          case 'reasoning': return 'ASR';
          case 'statements': return 'STM';
          default: return type.substring(0,3).toUpperCase();
      }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans animate-fade-in">
        <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex flex-col gap-4 shadow-sm z-20">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <iconify-icon icon="mdi:database-search-outline" className="text-amber-500" />
                    Question Bank
                </h1>
                <div className="flex items-center gap-3">
                    {isKBLoading ? (
                        <div className="w-32 h-8 bg-slate-100 animate-pulse rounded-lg" />
                    ) : (
                        <div className="flex gap-2">
                            <select 
                                value={selectedKbId || ''} 
                                onChange={e => setSelectedKbId(e.target.value)} 
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-slate-600 outline-none focus:border-indigo-500"
                            >
                                {kbList.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                            </select>
                            <button 
                                onClick={handleToggleStats}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${showKbStats ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200 hover:text-indigo-600 hover:border-indigo-200'}`}
                                title="Knowledge Base Stats"
                            >
                                <iconify-icon icon="mdi:chart-box-outline" width="18" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
            
            {/* KB Stats Panel */}
            {showKbStats && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 animate-slide-up shadow-inner">
                    {isKbStatsLoading ? (
                        <div className="flex items-center justify-center py-2 text-slate-400 gap-2 text-xs font-bold uppercase tracking-widest">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></div>
                            Calculating Overview...
                        </div>
                    ) : kbStats ? (
                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="flex flex-col items-start pr-6 border-r border-slate-200 min-w-[120px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Volume</span>
                                <span className="text-3xl font-black text-slate-800">{kbStats.total}</span>
                            </div>
                            
                            <div className="flex-1 w-full space-y-2">
                                <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500 tracking-wide">
                                    <span>Difficulty Distribution</span>
                                    <span>E: {kbStats.easy} / M: {kbStats.medium} / H: {kbStats.hard}</span>
                                </div>
                                <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${(kbStats.easy / (kbStats.total || 1)) * 100}%` }}></div>
                                    <div className="bg-amber-500 h-full" style={{ width: `${(kbStats.medium / (kbStats.total || 1)) * 100}%` }}></div>
                                    <div className="bg-rose-500 h-full" style={{ width: `${(kbStats.hard / (kbStats.total || 1)) * 100}%` }}></div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 max-w-sm">
                                {Object.entries(kbStats.types).map(([type, count]) => (
                                    <div key={type} className="px-2 py-1 rounded bg-white border border-slate-200 text-[9px] font-bold uppercase text-slate-600 shadow-sm">
                                        {getTypeShortName(type)}: {count}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-2 text-xs text-slate-400">No data available for this Knowledge Base.</div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide pb-2">
                    {isClassesLoading ? (
                        <div className="flex gap-4"><div className="w-16 h-4 bg-slate-100 animate-pulse rounded"/><div className="w-16 h-4 bg-slate-100 animate-pulse rounded"/></div>
                    ) : (
                        classes.map(cls => (
                            <button
                                key={cls.id}
                                onClick={() => setSelectedClassId(cls.id)}
                                className={`text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors ${selectedClassId === cls.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {cls.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    {isSubjectsLoading ? (
                        <div className="flex gap-3"><div className="w-20 h-6 bg-slate-100 animate-pulse rounded-full"/><div className="w-20 h-6 bg-slate-100 animate-pulse rounded-full"/></div>
                    ) : (
                        subjects.map(sub => (
                            <button
                                key={sub.id}
                                onClick={() => setSelectedSubjectId(sub.id)}
                                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border whitespace-nowrap transition-all ${selectedSubjectId === sub.id ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200'}`}
                            >
                                {sub.name}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            <aside className="w-80 border-r border-slate-800 flex flex-col shrink-0 bg-slate-900 text-slate-300">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chapters</span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{chapters.length} Items</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {isChaptersLoading ? (
                        <div className="space-y-3">
                            {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : chapters.length > 0 ? (
                        chapters.map(c => {
                            const stats = chapterStats[c.id] || { total: 0, easy: 0, medium: 0, hard: 0, figures: 0 };
                            const isSelected = selectedChapterId === c.id;
                            const isAdded = targetChapters.some(tc => tc.id === c.id);
                            
                            return (
                                <div 
                                    key={c.id} 
                                    onClick={() => setSelectedChapterId(c.id)}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col gap-2 ${
                                        isSelected 
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                                            : 'bg-slate-800/50 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between min-w-0 gap-2">
                                        <p className={`text-[11px] font-black uppercase leading-tight truncate flex-1 ${isSelected ? 'text-white' : 'text-slate-400'}`}>{c.name}</p>
                                        <button
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if(isAdded) removeChapterFromForge(c.id);
                                                else addChapterToForge(c); 
                                            }}
                                            className={`w-6 h-6 rounded-md flex items-center justify-center ${isAdded ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-500'}`}
                                        >
                                            <iconify-icon icon={isAdded ? "mdi:check" : "mdi:plus"} width="14" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${isSelected ? 'bg-indigo-500 border-indigo-400 text-indigo-100' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>{stats.total} Qs</span>
                                        {stats.figures > 0 && (
                                            <span className="text-[8px] font-bold text-indigo-300 bg-indigo-900/40 px-1.5 py-0.5 rounded border border-indigo-800 flex items-center gap-1">
                                                <iconify-icon icon="mdi:image-outline" width="10" /> {stats.figures}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-20 text-slate-600 text-[10px] font-bold uppercase tracking-widest italic">Select Subject</div>
                    )}
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 relative">
                {/* ... (Main Content for Browse/Forge remains largely unchanged, just ensuring logic) ... */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setMode('browse')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${mode === 'browse' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Browse</button>
                        <button onClick={() => setMode('create')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${mode === 'create' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Forge</button>
                    </div>
                    {mode === 'browse' && selectedChapterId && (
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Qs:</span>
                            <span className="text-xs font-black text-slate-700">{totalChapterQuestions > 0 ? totalChapterQuestions : questions.length}{hasMore ? '+' : ''}</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {mode === 'browse' ? (
                        selectedChapterId ? (
                            questions.length > 0 || isLoadingQuestions ? (
                                <div className="space-y-4">
                                    {questions.map((q, idx) => (
                                        <div key={q.id || idx} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all group relative">
                                            <button onClick={() => q.id && handleDelete(q.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-all"><iconify-icon icon="mdi:trash-can-outline" /></button>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border ${
                                                    q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                    'bg-rose-50 text-rose-600 border-rose-100'
                                                }`}>{q.difficulty}</span>
                                                <span className={`border px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider ${getTypeBadgeStyle(q.question_type)}`}>{getTypeShortName(q.question_type)}</span>
                                                {q.page_number && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 px-2 py-0.5 rounded border border-slate-100">P.{q.page_number}</span>}
                                            </div>
                                            {q.figure_url && <img src={q.figure_url} className="mb-4 max-w-sm rounded-xl border border-slate-100 shadow-sm" />}
                                            <div className="text-sm font-medium text-slate-700 leading-relaxed mb-3">{renderWithSmiles(parsePseudoLatexAndMath(q.question_text), 100)}</div>
                                            <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-slate-100">
                                                {q.options.map((opt, i) => (
                                                    <div key={i} className={`text-xs ${i === q.correct_index ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
                                                        {String.fromCharCode(65 + i)}. {renderWithSmiles(parsePseudoLatexAndMath(opt), 80)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {isLoadingQuestions && (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    
                                    {!isLoadingQuestions && hasMore && (
                                        <button 
                                            onClick={handleLoadMore}
                                            className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        >
                                            Load More Questions
                                        </button>
                                    )}
                                </div>
                            ) : <div className="text-center py-20 text-slate-400 font-black uppercase tracking-widest">Empty chapter.</div>
                        ) : <div className="text-center py-20 text-slate-300 font-black uppercase tracking-widest">Select a chapter from sidebar.</div>
                    ) : (
                        <div className="max-w-5xl mx-auto pb-10">
                            {/* Forge Mode Content (unchanged) */}
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                                {isForging && (
                                    <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                                        <h3 className="text-xl font-black text-slate-800">{forgeStatus}</h3>
                                        <div className="w-64 bg-slate-200 rounded-full h-2 mt-4 overflow-hidden"><div className="bg-indigo-600 h-full" style={{ width: `${forgeProgress}%` }}></div></div>
                                    </div>
                                )}
                                
                                {forgedPreview.length > 0 ? (
                                    <div className="animate-slide-up">
                                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                                            <h3 className="text-lg font-black text-slate-800">Preview ({forgedPreview.length})</h3>
                                            <div className="flex gap-3">
                                                <button onClick={() => setForgedPreview([])} className="px-4 py-2 text-rose-500 font-bold">Discard</button>
                                                <button onClick={handleSavePreviewToDB} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest">Save to DB</button>
                                            </div>
                                        </div>
                                        <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                                            {forgedPreview.map((q, i) => (
                                                <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                                                    <p className="text-sm font-bold text-slate-700 mb-2">{q.question_text}</p>
                                                    {q.figure_url && (
                                                        <div className="mb-3 max-w-[200px] border border-slate-200 rounded-lg overflow-hidden">
                                                            <img src={q.figure_url} alt="Question Figure" className="w-full h-auto block" />
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                                        {q.options.map((o, oi) => <div key={oi}>{String.fromCharCode(65+oi)}. {o}</div>)}
                                                    </div>
                                                    {q.page_number && <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider">Source: P.{q.page_number}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100"><iconify-icon icon="mdi:creation" width="24" /></div>
                                            <h3 className="text-lg font-black text-slate-800 uppercase">AI Forge</h3>
                                        </div>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            <div className="space-y-6">
                                                <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl">
                                                    <h4 className="text-xs font-black text-slate-700 uppercase mb-4">Difficulty</h4>
                                                    <div className="flex gap-3">
                                                        {['easy','medium','hard'].map(d => (
                                                            <div key={d} className="flex-1">
                                                                <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">{d}</label>
                                                                <input type="number" value={globalDiff[d as keyof DifficultyDistribution]} onChange={e => setGlobalDiff({...globalDiff, [d]: parseInt(e.target.value)||0})} className="w-full bg-white border border-slate-200 rounded-xl p-2 text-center font-bold" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Count / Chap</label>
                                                        <input type="number" value={globalCount} onChange={e => setGlobalCount(parseInt(e.target.value))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-bold" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Figures</label>
                                                        <input type="number" value={globalFigureCount} onChange={e => setGlobalFigureCount(parseInt(e.target.value)||0)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-bold" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col h-full min-h-[300px]">
                                                <h4 className="text-xs font-black text-slate-700 uppercase mb-3">Target Chapters ({targetChapters.length})</h4>
                                                <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-200 p-2 overflow-y-auto space-y-2">
                                                    {targetChapters.map(tc => (
                                                        <div key={tc.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                            <p className="text-[10px] font-black text-slate-700 uppercase truncate max-w-[150px]">{tc.name}</p>
                                                            <button onClick={() => removeChapterFromForge(tc.id)} className="text-rose-500 hover:text-rose-700 transition-colors"><iconify-icon icon="mdi:close" /></button>
                                                        </div>
                                                    ))}
                                                    {targetChapters.length === 0 && <p className="text-center text-slate-400 text-[10px] font-bold uppercase py-10">No chapters selected.</p>}
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={handleAiForge} disabled={isForging} className="w-full mt-8 py-4 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all">Start Forge</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    </div>
  );
};

export default QuestionBankHome;
