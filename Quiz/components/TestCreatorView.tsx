
import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabase/client';
import { SelectedChapter, TypeDistribution, CreateTestOptions, QuestionType, Question } from '../types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { ChapterStatChips } from './ChapterStatChips';
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
    /** @deprecated Ignored — use chapter blueprint only */
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
    initialManualQuestions: _initialManualQuestions,
    initialTotalTarget,
    initialDistributionMode,
    initialGlobalTypes,
    initialGlobalFigureCount,
}) => {
    void _initialManualQuestions;
    const [distributionMode, setDistributionMode] = useState<'count' | 'percent'>(initialDistributionMode ?? 'count');
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

    type CreatorPanel = null | 'curriculum' | 'mix' | 'matrix';
    const [creatorPanel, setCreatorPanel] = useState<CreatorPanel>(null);
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
        if (!creatorPanel) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setCreatorPanel(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [creatorPanel]);

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
        if (blueprint.some(b => b.id === ch.id)) {
            setBlueprint(blueprint.filter(b => b.id !== ch.id));
            return;
        }
        setBlueprint([...blueprint, {
            id: ch.id, name: ch.name, subjectName: ch.subject_name || '', className: ch.class_name || '',
            count: 10, figureCount: 0, difficulty: 'Global', source: 'db', selectionMode: distributionMode,
            visualMode: 'image'
        }]);
        setCreatorPanel(null);
    };

    const handleUpdateChapterCount = (id: string, val: number) => {
        setBlueprint(prev => prev.map(b => b.id === id ? { ...b, count: Math.max(0, val) } : b));
    };

    const getOptions = (): CreateTestOptions => {
        const finalQuestionsTotal =
            distributionMode === 'percent' ? totalTarget : blueprint.reduce((sum, b) => sum + b.count, 0);
        
        const chaptersWithFinalCounts = blueprint.map(b => {
            const count = distributionMode === 'percent' ? Math.round((b.count / 100) * totalTarget) : b.count;
            return { ...b, count, source: 'db' as const };
        });

        return {
            mode: 'multi-ai', topic: topic.trim() || 'Untitled Assessment', 
            chapters: chaptersWithFinalCounts,
            useGlobalDifficulty, globalDifficultyMix: globalDiff, 
            globalTypeMix: globalTypes,
            globalFigureCount,
            totalQuestions: finalQuestionsTotal, 
            selectionMode: 'auto',
            manualQuestions: [],
            targetClassId: targetOrgClassId || null,
            knowledgeBaseId: selectedKb || null,
            allowPastQuestions
        };
    };

    const handleAction = () => {
        setActionError(null);
        if (blueprint.length === 0) {
            setActionError('Add at least one chapter to the blueprint, or enter a chapter from the list.');
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

    const selectionInventory = useMemo(() => {
        return blueprint.map(b => ({
            id: b.id,
            name: b.name,
            selectedCount: b.count,
            selectedFigures: 0,
            targetCount: distributionMode === 'percent' ? Math.round((b.count / 100) * totalTarget) : b.count,
            difficulties: { 'Easy': 0, 'Medium': 0, 'Hard': 0 } as Record<string, number>,
            styles: {} as Record<string, number>,
            isBlueprint: true,
        }));
    }, [blueprint, distributionMode, totalTarget]);

    const globalInventoryStats = useMemo(() => {
        const blueprintQ =
            distributionMode === 'percent' ? totalTarget : blueprint.reduce((s, b) => s + b.count, 0);
        return {
            totalSelected: blueprintQ,
            totalTarget,
            totalFigures: globalFigureCount,
            difficulties: { 'Easy': 0, 'Medium': 0, 'Hard': 0 },
            styles: { 'mcq': 0, 'reasoning': 0, 'matching': 0, 'statements': 0 },
            subjects: {} as Record<string, number>,
        };
    }, [blueprint, totalTarget, distributionMode, globalFigureCount]);

    const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

    const MixStepper: React.FC<{
        label: string;
        value: number;
        onChange: (v: number) => void;
        color: string;
        mode: 'percent' | 'count';
        total: number;
    }> = ({ label, value, onChange, color, mode, total }) => {
        const v = clampPct(value);
        const countHint = mode === 'count' ? Math.round((v / 100) * total) : null;
        return (
            <div className="flex w-[7.25rem] shrink-0 flex-col gap-1">
                <div className="flex items-center justify-between gap-1 px-0.5">
                    <span className="text-[7px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
                    <span className={`text-[7px] font-bold ${color}`}>
                        {mode === 'percent' ? `${v}%` : countHint !== null ? `~${countHint}` : ''}
                    </span>
                </div>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label={`Decrease ${label}`}
                        onClick={() => onChange(clampPct(v - 1))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                    >
                        <iconify-icon icon="mdi:minus" width="22" />
                    </button>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={v}
                        onChange={(e) => onChange(clampPct(parseInt(e.target.value, 10) || 0))}
                        className="h-9 w-10 shrink-0 rounded-md border border-zinc-200 bg-white text-center text-xs font-bold text-zinc-800 shadow-sm outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        aria-label={`Increase ${label}`}
                        onClick={() => onChange(clampPct(v + 1))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                    >
                        <iconify-icon icon="mdi:plus" width="22" />
                    </button>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={v}
                    onChange={(e) => onChange(clampPct(parseInt(e.target.value, 10)))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-600"
                    aria-label={`${label} slider`}
                />
            </div>
        );
    };

    const mixStripLeading = (
        <div className="flex shrink-0 flex-wrap items-end gap-3 sm:gap-4">
            <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm">
                <button type="button" onClick={() => setDistributionMode('percent')} className={`min-h-8 rounded-sm px-2 py-1 text-[8px] font-semibold uppercase tracking-wide transition-all ${distributionMode === 'percent' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>%</button>
                <button type="button" onClick={() => setDistributionMode('count')} className={`min-h-8 rounded-sm px-2 py-1 text-[8px] font-semibold uppercase tracking-wide transition-all ${distributionMode === 'count' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>#</button>
            </div>
                <div className="flex flex-col gap-0.5">
                <label className="text-[7px] font-semibold uppercase tracking-wide text-zinc-500">Total Qs</label>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="Decrease total questions"
                        onClick={() => setTotalTarget((t) => Math.max(1, t - 1))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                    >
                        <iconify-icon icon="mdi:minus" width="22" />
                    </button>
                    <input
                        type="number"
                        min={1}
                        max={999}
                        value={totalTarget}
                        onChange={(e) => setTotalTarget(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                        className="h-9 w-12 rounded-md border border-zinc-200 bg-white text-center text-xs font-bold text-zinc-800 shadow-sm outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        aria-label="Increase total questions"
                        onClick={() => setTotalTarget((t) => Math.min(999, t + 1))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                    >
                        <iconify-icon icon="mdi:plus" width="22" />
                    </button>
                </div>
            </div>
        </div>
    );

    const mixStripSliders = (
        <div className="no-scrollbar flex min-w-0 flex-1 flex-wrap content-end items-end gap-x-3 gap-y-2 overflow-x-auto py-1">
            <MixStepper label="Easy" value={globalDiff.easy} onChange={(v) => setGlobalDiff({ ...globalDiff, easy: v })} color="text-emerald-600" mode={distributionMode} total={totalTarget} />
            <MixStepper label="Med" value={globalDiff.medium} onChange={(v) => setGlobalDiff({ ...globalDiff, medium: v })} color="text-amber-600" mode={distributionMode} total={totalTarget} />
            <MixStepper label="Hard" value={globalDiff.hard} onChange={(v) => setGlobalDiff({ ...globalDiff, hard: v })} color="text-rose-600" mode={distributionMode} total={totalTarget} />
            <div className="hidden h-8 w-px shrink-0 bg-zinc-200 sm:block" />
            <MixStepper label="MCQ" value={globalTypes.mcq} onChange={(v) => setGlobalTypes({ ...globalTypes, mcq: v })} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
            <MixStepper label="Reas" value={globalTypes.reasoning} onChange={(v) => setGlobalTypes({ ...globalTypes, reasoning: v })} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
            <MixStepper label="Match" value={globalTypes.matching} onChange={(v) => setGlobalTypes({ ...globalTypes, matching: v })} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
            <MixStepper label="Stmt" value={globalTypes.statements} onChange={(v) => setGlobalTypes({ ...globalTypes, statements: v })} color="text-zinc-600" mode={distributionMode} total={totalTarget} />
        </div>
    );

    const chaptersAsideNodes = (
        <>
            <div className="shrink-0 space-y-2 border-b border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Question database</p>
                <div className="max-h-32 space-y-1.5 overflow-y-auto custom-scrollbar pr-0.5">
                    {kbs.map((kb) => {
                        const active = selectedKb === kb.id;
                        const chCount = kbChapterCounts[kb.id];
                        return (
                            <button
                                key={kb.id}
                                type="button"
                                onClick={() => setSelectedKb(kb.id)}
                                className={`w-full rounded-lg border p-2 text-left transition-all ${
                                    active
                                        ? 'border-zinc-300 bg-white shadow-sm ring-1 ring-zinc-200/60'
                                        : 'border-zinc-200/80 bg-white hover:border-zinc-300'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                                            active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                                        }`}
                                    >
                                        <iconify-icon icon="mdi:database-outline" width="14" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={`truncate text-[8px] font-bold uppercase leading-tight ${
                                                active ? 'text-zinc-900' : 'text-zinc-800'
                                            }`}
                                        >
                                            {kb.name}
                                        </p>
                                        <p className="text-[6px] font-semibold uppercase text-zinc-400">
                                            {chCount !== undefined ? `${chCount} ch` : '…'}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className="relative group">
                    <iconify-icon icon="mdi:magnify" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="14" />
                    <input
                        type="text"
                        placeholder="Search chapters…"
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-[9px] font-medium shadow-sm outline-none focus:border-zinc-400"
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 custom-scrollbar">
                {classes.map(cl => (
                    <div key={cl.id}>
                        <button type="button" onClick={() => setSelectedClass(selectedClass === cl.id ? '' : cl.id)} className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide transition-all ${selectedClass === cl.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-50'}`}>{cl.name} <iconify-icon icon={selectedClass === cl.id ? "mdi:chevron-up" : "mdi:chevron-down"} width="16" /></button>
                        {selectedClass === cl.id && (
                            <div className="mt-0.5 pl-1.5">
                                {subjects.map(s => (
                                    <div key={s.id}>
                                        <button type="button" onClick={() => setSelectedSubject(selectedSubject === s.id ? '' : s.id)} className={`w-full min-h-8 rounded-md px-2 py-1 text-left text-[8px] font-bold uppercase transition-colors ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-400 hover:text-zinc-600'}`}>{s.name}</button>
                                        {selectedSubject === s.id && (
                                            <div className="mt-0.5 pl-1.5">
                                                {chapters.map((ch) => {
                                                    const inBlueprint = blueprint.some((b) => b.id === ch.id);
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
                                                            className={`mb-0.5 w-full cursor-pointer rounded-md px-2 py-1 text-left text-[8px] font-bold uppercase leading-snug transition-all ${
                                                                inBlueprint
                                                                        ? 'bg-zinc-900 text-white shadow-sm'
                                                                        : 'text-zinc-600 hover:bg-zinc-50'
                                                            }`}
                                                        >
                                                            <span className="block truncate">{ch.name}</span>
                                                            {chipStats && (
                                                                <ChapterStatChips
                                                                    stats={chipStats}
                                                                    dense
                                                                    onColoredBackground={inBlueprint}
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

    const matrixPanelScroll = (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 custom-scrollbar sm:p-4">
            <div className="space-y-2">
                <div className="flex items-end justify-between gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Progress</span>
                    <span className="text-lg font-bold tabular-nums text-zinc-800">
                        {globalInventoryStats.totalSelected} <span className="text-xs font-semibold text-zinc-400">/ {globalInventoryStats.totalTarget}</span>
                    </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 shadow-inner">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, (globalInventoryStats.totalSelected / Math.max(1, globalInventoryStats.totalTarget)) * 100)}%` }}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <h4 className="ml-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">Rigor</h4>
                <div className="grid grid-cols-3 gap-1.5">
                    <div className="flex flex-col items-center rounded-lg border border-emerald-100 bg-emerald-50/80 px-1 py-2 text-center">
                        <span className="text-[7px] font-bold uppercase text-emerald-600">Easy</span>
                        <span className="text-xs font-bold tabular-nums text-emerald-800">{globalInventoryStats.difficulties.Easy}</span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg border border-amber-100 bg-amber-50/80 px-1 py-2 text-center">
                        <span className="text-[7px] font-bold uppercase text-amber-600">Med</span>
                        <span className="text-xs font-bold tabular-nums text-amber-800">{globalInventoryStats.difficulties.Medium}</span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg border border-rose-100 bg-rose-50/80 px-1 py-2 text-center">
                        <span className="text-[7px] font-bold uppercase text-rose-600">Hard</span>
                        <span className="text-xs font-bold tabular-nums text-rose-800">{globalInventoryStats.difficulties.Hard}</span>
                    </div>
                </div>
            </div>
                <div className="space-y-2">
                <h4 className="ml-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">Styles</h4>
                <div className="space-y-1">
                    {Object.entries(globalInventoryStats.styles).map(([style, count]) => (
                        <div
                            key={style}
                            className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 transition-colors hover:border-emerald-200/60"
                        >
                            <span className="text-[8px] font-bold uppercase tracking-wide text-zinc-500">{style}</span>
                            <span className="text-xs font-bold tabular-nums text-zinc-800">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
                <div className="space-y-2">
                <h4 className="ml-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">By chapter</h4>
                <div className="space-y-1.5">
                    {selectionInventory.map((item) => (
                        <div key={item.id} className="rounded-lg border border-zinc-100 bg-white px-2.5 py-2 shadow-sm">
                            <div className="mb-1 flex items-start justify-between gap-2">
                                <h5 className="flex-1 truncate text-[9px] font-bold uppercase text-zinc-700">{item.name}</h5>
                                <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold tabular-nums ${
                                        item.selectedCount >= item.targetCount ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                                    }`}
                                >
                                    {item.selectedCount}/{item.targetCount}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {item.difficulties.Easy > 0 && (
                                    <span className="rounded bg-emerald-50 px-1 py-0.5 text-[6px] font-bold uppercase text-emerald-600">E:{item.difficulties.Easy}</span>
                                )}
                                {item.difficulties.Medium > 0 && (
                                    <span className="rounded bg-amber-50 px-1 py-0.5 text-[6px] font-bold uppercase text-amber-600">M:{item.difficulties.Medium}</span>
                                )}
                                {item.difficulties.Hard > 0 && (
                                    <span className="rounded bg-rose-50 px-1 py-0.5 text-[6px] font-bold uppercase text-rose-600">H:{item.difficulties.Hard}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const creatorPanelTitle = (p: NonNullable<CreatorPanel>) =>
        p === 'curriculum' ? 'Curriculum' : p === 'mix' ? 'Mix & totals' : 'Assessment matrix';

    const autoQuestionSummary =
        blueprint.length > 0
            ? `${blueprint.length} ch · ${distributionMode === 'percent' ? totalTarget : blueprint.reduce((s, b) => s + b.count, 0)} Q`
            : null;

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
                            <p className="truncate text-[11px] text-zinc-500">{autoQuestionSummary || 'Chapter blueprint'}</p>
                        </div>
                        <div className="h-11 w-11 shrink-0" aria-hidden />
                    </div>
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Assessment title…" className="min-h-11 w-full rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-800 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-400" />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'curriculum' ? null : 'curriculum'))}
                            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold uppercase tracking-wide transition-all sm:flex-initial sm:px-3 ${
                                creatorPanel === 'curriculum' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                            }`}
                        >
                            <iconify-icon icon="mdi:book-open-page-variant" width="18" />
                            Curriculum
                            {blueprint.length > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold tabular-nums ${creatorPanel === 'curriculum' ? 'bg-white/20' : 'bg-zinc-200 text-zinc-800'}`}>
                                    {blueprint.length}
                                </span>
                            )}
                            </button>
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'mix' ? null : 'mix'))}
                            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold uppercase tracking-wide transition-all sm:flex-initial sm:px-3 ${
                                creatorPanel === 'mix' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                            }`}
                        >
                            <iconify-icon icon="mdi:tune-variant" width="18" />
                            Mix
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'matrix' ? null : 'matrix'))}
                            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold uppercase tracking-wide transition-all sm:flex-initial sm:px-3 ${
                                creatorPanel === 'matrix' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                            }`}
                        >
                            <iconify-icon icon="mdi:clipboard-list-outline" width="18" />
                            Matrix
                            {blueprint.length > 0 && (
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold tabular-nums ${
                                        creatorPanel === 'matrix' ? 'bg-white/25' : 'bg-emerald-100 text-emerald-900'
                                    }`}
                                >
                                    {blueprint.length}
                                </span>
                            )}
                            </button>
                        </div>
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
                        <button type="button" onClick={handleAction} disabled={isLoading} className="flex min-h-11 min-w-[120px] flex-1 items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 text-[10px] font-medium uppercase tracking-wide text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50">
                            Forge
                        </button>
                    </div>
                </div>

                {/* Desktop */}
                <div className="hidden min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:flex">
                    <div className="flex shrink-0 items-center gap-3">
                        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800" aria-label="Back">
                            <iconify-icon icon="mdi:arrow-left" width="20" />
                        </button>
                        <div className="min-w-[140px]">
                            <h1 className="mb-0.5 text-lg font-semibold tracking-tight text-zinc-900">Test creator</h1>
                            <p className="text-[13px] text-zinc-500">
                                {autoQuestionSummary || 'Shape your test on the canvas'}
                            </p>
                        </div>
                    </div>

                    <div className="hidden shrink-0 flex-wrap items-center gap-2 lg:flex">
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'curriculum' ? null : 'curriculum'))}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                                creatorPanel === 'curriculum' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50'
                            }`}
                        >
                            <iconify-icon icon="mdi:book-open-page-variant" width="16" />
                            Curriculum
                            {blueprint.length > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${creatorPanel === 'curriculum' ? 'bg-white/20' : 'bg-zinc-100 text-zinc-800'}`}>
                                    {blueprint.length}
                                </span>
                            )}
                            </button>
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'mix' ? null : 'mix'))}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                                creatorPanel === 'mix' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50'
                            }`}
                        >
                            <iconify-icon icon="mdi:tune-variant" width="16" />
                            Mix
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreatorPanel((p) => (p === 'matrix' ? null : 'matrix'))}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                                creatorPanel === 'matrix' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50'
                            }`}
                        >
                            <iconify-icon icon="mdi:clipboard-list-outline" width="16" />
                            Matrix
                            {blueprint.length > 0 && (
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                                        creatorPanel === 'matrix' ? 'bg-white/25' : 'bg-emerald-100 text-emerald-900'
                                    }`}
                                >
                                    {blueprint.length}
                                </span>
                            )}
                            </button>
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
                        <button type="button" onClick={handleAction} disabled={isLoading} className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50">
                            Forge Assessment
                        </button>
                    </div>
                </div>

            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <main className="relative min-h-0 flex-1 overflow-y-auto bg-zinc-50/80 custom-scrollbar px-4 py-4 sm:px-6 lg:px-10 xl:px-16">
                    <div className="mx-auto w-full max-w-2xl space-y-2 pb-20 lg:max-w-3xl">
                            {blueprint.map((item, idx) => (
                                <div
                                    key={item.id}
                                    className="group flex animate-slide-up items-center gap-2 rounded-lg border border-zinc-200/90 bg-white px-2.5 py-2 shadow-sm sm:gap-3 sm:px-3"
                                >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-bold text-white">{idx + 1}</div>
                                        <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-xs font-semibold leading-tight text-zinc-900">{item.name}</h3>
                                        <p className="truncate text-[10px] text-zinc-500">{item.subjectName}</p>
                                        </div>
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        <button
                                            type="button"
                                            aria-label="Decrease question count"
                                            onClick={() => handleUpdateChapterCount(item.id, Math.max(0, item.count - 1))}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                                        >
                                            <iconify-icon icon="mdi:minus" width="22" />
                                        </button>
                                        <input
                                            type="number"
                                            min={0}
                                            value={item.count}
                                            onChange={(e) => handleUpdateChapterCount(item.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                                            className="h-9 w-11 rounded-md border border-zinc-200 bg-white text-center text-xs font-bold text-zinc-800 shadow-sm outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                        <button
                                            type="button"
                                            aria-label="Increase question count"
                                            onClick={() => handleUpdateChapterCount(item.id, item.count + 1)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-transform hover:bg-zinc-50 active:scale-95"
                                        >
                                            <iconify-icon icon="mdi:plus" width="22" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => addToBlueprint(item as any)}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 transition-all hover:bg-rose-500 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                                        title="Remove chapter"
                                        aria-label="Remove chapter"
                                    >
                                            <iconify-icon icon="mdi:trash-can-outline" width="18" />
                                        </button>
                                </div>
                            ))}
                            {blueprint.length === 0 && (
                                <div className="flex flex-col items-center gap-3 py-16 text-center text-zinc-400">
                                    <iconify-icon icon="mdi:creation" width="48" />
                                    <p className="text-xs font-bold uppercase tracking-widest">Select chapters to begin</p>
                        </div>
                                    )}
                                </div>
                </main>
            </div>

            {creatorPanel && (
                <>
                    <button
                        type="button"
                        aria-label="Close panel"
                        className="animate-fade-in fixed inset-0 z-[55] bg-zinc-950/40"
                        onClick={() => setCreatorPanel(null)}
                    />
                    {isLgLayout ? (
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="creator-panel-title"
                            className="fixed left-1/2 top-1/2 z-[60] flex max-h-[min(85vh,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl animate-fade-in"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                                <span id="creator-panel-title" className="text-sm font-semibold text-zinc-900">
                                    {creatorPanelTitle(creatorPanel)}
                                </span>
                    <button
                        type="button"
                                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800"
                                    onClick={() => setCreatorPanel(null)}
                                    aria-label="Close"
                                >
                                    <iconify-icon icon="mdi:close" width="22" />
                    </button>
                </div>
                            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                                {creatorPanel === 'curriculum' && (
                                    <div className="flex min-h-[min(60vh,480px)] flex-col">{chaptersAsideNodes}</div>
                                )}
                                {creatorPanel === 'mix' && (
                                    <div className="flex flex-col gap-4 p-4">
                                        {mixStripLeading}
                                        <div className="flex flex-wrap content-end items-end gap-x-3 gap-y-3 border-t border-zinc-100 pt-4">
                                            {mixStripSliders}
                                        </div>
                                    </div>
                                )}
                                {creatorPanel === 'matrix' && <div className="p-1">{matrixPanelScroll}</div>}
                            </div>
                            <div className="shrink-0 border-t border-zinc-200 bg-zinc-50/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button
                        type="button"
                                    onClick={() => setCreatorPanel(null)}
                                    className="flex min-h-10 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-800 shadow-sm hover:bg-zinc-50"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : (
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
                                    {creatorPanelTitle(creatorPanel)}
                            </span>
                            <button
                                type="button"
                                className="rounded-xl p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                    onClick={() => setCreatorPanel(null)}
                                aria-label="Close"
                            >
                                <iconify-icon icon="mdi:close" width="22" />
                            </button>
                        </div>
                            <div className="flex max-h-[min(72vh,calc(90vh-5.5rem))] min-h-0 flex-1 flex-col overflow-hidden">
                                {creatorPanel === 'curriculum' && (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chaptersAsideNodes}</div>
                                )}
                                {creatorPanel === 'mix' && (
                                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
                                        <div className="flex flex-col gap-4">
                                            {mixStripLeading}
                                            <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4">{mixStripSliders}</div>
                                        </div>
                                </div>
                            )}
                                {creatorPanel === 'matrix' && (
                                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">{matrixPanelScroll}</div>
                                )}
                        </div>
                            <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                                <button
                                    type="button"
                                    onClick={() => setCreatorPanel(null)}
                                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-800 shadow-sm hover:bg-zinc-50"
                                >
                                    Done
                                </button>
                    </div>
                        </div>
                    )}
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
