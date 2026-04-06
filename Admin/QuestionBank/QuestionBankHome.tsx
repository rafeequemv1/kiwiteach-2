
import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog } from 'radix-ui';
import { supabase } from '../../supabase/client';
import { generateQuizQuestions, ensureApiKey, extractChapterReferenceImages, generateCompositeStyleVariants, generateCompositeFigures } from '../../services/geminiService';
import { fetchSyllabusTopicsForChapter, fetchUserExcludedTopicLabels } from '../../services/syllabusService';
import { resolveStoredPromptSetIdForKbGeneration } from '../../services/kbPromptService';
import { QuestionType, Question } from '../../Quiz/types';
import QuestionPaperItem, { QuestionFlagReason } from '../../Quiz/components/QuestionPaperItem';
import { ChapterStatChips } from '../../Quiz/components/ChapterStatChips';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';

const PAGE_SIZE = 12;

interface QuestionItem extends Question {
    chapter_id: string;
    chapter_name: string;
    subject_name: string;
    class_name: string;
    question_text: string;
    figure_url?: string;
    id: string;
    correct_index?: number;
    question_type?: string;
    topic_tag?: string;
    source_figure_url?: string; 
    column_a?: string[]; 
    column_b?: string[]; 
}

// ... (Interfaces ChapterStats, ChapterConfig remain unchanged) ...
interface ChapterStats {
    total: number;
    easy_count: number;
    medium_count: number;
    hard_count: number;
    mcq_count: number;
    reasoning_count: number;
    matching_count: number;
    statements_count: number;
    figure_count: number;
}

interface ChapterConfig {
    total: number;
    diff: { easy: number, medium: number, hard: number };
    types: { mcq: number, reasoning: number, matching: number, statements: number };
    visualMode: 'image' | 'text';
    selectedFigures: Record<number, number>;
    syntheticFigureCount: number;
    synthesisMode: 'standard' | 'syllabus';
    topicCounts: Record<string, { count: number; enabled: boolean }>;
    syllabusDifficulty: 'Easy' | 'Medium' | 'Hard';
    isProportional: boolean;
}

interface GraphNode {
  id: string;
  label: string;
  kind: 'kb' | 'class' | 'chapter';
  count: number;
}

const COST_ESTIMATES = {
  'gemini-3-pro-preview': 4.50, 
  'gemini-3-flash-preview': 0.15,
  'gemini-flash-lite-latest': 0.05
};

const STUDIO_MODEL_IDS = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'] as const;
const STUDIO_MODEL_META: Record<(typeof STUDIO_MODEL_IDS)[number], { label: string; icon: string }> = {
  'gemini-3-pro-preview': { label: 'Pro', icon: 'mdi:diamond-stone' },
  'gemini-3-flash-preview': { label: 'Flash', icon: 'mdi:lightning-bolt' },
  'gemini-flash-lite-latest': { label: 'Flash Lite', icon: 'mdi:feather' },
};

/** Scale Easy/Medium/Hard template counts to sum exactly to `total` (preserves ratio; largest remainder). */
function scaleDifficultyToTotal(
  template: { easy: number; medium: number; hard: number },
  total: number
): { easy: number; medium: number; hard: number } {
  const wE = Math.max(0, Math.floor(template.easy));
  const wM = Math.max(0, Math.floor(template.medium));
  const wH = Math.max(0, Math.floor(template.hard));
  const sumW = wE + wM + wH;
  if (total <= 0) return { easy: 0, medium: 0, hard: 0 };
  if (sumW <= 0) return { easy: 0, medium: total, hard: 0 };

  const exact = [(wE / sumW) * total, (wM / sumW) * total, (wH / sumW) * total];
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return { easy: out[0], medium: out[1], hard: out[2] };
}

