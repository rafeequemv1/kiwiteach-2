
import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabase/client';
import { SelectedChapter, TypeDistribution, CreateTestOptions, QuestionType, Question } from '../types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import QuestionPaperItem from './QuestionPaperItem';
import { ChapterStatChips } from './ChapterStatChips';
import {
    fetchEligibleQuestions,
    fetchUsedQuestionsForClass,
} from '../services/questionUsageService';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';

interface TestCreatorViewProps {
  onClose: () => void;
  onStart: (options: CreateTestOptions) => void;
  onSaveDraft?: (options: CreateTestOptions) => Promise<void>;
  isLoading: boolean;
  loadingStep?: string;
  initialChapters?: SelectedChapter[];
  /** When opening from chapter picker, keep KB in sync with selected chapters */
  initialKnowledgeBaseId?: string | null;
  initialTopic?: string;
  initialManualQuestions?: Question[];
  /** From exam paper preset / new-test picker */
  initialTotalTarget?: number;
  initialDistributionMode?: 'count' | 'percent';
  initialGlobalTypes?: TypeDistribution;
  initialGlobalFigureCount?: number;
}

const defaultTypeDistribution = (): TypeDistribution => ({
  mcq: 70,
  reasoning: 15,
  matching: 10,
  statements: 5,
});

