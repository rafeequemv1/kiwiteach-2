
import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabase/client';
import { SelectedChapter, TypeDistribution, CreateTestOptions, QuestionType, Question } from '../types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { GoogleGenAI, Type } from "@google/genai";
import { ensureApiKey } from '../../services/geminiService';
import QuestionPaperItem from './QuestionPaperItem';
import {
    fetchEligibleQuestions,
    fetchUsedQuestionsForClass,
} from '../services/questionUsageService';

interface TestCreatorViewProps {
  onClose: () => void;
  onStart: (options: CreateTestOptions) => void;
  onSaveDraft?: (options: CreateTestOptions) => Promise<void>;
  isLoading: boolean;
  loadingStep?: string;
  initialChapters?: SelectedChapter[];
  initialTopic?: string;
  initialManualQuestions?: Question[];
}

interface KBItem { id: string; name: string; }
interface ClassItem { id: string; name: string; }
interface SubjectItem { id: string; name: string; }
interface ChapterItem { 
    id: string; 
    name: string; 
    chapter_number: number; 
    subject_id: string;
    subject_name?: string;
    class_name?: string;
    raw_text?: string;
}

interface ChapterStats {
    total: number;
    easy: number;
    medium: number;
    hard: number;
    mcq: number;
    reasoning: number;
    matching: number;
    statements: number;
    figures: number; 
}

interface InventoryItem {
    id: string;
    name: string;
    selectedCount: number;
    targetCount: number;
    selectedFigures: number;
    difficulties: Record<string, number>;
    styles: Record<string, number>;
    isBlueprint: boolean;
}