/** Scale MCQ / assertion / matching / statements template counts to sum exactly to `total`. */
function scaleTypesToTotal(
  template: { mcq: number; reasoning: number; matching: number; statements: number },
  total: number
): { mcq: number; reasoning: number; matching: number; statements: number } {
  const keys = ['mcq', 'reasoning', 'matching', 'statements'] as const;
  const weights = keys.map((k) => Math.max(0, Math.floor(Number(template[k]) || 0)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
  if (sumW === 0) return { mcq: total, reasoning: 0, matching: 0, statements: 0 };
  const exact = weights.map((wi) => (wi / sumW) * total);
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return { mcq: out[0], reasoning: out[1], matching: out[2], statements: out[3] };
}

const QuestionBankHome: React.FC = () => {
  const [kbList, setKbList] = useState<any[]>([]);
  const [kbChapterCounts, setKbChapterCounts] = useState<Record<string, number>>({});
  const [chapters, setChapters] = useState<any[]>([]);
  const [chapterStats, setChapterStats] = useState<Record<string, ChapterStats>>({});
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [activeEditingChapterId, setActiveEditingChapterId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-pro-preview');
  
  const [mode, setMode] = useState<'browse' | 'studio' | 'review' | 'graph'>('browse');
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [isForgingBatch, setIsForgingBatch] = useState(false); 
  const [chapterSearch, setChapterSearch] = useState('');

  // Sidebar filters for faster chapter targeting.
  // Applies in both "Browse Repository" and "Neural Studio" modes.
  const [selectedClassFilters, setSelectedClassFilters] = useState<Set<string>>(new Set());
  const [selectedSubjectFilters, setSelectedSubjectFilters] = useState<Set<string>>(new Set());
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const stopForgingRef = useRef(false);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [browseFilters, setBrowseFilters] = useState({
      difficulty: 'all' as string,
      style: 'all' as string,
      hasFigure: false,
      showSource: false,
      showPromptSet: false,
  });

  const [reviewShowSource, setReviewShowSource] = useState(false);
  const [reviewShowChoices, setReviewShowChoices] = useState(true);
  const [reviewShowExplanations, setReviewShowExplanations] = useState(true);
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(new Set());
  const [flagReasonsByQuestionId, setFlagReasonsByQuestionId] = useState<Record<string, string>>({});

  const [chapterConfigs, setChapterConfigs] = useState<Record<string, ChapterConfig>>({});
  const [extractedFigures, setExtractedFigures] = useState<{data: string, mimeType: string}[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [forgeProgress, setForgeProgress] = useState('');
  /** When on, Forge uses the active chapter's E/M/H + style *ratios* scaled to each chapter's question total (standard only). */
  const [applyActiveStandardMixToAllChapters, setApplyActiveStandardMixToAllChapters] = useState(false);
  const [studioChapterConfigOpen, setStudioChapterConfigOpen] = useState(false);

  const [activeChapterSyllabus, setActiveChapterSyllabus] = useState<string[]>([]);
  const [isFetchingSyllabus, setIsFetchingSyllabus] = useState(false);
  /** Syllabus topic opened for full detail (Neural Studio — syllabus mode) */
  const [syllabusDetailTopic, setSyllabusDetailTopic] = useState<string | null>(null);
  /** Uniform bulk edits for syllabus-focused mode */
  const [syllabusUniformDelta, setSyllabusUniformDelta] = useState(1);
  const [syllabusUniformTarget, setSyllabusUniformTarget] = useState(1);
  const [bankUserId, setBankUserId] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
  const [docViewer, setDocViewer] = useState<{ html: string; name: string } | null>(null);
  const [graphPositions, setGraphPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const statsCache = useRef<Record<string, { data: Record<string, ChapterStats>, timestamp: number }>>({});

  // ... (Fetch logic remains the same) ...
  const fetchKbChapterCounts = async (list: { id: string }[]) => {
    if (!list.length) {
      setKbChapterCounts({});
      return;
    }
    const entries = await Promise.all(
      list.map(async (kb) => {
        const { count } = await supabase
          .from('chapters')
          .select('*', { count: 'exact', head: true })
          .eq('kb_id', kb.id);
        return [kb.id, count ?? 0] as const;
      })
    );
    setKbChapterCounts(Object.fromEntries(entries));
  };

  const fetchKbs = async () => {
    const { data } = await supabase.from('knowledge_bases').select('id, name').order('name');
    setKbList(data || []);
    if (data?.length && !selectedKbId) setSelectedKbId(data[0].id);
    if (data?.length) await fetchKbChapterCounts(data);
  };

  const fetchChapters = async (kbId: string) => {
    if (!kbId) return;
    setIsFetching(true);
    try {
        const { data: chaps } = await supabase.from('chapters')
            .select('id, name, chapter_number, subject_name, class_name, doc_path, pdf_path')
            .eq('kb_id', kbId)
            .order('chapter_number');
        setChapters(chaps || []);
        if (chaps && chaps.length > 0) fetchBulkStats(chaps.map(c => c.id));
    } finally {
        setIsFetching(false);
    }
  };

  const manualRefreshChapters = async () => {
    statsCache.current = {};
    if (kbList.length) await fetchKbChapterCounts(kbList);
    if (selectedKbId) await fetchChapters(selectedKbId);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        setBankUserId(session.user.id);
        fetchKbs();
    });
  }, []);

  useEffect(() => {
      if (selectedKbId) fetchChapters(selectedKbId);
  }, [selectedKbId]);

  useEffect(() => {
    // Reset filters when switching knowledge base.
    setSelectedClassFilters(new Set());
    setSelectedSubjectFilters(new Set());
  }, [selectedKbId]);

  // ... (Configs and Chat effects remain same) ...
  useEffect(() => {
      setChapterConfigs(prev => {
          const next = { ...prev };
          selectedChapterIds.forEach(id => {
              if (!next[id]) {
                  next[id] = {
                      total: 10,
                      diff: { easy: 0, medium: 8, hard: 2 },
                      types: { mcq: 6, reasoning: 2, matching: 1, statements: 1 },
                      visualMode: 'text',
                      selectedFigures: {},
                      syntheticFigureCount: 0,
                      synthesisMode: 'standard',
                      topicCounts: {},
                      syllabusDifficulty: 'Medium',
                      isProportional: true
                  };
              }
          });
          return next;
      });
      if (selectedChapterIds.size > 0 && (!activeEditingChapterId || !selectedChapterIds.has(activeEditingChapterId))) {
          setActiveEditingChapterId(Array.from(selectedChapterIds)[0]);
      }
  }, [selectedChapterIds]);

  // ... (Chat logic remains same) ...

  const grandTotals = useMemo(() => {
      let q = 0; let f = 0;
      Array.from(selectedChapterIds).forEach(id => {
          const cfg = chapterConfigs[id];
          if (!cfg) return;
          if (cfg.synthesisMode === 'syllabus') {
            const topics = Object.values(cfg.topicCounts || {}) as { count: number; enabled: boolean }[];
            q += topics.reduce((sum, topic) => sum + (topic.enabled ? topic.count : 0), 0);
          } else {
            q += cfg.total;
            if (cfg.visualMode === 'image') {
              f += (Object.values(cfg.selectedFigures || {}) as number[]).reduce((a: number, b: number) => a + b, 0);
            } else {
              f += cfg.syntheticFigureCount || 0;
            }
          }
      });
      return { questions: q, figures: f };
  }, [selectedChapterIds, chapterConfigs]);

  /** Live forge estimate: updates as chapter configs, model, or batch selection change. */
  const forgeCostPreview = useMemo(() => {
    const rate = COST_ESTIMATES[selectedModel as keyof typeof COST_ESTIMATES] || 0;
    const q = grandTotals.questions;
    return {
      inrTotal: (q * rate).toFixed(2),
      rate,
      questions: q,
      modelLabel: STUDIO_MODEL_META[selectedModel as keyof typeof STUDIO_MODEL_META]?.label ?? selectedModel,
    };
  }, [grandTotals.questions, selectedModel]);

  useEffect(() => {
      if (mode === 'browse') {
          if (selectedChapterIds.size > 0) fetchQuestions();
          else { setQuestions([]); setTotalCount(0); }
      }
  }, [selectedChapterIds, mode, currentPage, browseFilters.style, browseFilters.difficulty, browseFilters.hasFigure]);

  const activeChapterVisualMode = activeEditingChapterId ? chapterConfigs[activeEditingChapterId]?.visualMode : undefined;

  useEffect(() => {
      if (mode !== 'studio') {
          setExtractedFigures([]);
          setIsExtracting(false);
          return;
      }
      if (!activeEditingChapterId) {
          setExtractedFigures([]);
          setIsExtracting(false);
          return;
      }
      if (activeChapterVisualMode !== 'image') {
          setExtractedFigures([]);
          setIsExtracting(false);
          return;
      }
      let cancelled = false;
      setIsExtracting(true);
      (async () => {
          try {
              const { data: row } = await supabase
                  .from('chapters')
                  .select('doc_path, pdf_path')
                  .eq('id', activeEditingChapterId)
                  .single();
              if (cancelled) return;
              const imgs = await extractChapterReferenceImages(row?.doc_path ?? null, row?.pdf_path ?? null);
              if (!cancelled) setExtractedFigures(imgs);
          } catch (e) {
              console.error('Reference image load failed', e);
              if (!cancelled) setExtractedFigures([]);
          } finally {
              if (!cancelled) setIsExtracting(false);
          }
      })();
      return () => {
          cancelled = true;
      };
  }, [mode, activeEditingChapterId, activeChapterVisualMode]);

  // ... (Syllabus and Extraction logic remains same) ...
  useEffect(() => {
      if (mode === 'studio' && activeEditingChapterId) {
        const config = chapterConfigs[activeEditingChapterId];
        if (config?.synthesisMode === 'syllabus') fetchActiveSyllabus();
        else setActiveChapterSyllabus([]);
    }
  }, [activeEditingChapterId, mode, activeEditingChapterId ? chapterConfigs[activeEditingChapterId]?.synthesisMode : undefined]);

  useEffect(() => {
    setSyllabusDetailTopic(null);
  }, [activeEditingChapterId]);

  const fetchActiveSyllabus = async (force: boolean = false) => {
    // ... (same as original file) ...
    // Placeholder to keep logic consistent
    if (!activeEditingChapterId) return;
    const chapter = chapters.find(c => c.id === activeEditingChapterId);
    if (!chapter) return;
    const existingConfig = chapterConfigs[activeEditingChapterId];
    if (!force && existingConfig?.topicCounts && Object.keys(existingConfig.topicCounts).length > 0) {
        setActiveChapterSyllabus(Object.keys(existingConfig.topicCounts));
        return; 
    }
    setIsFetchingSyllabus(true);
    try {
        const topics = await fetchSyllabusTopicsForChapter({
            kbId: selectedKbId,
            chapterName: chapter.name.trim(),
            subjectName: chapter.subject_name || null,
        });
        setActiveChapterSyllabus(topics);
        setChapterConfigs(prev => {
            const cfg = { ...(prev[activeEditingChapterId!] || { total: 10, diff: { easy: 0, medium: 8, hard: 2 }, types: { mcq: 6, reasoning: 2, matching: 1, statements: 1 }, visualMode: 'text', selectedFigures: {}, syntheticFigureCount: 0, synthesisMode: 'syllabus', topicCounts: {}, syllabusDifficulty: 'Medium', isProportional: true }) };
            const nextTopicCounts: Record<string, { count: number; enabled: boolean }> = force ? {} : { ...(cfg.topicCounts || {}) };
            topics.forEach((t: string) => { if (!nextTopicCounts[t]) { nextTopicCounts[t] = { count: 1, enabled: true }; } });
            cfg.topicCounts = nextTopicCounts;
            return { ...prev, [activeEditingChapterId!]: cfg as ChapterConfig };
        });
    } catch (e) { console.error("Syllabus fetch failed", e); setActiveChapterSyllabus([]); } finally { setIsFetchingSyllabus(false); }
  };

  const fetchBulkStats = async (chapterIds: string[]) => {
      // ... (same logic) ...
      if (chapterIds.length === 0) return;
      const cacheKey = selectedKbId || 'default';
      const now = Date.now();
      if (statsCache.current[cacheKey] && (now - statsCache.current[cacheKey].timestamp < 60000)) { setChapterStats(statsCache.current[cacheKey].data); return; }
      const { data } = await supabase.rpc('get_chapters_bulk_stats', { target_chapter_ids: chapterIds });
      if (data) { const stats: Record<string, ChapterStats> = {}; data.forEach((s: any) => { stats[s.chapter_id] = s; }); setChapterStats(stats); statsCache.current[cacheKey] = { data: stats, timestamp: now }; }
  };

  const fetchQuestions = async () => {
      if (selectedChapterIds.size === 0) return;
      setIsFetching(true);
      try {
          let q = supabase.from('question_bank_neet').select('*, kb_prompt_sets(name)', { count: 'exact' });
          q = q.in('chapter_id', Array.from(selectedChapterIds));
          if (browseFilters.style !== 'all') q = q.eq('question_type', browseFilters.style);
          if (browseFilters.difficulty !== 'all') q = q.eq('difficulty', browseFilters.difficulty);
          if (browseFilters.hasFigure) q = q.not('figure_url', 'is', null);
          const from = (currentPage - 1) * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, to);
          if (error) throw error;
          // Clean up data for QuestionItem type compatibility
          const cleanData = (data || []).map((item: any) => {
              const nested = item.kb_prompt_sets;
              const promptSetName =
                  nested && typeof nested === 'object' && !Array.isArray(nested)
                      ? (nested as { name?: string }).name
                      : Array.isArray(nested) && nested[0]
                        ? (nested[0] as { name?: string }).name
                        : undefined;
              return {
                  ...item,
                  id: item.id,
                  text: item.question_text || item.text,
                  type: item.question_type || item.type,
                  correctIndex: item.correct_index,
                  columnA: item.column_a,
                  columnB: item.column_b,
                  figureDataUrl: item.figure_url,
                  sourceFigureDataUrl: item.source_figure_url,
                  topic_tag: item.topic_tag || 'General',
                  prompt_set_name: promptSetName ?? null,
              };
          });
          setQuestions(cleanData);
          setTotalCount(count || 0);
          setSelectedIds(new Set()); 
      } catch (err: any) { console.error("Fetch Failure:", err.message); setQuestions([]); setTotalCount(0); } finally { setIsFetching(false); }
  };

  const handleToggleSelect = (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIds(next);
  };

  const handleSelectAllOnPage = () => {
      const currentList = mode === 'review' ? reviewQueue : questions;
      if (selectedIds.size === currentList.length && currentList.length > 0) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(currentList.map(q => q.id))); }
  };

  const handleDeleteSelected = async () => {
      if (selectedIds.size === 0) return;
      if (mode === 'review') { setReviewQueue(prev => prev.filter(q => !selectedIds.has(q.id))); setSelectedIds(new Set()); return; }
      if (!confirm(`Delete ${selectedIds.size} items?`)) return;
      setIsSaving(true); setForgeProgress('Purging...');
      try {
          const { error } = await supabase.from('question_bank_neet').delete().in('id', Array.from(selectedIds));
          if (error) throw error;
          setQuestions(prev => prev.filter(q => !selectedIds.has(q.id)));
          setSelectedIds(new Set());
          if (selectedChapterIds.size > 0) fetchBulkStats(Array.from(selectedChapterIds));
      } finally { setIsSaving(false); setForgeProgress(''); }
  };

  const handleToggleChapter = (id: string) => {
    const next = new Set(selectedChapterIds);
    if(next.has(id)) { next.delete(id); if (activeEditingChapterId === id) setActiveEditingChapterId(next.size > 0 ? Array.from(next)[0] : null); } 
    else { next.add(id); setActiveEditingChapterId(id); }
    setSelectedChapterIds(next);
    setCurrentPage(1);
  };

  const handleRunForge = async () => {
      const chapterIds = Array.from(selectedChapterIds);
      if (chapterIds.length === 0) return alert("Select chapters.");
      setMode('review'); 
      setReviewQueue([]); 
      setIsForgingBatch(true); 
      stopForgingRef.current = false;
      try {
          let excludedTopicLabelsNormalized: string[] = [];
          if (bankUserId) {
              try {
                  excludedTopicLabelsNormalized = await fetchUserExcludedTopicLabels(
                      supabase,
                      bankUserId,
                      selectedKbId
                  );
              } catch (e) {
                  console.warn('Exclusions fetch failed', e);
              }
          }
          const batchPromptSetId = await resolveStoredPromptSetIdForKbGeneration(selectedKbId);
          for (let i = 0; i < chapterIds.length; i++) {
              if (stopForgingRef.current) break;
              const chapId = chapterIds[i];
              const chapter = chapters.find(c => c.id === chapId);
              const config = { ...chapterConfigs[chapId] }; 
              if (!chapter || !config) continue;
              const progressPrefix = `[${i+1}/${chapterIds.length}] ${String(chapter.name)}`;
              setForgeProgress(`${progressPrefix}: Boundary Lookup...`);
              
              try {
                  // ... (Syllabus boundary code) ...
                  let boundariesContext = "";
                  try {
                    const boundaryTopics = await fetchSyllabusTopicsForChapter({
                      kbId: selectedKbId,
                      chapterName: String(chapter.name).trim(),
                      subjectName: chapter.subject_name || null,
                    });
                    if (boundaryTopics.length > 0) {
                      boundariesContext = `[STRICT BOUNDARIES]: Topics: ${boundaryTopics.join(', ')}.`;
                    }
                  } catch { /* ignore */ }
                  const contentRes = await supabase.from('chapters').select('raw_text, doc_path, pdf_path').eq('id', chapId).single();
                  const rawText = (contentRes.data?.raw_text || "") + "\n\n" + boundariesContext;
                  const docPath = contentRes.data?.doc_path || chapter.doc_path; 
                  const pdfPath = contentRes.data?.pdf_path || chapter.pdf_path;

                  let chapterGeneratedQs: Question[] = [];
                  if (config.synthesisMode === 'syllabus') {
                      const enabledTopics = (Object.entries(config.topicCounts) as [string, { count: number; enabled: boolean }][]).filter(([_, tConf]) => tConf.enabled && tConf.count > 0);
                      for (const [topicName, topicConfig] of enabledTopics) {
                          if (stopForgingRef.current) break;
                          setForgeProgress(`${progressPrefix}: ${topicName}`);
                          const gen = await generateQuizQuestions(String(chapter.name), { easy: 0, medium: topicConfig.count, hard: 0 }, topicConfig.count, { text: rawText }, { mcq: topicConfig.count, reasoning: 0, matching: 0, statements: 0 }, undefined, 0, false, undefined, selectedModel, 'text', [String(topicName)], undefined, undefined, undefined, excludedTopicLabelsNormalized, selectedKbId);
                          chapterGeneratedQs.push(...gen);
                      }
                  } else {
                      config.total = Object.values(config.types).reduce((a: number, b: number) => a + b, 0);
                      let diffForGen = config.diff;
                      let typesForGen = { ...config.types };
                      if (
                        applyActiveStandardMixToAllChapters &&
                        activeEditingChapterId &&
                        chapterConfigs[activeEditingChapterId]
                      ) {
                        const tmpl = chapterConfigs[activeEditingChapterId];
                        diffForGen = scaleDifficultyToTotal(tmpl.diff, config.total);
                        typesForGen = scaleTypesToTotal(tmpl.types, config.total);
                      }
                      let figureCount = 0; let sourceImages: {data: string, mimeType: string}[] = [];
                      if (config.visualMode === 'image') { figureCount = (Object.values(config.selectedFigures || {}) as number[]).reduce((a: number, b: number) => a + b, 0); setForgeProgress(`${progressPrefix}: Scanning Visuals...`); sourceImages = await extractChapterReferenceImages(docPath ?? null, pdfPath ?? null); } else figureCount = config.syntheticFigureCount || 0;
                      
                      setForgeProgress(`${progressPrefix}: Synthesizing Questions...`);
                      const gen: Question[] = await generateQuizQuestions(String(chapter.name), diffForGen, config.total, { text: rawText, images: sourceImages }, typesForGen, undefined, figureCount, false, JSON.stringify(config.selectedFigures || {}), selectedModel, config.visualMode, undefined, undefined, undefined, undefined, excludedTopicLabelsNormalized, selectedKbId);
                      const figureQs = gen.filter(q => q.figurePrompt);
                      if (figureQs.length > 0 && figureCount > 0) {
                          setForgeProgress(`${progressPrefix}: Processing Visuals...`);
                          if (config.visualMode === 'image') {
                              if (sourceImages.length > 0) {
                                  const sourceEditGroups: Record<number, Question[]> = {};
                                  figureQs.forEach(q => { const sIdx = (q.sourceImageIndex !== undefined && sourceImages[q.sourceImageIndex]) ? q.sourceImageIndex : 0; const sourceImg = sourceImages[sIdx]; if (sourceImg?.data) q.sourceFigureDataUrl = `data:${sourceImg.mimeType};base64,${sourceImg.data}`; if (!sourceEditGroups[sIdx]) sourceEditGroups[sIdx] = []; sourceEditGroups[sIdx].push(q); });
                                  for (const [imgIdxStr, groupQs] of Object.entries(sourceEditGroups)) { if (stopForgingRef.current) break; const imgIdx = parseInt(imgIdxStr); const sourceImg = sourceImages[imgIdx]; if (sourceImg?.data) { const prompts = groupQs.map(q => q.figurePrompt!).filter(Boolean); const images = await generateCompositeStyleVariants(sourceImg.data, sourceImg.mimeType, prompts); groupQs.forEach((q, cIdx) => { if (images[cIdx]) q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; }); } }
                              }
                          } else { const images = await generateCompositeFigures(figureQs.map(q => q.figurePrompt!)); figureQs.forEach((q, idx) => { if (images[idx]) q.figureDataUrl = `data:image/png;base64,${images[idx]}`; }); }
                      }
                      chapterGeneratedQs = gen;
                  }
                  setReviewQueue(prev => [...prev, ...chapterGeneratedQs.map((q, k) => ({ id: `review-${chapter.id}-${Date.now()}-${k}`, chapter_id: chapter.id, chapter_name: chapter.name, subject_name: chapter.subject_name, class_name: chapter.class_name, question_text: q.text, options: q.options, correct_index: q.correctIndex, explanation: q.explanation, difficulty: q.difficulty, question_type: q.type, topic_tag: q.topic_tag || 'General', figure_url: q.figureDataUrl, source_figure_url: q.sourceFigureDataUrl, column_a: q.columnA, column_b: q.columnB, prompt_set_id: batchPromptSetId }))]);
              } catch (chapErr) { console.error(`Chapter Error`, chapErr); }
          }
      } catch (e: any) { alert("Batch Error: " + e.message); } finally { setIsForgingBatch(false); setForgeProgress(''); setMode('review'); }
  };

  const handleCommitReview = async () => {
    // ... (Commit logic same as original) ...
    if (reviewQueue.length === 0) return;
    setIsSaving(true);
    setForgeProgress('Cloud Sync...');
    try {
        const { error } = await supabase.from('question_bank_neet').insert(reviewQueue.map(item => ({ chapter_id: item.chapter_id, chapter_name: item.chapter_name, subject_name: item.subject_name, class_name: item.class_name, question_text: item.question_text, options: item.options, correct_index: item.correct_index, explanation: item.explanation, difficulty: item.difficulty, question_type: item.question_type, topic_tag: item.topic_tag || 'General', figure_url: item.figure_url, source_figure_url: item.source_figure_url, column_a: item.column_a, column_b: item.column_b, prompt_set_id: item.prompt_set_id ?? null })));
        if (error) throw error;
        alert(`Synced ${reviewQueue.length} items.`);
        setReviewQueue([]); setMode('browse'); fetchQuestions();
    } catch (err: any) { alert("Commit failed: " + err.message); } finally { setIsSaving(false); setForgeProgress(''); }
  };

  const handleInterruptStudio = () => {
    stopForgingRef.current = true;
  };

  // Helper inputs (StepNumberInput, etc)
  const StepNumberInput = ({ value, onChange, label, color, subText, min = 0, icon, disabled }: any) => (
    <div className={`flex flex-col gap-2 w-full bg-white p-3.5 rounded-2xl border border-zinc-100 shadow-sm ${disabled ? 'opacity-40 grayscale' : ''}`}>
        <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2">
                {icon && <iconify-icon icon={icon} className={`text-lg ${color}`} />}
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
                    {subText && <span className="text-[7px] font-bold text-zinc-300 uppercase">{subText}</span>}
                </div>
            </div>
        </div>
        <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden">
            <button disabled={disabled} onClick={() => onChange(Math.max(min, value - 1))} className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><iconify-icon icon="mdi:minus" /></button>
            <input disabled={disabled} type="number" value={value} onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))} className={`flex-1 min-w-0 bg-transparent text-center font-black text-sm outline-none ${color}`} />
            <button disabled={disabled} onClick={() => onChange(value + 1)} className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500"><iconify-icon icon="mdi:plus" /></button>
        </div>
    </div>
  );

  const activeConfig = activeEditingChapterId ? chapterConfigs[activeEditingChapterId] : null;
  const updateActiveConfig = (key: keyof ChapterConfig, nestedKey: string | null, val: any) => {
      if (!activeEditingChapterId) return;
      setChapterConfigs(prev => {
          const cfg = { ...prev[activeEditingChapterId!] };
          if (nestedKey) (cfg[key] as any) = { ...cfg[key] as any, [nestedKey]: val };
          else (cfg[key] as any) = val;
          if (key === 'types') cfg.total = Object.values(cfg.types).reduce((a: number, b: number) => a + b, 0);
          return { ...prev, [activeEditingChapterId!]: cfg };
      });
  };
  const handleUpdateProportionalTotal = (newTotal: number) => {
      if (!activeEditingChapterId) return;
      setChapterConfigs(prev => {
          const cfg = { ...prev[activeEditingChapterId!] };
          cfg.total = newTotal;
          cfg.diff.easy = 0; cfg.diff.medium = Math.round(newTotal * 0.75); cfg.diff.hard = newTotal - cfg.diff.medium;
          const typeBase = { mcq: 0.6, reasoning: 0.2, matching: 0.1, statements: 0.1 };
          cfg.types.mcq = Math.round(newTotal * typeBase.mcq); cfg.types.reasoning = Math.round(newTotal * typeBase.reasoning); cfg.types.matching = Math.round(newTotal * typeBase.matching); cfg.types.statements = newTotal - (cfg.types.mcq + cfg.types.reasoning + cfg.types.matching);
          return { ...prev, [activeEditingChapterId!]: cfg };
      });
  };
  const handleSynthesisModeChange = (synMode: 'standard' | 'syllabus') => {
    setSyllabusDetailTopic(null);
    updateActiveConfig('synthesisMode', null, synMode);
    if (synMode === 'syllabus') fetchActiveSyllabus();
    else setActiveChapterSyllabus([]);
  };
  const handleUpdateFigureCount = (idx: number, count: number) => { if (!activeEditingChapterId) return; setChapterConfigs(prev => { const cfg = { ...prev[activeEditingChapterId!] }; const nextSelected = { ...(cfg.selectedFigures || {}) }; if (count <= 0) delete nextSelected[idx]; else nextSelected[idx] = count; cfg.selectedFigures = nextSelected; return { ...prev, [activeEditingChapterId!]: cfg }; }); };
  const handleTopicCountChange = (topic: string, count: number) => { if (!activeEditingChapterId) return; setChapterConfigs(prev => { const cfg = { ...prev[activeEditingChapterId!] }; cfg.topicCounts = { ...cfg.topicCounts, [topic]: { ...cfg.topicCounts[topic], count: Math.max(0, count) } }; return { ...prev, [activeEditingChapterId!]: cfg }; }); };
  const handleTopicToggle = (topic: string) => { if (!activeEditingChapterId) return; setChapterConfigs(prev => { const cfg = { ...prev[activeEditingChapterId!] }; const current = cfg.topicCounts[topic]; cfg.topicCounts = { ...cfg.topicCounts, [topic]: { ...current, enabled: !current.enabled } }; return { ...prev, [activeEditingChapterId!]: cfg }; }); };
  const handleBulkTopicsAction = (action: 'all' | 'none') => { if (!activeEditingChapterId || !activeChapterSyllabus.length) return; setChapterConfigs(prev => { const cfg = { ...prev[activeEditingChapterId!] }; const next = { ...cfg.topicCounts }; activeChapterSyllabus.forEach(t => { if (next[t]) next[t] = { ...next[t], enabled: action === 'all' }; }); cfg.topicCounts = next; return { ...prev, [activeEditingChapterId!]: cfg }; }); };

  const handleAddUniformToEnabledSyllabusTopics = (delta: number) => {
    if (!activeEditingChapterId || delta === 0 || activeChapterSyllabus.length === 0) return;
    setChapterConfigs((prev) => {
      const cfg = { ...prev[activeEditingChapterId!] };
      const next = { ...cfg.topicCounts };
      activeChapterSyllabus.forEach((topic) => {
        const cur = next[topic] ?? { count: 0, enabled: false };
        if (!cur.enabled) return;
        next[topic] = { ...cur, count: Math.max(0, cur.count + delta) };
      });
      cfg.topicCounts = next;
      return { ...prev, [activeEditingChapterId!]: cfg };
    });
  };

  const handleSetUniformCountForEnabledSyllabusTopics = (n: number) => {
    if (!activeEditingChapterId || activeChapterSyllabus.length === 0) return;
    const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
    setChapterConfigs((prev) => {
      const cfg = { ...prev[activeEditingChapterId!] };
      const next = { ...cfg.topicCounts };
      activeChapterSyllabus.forEach((topic) => {
        const cur = next[topic] ?? { count: 0, enabled: false };
        if (!cur.enabled) return;
        next[topic] = { ...cur, count: v };
      });
      cfg.topicCounts = next;
      return { ...prev, [activeEditingChapterId!]: cfg };
    });
  };
  
  const openDocViewer = async (id: string) => {
    const chapter = chapters.find((c) => c.id === id);
    if (!chapter) {
      alert('Chapter not found.');
      return;
    }
    setIsSaving(true);
    setForgeProgress('Loading source…');
    setDocViewer(null);
    setPdfViewer(null);

    try {
      const { data: row, error: rowErr } = await supabase
        .from('chapters')
        .select('doc_path, pdf_path, name')
        .eq('id', id)
        .maybeSingle();
      if (rowErr) throw rowErr;

      const docPath = row?.doc_path ?? chapter.doc_path ?? null;
      const pdfPath = row?.pdf_path ?? (chapter as { pdf_path?: string }).pdf_path ?? null;
      const name = (row?.name || chapter.name || 'Chapter').trim();

      const openPdfFromStoragePath = async (path: string) => {
        const { data, error } = await supabase.storage.from('chapters').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) throw error || new Error('Could not create PDF link');
        setPdfViewer({ url: data.signedUrl, name });
      };

      const docLower = (docPath || '').toLowerCase();

      if (docPath && docLower.endsWith('.pdf')) {
        await openPdfFromStoragePath(docPath);
        return;
      }
      if (!docPath && pdfPath) {
        await openPdfFromStoragePath(pdfPath);
        return;
      }

      if (!docPath) {
        alert('No source document path for this chapter. Upload a DOCX or PDF in Knowledge Base.');
        return;
      }

      const mammoth = (window as any).mammoth;
      if (!mammoth?.convertToHtml) {
        alert('Document viewer (mammoth) is not loaded. Refresh the page.');
        return;
      }

      const { data: blob, error: dlErr } = await supabase.storage.from('chapters').download(docPath);
      if (dlErr || !blob) throw dlErr || new Error('Download failed');

      const arrayBuffer = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setDocViewer({ html: result.value, name });
    } catch (e) {
      console.error('openDocViewer', e);
      alert(
        'Could not open source. For PDF-only chapters use the Knowledge Base explorer, or ensure the file is DOCX and storage access is allowed.'
      );
    } finally {
      setIsSaving(false);
      setForgeProgress('');
    }
  };

  const classFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    chapters.forEach((c: any) => {
      const v = String(c.class_name || 'Unassigned');
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12);
  }, [chapters]);

  const subjectFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    chapters.forEach((c: any) => {
      const v = String(c.subject_name || 'Unassigned');
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12);
  }, [chapters]);

  const filteredSidebarChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    let base = !q ? chapters : chapters.filter(c => String(c.name || '').toLowerCase().includes(q));

    if (selectedClassFilters.size > 0) {
      base = base.filter(c => selectedClassFilters.has(String(c.class_name || 'Unassigned')));
    }
    if (selectedSubjectFilters.size > 0) {
      base = base.filter(c => selectedSubjectFilters.has(String(c.subject_name || 'Unassigned')));
    }
    return base;
  }, [chapters, chapterSearch, selectedClassFilters, selectedSubjectFilters]);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const displayQuestions = mode === 'review' ? reviewQueue : questions;

  const isUuidLike = (value: string | undefined | null) =>
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  useEffect(() => {
    const loadFlagsForVisibleQuestions = async () => {
      if (!bankUserId) {
        setFlaggedQuestionIds(new Set());
        setFlagReasonsByQuestionId({});
        return;
      }

      const visibleIds = displayQuestions
        .map((q: any) => String(q.id || ''))
        .filter((id: string) => isUuidLike(id));

      if (visibleIds.length === 0) {
        setFlaggedQuestionIds(new Set());
        setFlagReasonsByQuestionId({});
        return;
      }

      const { data, error } = await supabase
        .from('out_of_syllabus_question_flags')
        .select('question_id, reason')
        .in('question_id', visibleIds)
        .eq('flagged_by', bankUserId)
        .eq('exam_tag', 'neet');

      if (error) {
        console.warn('Could not load question flags:', error.message);
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

    void loadFlagsForVisibleQuestions();
  }, [bankUserId, displayQuestions]);

  const handleFlagOutOfSyllabus = async (questionId: string, reason: QuestionFlagReason = 'out_of_syllabus') => {
    if (!isUuidLike(questionId)) {
      alert('Only saved repository questions can be flagged.');
      return;
    }

    const { error } = await supabase.rpc('flag_question_out_of_syllabus', {
      p_question_id: questionId,
      p_knowledge_base_id: selectedKbId,
      p_reason: reason,
      p_exam_tag: 'neet',
    });

    if (error) {
      alert(error.message);
      return;
    }

    setFlaggedQuestionIds((prev) => new Set(prev).add(questionId));
    setFlagReasonsByQuestionId((prev) => ({ ...prev, [questionId]: reason }));
  };

  return (
    <div className={`${workspacePageClass} overflow-hidden relative`}>
        {/* PROGRESS OVERLAY — forge or save */}
        {(isSaving || isForgingBatch) && (
            <div className="fixed inset-0 z-[200] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in px-6">
                <div className="w-20 h-20 border-4 border-zinc-100 border-t-indigo-600 rounded-full animate-spin mb-8"></div>
                <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2 uppercase text-center">
                  {isForgingBatch ? 'Neural Forge' : 'Syncing repository'}
                </h3>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.25em] text-center max-w-lg leading-relaxed">
                  {forgeProgress || 'Processing…'}
                </p>
                {isForgingBatch && (
                  <button
                    type="button"
                    onClick={handleInterruptStudio}
                    className="mt-8 px-6 py-2.5 rounded-xl border-2 border-rose-200 bg-white text-rose-700 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-colors"
                  >
                    Interrupt
                  </button>
                )}
                <p className="mt-4 text-[9px] text-zinc-400 text-center max-w-sm">
                  Forge batches to review; interrupt stops before the next chapter or topic.
                </p>
            </div>
        )}
        
        {/* Header ... */}
        <header className="bg-white border-b border-zinc-200 z-30 shadow-sm shrink-0">
            <div className="min-h-14 px-3 sm:px-6 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 shadow-inner w-full sm:w-auto">
                    <button onClick={() => { setMode('browse'); setReviewQueue([]); }} className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'browse' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}>Browse Repository</button>
                    <button onClick={() => { setMode('studio'); setReviewQueue([]); }} className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'studio' || mode === 'review' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-400'}`}>Neural Studio</button>
                </div>
                {mode === 'review' && (
                    <button onClick={handleCommitReview} disabled={isForgingBatch} className="w-full sm:w-auto shrink-0 bg-emerald-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 sm:gap-3 active:scale-95 disabled:opacity-50">
                        <iconify-icon icon="mdi:cloud-check" width="20" /> Commit to Hub
                    </button>
                )}
            </div>
            {(mode === 'browse' || mode === 'review') && (
                <div className="bg-zinc-50/90 border-t border-zinc-100 px-3 sm:px-6 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4">
                    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                        <button onClick={handleSelectAllOnPage} className={`px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${selectedIds.size === (mode === 'review' ? reviewQueue.length : questions.length) && (mode === 'review' ? reviewQueue.length : questions.length) > 0 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}><iconify-icon icon={selectedIds.size === (mode === 'review' ? reviewQueue.length : questions.length) && (mode === 'review' ? reviewQueue.length : questions.length) > 0 ? "mdi:check-circle" : "mdi:circle-outline"} /> Select All</button>
                        {mode === 'browse' && (
                            <>
                                <div className="w-px h-6 bg-zinc-200 mx-2" />
                                <div className="flex items-center gap-1.5"><span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mr-1">Rigor:</span>{(['all', 'Easy', 'Medium', 'Hard'] as const).map(d => (<button key={d} onClick={() => { setBrowseFilters({...browseFilters, difficulty: d}); setCurrentPage(1); }} className={`px-3 py-1 rounded-full text-[8px] font-black uppercase transition-all border ${browseFilters.difficulty === d ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}>{d}</button>))}</div>
                                <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-4 ml-2"><select value={browseFilters.style} onChange={e => { setBrowseFilters({...browseFilters, style: e.target.value}); setCurrentPage(1); }} className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-[8px] font-black uppercase text-indigo-600 outline-none"><option value="all">ALL STYLES</option><option value="mcq">MCQ</option><option value="reasoning">ASSERTION</option><option value="matching">MATCHING</option><option value="statements">STATEMENTS</option></select></div>
                                <button onClick={() => { setBrowseFilters({...browseFilters, hasFigure: !browseFilters.hasFigure}); setCurrentPage(1); }} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${browseFilters.hasFigure ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:image-outline" /> Figure Only</button>
                                <button onClick={() => { setBrowseFilters({...browseFilters, showSource: !browseFilters.showSource}); }} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${browseFilters.showSource ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:image-search-outline" /> Show Source</button>
                                <button type="button" onClick={() => { setBrowseFilters({ ...browseFilters, showPromptSet: !browseFilters.showPromptSet }); }} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${browseFilters.showPromptSet ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:text-box-multiple-outline" /> Prompt set</button>
                            </>
                        )}
                        {mode === 'review' && (
                             <>
                                <div className="w-px h-6 bg-zinc-200 mx-2" />
                                <button onClick={() => setReviewShowSource(!reviewShowSource)} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${reviewShowSource ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:image-search-outline" /> Show Reference</button>
                                <button onClick={() => setReviewShowChoices(!reviewShowChoices)} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${reviewShowChoices ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:format-list-numbered" /> Show Choices</button>
                                <button onClick={() => setReviewShowExplanations(!reviewShowExplanations)} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${reviewShowExplanations ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:lightbulb-on-outline" /> Show Solution</button>
                             </>
                        )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0"><span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{mode === 'review' ? reviewQueue.length : totalCount} Items</span>{mode === 'browse' && (<div className="flex items-center bg-white border border-zinc-200 rounded-xl p-1 shadow-sm"><button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-indigo-600 transition-all disabled:opacity-30"><iconify-icon icon="mdi:chevron-left" /></button><span className="text-[9px] font-black text-indigo-600 px-3 uppercase">P.{currentPage} / {totalPages || 1}</span><button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-indigo-600 transition-all disabled:opacity-30"><iconify-icon icon="mdi:chevron-right" /></button></div>)}</div>
                </div>
            )}
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
            <aside className="w-full lg:w-80 lg:max-w-[20rem] lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-zinc-100 flex flex-col shrink-0 z-20 shadow-sm max-h-[min(42vh,420px)] lg:max-h-none min-h-0">
                {/* ... (Sidebar logic unchanged) ... */}
                <div className="space-y-3 border-b border-zinc-50 bg-zinc-50/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Question DB</span>
                        <button
                            type="button"
                            onClick={() => void manualRefreshChapters()}
                            className="group flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-all hover:text-indigo-600"
                            title="Refresh databases & chapters"
                        >
                            <iconify-icon icon="mdi:refresh" className="transition-transform duration-500 group-active:rotate-180" />
                        </button>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto custom-scrollbar pr-0.5">
                        {kbList.length === 0 ? (
                            <p className="py-4 text-center text-[9px] font-bold uppercase text-zinc-400">No databases</p>
                        ) : (
                            kbList.map((kb) => {
                                const active = selectedKbId === kb.id;
                                const chCount = kbChapterCounts[kb.id];
                                return (
                                    <button
                                        key={kb.id}
                                        type="button"
                                        onClick={() => setSelectedKbId(kb.id)}
                                    className={`w-full rounded-2xl border-2 p-3 text-left transition-all ${
                                            active
                                                ? 'border-indigo-400 bg-indigo-50 shadow-sm ring-1 ring-indigo-100'
                                                : 'border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50/80'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <div
                                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                                                    active ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-500'
                                                }`}
                                            >
                                                <iconify-icon icon="mdi:database-outline" width="18" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className={`truncate text-[10px] font-black uppercase leading-tight ${
                                                    active ? 'text-indigo-900' : 'text-zinc-800'
                                                    }`}
                                                >
                                                    {kb.name}
                                                </p>
                                            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-400">
                                                    {chCount !== undefined ? `${chCount} chapters` : '…'}
                                                </p>
                                                {active && (
                                                    <span className="mt-1 inline-block rounded-md bg-indigo-600 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-widest text-white">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    <div className="relative group">
                        <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search Chapters..."
                            value={chapterSearch}
                            onChange={(e) => setChapterSearch(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-[10px] font-black uppercase shadow-sm outline-none focus:border-indigo-500"
                        />
                    </div>

                    {(mode === 'browse' || mode === 'studio') && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Class</span>
                            {selectedClassFilters.size > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedClassFilters(new Set())}
                                className="text-[7px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedClassFilters(new Set())}
                              className={`px-2 py-1 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                                selectedClassFilters.size === 0
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                              }`}
                            >
                              All
                            </button>
                            {classFilterOptions.map(([cls, cnt]) => {
                              const active = selectedClassFilters.has(cls);
                              return (
                                <button
                                  key={cls}
                                  type="button"
                                  onClick={() =>
                                    setSelectedClassFilters(prev => {
                                      const next = new Set(prev);
                                      if (next.has(cls)) next.delete(cls);
                                      else next.add(cls);
                                      return next;
                                    })
                                  }
                                  className={`px-2 py-1 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                                    active
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                                  }`}
                                  title={`${cls} (${cnt} chapters)`}
                                >
                                  {cls}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Subject</span>
                            {selectedSubjectFilters.size > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedSubjectFilters(new Set())}
                                className="text-[7px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedSubjectFilters(new Set())}
                              className={`px-2 py-1 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                                selectedSubjectFilters.size === 0
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                              }`}
                            >
                              All
                            </button>
                            {subjectFilterOptions.map(([sub, cnt]) => {
                              const active = selectedSubjectFilters.has(sub);
                              return (
                                <button
                                  key={sub}
                                  type="button"
                                  onClick={() =>
                                    setSelectedSubjectFilters(prev => {
                                      const next = new Set(prev);
                                      if (next.has(sub)) next.delete(sub);
                                      else next.add(sub);
                                      return next;
                                    })
                                  }
                                  className={`px-2 py-1 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                                    active
                                      ? 'bg-amber-500 border-amber-500 text-white'
                                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                                  }`}
                                  title={`${sub} (${cnt} chapters)`}
                                >
                                  {sub}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 custom-scrollbar min-h-0">
                    {isFetching && chapters.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-zinc-300">
                            <iconify-icon icon="mdi:loading" className="animate-spin" width="24" />
                            <p className="text-[9px] font-black uppercase tracking-widest">Fetching chapters...</p>
                        </div>
                    ) : (
                        filteredSidebarChapters.map((c) => {
                            const active = selectedChapterIds.has(String(c.id));
                            const stats = chapterStats[String(c.id)];
                            return (
                                <div
                                    key={c.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleToggleChapter(String(c.id))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleToggleChapter(String(c.id))}
                                    className={`cursor-pointer rounded-[1.5rem] border-2 p-3 sm:p-4 transition-all min-w-0 overflow-hidden ${
                                        active ? 'border-indigo-200 bg-indigo-50 shadow-sm' : 'border-zinc-50 bg-white hover:bg-zinc-50/50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h4
                                            title={c.name}
                                            className={`flex-1 min-w-0 line-clamp-2 text-[10px] font-black uppercase leading-tight break-words [overflow-wrap:anywhere] ${
                                                active ? 'text-indigo-700' : 'text-zinc-700'
                                            }`}
                                        >
                                            {c.name}
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openDocViewer(c.id);
                                            }}
                                            className="text-zinc-300 transition-colors hover:text-indigo-500"
                                            title="Quick View Source"
                                        >
                                            <iconify-icon icon="mdi:file-document-outline" />
                                        </button>
                                    </div>
                                    <ChapterStatChips stats={stats} dense />
                                </div>
                            );
                        })
                    )}
                </div>
            </aside>

            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar bg-zinc-100/40 p-3 sm:p-6 lg:p-10">
                {mode === 'studio' ? (
                    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in pb-20">
                         {/* Studio — compact layout */}
                         {selectedChapterIds.size === 0 ? <div className="py-24 text-center opacity-30 flex flex-col items-center justify-center"><iconify-icon icon="mdi:arrow-left-bold" width="48" className="mb-3 animate-bounce-subtle text-zinc-300" /><p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Select chapters</p></div> : (
                            <>
                                <header className="flex flex-col gap-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <h2 className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight shrink-0">Neural Studio</h2>
                                  </div>
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-1 bg-white p-0.5 rounded-lg border border-zinc-200 w-full md:w-fit">
                                      {STUDIO_MODEL_IDS.map((m) => {
                                        const meta = STUDIO_MODEL_META[m];
                                        return (
                                          <button key={m} type="button" onClick={() => setSelectedModel(m)} className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all flex items-center justify-center gap-1 ${selectedModel === m ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                                            <iconify-icon icon={meta.icon} width="14" /> {meta.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                                      <button
                                        type="button"
                                        onClick={() => setStudioChapterConfigOpen(true)}
                                        disabled={!activeConfig}
                                        className="border border-zinc-200 bg-white px-4 py-2.5 rounded-lg font-semibold text-[10px] uppercase tracking-wide text-zinc-800 shadow-sm hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shrink-0 flex-1 sm:flex-none disabled:opacity-40"
                                      >
                                        <iconify-icon icon="mdi:cog-outline" width="18" /> Config
                                      </button>
                                      <button type="button" onClick={handleRunForge} disabled={isForgingBatch} className="bg-zinc-900 text-white px-4 py-2.5 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-md hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.99] shrink-0 flex-1 sm:flex-none disabled:opacity-50">
                                        <iconify-icon icon="mdi:lightning-bolt" width="18" /> Forge
                                      </button>
                                    </div>
                                  </div>
                                </header>
                                <div className="rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Active chapter</p>
                                    <p className="text-sm font-bold text-zinc-900 truncate">
                                      {activeEditingChapterId
                                        ? String(chapters.find((c) => c.id === activeEditingChapterId)?.name || 'Chapter')
                                        : '—'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setStudioChapterConfigOpen(true)}
                                    disabled={!activeConfig}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-indigo-800 transition-colors hover:bg-indigo-100 disabled:opacity-40"
                                  >
                                    <iconify-icon icon="mdi:open-in-new" width="16" /> Open chapter config
                                  </button>
                                </div>
                                <Dialog.Root open={studioChapterConfigOpen} onOpenChange={setStudioChapterConfigOpen}>
                                  <Dialog.Portal>
                                    <Dialog.Overlay className="fixed inset-0 z-[180] bg-black/45 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                                    <Dialog.Content className="fixed left-1/2 top-1/2 z-[190] flex max-h-[min(92vh,760px)] w-[calc(100vw-1.25rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl [color-scheme:light] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                                      <div className="shrink-0 flex items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/90 px-4 py-3 sm:px-5">
                                        <div className="min-w-0 pr-2">
                                          <Dialog.Title className="text-sm font-bold text-zinc-900">Chapter config</Dialog.Title>
                                          <Dialog.Description className="sr-only">
                                            Synthesis mode, visuals, difficulty counts, and question style counts for forge.
                                          </Dialog.Description>
                                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                                            {activeEditingChapterId
                                              ? String(chapters.find((c) => c.id === activeEditingChapterId)?.name || '')
                                              : ''}
                                          </p>
                                        </div>
                                        <Dialog.Close asChild>
                                          <button
                                            type="button"
                                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 shrink-0"
                                            aria-label="Close"
                                          >
                                            <iconify-icon icon="mdi:close" width="22" />
                                          </button>
                                        </Dialog.Close>
                                      </div>
                                      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 custom-scrollbar">
                                        {activeConfig ? (
                                            <div className="space-y-4 min-w-0 max-w-full overflow-hidden">
                                                <div className="space-y-4"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Synthesis Mode</label><div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200"><button onClick={() => handleSynthesisModeChange('standard')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeConfig.synthesisMode === 'standard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-400'}`}>Standard</button><button onClick={() => handleSynthesisModeChange('syllabus')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeConfig.synthesisMode === 'syllabus' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-400'}`}>Syllabus Focused</button></div></div>
                                                {/* (Rest of Studio Config as per original...) */}
                                                {activeConfig.synthesisMode === 'syllabus' ? (
                                                    <div className="space-y-4">
                                                        <div className="flex flex-col gap-2 w-full bg-white p-3.5 rounded-2xl border border-zinc-100 shadow-sm"><div className="flex justify-between items-center px-1"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Difficulty</label><button onClick={() => fetchActiveSyllabus(true)} className="text-[8px] font-black uppercase text-indigo-400 hover:text-indigo-600 flex items-center gap-1 transition-colors" title="Force Fetch Topics"><iconify-icon icon="mdi:refresh" /> Refresh Topics</button></div><select value={activeConfig.syllabusDifficulty} onChange={(e) => updateActiveConfig('syllabusDifficulty', null, e.target.value)} className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold outline-none"><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select></div>
                                                        <div className="space-y-3">
                                                          <div className="flex flex-wrap justify-between items-center gap-2 px-1">
                                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Syllabus topics</label>
                                                            <div className="flex gap-2 shrink-0">
                                                              <button type="button" onClick={() => handleBulkTopicsAction('all')} className="text-[7px] font-black uppercase text-indigo-500 hover:text-indigo-700">All</button>
                                                              <button type="button" onClick={() => handleBulkTopicsAction('none')} className="text-[7px] font-black uppercase text-zinc-400 hover:text-rose-500">None</button>
                                                            </div>
                                                          </div>
                                                          <p className="text-[8px] font-medium text-zinc-500 px-1 -mt-1">Tap a card to include/exclude and set question counts.</p>
                                                          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5 space-y-2">
                                                            <p className="text-[9px] font-semibold text-indigo-950">Uniform counts (enabled topics only)</p>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                              <span className="text-[8px] font-medium text-zinc-600">Add</span>
                                                              <input
                                                                type="number"
                                                                min={0}
                                                                max={50}
                                                                value={syllabusUniformDelta}
                                                                onChange={(e) =>
                                                                  setSyllabusUniformDelta(Math.max(0, parseInt(e.target.value, 10) || 0))
                                                                }
                                                                className="w-12 rounded border border-zinc-200 bg-white px-1 py-0.5 text-center text-[11px] font-bold text-indigo-700 outline-none focus:border-indigo-400"
                                                              />
                                                              <span className="text-[8px] text-zinc-500">to each</span>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleAddUniformToEnabledSyllabusTopics(syllabusUniformDelta)}
                                                                className="rounded-md bg-indigo-600 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
                                                              >
                                                                Apply
                                                              </button>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleAddUniformToEnabledSyllabusTopics(-syllabusUniformDelta)}
                                                                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[8px] font-semibold text-zinc-600 hover:bg-zinc-50"
                                                                title="Subtract this amount from each enabled topic"
                                                              >
                                                                −
                                                              </button>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100/80 pt-2">
                                                              <span className="text-[8px] font-medium text-zinc-600">Set all enabled to</span>
                                                              <input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                value={syllabusUniformTarget}
                                                                onChange={(e) =>
                                                                  setSyllabusUniformTarget(Math.max(0, parseInt(e.target.value, 10) || 0))
                                                                }
                                                                className="w-12 rounded border border-zinc-200 bg-white px-1 py-0.5 text-center text-[11px] font-bold text-indigo-700 outline-none focus:border-indigo-400"
                                                              />
                                                              <button
                                                                type="button"
                                                                onClick={() =>
                                                                  handleSetUniformCountForEnabledSyllabusTopics(syllabusUniformTarget)
                                                                }
                                                                className="rounded-md bg-white px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                                                              >
                                                                Set
                                                              </button>
                                                            </div>
                                                          </div>
                                                          <div className="max-h-[min(420px,50vh)] overflow-y-auto custom-scrollbar p-2 sm:p-3 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                                                            {isFetchingSyllabus && <p className="text-xs text-center p-4 text-zinc-400 animate-pulse">Fetching syllabus…</p>}
                                                            {activeChapterSyllabus.length === 0 && !isFetchingSyllabus && (
                                                              <div className="text-center p-6 flex flex-col items-center justify-center opacity-50">
                                                                <iconify-icon icon="mdi:file-search-outline" width="32" className="mb-2" />
                                                                <p className="text-[10px] font-black uppercase tracking-widest">No syllabus found</p>
                                                                <p className="text-[8px] font-medium mt-1">Map this chapter in Syllabus Manager.</p>
                                                                <button type="button" onClick={() => fetchActiveSyllabus(true)} className="mt-3 text-[9px] font-black uppercase text-indigo-600 bg-white border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm">Refetch</button>
                                                              </div>
                                                            )}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                              {activeChapterSyllabus.map((topic) => {
                                                                const topicConf = activeConfig.topicCounts[topic] || { count: 0, enabled: false };
                                                                return (
                                                                  <button
                                                                    key={topic}
                                                                    type="button"
                                                                    onClick={() => setSyllabusDetailTopic(topic)}
                                                                    className={`rounded-2xl border-2 p-3 text-left transition-all min-w-0 max-w-full ${
                                                                      topicConf.enabled ? 'border-indigo-200 bg-indigo-50/90 shadow-sm' : 'border-zinc-100 bg-white hover:border-zinc-200'
                                                                    }`}
                                                                  >
                                                                    <p className="text-[10px] font-bold text-zinc-800 line-clamp-3 break-words [overflow-wrap:anywhere] text-left">{topic}</p>
                                                                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                                                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${topicConf.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>
                                                                        {topicConf.enabled ? 'Included' : 'Off'}
                                                                      </span>
                                                                      {topicConf.enabled && topicConf.count > 0 && (
                                                                        <span className="text-[7px] font-black text-indigo-600">{topicConf.count} Q</span>
                                                                      )}
                                                                    </div>
                                                                    <span className="mt-2 inline-block text-[7px] font-black uppercase tracking-widest text-indigo-500">Open details →</span>
                                                                  </button>
                                                                );
                                                              })}
                                                            </div>
                                                          </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="space-y-4"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Visual Mode</label><div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200"><button onClick={() => updateActiveConfig('visualMode', null, 'text')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeConfig.visualMode === 'text' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-400'}`}>Text Only</button><button onClick={() => updateActiveConfig('visualMode', null, 'image')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeConfig.visualMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-400'}`}>Reference Image</button></div></div>
                                                        {activeConfig.visualMode === 'text' && <div className="bg-indigo-50/50 p-5 rounded-[2rem] border border-indigo-100 animate-slide-up"><div className="flex justify-between items-center mb-3"><div className="flex items-center gap-2"><iconify-icon icon="mdi:auto-fix" className="text-indigo-600" /><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Proportional Rigor Scalar</span></div><span className="bg-white px-2 py-0.5 rounded-lg border border-indigo-200 text-[10px] font-black text-indigo-700 shadow-sm">{activeConfig.total} Items</span></div><input type="range" min="1" max="100" value={activeConfig.total} onChange={(e) => handleUpdateProportionalTotal(parseInt(e.target.value))} className="w-full h-1.5 bg-indigo-200 rounded-full appearance-none cursor-pointer accent-indigo-600 mb-3" /><button onClick={() => updateActiveConfig('isProportional', null, !activeConfig.isProportional)} className="mt-4 w-full py-1.5 bg-white border border-indigo-100 rounded-xl text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600 transition-colors">{activeConfig.isProportional ? 'Switch to Manual Distribution' : 'Lock Proportional Mode'}</button></div>}
                                                        {activeConfig.visualMode === 'image' ? (
                                                          <div className="space-y-2">
                                                            <p className="text-[8px] font-medium text-zinc-500 px-0.5 leading-relaxed">
                                                              From DOCX embeds, or PDF pages if the chapter has no DOCX images. Toggle Reference Image again to reload.
                                                            </p>
                                                            <div className="grid grid-cols-2 gap-3 max-h-[min(420px,55vh)] overflow-y-auto custom-scrollbar pr-2 p-2 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
                                                              {isExtracting ? (
                                                                <div className="col-span-2 flex flex-col items-center justify-center py-14 gap-3 text-zinc-400">
                                                                  <div className="w-10 h-10 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin" />
                                                                  <span className="text-[10px] font-semibold uppercase tracking-wider">Loading reference images…</span>
                                                                </div>
                                                              ) : extractedFigures.length > 0 ? (
                                                                extractedFigures.map((fig, idx) => {
                                                                  const count = activeConfig.selectedFigures?.[idx] || 0;
                                                                  return (
                                                                    <div
                                                                      key={idx}
                                                                      className={`relative group flex flex-col bg-white border-2 rounded-2xl overflow-hidden transition-all min-h-0 ${count > 0 ? 'border-indigo-500 shadow-md' : 'border-zinc-100'}`}
                                                                    >
                                                                      <div className="relative w-full bg-white flex items-center justify-center min-h-[140px] max-h-[220px]">
                                                                        <img
                                                                          src={`data:${fig.mimeType};base64,${fig.data}`}
                                                                          alt=""
                                                                          className="w-full h-full max-h-[220px] object-contain"
                                                                        />
                                                                      </div>
                                                                      <span className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider text-center py-1 border-t border-zinc-100 bg-zinc-50/80">
                                                                        #{idx + 1}
                                                                      </span>
                                                                      <div className="absolute inset-0 bg-zinc-900/0 group-hover:bg-zinc-900/30 transition-all flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
                                                                        <button
                                                                          type="button"
                                                                          onClick={() => handleUpdateFigureCount(idx, count - 1)}
                                                                          className="w-8 h-8 rounded-full bg-white text-zinc-900 shadow-lg opacity-0 group-hover:opacity-100 hover:scale-110 transition-all flex items-center justify-center"
                                                                        >
                                                                          <iconify-icon icon="mdi:minus" />
                                                                        </button>
                                                                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-md">
                                                                          {count}
                                                                        </div>
                                                                        <button
                                                                          type="button"
                                                                          onClick={() => handleUpdateFigureCount(idx, count + 1)}
                                                                          className="w-8 h-8 rounded-full bg-white text-zinc-900 shadow-lg opacity-0 group-hover:opacity-100 hover:scale-110 transition-all flex items-center justify-center"
                                                                        >
                                                                          <iconify-icon icon="mdi:plus" />
                                                                        </button>
                                                                      </div>
                                                                    </div>
                                                                  );
                                                                })
                                                              ) : (
                                                                <div className="col-span-2 text-center py-10 px-3 space-y-2">
                                                                  <p className="text-[10px] font-bold text-zinc-500">No reference images found</p>
                                                                  <p className="text-[8px] text-zinc-400 leading-relaxed">
                                                                    Upload a PDF or DOCX with figures on this chapter in Knowledge Base. PDFs load as page thumbnails (first 48 pages).
                                                                  </p>
                                                                </div>
                                                              )}
                                                            </div>
                                                          </div>
                                                        ) : !activeConfig.isProportional ? (
                                                          <StepNumberInput icon="mdi:molecule" label="Synthetic Visuals" subText="Circuits, Structures, Graphs" color="text-rose-600" value={activeConfig.syntheticFigureCount || 0} onChange={(v:number) => updateActiveConfig('syntheticFigureCount', null, v)} />
                                                        ) : null}
                                                        <div className={`grid grid-cols-1 gap-3 ${activeConfig.isProportional ? 'opacity-40 pointer-events-none' : ''}`}><StepNumberInput disabled={activeConfig.isProportional} label="Easy" color="text-emerald-500" value={activeConfig.diff.easy} onChange={(v:number) => updateActiveConfig('diff', 'easy', v)} /><StepNumberInput disabled={activeConfig.isProportional} label="Medium" color="text-amber-500" value={activeConfig.diff.medium} onChange={(v:number) => updateActiveConfig('diff', 'medium', v)} /><StepNumberInput disabled={activeConfig.isProportional} label="Hard" color="text-rose-500" value={activeConfig.diff.hard} onChange={(v:number) => updateActiveConfig('diff', 'hard', v)} /></div>
                                                        <div className="border-t border-zinc-100 pt-6 mt-6"><h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 mb-4">Question Styles</h4><div className="grid grid-cols-2 gap-3"><StepNumberInput disabled={activeConfig.isProportional} label="MCQ" color="text-indigo-500" value={activeConfig.types.mcq} onChange={(v:number) => updateActiveConfig('types', 'mcq', v)} /><StepNumberInput disabled={activeConfig.isProportional} label="Assertion" color="text-indigo-500" value={activeConfig.types.reasoning} onChange={(v:number) => updateActiveConfig('types', 'reasoning', v)} /><StepNumberInput disabled={activeConfig.isProportional} label="Matching" color="text-indigo-500" value={activeConfig.types.matching} onChange={(v:number) => updateActiveConfig('types', 'matching', v)} /><StepNumberInput disabled={activeConfig.isProportional} label="Statements" color="text-indigo-500" value={activeConfig.types.statements} onChange={(v:number) => updateActiveConfig('types', 'statements', v)} /></div></div>
                                                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                                                          <input
                                                            type="checkbox"
                                                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                                                            checked={applyActiveStandardMixToAllChapters}
                                                            onChange={(e) => setApplyActiveStandardMixToAllChapters(e.target.checked)}
                                                          />
                                                          <span className="min-w-0">
                                                            <span className="block text-[9px] font-black uppercase tracking-wide text-amber-950">Apply difficulty + styles to all chapters</span>
                                                            <span className="mt-0.5 block text-[8px] font-medium leading-snug text-zinc-600">
                                                              At forge time, each <strong className="font-semibold text-zinc-800">standard</strong> chapter uses this chapter&apos;s Easy/Medium/Hard and MCQ/assertion/matching/statements <em className="not-italic font-semibold text-zinc-700">ratios</em>, scaled to that chapter&apos;s own total count. Syllabus chapters unchanged.
                                                            </span>
                                                          </span>
                                                        </label>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                          <p className="py-10 text-center text-sm text-zinc-500">Select a chapter in the batch list, then configure.</p>
                                        )}
                                      </div>
                                    </Dialog.Content>
                                  </Dialog.Portal>
                                </Dialog.Root>
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div className="flex flex-col gap-3">
                                      <div className="rounded-xl border border-indigo-500/30 bg-zinc-900 p-4 text-white shadow-md flex flex-wrap items-center justify-between gap-3 transition-[box-shadow] duration-200">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-md">
                                            <iconify-icon icon="mdi:currency-inr" width="22" />
                                          </div>
                                          <div>
                                            <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide">Est. cost (live)</span>
                                            <div className="flex items-baseline gap-1.5 tabular-nums">
                                              <span className="text-2xl font-bold tracking-tight">₹{forgeCostPreview.inrTotal}</span>
                                              <span className="text-[10px] font-medium uppercase text-indigo-300">INR</span>
                                            </div>
                                            <p className="mt-1 text-[9px] font-medium text-zinc-400">
                                              {forgeCostPreview.questions} Q × ₹{forgeCostPreview.rate.toFixed(2)} · {forgeCostPreview.modelLabel}
                                            </p>
                                            {applyActiveStandardMixToAllChapters && (
                                              <p className="mt-1 text-[9px] font-semibold text-amber-200/90">
                                                Shared E/M/H + style mix at forge (standard chapters)
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right text-[10px]">
                                          <span className="font-semibold text-zinc-400 uppercase tracking-wide block">Batch</span>
                                          <span className="font-bold text-lg tabular-nums">
                                            {grandTotals.questions}{' '}
                                            <span className="text-zinc-500 font-normal text-xs">items</span>
                                          </span>
                                          <div className="mt-0.5 text-zinc-400">
                                            <span className="text-rose-300">{grandTotals.figures} fig</span>
                                            <span className="mx-1">·</span>
                                            <span className="text-indigo-300">{grandTotals.questions - grandTotals.figures} text</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex-1 overflow-hidden min-h-0">
                                        <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2 mb-4">
                                          <iconify-icon icon="mdi:layers-triple" className="text-indigo-600" width="20" /> Selected batch
                                        </h3>
                                        <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar max-h-[min(360px,50vh)] pr-1">
                                          {Array.from(selectedChapterIds).map((id: string) => {
                                            const chapter = chapters.find(c => c.id === id);
                                            const config = chapterConfigs[id as string];
                                            const isActive = activeEditingChapterId === id;
                                            let chapterTotalCount = 0;
                                            if (config?.synthesisMode === 'syllabus') {
                                              const topics = Object.values(config.topicCounts || {}) as { count: number; enabled: boolean }[];
                                              chapterTotalCount = topics.reduce((sum, t) => sum + (t.enabled ? t.count : 0), 0);
                                            } else chapterTotalCount = config?.total || 0;
                                            const isStd = config?.synthesisMode === 'standard';
                                            let rowDiff = config?.diff ?? { easy: 0, medium: 0, hard: 0 };
                                            let rowTypes = config?.types ?? { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
                                            if (
                                              applyActiveStandardMixToAllChapters &&
                                              isStd &&
                                              activeEditingChapterId &&
                                              chapterConfigs[activeEditingChapterId]?.synthesisMode === 'standard' &&
                                              chapterTotalCount > 0
                                            ) {
                                              const tmpl = chapterConfigs[activeEditingChapterId];
                                              rowDiff = scaleDifficultyToTotal(tmpl.diff, chapterTotalCount);
                                              rowTypes = scaleTypesToTotal(tmpl.types, chapterTotalCount);
                                            }
                                            return (
                                              <div
                                                key={id}
                                                onClick={() => setActiveEditingChapterId(id)}
                                                className={`bg-zinc-50 border rounded-lg p-3 flex items-center gap-3 transition-all cursor-pointer group ${
                                                  isActive ? 'bg-white border-indigo-500 shadow-sm' : 'border-zinc-200 hover:border-indigo-200'
                                                }`}
                                              >
                                                <div className="flex-1 min-w-0">
                                                  <h4 className={`text-[11px] font-semibold uppercase truncate ${isActive ? 'text-indigo-700' : 'text-zinc-700'}`}>
                                                    {String(chapter?.name || 'Chapter')}
                                                  </h4>
                                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                                    <span className="text-[8px] font-semibold text-zinc-500 uppercase bg-white px-1 py-0.5 rounded border border-zinc-100">
                                                      {chapterTotalCount} Q
                                                    </span>
                                                    {config?.synthesisMode === 'syllabus' ? (
                                                      <span className="text-[8px] font-semibold text-rose-600 bg-rose-50 px-1 py-0.5 rounded uppercase">Syllabus</span>
                                                    ) : (
                                                      <>
                                                        <span className="text-[8px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded" title="Easy (forge preview)">
                                                          E:{rowDiff.easy}
                                                        </span>
                                                        <span className="text-[8px] font-semibold text-amber-800 bg-amber-50 px-1 py-0.5 rounded" title="Medium (forge preview)">
                                                          M:{rowDiff.medium}
                                                        </span>
                                                        <span className="text-[8px] font-semibold text-rose-700 bg-rose-50 px-1 py-0.5 rounded" title="Hard (forge preview)">
                                                          H:{rowDiff.hard}
                                                        </span>
                                                        <span
                                                          className="text-[7px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 max-w-full truncate"
                                                          title="Style counts at forge (MCQ · Assertion · Matching · Statements)"
                                                        >
                                                          M{rowTypes.mcq}·A{rowTypes.reasoning}·m{rowTypes.matching}·S{rowTypes.statements}
                                                        </span>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setActiveEditingChapterId(id);
                                                      setStudioChapterConfigOpen(true);
                                                    }}
                                                    className="w-7 h-7 rounded-md bg-zinc-100 text-zinc-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center border border-zinc-200"
                                                    title="Chapter config"
                                                    type="button"
                                                  >
                                                    <iconify-icon icon="mdi:cog-outline" width="16" />
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openDocViewer(id);
                                                    }}
                                                    className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center border border-indigo-100"
                                                    title="View document"
                                                    type="button"
                                                  >
                                                    <iconify-icon icon="mdi:file-document-outline" width="16" />
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleToggleChapter(String(id));
                                                    }}
                                                    className="text-zinc-300 hover:text-rose-500 p-0.5"
                                                    type="button"
                                                  >
                                                    <iconify-icon icon="mdi:close-circle-outline" width="18" />
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                </div>

                            {syllabusDetailTopic && activeConfig && (
                              <div
                                className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-900/50 backdrop-blur-sm"
                                onClick={() => setSyllabusDetailTopic(null)}
                                role="presentation"
                              >
                                <div
                                  className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[min(90vh,640px)] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-zinc-200"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-4">
                                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Topic detail</h4>
                                    <button
                                      type="button"
                                      onClick={() => setSyllabusDetailTopic(null)}
                                      className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100"
                                      aria-label="Close"
                                    >
                                      <iconify-icon icon="mdi:close" width="22" />
                                    </button>
                                  </div>
                                  <p className="text-sm font-bold text-zinc-900 break-words [overflow-wrap:anywhere] leading-snug mb-6">{syllabusDetailTopic}</p>
                                  {(() => {
                                    const tc = activeConfig.topicCounts[syllabusDetailTopic] || { count: 0, enabled: false };
                                    return (
                                      <div className="space-y-4">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={tc.enabled}
                                            onChange={() => handleTopicToggle(syllabusDetailTopic)}
                                            className="w-5 h-5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                          />
                                          <span className="text-xs font-bold text-zinc-700">Include in batch</span>
                                        </label>
                                        <div>
                                          <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Questions for this topic</label>
                                          <input
                                            type="number"
                                            min={0}
                                            value={tc.count}
                                            onChange={(e) =>
                                              handleTopicCountChange(syllabusDetailTopic, Math.max(0, parseInt(e.target.value, 10) || 0))
                                            }
                                            className="w-full max-w-[120px] bg-zinc-50 border border-zinc-200 rounded-xl text-center font-black text-indigo-600 text-sm py-2"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSyllabusDetailTopic(null)}
                                          className="w-full py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700"
                                        >
                                          Done
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                            </>
                         )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 pb-24 sm:pb-40 w-full min-w-0">
                         {isFetching ? (
                             <div className="col-span-full h-full flex flex-col items-center justify-center text-zinc-300 animate-pulse py-40">
                                 <iconify-icon icon="mdi:database-search" width="64" className="mb-4" />
                                 <p className="text-xs font-black uppercase tracking-[0.3em]">Querying Hub...</p>
                             </div>
                         ) : displayQuestions.length === 0 ? (
                            <div className="col-span-full py-40 text-center opacity-30 flex flex-col items-center justify-center">
                                <iconify-icon icon="mdi:database-off-outline" width="64" className="mb-4 text-zinc-300" />
                                <p className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">{mode === 'review' ? 'Review queue empty.' : 'No questions found.'}</p>
                            </div>
                         ) : (
                            displayQuestions.map((q: any, idx) => (
                                <QuestionPaperItem 
                                    key={q.id || idx}
                                    index={idx}
                                    question={{
                                        ...q,
                                        // Ensure compat
                                        text: q.question_text || q.text,
                                        type: q.question_type || q.type,
                                        correctIndex: q.correct_index !== undefined ? q.correct_index : q.correctIndex,
                                        figureDataUrl: q.figure_url || q.figureDataUrl,
                                        sourceFigureDataUrl: q.source_figure_url || q.sourceFigureDataUrl,
                                        columnA: q.column_a || q.columnA,
                                        columnB: q.column_b || q.columnB,
                                        topic_tag: q.topic_tag || 'General'
                                    }}
                                    showExplanation={mode === 'review' && reviewShowExplanations}
                                    showSource={(mode === 'browse' && browseFilters.showSource) || (mode === 'review' && reviewShowSource)}
                                    showPromptSet={mode === 'browse' && browseFilters.showPromptSet}
                                    promptSetName={q.prompt_set_name ?? null}
                                    isSelected={selectedIds.has(String(q.id))}
                                    onToggleSelect={(id) => handleToggleSelect(String(id))}
                                    onFlagOutOfSyllabus={mode === 'browse' ? handleFlagOutOfSyllabus : undefined}
                                    isFlaggedOutOfSyllabus={flaggedQuestionIds.has(String(q.id))}
                                    flagReason={flagReasonsByQuestionId[String(q.id)] ?? null}
                                />
                            ))
                         )}
                    </div>
                )}
            </main>
        </div>

        {pdfViewer && (
          <div className="fixed inset-0 z-[350] flex flex-col bg-slate-900/95 p-4 backdrop-blur-md animate-fade-in">
            <div className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between text-white">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500 shadow-lg">
                  <iconify-icon icon="mdi:file-pdf-box" width="18" />
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-xs font-bold">{pdfViewer.name}</h4>
                  <p className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">Source (PDF)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPdfViewer(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-white/20"
                aria-label="Close"
              >
                <iconify-icon icon="mdi:close" width="16" />
              </button>
            </div>
            <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl">
              <iframe src={pdfViewer.url} title={pdfViewer.name} className="h-full min-h-[70vh] w-full border-none" />
            </div>
          </div>
        )}

        {docViewer && (
          <div className="fixed inset-0 z-[350] flex flex-col bg-slate-900/95 p-4 backdrop-blur-md animate-fade-in">
            <div className="mx-auto mb-3 flex w-full max-w-5xl items-center justify-between text-white">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 shadow-lg">
                  <iconify-icon icon="mdi:file-document-outline" width="18" />
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-xs font-bold">{docViewer.name}</h4>
                  <p className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">Source (DOCX)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDocViewer(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 transition-all hover:bg-white/20"
                aria-label="Close"
              >
                <iconify-icon icon="mdi:close" width="16" />
              </button>
            </div>
            <div className="custom-scrollbar mx-auto w-full max-w-5xl flex-1 overflow-y-auto rounded-xl border border-white/10 bg-white p-6 shadow-2xl md:p-12">
              <div
                className="prose prose-slate max-w-none font-serif text-base leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: docViewer.html }}
              />
            </div>
          </div>
        )}
    </div>
  );
};

export default QuestionBankHome;