function normalizeInitialGlobalTypes(t: TypeDistribution | undefined): TypeDistribution {
  if (!t) return defaultTypeDistribution();
  const sum = t.mcq + t.reasoning + t.matching + t.statements;
  if (sum <= 0) return defaultTypeDistribution();
  return { ...t };
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
    initialKnowledgeBaseId,
    initialTopic,
    initialManualQuestions,
    initialTotalTarget,
    initialDistributionMode,
    initialGlobalTypes,
    initialGlobalFigureCount,
}) => {
    const [activeMode, setActiveMode] = useState<'auto' | 'manual'>(initialManualQuestions && initialManualQuestions.length > 0 ? 'manual' : 'auto');
    const [distributionMode, setDistributionMode] = useState<'count' | 'percent'>(initialDistributionMode ?? 'count');
    const [inventoryViewMode, setInventoryViewMode] = useState<'count' | 'percent'>('count');
    const [manualLayout, setManualLayout] = useState<'grid' | 'list'>('grid');
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);
    const [inventoryFilterChapterId, setInventoryFilterChapterId] = useState<string | null>(null);
    const [totalTarget, setTotalTarget] = useState(initialTotalTarget ?? 50);
    const [globalFigureCount, setGlobalFigureCount] = useState(initialGlobalFigureCount ?? 0);
    const [chapterSearch, setChapterSearch] = useState('');
    const [chapterStats, setChapterStats] = useState<Record<string, ChapterStats>>({});

    // --- Chat Assistant State ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
    const [isChatThinking, setIsChatThinking] = useState(false);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const [kbChapterCounts, setKbChapterCounts] = useState<Record<string, number>>({});

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
    const [actionError, setActionError] = useState<string | null>(null);
    
    const [blueprint, setBlueprint] = useState<SelectedChapter[]>(initialChapters || []);
    const [globalDiff, setGlobalDiff] = useState({ easy: 30, medium: 50, hard: 20 });
    const [globalTypes, setGlobalTypes] = useState<TypeDistribution>(normalizeInitialGlobalTypes(initialGlobalTypes));
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
            if (data?.length) {
                setKbs(data);
                const preferred =
                    initialKnowledgeBaseId && data.some((k) => k.id === initialKnowledgeBaseId)
                        ? initialKnowledgeBaseId
                        : data[0].id;
                setSelectedKb(preferred);
                const entries = await Promise.all(
                    data.map(async (kb) => {
                        const { count } = await supabase
                            .from('chapters')
                            .select('*', { count: 'exact', head: true })
                            .eq('kb_id', kb.id);
                        return [kb.id, count ?? 0] as const;
                    })
                );
                setKbChapterCounts(Object.fromEntries(entries));
            }
        };
        void fetchKbs();
    }, [initialKnowledgeBaseId]);

    useEffect(() => {
        if (!selectedKb) return;
        supabase.from('kb_classes').select('id, name').eq('kb_id', selectedKb).then(({ data }) => setClasses(data || []));
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
        setActionError(null);
        if (activeMode === 'auto' && blueprint.length === 0) {
            setActionError('Add at least one chapter to the blueprint, or enter a chapter from the list.');
            return;
        }
        if (activeMode === 'manual' && selectedManualQuestions.length === 0) {
            setActionError('Select at least one question from the pool.');
            return;
        }
        onStart(getOptions());
    };

    const handleSaveDraftInternal = async () => {
        if (!onSaveDraft) return;
        setIsSavingDraft(true);
        setActionError(null);
        try {
            await onSaveDraft(getOptions());
        } catch (e: any) {
            setActionError(e?.message ? `Could not save draft: ${e.message}` : 'Could not save draft.');
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
                    <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
                    <span className={`text-[8px] font-black ${color} bg-zinc-100 px-1 rounded`}>{mode === 'percent' ? `${value}%` : displayValue}</span>
                </div>
                <input type="range" min="0" max="100" value={value} onChange={e => onChange(parseInt(e.target.value))} className="w-full h-1 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-zinc-600 transition-all" />
            </div>
        );
    };

    const mixStripLeading = (
        <div className="flex shrink-0 flex-wrap items-center gap-4 sm:gap-6">
            <div className="mr-0 inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm sm:mr-2">
                <button type="button" onClick={() => setDistributionMode('percent')} className={`min-h-[36px] rounded-sm px-2.5 py-1 text-[8px] font-medium uppercase tracking-wide transition-all ${distributionMode === 'percent' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>%</button>
                <button type="button" onClick={() => setDistributionMode('count')} className={`min-h-[36px] rounded-sm px-2.5 py-1 text-[8px] font-medium uppercase tracking-wide transition-all ${distributionMode === 'count' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>#</button>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[7px] font-medium uppercase tracking-wide text-zinc-500">Total items</label>
                    <div className="flex items-center gap-1.5">
                        <input type="number" value={totalTarget} onChange={e => setTotalTarget(parseInt(e.target.value)||0)} className="h-9 w-14 rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-xs font-semibold text-zinc-800 shadow-sm outline-none focus:border-zinc-400 sm:h-7" />
                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter">Qs</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const mixStripSliders = (
        <div className="no-scrollbar flex min-w-0 flex-1 gap-4 overflow-x-auto py-1 lg:border-l lg:border-zinc-200 lg:pl-4">
            <MixControl label="Easy" value={globalDiff.easy} onChange={v => setGlobalDiff({...globalDiff, easy: v})} color="text-emerald-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Medium" value={globalDiff.medium} onChange={v => setGlobalDiff({...globalDiff, medium: v})} color="text-amber-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Hard" value={globalDiff.hard} onChange={v => setGlobalDiff({...globalDiff, hard: v})} color="text-rose-600" mode={distributionMode} total={totalTarget} />
            <div className="w-px h-6 bg-zinc-200 self-center shrink-0 hidden sm:block" />
            <MixControl label="MCQ" value={globalTypes.mcq} onChange={v => setGlobalTypes({...globalTypes, mcq: v})} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
            <MixControl label="Reason" value={globalTypes.reasoning} onChange={v => setGlobalTypes({...globalTypes, reasoning: v})} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
        </div>
    );

    const chaptersAsideNodes = (
        <>
            <div className="shrink-0 space-y-3 border-b border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Question database</p>
                <div className="max-h-40 space-y-2 overflow-y-auto custom-scrollbar pr-0.5">
                    {kbs.map((kb) => {
                        const active = selectedKb === kb.id;
                        const chCount = kbChapterCounts[kb.id];
                        return (
                            <button
                                key={kb.id}
                                type="button"
                                onClick={() => setSelectedKb(kb.id)}
                                className={`w-full rounded-md border p-2.5 text-left transition-all ${
                                    active
                                        ? 'border-zinc-300 bg-zinc-50 shadow-sm ring-1 ring-zinc-200/60'
                                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                            active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                                        }`}
                                    >
                                        <iconify-icon icon="mdi:database-outline" width="16" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={`truncate text-[9px] font-black uppercase leading-tight ${
                                                active ? 'text-zinc-900' : 'text-zinc-800'
                                            }`}
                                        >
                                            {kb.name}
                                        </p>
                                        <p className="text-[7px] font-bold uppercase text-zinc-400">
                                            {chCount !== undefined ? `${chCount} ch` : '…'}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className="relative group">
                    <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Search Chapters..."
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-[10px] font-medium shadow-sm outline-none focus:border-zinc-400"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1 min-h-0">
                {classes.map(cl => (
                    <div key={cl.id}>
                        <button type="button" onClick={() => setSelectedClass(selectedClass === cl.id ? '' : cl.id)} className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-[10px] font-medium uppercase tracking-wide transition-all ${selectedClass === cl.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-50'}`}>{cl.name} <iconify-icon icon={selectedClass === cl.id ? "mdi:chevron-up" : "mdi:chevron-down"} /></button>
                        {selectedClass === cl.id && (
                            <div className="pl-2 mt-1">
                                {subjects.map(s => (
                                    <div key={s.id}>
                                        <button type="button" onClick={() => setSelectedSubject(selectedSubject === s.id ? '' : s.id)} className={`w-full min-h-10 px-3 py-1.5 rounded text-[9px] font-bold uppercase text-left transition-colors ${selectedSubject === s.id ? 'text-emerald-600 bg-emerald-50' : 'text-zinc-400 hover:text-zinc-600'}`}>{s.name}</button>
                                        {selectedSubject === s.id && (
                                            <div className="pl-2 mt-1">
                                                {chapters.map((ch) => {
                                                    const inBlueprint = blueprint.some((b) => b.id === ch.id);
                                                    const isCurrent = currentViewChapter?.id === ch.id;
                                                    const autoActive = activeMode === 'auto' && inBlueprint;
                                                    const manualActive = activeMode === 'manual' && isCurrent;
                                                    const chipStats = chapterStats[ch.id]
                                                        ? {
                                                              total: chapterStats[ch.id].total,
                                                              easy: chapterStats[ch.id].easy,
                                                              medium: chapterStats[ch.id].medium,
                                                              hard: chapterStats[ch.id].hard,
                                                              mcq: chapterStats[ch.id].mcq,
                                                              reasoning: chapterStats[ch.id].reasoning,
                                                              matching: chapterStats[ch.id].matching,
                                                              statements: chapterStats[ch.id].statements,
                                                              figures: chapterStats[ch.id].figures,
                                                          }
                                                        : undefined;
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={ch.id}
                                                            onClick={() => addToBlueprint(ch)}
                                                            className={`mb-1 w-full cursor-pointer rounded-lg px-3 py-2 text-left text-[9px] font-black uppercase transition-all ${
                                                                activeMode === 'auto'
                                                                    ? inBlueprint
                                                                        ? 'bg-zinc-900 text-white shadow-sm'
                                                                        : 'text-zinc-600 hover:bg-zinc-50'
                                                                    : isCurrent
                                                                      ? 'bg-emerald-600 text-white shadow-md'
                                                                      : 'text-zinc-500 hover:bg-zinc-50'
                                                            }`}
                                                        >
                                                            <span className="block truncate leading-tight">{ch.name}</span>
                                                            {chipStats && (
                                                                <ChapterStatChips
                                                                    stats={chipStats}
                                                                    dense
                                                                    onColoredBackground={autoActive || manualActive}
                                                                />
                                                            )}
                                                        </button>
                                                    );
                                                })}
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
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <iconify-icon icon="mdi:clipboard-list-outline" className="text-emerald-600" width="16" />
                Assessment matrix
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">Selection profile</p>
        </div>
    );

    const matrixPanelScroll = (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-8">
            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Progress</span>
                    <span className="text-xl font-black text-zinc-800">{globalInventoryStats.totalSelected} <span className="text-xs text-zinc-300">/ {globalInventoryStats.totalTarget}</span></span>
                </div>
                <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_#10b98150]" style={{ width: `${Math.min(100, (globalInventoryStats.totalSelected / globalInventoryStats.totalTarget) * 100)}%` }} />
                </div>
            </div>
            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Rigor Breakdown</h4>
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
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Style Map</h4>
                <div className="space-y-2">
                    {Object.entries(globalInventoryStats.styles).map(([style, count]) => (
                        <div key={style} className="flex items-center justify-between bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-100 group hover:border-emerald-200 transition-all">
                            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">{style}</span>
                            <span className="text-sm font-black text-zinc-800">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Per Chapter Balance</h4>
                <div className="space-y-2">
                    {selectionInventory.map(item => (
                        <div key={item.id} className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <h5 className="text-[10px] font-black text-zinc-700 uppercase truncate flex-1 pr-2">{item.name}</h5>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${item.selectedCount >= item.targetCount ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'}`}>{item.selectedCount}/{item.targetCount}</span>
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
        <div className="shrink-0 border-t border-zinc-200 bg-zinc-50/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
            <button
                type="button"
                onClick={handleAction}
                disabled={
                    isLoading ||
                    (activeMode === 'auto' ? blueprint.length === 0 : selectedManualQuestions.length === 0)
                }
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-zinc-900 py-3 text-[10px] font-medium uppercase tracking-wide text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50 active:scale-[0.99]"
            >
                <iconify-icon icon="mdi:check-all" width="20" />
                Lock Assessment
            </button>
        </div>
    );

    return (
        <div className={`${workspacePageClass} relative`}>
            <header className="z-30 shrink-0 border-b border-zinc-200 bg-white shadow-sm">
                {actionError && (
                    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[12px] font-medium text-amber-950" role="alert">
                        {actionError}
                    </div>
                )}
                {/* Mobile / tablet */}
                <div className="space-y-3 px-3 py-3 lg:hidden">
                    <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800" aria-label="Back">
                            <iconify-icon icon="mdi:arrow-left" width="20" />
                        </button>
                        <div className="min-w-0 flex-1 px-2 text-center">
                            <h1 className="mb-0.5 truncate text-sm font-semibold tracking-tight text-zinc-900">Test creator</h1>
                            <p className="truncate text-[11px] text-zinc-500">{activeMode === 'auto' ? 'Blueprint' : `${selectedManualQuestions.length} selected`}</p>
                        </div>
                        <div className="inline-flex shrink-0 rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm">
                            <button type="button" onClick={() => setActiveMode('auto')} className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-2 text-[10px] font-medium uppercase tracking-wide transition-all ${activeMode === 'auto' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`} title="Auto" aria-label="Auto mode">
                                <iconify-icon icon="mdi:lightning-bolt" />
                                <span className="hidden sm:inline">Auto</span>
                            </button>
                            <button type="button" onClick={() => setActiveMode('manual')} className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-2 text-[10px] font-medium uppercase tracking-wide transition-all ${activeMode === 'manual' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500'}`} title="Manual" aria-label="Manual mode">
                                <iconify-icon icon="mdi:cursor-default-click" />
                                <span className="hidden sm:inline">Manual</span>
                            </button>
                        </div>
                    </div>
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Assessment title…" className="min-h-11 w-full rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-800 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-400" />
                    <div className="flex flex-wrap items-stretch gap-2">
                        <select
                            value={targetOrgClassId}
                            onChange={(e) => setTargetOrgClassId(e.target.value)}
                            className="min-h-11 min-w-[140px] flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-700 shadow-sm outline-none focus:border-zinc-400"
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
                            className={`min-h-11 shrink-0 rounded-md border px-3 text-[9px] font-medium uppercase tracking-wide transition-all ${
                                allowPastQuestions
                                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                                    : 'border-zinc-200 bg-white text-zinc-600 shadow-sm'
                            }`}
                            title="Optional override to allow past questions"
                        >
                            {allowPastQuestions ? 'Past ok' : 'No repeat'}
                        </button>
                        <button type="button" onClick={handleSaveDraftInternal} disabled={isLoading || isSavingDraft} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50" title="Save draft">
                            {isSavingDraft ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800"></div> : <iconify-icon icon="mdi:content-save-outline" width="20" />}
                        </button>
                        <button type="button" onClick={handleAction} disabled={isLoading} className={`flex min-h-11 min-w-[120px] flex-1 items-center justify-center gap-2 rounded-md px-4 text-[10px] font-medium uppercase tracking-wide shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 ${activeMode === 'auto' ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                            {activeMode === 'auto' ? 'Forge' : 'Finalize'}
                        </button>
                    </div>
                </div>

                {/* Desktop */}
                <div className="hidden h-16 items-center justify-between gap-4 px-4 lg:flex">
                    <div className="flex shrink-0 items-center gap-3">
                        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800" aria-label="Back">
                            <iconify-icon icon="mdi:arrow-left" width="20" />
                        </button>
                        <div className="min-w-[140px]">
                            <h1 className="mb-0.5 text-lg font-semibold tracking-tight text-zinc-900">Test creator</h1>
                            <p className="text-[13px] text-zinc-500">{activeMode === 'auto' ? 'Blueprint & mix' : `${selectedManualQuestions.length} items selected`}</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm">
                            <button type="button" onClick={() => setActiveMode('auto')} className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-all ${activeMode === 'auto' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                                <iconify-icon icon="mdi:lightning-bolt" /> Auto
                            </button>
                            <button type="button" onClick={() => setActiveMode('manual')} className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-all ${activeMode === 'manual' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500'}`}>
                                <iconify-icon icon="mdi:cursor-default-click" /> Manual
                            </button>
                        </div>
                    </div>

                    <div className="min-w-0 max-w-xs flex-1 px-2">
                        <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Assessment title…" className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400" />
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <select
                            value={targetOrgClassId}
                            onChange={(e) => setTargetOrgClassId(e.target.value)}
                            className="max-w-[160px] rounded-md border border-zinc-200 bg-white px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-700 shadow-sm outline-none focus:border-zinc-400"
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
                            className={`whitespace-nowrap rounded-md border px-3 py-2 text-[9px] font-medium uppercase tracking-wide transition-all ${
                                allowPastQuestions
                                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                                    : 'border-zinc-200 bg-white text-zinc-600 shadow-sm'
                            }`}
                            title="Optional override to allow past questions"
                        >
                            {allowPastQuestions ? 'Past allowed' : 'No repeats'}
                        </button>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={handleSaveDraftInternal} disabled={isLoading || isSavingDraft} className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50" title="Save draft">
                            {isSavingDraft ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800"></div> : <iconify-icon icon="mdi:content-save-outline" width="20" />}
                        </button>
                        <button type="button" onClick={handleAction} disabled={isLoading} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-[10px] font-medium uppercase tracking-wide shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 ${activeMode === 'auto' ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                            {activeMode === 'auto' ? 'Forge Assessment' : 'Finalize Selection'}
                        </button>
                    </div>
                </div>

                {activeMode === 'auto' && (
                    <>
                        <div className="border-t border-zinc-200 bg-zinc-50/80 px-3 py-2 lg:hidden">
                            <button
                                type="button"
                                onClick={() => setMixStripOpen((o) => !o)}
                                className="flex min-h-11 w-full items-center justify-between rounded-md px-2 text-[10px] font-medium uppercase tracking-wide text-zinc-700"
                            >
                                Mix &amp; totals
                                <iconify-icon icon={mixStripOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="22" />
                            </button>
                            {mixStripOpen && (
                                <div className="flex flex-col gap-3 pt-2 pb-1 border-t border-zinc-200/80 mt-1">
                                    {mixStripLeading}
                                    {mixStripSliders}
                                </div>
                            )}
                        </div>
                        <div className="hidden min-h-[56px] items-center gap-8 overflow-hidden border-t border-zinc-200 bg-zinc-50/80 px-6 py-3 lg:flex">
                            {mixStripLeading}
                            {mixStripSliders}
                        </div>
                    </>
                )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                <aside className="z-20 hidden min-h-0 w-80 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
                    {chaptersAsideNodes}
                </aside>

                <main className="relative min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-4 custom-scrollbar md:p-6 lg:p-8">
                    {activeMode === 'auto' ? (
                        <div className="max-w-4xl mx-auto space-y-4 pb-20">
                            {blueprint.map((item, idx) => (
                                <div key={item.id} className="group flex animate-slide-up flex-col gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
                                    <div className="flex min-w-0 flex-1 items-center gap-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-semibold text-white">{idx + 1}</div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-sm font-semibold text-zinc-900">{item.name}</h3>
                                            <p className="truncate text-[11px] text-zinc-500">{item.subjectName}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center justify-end gap-4 sm:gap-6">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-center text-[7px] font-medium uppercase tracking-wide text-zinc-500">Qty</span>
                                            <input type="number" value={item.count} onChange={e => handleUpdateChapterCount(item.id, parseInt(e.target.value)||0)} className="h-9 w-12 rounded-md border border-zinc-200 bg-white text-center text-xs font-semibold text-zinc-800 shadow-sm outline-none focus:border-zinc-400 sm:h-8" />
                                        </div>
                                        <button type="button" onClick={() => addToBlueprint(item as any)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-500 opacity-100 transition-all hover:bg-rose-500 hover:text-white sm:h-10 sm:w-10 md:opacity-0 md:group-hover:opacity-100" title="Remove chapter" aria-label="Remove chapter">
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
                        <div className="mx-auto flex h-full max-w-6xl flex-col">
                            <div className="mb-6 flex shrink-0 flex-col items-center justify-between gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:flex-row">
                                <div className="flex w-full flex-1 items-center gap-4">
                                    <div className="relative flex-1">
                                        <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                        <input type="text" placeholder="Search pool…" value={poolSearch} onChange={e => setPoolSearch(e.target.value)} className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-10 pr-4 text-xs shadow-sm outline-none focus:border-emerald-500" />
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        {(['all', 'Easy', 'Medium', 'Hard'] as const).map(d => (
                                            <button type="button" key={d} onClick={() => setManualFilters({...manualFilters, difficulty: d})} className={`rounded-md border px-3 py-1.5 text-[9px] font-medium uppercase transition-all ${manualFilters.difficulty === d ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'}`}>{d}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <button type="button" onClick={() => setShowSelectedOnly(!showSelectedOnly)} className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[9px] font-medium uppercase transition-all ${showSelectedOnly ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 bg-white text-zinc-600'}`}><iconify-icon icon="mdi:filter-check" /> Selected only</button>
                                </div>
                            </div>
                            
                            {isPoolFetching ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-zinc-300 gap-4">
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

                <aside className="z-20 hidden min-h-0 w-80 shrink-0 flex-col border-l border-zinc-200 bg-white animate-fade-in lg:flex">
                    {matrixPanelHeader}
                    {matrixPanelScroll}
                    {matrixPanelFooter}
                </aside>
            </div>

            {!isLgLayout && (
                <div className="flex shrink-0 gap-2 border-t border-zinc-200 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={() => setMobileSheet((s) => (s === 'chapters' ? null : 'chapters'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md text-[10px] font-medium uppercase tracking-wide transition-all ${
                            mobileSheet === 'chapters' ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 bg-zinc-50 text-zinc-700'
                        }`}
                    >
                        <iconify-icon icon="mdi:book-open-page-variant" width="20" />
                        Chapters
                    </button>
                    <button
                        type="button"
                        onClick={() => setMobileSheet((s) => (s === 'matrix' ? null : 'matrix'))}
                        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md text-[10px] font-medium uppercase tracking-wide transition-all ${
                            mobileSheet === 'matrix' ? 'bg-emerald-700 text-white shadow-sm' : 'border border-zinc-200 bg-zinc-50 text-zinc-700'
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
                        className="animate-fade-in fixed inset-0 z-[55] bg-zinc-950/40"
                        onClick={() => setMobileSheet(null)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="creator-sheet-title"
                        className="animate-slide-up fixed inset-x-0 bottom-0 z-[60] flex max-h-[90vh] flex-col rounded-t-xl border border-zinc-200 border-b-0 bg-white shadow-lg"
                    >
                        <div className="flex justify-center pt-2 pb-1" aria-hidden>
                            <div className="h-1 w-10 rounded-full bg-zinc-300" />
                        </div>
                        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-2.5">
                            <span id="creator-sheet-title" className="text-xs font-black uppercase tracking-widest text-zinc-800">
                                {mobileSheet === 'chapters' ? 'Browse chapters' : 'Assessment matrix'}
                            </span>
                            <button
                                type="button"
                                className="rounded-xl p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
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
                <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm animate-fade-in">
                    <div className="mb-5 h-14 w-14 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900"></div>
                    <h3 className="text-sm font-semibold text-zinc-900">{loadingStep || 'Synthesizing…'}</h3>
                    <p className="mt-2 text-[11px] text-zinc-500">Please wait</p>
                </div>
            )}
        </div>
    );
};

export default TestCreatorView;