const TestCreatorView: React.FC<TestCreatorViewProps> = ({ 
    onClose, 
    onStart,
    onSaveDraft,
    isLoading, 
    loadingStep, 
    initialChapters, 
    initialTopic,
    initialManualQuestions
}) => {
    const [activeMode, setActiveMode] = useState<'auto' | 'manual'>(initialManualQuestions && initialManualQuestions.length > 0 ? 'manual' : 'auto');
    const [distributionMode, setDistributionMode] = useState<'count' | 'percent'>('count');
    const [inventoryViewMode, setInventoryViewMode] = useState<'count' | 'percent'>('count');
    const [manualLayout, setManualLayout] = useState<'grid' | 'list'>('grid');
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);
    const [inventoryFilterChapterId, setInventoryFilterChapterId] = useState<string | null>(null);
    const [totalTarget, setTotalTarget] = useState(50); 
    const [globalFigureCount, setGlobalFigureCount] = useState(0); 
    const [chapterSearch, setChapterSearch] = useState('');
    const [chapterStats, setChapterStats] = useState<Record<string, ChapterStats>>({});

    // --- Chat Assistant State ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
    const [isChatThinking, setIsChatThinking] = useState(false);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const [kbChaptersMap, setKbChaptersMap] = useState<any[]>([]);

    // Manual Mode Config
    const [manualFilters, setManualFilters] = useState({
        figuresOnly: false,
        showChoices: false,
        showExplanations: false,
        showTopics: true,
        fullText: false,
        difficulty: 'all',
        style: 'all'
    });

    const [kbs, setKbs] = useState<KBItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [chapters, setChapters] = useState<ChapterItem[]>([]);
    
    const [selectedKb, setSelectedKb] = useState<string>('');
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedSubject, setSelectedSubject] = useState<string>('');
    const [orgClasses, setOrgClasses] = useState<ClassItem[]>([]);
    const [targetOrgClassId, setTargetOrgClassId] = useState<string>('');
    const [allowPastQuestions, setAllowPastQuestions] = useState(false);
    
    const [topic, setTopic] = useState(initialTopic || '');
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    
    const [blueprint, setBlueprint] = useState<SelectedChapter[]>(initialChapters || []);
    const [globalDiff, setGlobalDiff] = useState({ easy: 30, medium: 50, hard: 20 });
    const [globalTypes, setGlobalTypes] = useState<TypeDistribution>({ mcq: 70, reasoning: 15, matching: 10, statements: 5 });
    const [useGlobalDifficulty, setUseGlobalDifficulty] = useState(true);

    const [currentViewChapter, setCurrentViewChapter] = useState<ChapterItem | null>(null);
    const [questionPool, setQuestionPool] = useState<Question[]>([]);
    const [isPoolFetching, setIsPoolFetching] = useState(false);
    const [selectedManualQuestions, setSelectedManualQuestions] = useState<Question[]>(initialManualQuestions || []);
    const [poolSearch, setPoolSearch] = useState('');

    type MobileSheet = null | 'chapters' | 'matrix';
    const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
    const [isLgLayout, setIsLgLayout] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
    );
    const [mixStripOpen, setMixStripOpen] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = () => setIsLgLayout(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (isLgLayout) setMobileSheet(null);
    }, [isLgLayout]);

    useEffect(() => {
        if (!mobileSheet || isLgLayout) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileSheet(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mobileSheet, isLgLayout]);

    useEffect(() => {
        const fetchKbs = async () => {
            const { data } = await supabase.from('knowledge_bases').select('id, name');
            if (data?.length) { setKbs(data); setSelectedKb(data[0].id); }
        };
        fetchKbs();
    }, []);

    useEffect(() => {
        if (!selectedKb) return;
        supabase.from('kb_classes').select('id, name').eq('kb_id', selectedKb).then(({ data }) => setClasses(data || []));
        supabase.from('chapters').select('id, name, subject_name, class_name').eq('kb_id', selectedKb).then(({ data }) => {
            setKbChaptersMap(data || []);
        });
    }, [selectedKb]);

    useEffect(() => {
        if (!selectedClass) return;
        supabase.from('subjects').select('id, name').eq('class_id', selectedClass).then(({ data }) => setSubjects(data || []));
    }, [selectedClass]);

    useEffect(() => {
        if (!selectedSubject) return;
        supabase.from('chapters').select('*').eq('subject_id', selectedSubject).order('chapter_number').then(({ data }) => {
            setChapters(data || []);
            if (data?.length) {
                if (!currentViewChapter || !data.some(c => c.id === currentViewChapter.id)) {
                    setCurrentViewChapter(data[0]);
                }
                fetchBulkStats(data.map(c => c.id));
            }
        });
    }, [selectedSubject]);

    useEffect(() => {
        supabase.from('classes').select('id, name').order('name').then(({ data }) => {
            setOrgClasses((data || []) as ClassItem[]);
        });
    }, []);

    // FETCH QUESTION POOL FOR MANUAL MODE
    useEffect(() => {
        if (activeMode === 'manual' && currentViewChapter) {
            fetchQuestionPool(currentViewChapter.id);
        }
    }, [currentViewChapter, activeMode, targetOrgClassId, allowPastQuestions]);

    const fetchQuestionPool = async (chapterId: string) => {
        setIsPoolFetching(true);
        try {
            const excluded = selectedManualQuestions.map((q) => q.originalId || q.id).filter(Boolean) as string[];
            let mapped = await fetchEligibleQuestions({
                classId: targetOrgClassId || null,
                chapterId,
                excludeIds: excluded,
                limit: 400,
                allowRepeats: allowPastQuestions,
            });
            if (allowPastQuestions && targetOrgClassId) {
                const used = await fetchUsedQuestionsForClass(targetOrgClassId, chapterId, 120);
                const seen = new Set(mapped.map((q) => q.id));
                used.forEach((q) => {
                    if (!seen.has(q.id)) mapped.push(q);
                });
            }
            setQuestionPool(mapped);
        } catch (e) {
            console.error(e);
        } finally {
            setIsPoolFetching(false);
        }
    };

    const fetchBulkStats = async (chapterIds: string[]) => {
        if (chapterIds.length === 0) return;
        try {
            const { data, error } = await supabase.rpc('get_chapters_bulk_stats', { target_chapter_ids: chapterIds });
            if (error) throw error;
            if (data) {
                const stats: Record<string, ChapterStats> = {};
                data.forEach((s: any) => {
                    stats[s.chapter_id] = {
                        total: Number(s.total_count) || 0,
                        easy: Number(s.easy_count) || 0,
                        medium: Number(s.medium_count) || 0,
                        hard: Number(s.hard_count) || 0,
                        mcq: Number(s.mcq_count) || 0,
                        reasoning: Number(s.reasoning_count) || 0,
                        matching: Number(s.matching_count) || 0,
                        statements: Number(s.statements_count) || 0,
                        figures: Number(s.figure_count) || 0 
                    };
                });
                setChapterStats(prev => ({ ...prev, ...stats }));
            }
        } catch (e) { console.error(e); }
    };

    const addToBlueprint = (ch: ChapterItem) => {
        if (activeMode === 'manual') {
            setCurrentViewChapter(ch);
            if (!isLgLayout) setMobileSheet(null);
            return;
        }
        if (blueprint.some(b => b.id === ch.id)) {
            setBlueprint(blueprint.filter(b => b.id !== ch.id));
            return;
        }
        setBlueprint([...blueprint, {
            id: ch.id, name: ch.name, subjectName: ch.subject_name || '', className: ch.class_name || '',
            count: 10, figureCount: 0, difficulty: 'Global', source: 'db', selectionMode: distributionMode,
            visualMode: 'image'
        }]);
        if (!isLgLayout) setMobileSheet(null);
    };

    const toggleManualQuestion = (q: Question) => {
        const isSelected = selectedManualQuestions.some(item => item.id === q.id);
        setSelectedManualQuestions(isSelected ? selectedManualQuestions.filter(item => item.id !== q.id) : [...selectedManualQuestions, q]);
    };

    const handleUpdateChapterCount = (id: string, val: number) => {
        setBlueprint(prev => prev.map(b => b.id === id ? { ...b, count: Math.max(0, val) } : b));
    };

    const getOptions = (): CreateTestOptions => {
        let finalQuestionsTotal = activeMode === 'manual' ? selectedManualQuestions.length : (distributionMode === 'percent' ? totalTarget : blueprint.reduce((sum, b) => sum + b.count, 0));
        
        let chaptersWithFinalCounts = blueprint.map(b => {
            const count = distributionMode === 'percent' ? Math.round((b.count / 100) * totalTarget) : b.count;
            return { ...b, count, source: 'db' as const };
        });

        return {
            mode: 'multi-ai', topic: topic.trim() || 'Untitled Assessment', 
            chapters: chaptersWithFinalCounts,
            useGlobalDifficulty, globalDifficultyMix: globalDiff, 
            globalTypeMix: globalTypes,
            globalFigureCount: activeMode === 'auto' ? globalFigureCount : 0,
            totalQuestions: finalQuestionsTotal, 
            selectionMode: activeMode === 'auto' ? 'auto' : 'manual',
            manualQuestions: selectedManualQuestions,
            targetClassId: targetOrgClassId || null,
            knowledgeBaseId: selectedKb || null,
            allowPastQuestions
        };
    };

    const handleAction = () => {
        if (!topic.trim()) return alert("Please provide an assessment name.");
        if (activeMode === 'auto' && blueprint.length === 0) return alert("Select at least one chapter.");
        if (activeMode === 'manual' && selectedManualQuestions.length === 0) return alert("Select at least one question.");
        onStart(getOptions());
    };

    const handleSaveDraftInternal = async () => {
        if (!onSaveDraft) return;
        setIsSavingDraft(true);
        try {
            await onSaveDraft(getOptions());
        } catch (e: any) {
            alert("Failed to save draft: " + e.message);
        } finally {
            setIsSavingDraft(false);
        }
    };

    const filteredPool = useMemo(() => {
        let pool = showSelectedOnly ? selectedManualQuestions : questionPool;
        if (inventoryFilterChapterId) pool = pool.filter(q => q.sourceChapterId === inventoryFilterChapterId);
        if (poolSearch.trim()) pool = pool.filter(q => q.text.toLowerCase().includes(poolSearch.toLowerCase()));
        if (manualFilters.figuresOnly) pool = pool.filter(q => !!q.figureDataUrl);
        if (manualFilters.difficulty !== 'all') pool = pool.filter(q => q.difficulty === manualFilters.difficulty);
        if (manualFilters.style !== 'all') pool = pool.filter(q => q.type === manualFilters.style);
        return pool;
    }, [questionPool, selectedManualQuestions, showSelectedOnly, inventoryFilterChapterId, poolSearch, manualFilters]);

    const selectionInventory = useMemo(() => {
        const inventoryMap = new Map<string, InventoryItem>();
        blueprint.forEach(b => {
            inventoryMap.set(b.id, {
                id: b.id, name: b.name, selectedCount: 0, selectedFigures: 0, targetCount: b.count,
                difficulties: { 'Easy': 0, 'Medium': 0, 'Hard': 0 }, styles: {}, isBlueprint: true
            });
        });
        selectedManualQuestions.forEach(q => {
            const key = q.sourceChapterId || q.sourceChapterName || 'Unknown';
            if (!inventoryMap.has(key)) {
                inventoryMap.set(key, {
                    id: key, name: q.sourceChapterName || 'Unknown', selectedCount: 0, selectedFigures: 0, targetCount: 0,
                    difficulties: { 'Easy': 0, 'Medium': 0, 'Hard': 0 }, styles: {}, isBlueprint: false
                });
            }
            const entry = inventoryMap.get(key)!;
            entry.selectedCount++;
            if (q.figureDataUrl) entry.selectedFigures++;
            entry.difficulties[q.difficulty] = (entry.difficulties[q.difficulty] || 0) + 1;
            entry.styles[q.type] = (entry.styles[q.type] || 0) + 1;
        });
        return Array.from(inventoryMap.values());
    }, [selectedManualQuestions, blueprint]);

    const globalInventoryStats = useMemo(() => {
        const stats = {
            totalSelected: selectedManualQuestions.length, totalTarget: totalTarget,
            totalFigures: selectedManualQuestions.filter(q => !!q.figureDataUrl).length,
            difficulties: { 'Easy': 0, 'Medium': 0, 'Hard': 0 },
            styles: { 'mcq': 0, 'reasoning': 0, 'matching': 0, 'statements': 0 },
            subjects: {} as Record<string, number> 
        };
        selectedManualQuestions.forEach(q => {
            stats.difficulties[q.difficulty] = (stats.difficulties[q.difficulty] || 0) + 1;
            stats.styles[q.type as keyof typeof stats.styles] = (stats.styles[q.type as keyof typeof stats.styles] || 0) + 1;
            const sub = q.sourceSubjectName || 'General';
            stats.subjects[sub] = (stats.subjects[sub] || 0) + 1;
        });
        return stats;
    }, [selectedManualQuestions, totalTarget]);

    const MixControl: React.FC<{ label: string; value: number; onChange: (v: number) => void; color: string; mode: 'percent' | 'count'; total: number }> = ({ label, value, onChange, color, mode, total }) => {
        const displayValue = mode === 'percent' ? value : Math.round((value/100)*total);
        return (
            <div className="flex flex-col gap-1 group w-28 shrink-0">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                    <span className={`text-[8px] font-black ${color} bg-slate-100 px-1 rounded`}>{mode === 'percent' ? `${value}%` : displayValue}</span>
                </div>
                <input type="range" min="0" max="100" value={value} onChange={e => onChange(parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-600 transition-all" />
            </div>
        );
    };

    const mixStripLeading = (
        <div className="flex items-center gap-4 sm:gap-6 shrink-0 flex-wrap">
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner mr-0 sm:mr-2">
                <button type="button" onClick={() => setDistributionMode('percent')} className={`min-h-[36px] px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${distributionMode === 'percent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>%</button>
                <button type="button" onClick={() => setDistributionMode('count')} className={`min-h-[36px] px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${distributionMode === 'count' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>#</button>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Items</label>
                    <div className="flex items-center gap-1.5">
                        <input type="number" value={totalTarget} onChange={e => setTotalTarget(parseInt(e.target.value)||0)} className="w-14 h-9 sm:h-7 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-indigo-600 outline-none focus:border-indigo-500 shadow-sm text-center" />
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Qs</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const mixStripSliders = (
        <div className="flex flex-1 gap-4 min-w-0 lg:border-l lg:border-slate-200 lg:pl-4 overflow-x-auto no-scrollbar py-1">
            <MixControl label="Easy" value={globalDiff.easy} onChange={v => setGlobalDiff({...globalDiff, easy: v})} color="text-emerald-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Medium" value={globalDiff.medium} onChange={v => setGlobalDiff({...globalDiff, medium: v})} color="text-amber-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Hard" value={globalDiff.hard} onChange={v => setGlobalDiff({...globalDiff, hard: v})} color="text-rose-600" mode={distributionMode} total={totalTarget} />
            <div className="w-px h-6 bg-slate-200 self-center shrink-0 hidden sm:block" />
            <MixControl label="MCQ" value={globalTypes.mcq} onChange={v => setGlobalTypes({...globalTypes, mcq: v})} color="text-indigo-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Reason" value={globalTypes.reasoning} onChange={v => setGlobalTypes({...globalTypes, reasoning: v})} color="text-indigo-600" mode={distributionMode} total={totalTarget} />
        </div>
    );

    const chaptersAsideNodes = (
        <>
            <div className="p-4 border-b border-slate-50 bg-slate-50/30 space-y-3 shrink-0">
                <select value={selectedKb} onChange={e => setSelectedKb(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase text-indigo-700 outline-none shadow-sm">
                    {kbs.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                </select>
                <div className="relative group">
                    <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search Chapters..." value={chapterSearch} onChange={e => setChapterSearch(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[10px] font-bold outline-none focus:border-indigo-500 shadow-sm" />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1 min-h-0">
                {classes.map(cl => (
                    <div key={cl.id}>
                        <button type="button" onClick={() => setSelectedClass(selectedClass === cl.id ? '' : cl.id)} className={`w-full min-h-11 px-3 py-2 rounded-lg text-[10px] font-black uppercase flex justify-between items-center transition-all ${selectedClass === cl.id ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-500'}`}>{cl.name} <iconify-icon icon={selectedClass === cl.id ? "mdi:chevron-up" : "mdi:chevron-down"} /></button>
                        {selectedClass === cl.id && (
                            <div className="pl-2 mt-1">
                                {subjects.map(s => (
                                    <div key={s.id}>
                                        <button type="button" onClick={() => setSelectedSubject(selectedSubject === s.id ? '' : s.id)} className={`w-full min-h-10 px-3 py-1.5 rounded text-[9px] font-bold uppercase text-left transition-colors ${selectedSubject === s.id ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600'}`}>{s.name}</button>
                                        {selectedSubject === s.id && (
                                            <div className="pl-2 mt-1">
                                                {chapters.map(ch => (
                                                    <button type="button" key={ch.id} onClick={() => addToBlueprint(ch)} className={`w-full text-left px-3 py-2.5 min-h-10 rounded-lg cursor-pointer text-[9px] font-black uppercase mb-1 transition-all ${activeMode === 'auto' ? (blueprint.some(b => b.id === ch.id) ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50') : (currentViewChapter?.id === ch.id ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50')}`}>{ch.name}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );

    const matrixPanelHeader = (
        <div className="p-4 sm:p-6 border-b border-slate-50 bg-slate-50/50 shrink-0">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1 flex items-center gap-2">
                <iconify-icon icon="mdi:clipboard-list-outline" className="text-emerald-500" /> Assessment Matrix
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real-time Selection Profile</p>
        </div>
    );

    const matrixPanelScroll = (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-8">
            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Progress</span>
                    <span className="text-xl font-black text-slate-800">{globalInventoryStats.totalSelected} <span className="text-xs text-slate-300">/ {globalInventoryStats.totalTarget}</span></span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_#10b98150]" style={{ width: `${Math.min(100, (globalInventoryStats.totalSelected / globalInventoryStats.totalTarget) * 100)}%` }} />
                </div>
            </div>
            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rigor Breakdown</h4>
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center flex flex-col items-center">
                        <span className="text-[8px] font-black text-emerald-600 uppercase mb-1">Easy</span>
                        <span className="text-sm font-black text-emerald-700">{globalInventoryStats.difficulties.Easy}</span>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 text-center flex flex-col items-center">
                        <span className="text-[8px] font-black text-amber-600 uppercase mb-1">Med</span>
                        <span className="text-sm font-black text-amber-700">{globalInventoryStats.difficulties.Medium}</span>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-center flex flex-col items-center">
                        <span className="text-[8px] font-black text-rose-600 uppercase mb-1">Hard</span>
                        <span className="text-sm font-black text-rose-700">{globalInventoryStats.difficulties.Hard}</span>
                    </div>
                </div>
            </div>
            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Style Map</h4>
                <div className="space-y-2">
                    {Object.entries(globalInventoryStats.styles).map(([style, count]) => (
                        <div key={style} className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 group hover:border-emerald-200 transition-all">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{style}</span>
                            <span className="text-sm font-black text-slate-800">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Per Chapter Balance</h4>
                <div className="space-y-2">
                    {selectionInventory.map(item => (
                        <div key={item.id} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <h5 className="text-[10px] font-black text-slate-700 uppercase truncate flex-1 pr-2">{item.name}</h5>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${item.selectedCount >= item.targetCount ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{item.selectedCount}/{item.targetCount}</span>
                            </div>
                            <div className="flex gap-1">
                                {item.difficulties.Easy > 0 && <span className="text-[7px] font-black text-emerald-500 px-1.5 py-0.5 bg-emerald-50 rounded uppercase">E:{item.difficulties.Easy}</span>}
                                {item.difficulties.Medium > 0 && <span className="text-[7px] font-black text-amber-500 px-1.5 py-0.5 bg-amber-50 rounded uppercase">M:{item.difficulties.Medium}</span>}
                                {item.difficulties.Hard > 0 && <span className="text-[7px] font-black text-rose-500 px-1.5 py-0.5 bg-rose-50 rounded uppercase">H:{item.difficulties.Hard}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const matrixPanelFooter = (
        <div className="p-4 sm:p-6 border-t border-slate-50 bg-slate-50/30 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
                type="button"
                onClick={handleAction}
                disabled={isLoading || selectedManualQuestions.length === 0}
                className="w-full min-h-12 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                <iconify-icon icon="mdi:check-all" width="20" />
                Lock Assessment
            </button>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans relative">
            <header className="bg-white border-b border-slate-200 z-30 shadow-sm shrink-0">
                {/* Mobile / tablet */}
                <div className="lg:hidden px-3 py-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={onClose} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all border border-slate-100" aria-label="Back">
                            <iconify-icon icon="mdi:arrow-left" width="20" />
                        </button>
                        <div className="min-w-0 flex-1 px-2 text-center">
                            <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-0.5 truncate">Creator</h1>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{activeMode === 'auto' ? 'Blueprint' : `${selectedManualQuestions.length} selected`}</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner shrink-0">
                            <button type="button" onClick={() => setActiveMode('auto')} className={`min-h-11 min-w-11 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeMode === 'auto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Auto" aria-label="Auto mode">
                                <iconify-icon icon="mdi:lightning-bolt" />
                                <span className="hidden sm:inline">Auto</span>
                            </button>
                            <button type="button" onClick={() => setActiveMode('manual')} className={`min-h-11 min-w-11 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeMode === 'manual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`} title="Manual" aria-label="Manual mode">
                                <iconify-icon icon="mdi:cursor-default-click" />
                                <span className="hidden sm:inline">Manual</span>
                            </button>
                        </div>
                    </div>
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Test title..." className="w-full min-h-11 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-300" />
                    <div className="flex flex-wrap items-stretch gap-2">
                        <select
                            value={targetOrgClassId}
                            onChange={(e) => setTargetOrgClassId(e.target.value)}
                            className="flex-1 min-w-[140px] min-h-11 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
                            title="Class scope for no-repeat policy"
                        >
                            <option value="">No class scope</option>
                            {orgClasses.map((cls) => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => setAllowPastQuestions((prev) => !prev)}
                            className={`min-h-11 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all shrink-0 ${
                                allowPastQuestions
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-white text-slate-500 border-slate-200'
                            }`}
                            title="Optional override to allow past questions"
                        >
                            {allowPastQuestions ? 'Past ok' : 'No repeat'}
                        </button>
                        <button type="button" onClick={handleSaveDraftInternal} disabled={isLoading || isSavingDraft} className="min-h-11 min-w-11 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center disabled:opacity-50 shrink-0" title="Save draft">
                            {isSavingDraft ? <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div> : <iconify-icon icon="mdi:content-save-outline" width="20" />}
                        </button>
                        <button type="button" onClick={handleAction} disabled={isLoading} className={`min-h-11 flex-1 min-w-[120px] px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${activeMode === 'auto' ? 'bg-indigo-600 text-white shadow-indigo-600/30 hover:bg-indigo-700' : 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700'}`}>
                            {activeMode === 'auto' ? 'Forge' : 'Finalize'}
                        </button>
                    </div>
                </div>

                {/* Desktop */}
                <div className="hidden lg:flex h-16 px-6 items-center justify-between gap-4">
                    <div className="flex items-center gap-4 shrink-0">
                        <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all border border-slate-100" aria-label="Back">
                            <iconify-icon icon="mdi:arrow-left" width="20" />
                        </button>
                        <div className="min-w-[150px]">
                            <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Creator</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeMode === 'auto' ? `Blueprint Config` : `${selectedManualQuestions.length} Items Selected`}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                            <button type="button" onClick={() => setActiveMode('auto')} className={`px-5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeMode === 'auto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                                <iconify-icon icon="mdi:lightning-bolt" /> Auto
                            </button>
                            <button type="button" onClick={() => setActiveMode('manual')} className={`px-5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeMode === 'manual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                                <iconify-icon icon="mdi:cursor-default-click" /> Manual
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 max-w-xs px-4 min-w-0">
                        <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Test Title..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-300" />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={targetOrgClassId}
                            onChange={(e) => setTargetOrgClassId(e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none max-w-[160px]"
                            title="Class scope for no-repeat policy"
                        >
                            <option value="">No class scope</option>
                            {orgClasses.map((cls) => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => setAllowPastQuestions((prev) => !prev)}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${
                                allowPastQuestions
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-white text-slate-500 border-slate-200'
                            }`}
                            title="Optional override to allow past questions"
                        >
                            {allowPastQuestions ? 'Past allowed' : 'No repeats'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={handleSaveDraftInternal} disabled={isLoading || isSavingDraft} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center disabled:opacity-50" title="Save Draft to Hub">
                            {isSavingDraft ? <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div> : <iconify-icon icon="mdi:content-save-outline" width="20" />}
                        </button>
                        <button type="button" onClick={handleAction} disabled={isLoading} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 ${activeMode === 'auto' ? 'bg-indigo-600 text-white shadow-indigo-600/30 hover:bg-indigo-700' : 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700'}`}>
                            {activeMode === 'auto' ? 'Forge Assessment' : 'Finalize Selection'}
                        </button>
                    </div>
                </div>

                {activeMode === 'auto' && (
                    <>
                        <div className="lg:hidden border-t border-slate-100 bg-slate-50 px-3 py-2">
                            <button
                                type="button"
                                onClick={() => setMixStripOpen((o) => !o)}
                                className="w-full flex items-center justify-between min-h-11 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600"
                            >
                                Mix &amp; totals
                                <iconify-icon icon={mixStripOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="22" />
                            </button>
                            {mixStripOpen && (
                                <div className="flex flex-col gap-3 pt-2 pb-1 border-t border-slate-200/80 mt-1">
                                    {mixStripLeading}
                                    {mixStripSliders}
                                </div>
                            )}
                        </div>
                        <div className="hidden lg:flex bg-slate-50 border-t border-slate-100 px-6 py-3 items-center gap-8 min-h-[56px] overflow-hidden">
                            {mixStripLeading}
                            {mixStripSliders}
                        </div>
                    </>
                )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                <aside className="z-20 hidden min-h-0 w-80 shrink-0 flex-col border-r border-slate-100 bg-white shadow-sm lg:flex">
                    {chaptersAsideNodes}
                </aside>

                <main className="relative min-h-0 flex-1 overflow-y-auto custom-scrollbar bg-slate-100/40 p-4 md:p-6 lg:p-8">
                    {activeMode === 'auto' ? (
                        <div className="max-w-4xl mx-auto space-y-4 pb-20">
                            {blueprint.map((item, idx) => (
                                <div key={item.id} className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 animate-slide-up group">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-[10px] shrink-0">{idx + 1}</div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-black text-slate-800 uppercase truncate">{item.name}</h3>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.subjectName}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-4 sm:gap-6 shrink-0">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</span>
                                            <input type="number" value={item.count} onChange={e => handleUpdateChapterCount(item.id, parseInt(e.target.value)||0)} className="w-12 h-9 sm:h-8 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs font-black text-slate-800 outline-none" />
                                        </div>
                                        <button type="button" onClick={() => addToBlueprint(item as any)} className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-rose-50 text-rose-400 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 border border-rose-100 shrink-0" title="Remove chapter" aria-label="Remove chapter">
                                            <iconify-icon icon="mdi:trash-can-outline" width="18" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {blueprint.length === 0 && (
                                <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4"><iconify-icon icon="mdi:creation" width="64" /><p className="text-sm font-black uppercase tracking-widest">Select chapters to begin</p></div>
                            )}
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto flex flex-col h-full">
                            <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm shrink-0">
                                <div className="flex items-center gap-4 flex-1 w-full">
                                    <div className="relative flex-1">
                                        <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input type="text" placeholder="Search pool..." value={poolSearch} onChange={e => setPoolSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-emerald-500" />
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {(['all', 'Easy', 'Medium', 'Hard'] as const).map(d => (
                                            <button type="button" key={d} onClick={() => setManualFilters({...manualFilters, difficulty: d})} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${manualFilters.difficulty === d ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}>{d}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <button type="button" onClick={() => setShowSelectedOnly(!showSelectedOnly)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border transition-all flex items-center gap-2 ${showSelectedOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100'}`}><iconify-icon icon="mdi:filter-check" /> Selected Only</button>
                                </div>
                            </div>
                            
                            {isPoolFetching ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
                                    <iconify-icon icon="mdi:loading" width="48" className="animate-spin" />
                                    <p className="text-xs font-black uppercase tracking-widest">Querying Vault...</p>
                                </div>
                            ) : (
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
                                    {filteredPool.map((q, idx) => (
                                        <div key={q.id} className={`relative group ${selectedManualQuestions.some(i => i.id === q.id) ? 'ring-2 ring-emerald-500 ring-offset-2 rounded-[2rem]' : ''}`}>
                                            <QuestionPaperItem 
                                                question={q} 
                                                index={idx}
                                                onToggleSelect={() => toggleManualQuestion(q)}
                                                isSelected={selectedManualQuestions.some(i => i.id === q.id)}
                                            />
                                        </div>
                                    ))}
                                    {filteredPool.length === 0 && (
                                        <div className="col-span-full py-40 text-center opacity-30 flex flex-col items-center gap-4"><iconify-icon icon="mdi:database-off" width="64" /><p className="text-sm font-black uppercase tracking-widest">Vault Empty for this filter</p></div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </main>

                <aside className="z-20 hidden min-h-0 w-80 shrink-0 flex-col border-l border-slate-100 bg-white shadow-sm animate-fade-in lg:flex">
                    {matrixPanelHeader}
                    {matrixPanelScroll}
                    {matrixPanelFooter}
                </aside>
            </div>

            {!isLgLayout && (
                <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={() => setMobileSheet((s) => (s === 'chapters' ? null : 'chapters'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            mobileSheet === 'chapters' ? 'bg-slate-900 text-white shadow-md' : 'border border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                    >
                        <iconify-icon icon="mdi:book-open-page-variant" width="20" />
                        Chapters
                    </button>
                    <button
                        type="button"
                        onClick={() => setMobileSheet((s) => (s === 'matrix' ? null : 'matrix'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            mobileSheet === 'matrix' ? 'bg-emerald-700 text-white shadow-md' : 'border border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                    >
                        <iconify-icon icon="mdi:clipboard-list-outline" width="20" />
                        Matrix
                        {selectedManualQuestions.length > 0 && (
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${mobileSheet === 'matrix' ? 'bg-white/25' : 'bg-emerald-100 text-emerald-800'}`}>
                                {selectedManualQuestions.length}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {!isLgLayout && mobileSheet && (
                <>
                    <button
                        type="button"
                        aria-label="Close panel"
                        className="animate-fade-in fixed inset-0 z-[55] bg-slate-900/50"
                        onClick={() => setMobileSheet(null)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="creator-sheet-title"
                        className="animate-slide-up fixed inset-x-0 bottom-0 z-[60] flex max-h-[90vh] flex-col rounded-t-2xl border border-slate-200 border-b-0 bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.15)]"
                    >
                        <div className="flex justify-center pt-2 pb-1" aria-hidden>
                            <div className="h-1 w-10 rounded-full bg-slate-300" />
                        </div>
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
                            <span id="creator-sheet-title" className="text-xs font-black uppercase tracking-widest text-slate-800">
                                {mobileSheet === 'chapters' ? 'Browse chapters' : 'Assessment matrix'}
                            </span>
                            <button
                                type="button"
                                className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                onClick={() => setMobileSheet(null)}
                                aria-label="Close"
                            >
                                <iconify-icon icon="mdi:close" width="22" />
                            </button>
                        </div>
                        <div className="flex max-h-[min(72vh,calc(90vh-5.5rem))] min-h-[36vh] flex-1 flex-col overflow-hidden">
                            {mobileSheet === 'chapters' ? (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chaptersAsideNodes}</div>
                            ) : (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                    {matrixPanelScroll}
                                    {matrixPanelFooter}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {isLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-fade-in">
                    <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{loadingStep || 'Synthesizing...'}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 animate-pulse">Neural Link Synchronization</p>
                </div>
            )}
        </div>
    );
};

export default TestCreatorView;
