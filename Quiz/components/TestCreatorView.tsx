
import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabase/client';
import { Question, SelectedChapter, QuestionType, TypeDistribution } from '../types';

interface TestCreatorViewProps {
  onClose: () => void;
  onStart: (options: any) => void;
  isLoading: boolean;
  loadingStep?: string;
  initialChapters?: SelectedChapter[];
  initialTopic?: string;
}

interface DetailedStats {
    total: number;
    easy: number;
    medium: number;
    hard: number;
    figures: number;
    types: Record<string, number>;
}

const TestCreatorView: React.FC<TestCreatorViewProps> = ({ onClose, onStart, isLoading, loadingStep, initialChapters, initialTopic }) => {
  const [kbList, setKbList] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [chapterStats, setChapterStats] = useState<Record<string, DetailedStats>>({});
  
  const [isKBLoading, setIsKBLoading] = useState(true);
  const [isClassesLoading, setIsClassesLoading] = useState(false);
  const [isSubjectsLoading, setIsSubjectsLoading] = useState(false);
  const [isChaptersLoading, setIsChaptersLoading] = useState(false);

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [sourceMode, setSourceMode] = useState<'database' | 'upload'>('database');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedChapters, setSelectedChapters] = useState<SelectedChapter[]>(initialChapters || []);
  const [topic, setTopic] = useState(initialTopic || 'New Comprehensive Assessment');
  
  const [globalDifficultyMix, setGlobalDifficultyMix] = useState({ easy: 30, medium: 50, hard: 20 });
  const [globalTypeMix, setGlobalTypeMix] = useState<TypeDistribution>({ mcq: 100, reasoning: 0, matching: 0, statements: 0 });
  const [useSmiles, setUseSmiles] = useState(false);

  // Derived global figure count for display/control
  const totalFigures = selectedChapters.reduce((sum, c) => sum + (c.figureCount || 0), 0);

  useEffect(() => {
    const fetchKBs = async () => {
      setIsKBLoading(true);
      try {
        const { data, error } = await supabase.from('knowledge_bases').select('id, name').order('name');
        if (error) throw error;
        setKbList(data || []);
        if (data && data.length > 0) setSelectedKbId(data[0].id);
      } catch (err) {
        console.error("KB Fetch Error:", err);
      } finally {
        setIsKBLoading(false);
      }
    };
    fetchKBs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!selectedKbId || searchQuery.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        // OPTIMIZATION: Only select lightweight fields. Exclude 'raw_text'.
        const { data, error } = await supabase
          .from('chapters')
          .select('id, name, subject_id, subject_name, class_id, class_name, kb_id')
          .eq('kb_id', selectedKbId)
          .ilike('name', `%${searchQuery}%`)
          .limit(50);

        if (error) throw error;
        
        const missingStatIds = (data || []).filter(c => !chapterStats[c.id]).map(c => c.id);
        
        if (missingStatIds.length > 0) {
            const { data: statsData } = await supabase.rpc('get_chapters_bulk_stats', { target_chapter_ids: missingStatIds });
            if (statsData) {
                const newStats = { ...chapterStats };
                statsData.forEach((s: any) => {
                    newStats[s.chapter_id] = {
                        total: Number(s.total_count),
                        easy: Number(s.easy_count),
                        medium: Number(s.medium_count),
                        hard: Number(s.hard_count),
                        figures: Number(s.figure_count),
                        types: { mcq: Number(s.mcq_count) }
                    };
                });
                setChapterStats(newStats);
            }
        }
        
        setSearchResults(data || []);
      } catch (e) {
        console.error("Global Search Error:", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedKbId]);

  useEffect(() => {
      if (!selectedKbId) return;
      const fetchClasses = async () => {
          setIsClassesLoading(true);
          try {
              const { data, error } = await supabase.from('classes').select('*').eq('kb_id', selectedKbId).order('name');
              if (error) throw error;
              setClasses(data || []);
              if (data && data.length > 0) setSelectedClassId(data[0].id);
              else setSelectedClassId(null);
          } finally {
              setIsClassesLoading(false);
          }
      };
      fetchClasses();
  }, [selectedKbId]);

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
              else setSelectedSubjectId(null);
          } finally {
              setIsSubjectsLoading(false);
          }
      };
      fetchSubjects();
  }, [selectedClassId]);

  useEffect(() => {
      if (!selectedSubjectId) {
          setChapters([]);
          return;
      }
      const fetchChapterData = async () => {
          setIsChaptersLoading(true);
          try {
              // OPTIMIZATION: Only select lightweight fields. Exclude 'raw_text'.
              const [chapsRes, statsRes] = await Promise.all([
                  supabase.from('chapters')
                    .select('id, name, chapter_number, subject_id, subject_name, class_id, class_name')
                    .eq('subject_id', selectedSubjectId)
                    .order('chapter_number', { ascending: true }),
                  supabase.rpc('get_subject_chapter_stats', { target_subject_id: selectedSubjectId })
              ]);

              if (chapsRes.error) throw chapsRes.error;
              setChapters(chapsRes.data || []);

              const stats = { ...chapterStats };
              if (!statsRes.error && statsRes.data) {
                  statsRes.data.forEach((s: any) => {
                      stats[s.chapter_id] = {
                          total: Number(s.total_count),
                          easy: Number(s.easy_count),
                          medium: Number(s.medium_count),
                          hard: Number(s.hard_count),
                          figures: Number(s.figure_count),
                          types: { mcq: Number(s.mcq_count) }
                      };
                  });
              }
              setChapterStats(stats);
          } catch (e) {
              console.error("Chapter Load Error:", e);
          } finally {
              setIsChaptersLoading(false);
          }
      };
      fetchChapterData();
  }, [selectedSubjectId]);

  const handleDiffChange = (key: 'easy' | 'medium' | 'hard', value: string) => {
      const val = Math.min(100, Math.max(0, parseInt(value) || 0));
      setGlobalDifficultyMix(prev => ({ ...prev, [key]: val }));
  };

  const handleTypeChange = (key: keyof TypeDistribution, value: string) => {
      const val = Math.min(100, Math.max(0, parseInt(value) || 0));
      setGlobalTypeMix(prev => ({ ...prev, [key]: val }));
  };

  const applyNeetPreset = () => {
      setGlobalTypeMix({ mcq: 70, reasoning: 15, matching: 10, statements: 5 });
      setGlobalDifficultyMix({ easy: 30, medium: 50, hard: 20 });
  };

  const handleToggleChapter = (chapter: any) => {
    const exists = selectedChapters.find(sc => sc.id === chapter.id);
    if (exists) {
        setSelectedChapters(prev => prev.filter(sc => sc.id !== chapter.id));
    } else {
        const stats = chapterStats[chapter.id]?.total || 0;
        let defaultCount = Math.min(45, stats);
        if (stats > 0 && defaultCount === 0) defaultCount = 1;

        setSelectedChapters(prev => [...prev, { 
            id: chapter.id, 
            name: chapter.name, 
            subjectName: chapter.subject_name || subjects.find(s => s.id === chapter.subject_id)?.name || 'Unknown', 
            className: chapter.class_name || classes.find(l => l.id === chapter.class_id)?.name || 'Unknown', 
            count: defaultCount, 
            figureCount: 0, 
            difficulty: 'Global', 
            source: 'db',
            styleCounts: { mcq: defaultCount },
            selectionMode: 'count'
        }]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          
          // Auto-detect number of images in the content
          const imgMatches = content.match(/data:image\/[^;]+;base64/g);
          const imgCount = imgMatches ? imgMatches.length : 0;
          
          // Strategy: For uploads, we prioritize figure questions if images exist.
          // STRICT RULE: Multiples of 6.
          // Start with 6 if any images found, else 0 (text only mode, though unlikely for this use case)
          const initialFigures = imgCount > 0 ? 6 : 0;
          
          // For uploads, total questions = figure questions initially
          const totalQs = initialFigures > 0 ? initialFigures : 20;

          const virtualId = `upload-${Date.now()}`;
          const newChapter: SelectedChapter = {
              id: virtualId,
              name: file.name.replace(/\.[^/.]+$/, ""),
              subjectName: 'Uploaded Content',
              className: 'File Source',
              count: totalQs, 
              figureCount: initialFigures, // Auto-set based on content
              difficulty: 'Global',
              source: 'upload',
              content: content,
              styleCounts: { mcq: totalQs },
              selectionMode: 'count'
          };
          
          setSelectedChapters(prev => [...prev, newChapter]);
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      
      reader.readAsText(file);
  };

  const updateUploadFigures = (id: string, delta: number) => {
      setSelectedChapters(prev => prev.map(sc => {
          if (sc.id !== id) return sc;
          // Step by 6, min 6 (if originally had figures) or 0
          const current = sc.figureCount || 0;
          let newCount = current + delta;
          if (newCount < 6) newCount = 6; 
          if (newCount > 60) newCount = 60; // Reasonable cap
          
          // Sync total count with figure count for uploads
          return { ...sc, count: newCount, figureCount: newCount };
      }));
  };

  const updateChapterCount = (id: string, delta: number) => {
      setSelectedChapters(prev => prev.map(sc => {
          if (sc.id !== id) return sc;
          const maxAvailable = sc.source === 'upload' ? 999 : (chapterStats[id]?.total || 999);
          const newCount = Math.min(maxAvailable, Math.max(1, sc.count + delta));
          return { ...sc, count: newCount };
      }));
  };

  const setChapterCountDirect = (id: string, value: string) => {
      const num = parseInt(value) || 0;
      setSelectedChapters(prev => prev.map(sc => {
          if (sc.id !== id) return sc;
          const maxAvailable = sc.source === 'upload' ? 999 : (chapterStats[id]?.total || 999);
          const newCount = Math.min(maxAvailable, Math.max(0, num));
          return { ...sc, count: newCount };
      }));
  };

  const updateChapterFigures = (id: string, delta: number) => {
      setSelectedChapters(prev => prev.map(sc => {
          if (sc.id !== id) return sc;
          // Cannot exceed total questions count
          const newCount = Math.min(sc.count, Math.max(0, (sc.figureCount || 0) + delta));
          return { ...sc, figureCount: newCount };
      }));
  };

  const setChapterFiguresDirect = (id: string, value: string) => {
      const num = parseInt(value) || 0;
      setSelectedChapters(prev => prev.map(sc => {
          if (sc.id !== id) return sc;
          const newCount = Math.min(sc.count, Math.max(0, num));
          return { ...sc, figureCount: newCount };
      }));
  };

  // Bulk update all chapters' figure counts when global control changes
  const handleGlobalFigureChange = (value: string) => {
      const val = Math.max(0, parseInt(value) || 0);
      if (selectedChapters.length === 0) return;
      
      const figsPerChap = Math.floor(val / selectedChapters.length);
      const remainder = val % selectedChapters.length;
      
      setSelectedChapters(prev => prev.map((c, idx) => {
          // If upload, ignore global distribution logic to respect multiples of 6 constraint strictly
          if (c.source === 'upload') return c; 
          return {
            ...c,
            figureCount: Math.min(c.count, figsPerChap + (idx < remainder ? 1 : 0))
          };
      }));
  };

  const handleCreateTest = () => {
    if (selectedChapters.length === 0) return alert("Please add at least one chapter or file.");
    
    // We now use the figureCount already set on each chapter (either manually or via global distribution)
    const chaptersWithStrategy = selectedChapters.map(c => ({
        ...c,
        difficulty: 'Global' as const,
        // figureCount is already set on 'c'
        source: c.source === 'upload' ? 'ai' : c.source 
    }));

    onStart({ 
        mode: 'multi-ai', 
        topic, 
        chapters: chaptersWithStrategy, 
        useGlobalDifficulty: true, 
        globalDifficultyMix, 
        globalTypeMix, 
        globalFigureCount: totalFigures, // Pass aggregate for reference
        totalQuestions: selectedChapters.reduce((s, c) => s + c.count, 0),
        useSmiles 
    });
  };

  const totalQuestions = selectedChapters.reduce((sum, c) => sum + c.count, 0);
  const displayChapters = searchQuery.trim().length >= 2 ? searchResults : chapters;
  const typeSum = globalTypeMix.mcq + globalTypeMix.reasoning + globalTypeMix.matching + globalTypeMix.statements;

  if (isLoading) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white rounded-3xl p-12 text-center">
        <div className="w-16 h-16 border-4 border-indigo-50 border-t-accent rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{loadingStep || 'Forging Assessment...'}</h2>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 font-sans animate-fade-in overflow-hidden">
      <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-20 shrink-0 shadow-sm">
        <button onClick={onClose} className="p-2 -ml-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors flex items-center gap-2 group">
            <iconify-icon icon="mdi:arrow-left" width="20" />
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-slate-800">Back</span>
        </button>
        <div className="h-6 w-px bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <iconify-icon icon="mdi:database-search" width="20" />
            </div>
            <div>
                <h1 className="text-sm font-black text-slate-800 uppercase tracking-wide">{initialChapters ? 'Blueprint Editor' : 'Test Studio'}</h1>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{initialChapters ? 'Modify existing structure' : 'Database Assembly'}</p>
            </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden p-6">
        <div className="flex-1 lg:w-[50%] flex flex-col gap-4 min-h-0">
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex flex-col gap-5 flex-1 min-h-0">
            <div className="flex items-center justify-between gap-3 shrink-0">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">1. Select Content</h2>
              
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setSourceMode('database')} className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${sourceMode === 'database' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Database</button>
                  <button onClick={() => setSourceMode('upload')} className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${sourceMode === 'upload' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Upload</button>
              </div>
            </div>

            {sourceMode === 'database' ? (
                <>
                    <div className="flex justify-between items-center gap-2">
                        {isKBLoading ? (
                            <div className="w-24 h-6 bg-slate-100 animate-pulse rounded-lg" />
                        ) : (
                            <select value={selectedKbId || ''} onChange={e => setSelectedKbId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[9px] font-black text-slate-600 outline-none focus:border-indigo-500 appearance-none cursor-pointer">
                                {kbList.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                            </select>
                        )}
                    </div>

                    <div className={`shrink-0 transition-all duration-300 ${searchQuery.trim().length >= 2 ? 'opacity-30 pointer-events-none scale-95 blur-[1px]' : ''}`}>
                    <div className="border-b border-slate-100">
                        <div className="flex items-center gap-8 overflow-x-auto scrollbar-hide py-1">
                        {isClassesLoading ? (
                            <div className="flex gap-4 py-2"><div className="w-16 h-4 bg-slate-100 rounded animate-pulse"/><div className="w-16 h-4 bg-slate-100 rounded animate-pulse"/></div>
                        ) : (
                            classes.map(cls => (
                            <button key={cls.id} onClick={() => setSelectedClassId(cls.id)} className={`pb-3 text-xs font-black uppercase tracking-[0.15em] transition-all relative shrink-0 ${selectedClassId === cls.id ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                {cls.name}
                                {selectedClassId === cls.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full" />}
                            </button>
                            ))
                        )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-3 border-t border-slate-50 mt-1">
                        {isSubjectsLoading ? (
                            <div className="flex gap-2"><div className="w-20 h-6 bg-slate-100 rounded-full animate-pulse"/><div className="w-20 h-6 bg-slate-100 rounded-full animate-pulse"/></div>
                        ) : (
                            subjects.map(s => (
                            <button key={s.id} onClick={() => setSelectedSubjectId(s.id)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${selectedSubjectId === s.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-emerald-200'}`}>
                                {s.name}
                            </button>
                            ))
                        )}
                    </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                    <div className="relative mb-4 shrink-0">
                            <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 flex items-center justify-center ${isSearching ? 'animate-spin' : ''}`}>
                                <iconify-icon icon={isSearching ? "mdi:loading" : "mdi:magnify"} />
                            </div>
                            <input 
                                type="text" 
                                placeholder="Search chapters across entire base..." 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-12 py-3 text-xs font-bold outline-none focus:border-indigo-500 shadow-inner" 
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                                    <iconify-icon icon="mdi:close-circle" />
                                </button>
                            )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {isChaptersLoading || isSearching ? (
                            <div className="space-y-4">
                                {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-50 rounded-3xl animate-pulse"/>)}
                            </div>
                        ) : displayChapters.length > 0 ? (
                            displayChapters.map(c => {
                                const selected = selectedChapters.find(sc => sc.id === c.id);
                                const stats = chapterStats[c.id] || { total: 0, easy: 0, medium: 0, hard: 0, figures: 0, types: {} };
                                return (
                                    <div key={c.id} className={`p-4 rounded-3xl border transition-all animate-fade-in group ${selected ? 'border-emerald-500 bg-emerald-50/50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-300 shadow-sm'}`}>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4 cursor-pointer flex-1 min-w-0" onClick={() => handleToggleChapter(c)}>
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shrink-0 ${selected ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
                                                    <iconify-icon icon="mdi:database-check" width="20" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-[11px] font-black uppercase tracking-tight truncate ${selected ? 'text-emerald-900' : 'text-slate-600'}`}>{c.name}</p>
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {searchQuery.trim().length >= 2 && (
                                                            <span className="text-[7px] font-black text-indigo-500 uppercase bg-indigo-50 px-1.5 rounded border border-indigo-100">
                                                                {c.subject_name || 'Subject'} • {c.class_name || 'Class'}
                                                            </span>
                                                        )}
                                                        <span className="text-[7px] font-black text-slate-500 uppercase bg-slate-100 px-1.5 rounded border border-slate-200">Available: {stats.total}</span>
                                                        {stats.easy > 0 && <span className="text-[7px] font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-100">E:{stats.easy}</span>}
                                                        {stats.medium > 0 && <span className="text-[7px] font-bold text-amber-600 bg-amber-50 px-1.5 rounded border border-amber-100">M:{stats.medium}</span>}
                                                        {stats.hard > 0 && <span className="text-[7px] font-bold text-rose-600 bg-rose-50 px-1.5 rounded border border-rose-100">H:{stats.hard}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => handleToggleChapter(c)} className={`w-9 h-9 rounded-xl transition-all flex items-center justify-center border shrink-0 ${selected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-300 hover:text-emerald-500 border-slate-100'}`}><iconify-icon icon={selected ? "mdi:check" : "mdi:plus"} width="20" /></button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : searchQuery.trim().length >= 2 ? (
                            <div className="text-center py-10">
                                <iconify-icon icon="mdi:database-off-outline" width="48" className="text-slate-200 mb-2" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No chapters found in "{kbList.find(k => k.id === selectedKbId)?.name}"</p>
                            </div>
                        ) : !selectedSubjectId ? (
                            <div className="text-center py-10 text-slate-300 text-xs font-bold uppercase tracking-widest italic">Select a Subject or Search</div>
                        ) : (
                            <div className="text-center py-10 text-slate-300 text-xs font-bold uppercase tracking-widest italic">Empty Subject</div>
                        )}
                    </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 hover:bg-white hover:border-emerald-200 transition-all cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
                        <iconify-icon icon="mdi:file-upload-outline" className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-lg font-black text-slate-700">Drop Chapter File</h3>
                        <p className="text-xs text-slate-400 font-medium max-w-[200px] mx-auto">Supports HTML (with images) or Markdown</p>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest pt-2 bg-emerald-50 px-2 py-1 rounded inline-block">Use HTML for automatic figure support</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".md,.html,.txt" onChange={handleFileUpload} className="hidden" />
                </div>
            )}
          </div>
        </div>

        {/* Right Panel: Config (State preserved) */}
        <div className="flex-1 lg:w-[50%] flex flex-col gap-4 min-h-0">
          <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl flex flex-col flex-1 min-h-0 relative">
            <div className="flex items-center justify-between mb-8 shrink-0">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <iconify-icon icon="mdi:cog-outline" className="text-indigo-400" /> 2. Configuration
                </h2>
                <span className="text-[9px] font-black bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-full uppercase border border-indigo-500/20">{selectedChapters.length} Selected</span>
            </div>

            {/* Rest of the UI remains exactly the same as previous */}
            <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 block mb-2 tracking-widest">Assessment Title</label>
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-slate-800 border-2 border-slate-700/50 rounded-2xl px-5 py-4 text-sm font-black text-white outline-none focus:border-indigo-500" placeholder="e.g. Midterm Physics" />
              </div>

              {/* Global Strategy Block */}
              <div className="p-6 bg-slate-800/40 rounded-[2rem] border border-slate-700/50">
                 <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <iconify-icon icon="mdi:auto-fix" /> Global Strategy
                    </h3>
                    <button onClick={applyNeetPreset} className="text-[9px] font-black text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all">NEET Preset</button>
                 </div>
                 
                 <div className="space-y-6">
                    {/* Difficulty */}
                    <div>
                        <div className="flex justify-between items-center mb-3 px-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Difficulty Mix (%)</label>
                            <span className="text-[9px] font-black text-slate-600">Sum: {globalDifficultyMix.easy + globalDifficultyMix.medium + globalDifficultyMix.hard}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {['easy', 'medium', 'hard'].map(level => (
                                <div key={level} className="space-y-1.5">
                                    <label className="text-[8px] font-bold text-slate-400 uppercase text-center block">{level}</label>
                                    <input 
                                        type="number" 
                                        value={globalDifficultyMix[level as keyof typeof globalDifficultyMix]} 
                                        onChange={e => handleDiffChange(level as any, e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 text-center text-xs font-black text-white outline-none focus:border-indigo-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Question Types */}
                    <div>
                        <div className="flex justify-between items-center mb-3 px-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Question Styles (%)</label>
                            <span className={`text-[9px] font-black ${typeSum === 100 ? 'text-emerald-500' : 'text-rose-500'}`}>Sum: {typeSum}%</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { key: 'mcq', label: 'MCQ' },
                                { key: 'reasoning', label: 'ASR' },
                                { key: 'matching', label: 'Match' },
                                { key: 'statements', label: 'STM' }
                            ].map(type => (
                                <div key={type.key} className="space-y-1.5">
                                    <label className="text-[8px] font-bold text-slate-400 uppercase text-center block">{type.label}</label>
                                    <input 
                                        type="number" 
                                        value={globalTypeMix[type.key as keyof TypeDistribution]} 
                                        onChange={e => handleTypeChange(type.key as any, e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 text-center text-xs font-black text-white outline-none focus:border-indigo-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Total Figure Questions (Distribute)</label>
                            <div className="flex items-center gap-3">
                                <button onClick={() => handleGlobalFigureChange(String(totalFigures - 1))} className="w-8 h-8 bg-slate-700 text-white rounded-lg flex items-center justify-center"><iconify-icon icon="mdi:minus" /></button>
                                <input 
                                    type="number" 
                                    value={totalFigures} 
                                    onChange={e => handleGlobalFigureChange(e.target.value)}
                                    className="flex-1 bg-transparent border-b border-slate-700 focus:border-indigo-500 text-center text-lg font-black text-white outline-none min-w-0"
                                />
                                <button onClick={() => handleGlobalFigureChange(String(totalFigures + 1))} className="w-8 h-8 bg-slate-700 text-white rounded-lg flex items-center justify-center"><iconify-icon icon="mdi:plus" /></button>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Chemistry 2D</label>
                            <button 
                                onClick={() => setUseSmiles(!useSmiles)}
                                className={`w-full py-2 rounded-xl border-2 transition-all font-black text-[10px] uppercase tracking-wider ${useSmiles ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                            >
                                {useSmiles ? 'Enabled' : 'Disabled'}
                            </button>
                        </div>
                    </div>
                 </div>
              </div>

              {/* Selected Chapters List */}
              <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-2 block tracking-widest">Chapters Blueprint</label>
                {selectedChapters.map(sc => (
                    <div key={sc.id} className="p-5 bg-slate-800/50 rounded-3xl border border-slate-700/50 group/item">
                        <div className="flex justify-between items-center mb-4">
                            <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-black text-slate-300 uppercase truncate block">{sc.name}</span>
                                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">
                                    {sc.source === 'upload' ? <span className="text-emerald-500 flex items-center gap-1"><iconify-icon icon="mdi:file-document-outline"/> File Source</span> : `${sc.subjectName} • ${sc.className}`}
                                </span>
                            </div>
                            <button onClick={() => setSelectedChapters(p => p.filter(x => x.id !== sc.id))} className="text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover/item:opacity-100"><iconify-icon icon="mdi:close-circle" width="18" /></button>
                        </div>
                        
                        {/* Custom Control Logic based on Source */}
                        {sc.source === 'upload' ? (
                            // UPLOAD SPECIFIC CONTROLS (FIGURE BATCHES ONLY)
                            <div className="bg-indigo-500/10 rounded-xl p-3 border border-indigo-500/20">
                                <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                    <iconify-icon icon="mdi:image-multiple" /> Figure Batch Grid (6x)
                                </label>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => updateUploadFigures(sc.id, -6)} className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg active:scale-90 transition-transform"><iconify-icon icon="mdi:minus" /></button>
                                    <div className="flex-1 text-center">
                                        <span className="text-2xl font-black text-white block leading-none">{sc.figureCount}</span>
                                        <span className="text-[7px] font-bold text-indigo-400 uppercase tracking-widest">Total Figures</span>
                                    </div>
                                    <button onClick={() => updateUploadFigures(sc.id, 6)} className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg active:scale-90 transition-transform"><iconify-icon icon="mdi:plus" /></button>
                                </div>
                                <div className="mt-3 text-center">
                                    <span className="text-[8px] font-bold text-slate-500 bg-slate-900/50 px-2 py-1 rounded-full border border-slate-700">Generates {Math.ceil((sc.figureCount || 0) / 6)} Grid Images</span>
                                </div>
                            </div>
                        ) : (
                            // STANDARD DATABASE CONTROLS
                            <div className="space-y-4">
                                {/* Total Questions Control */}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-3 flex-1 bg-slate-900/50 rounded-xl p-2 border border-slate-700/50">
                                        <button onClick={() => updateChapterCount(sc.id, -1)} className="w-6 h-6 bg-slate-700 text-white rounded-lg flex items-center justify-center active:scale-90 transition-transform"><iconify-icon icon="mdi:minus" width="14" /></button>
                                        <div className="flex-1 text-center">
                                            <input 
                                                type="number" 
                                                value={sc.count} 
                                                onChange={e => setChapterCountDirect(sc.id, e.target.value)}
                                                className="w-full bg-transparent text-center text-sm font-black text-white outline-none"
                                            />
                                            <p className="text-[7px] text-slate-500 uppercase font-black">Total</p>
                                        </div>
                                        <button onClick={() => updateChapterCount(sc.id, 1)} className="w-6 h-6 bg-slate-700 text-white rounded-lg flex items-center justify-center active:scale-90 transition-transform"><iconify-icon icon="mdi:plus" width="14" /></button>
                                    </div>
                                    
                                    {/* Figure Questions Control */}
                                    <div className="flex items-center gap-3 flex-1 bg-indigo-900/20 rounded-xl p-2 border border-indigo-500/20">
                                        <button onClick={() => updateChapterFigures(sc.id, -1)} className="w-6 h-6 bg-indigo-900 text-indigo-200 rounded-lg flex items-center justify-center active:scale-90 transition-transform hover:bg-indigo-800"><iconify-icon icon="mdi:minus" width="14" /></button>
                                        <div className="flex-1 text-center">
                                            <input 
                                                type="number" 
                                                value={sc.figureCount || 0} 
                                                onChange={e => setChapterFiguresDirect(sc.id, e.target.value)}
                                                className="w-full bg-transparent text-center text-sm font-black text-indigo-200 outline-none"
                                            />
                                            <p className="text-[7px] text-indigo-400 uppercase font-black">Figures</p>
                                        </div>
                                        <button onClick={() => updateChapterFigures(sc.id, 1)} className="w-6 h-6 bg-indigo-900 text-indigo-200 rounded-lg flex items-center justify-center active:scale-90 transition-transform hover:bg-indigo-800"><iconify-icon icon="mdi:plus" width="14" /></button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-800 shrink-0">
               <button 
                onClick={handleCreateTest}
                disabled={totalQuestions === 0}
                className={`w-full py-6 rounded-3xl font-black uppercase tracking-[0.25em] text-[13px] shadow-2xl transition-all disabled:opacity-30 flex items-center justify-center gap-4 active:scale-[0.98] ${initialChapters ? 'bg-indigo-600 shadow-indigo-600/40 hover:bg-indigo-500' : 'bg-emerald-600 shadow-emerald-600/40 hover:bg-emerald-500'}`}
               >
                  <iconify-icon icon={initialChapters ? "mdi:update" : "mdi:content-save-all"} width="24" />
                  {initialChapters ? 'Update Assessment' : 'Initiate Forging'}
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestCreatorView;
