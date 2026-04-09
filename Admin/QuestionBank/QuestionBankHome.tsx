
import '../../types';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog } from 'radix-ui';
import { supabase } from '../../supabase/client';
import { generateQuizQuestions, ensureApiKey, extractChapterReferenceImages, generateCompositeStyleVariants, generateCompositeFigures } from '../../services/geminiService';
import { fetchSyllabusTopicsForChapter, fetchUserExcludedTopicLabels } from '../../services/syllabusService';
import {
  listKbPromptSets,
  resolveForgePromptProvenance,
  hydrateHubPromptSetDisplayName,
  hubPromptSetDisplayNameFallback,
  fetchKbPromptSetName,
  labelPromptGenerationSource,
  describePromptGenerationSource,
  isLikelyUuid,
  type KbPromptSetRow,
  type KbGenerationPromptSource,
} from '../../services/kbPromptService';
import { bankLabelForTextGenerationModel } from '../../services/studioGenerationModelLabels';
import {
  sanitizeRowForAnalysis,
  questionItemToAnalysisRow,
  runForgeBatchQualityAnalysis,
  type AnalysisTableRow,
} from '../../services/forgeBatchAnalysis';
import { QuestionType, Question } from '../../Quiz/types';
import { assertBankRowsPassLatexValidation } from '../../utils/latexBankValidation';

/** Scale Easy/Medium/Hard template to sum exactly to `total` (largest remainder). Used when splitting forge into per-style API calls. */
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

/** Largest-remainder scaling for MCQ / Assertion / Matching / Statements weights → exact question counts. */
function scaleTypeWeightsToTotal(
  weights: { mcq: number; reasoning: number; matching: number; statements: number },
  total: number
): { mcq: number; reasoning: number; matching: number; statements: number } {
  const keys = ['mcq', 'reasoning', 'matching', 'statements'] as const;
  const ws = keys.map((k) => Math.max(0, Math.floor(weights[k])));
  const sumW = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
  if (sumW <= 0) return { mcq: total, reasoning: 0, matching: 0, statements: 0 };
  const exact = keys.map((_, i) => (ws[i] / sumW) * total);
  const floor = exact.map((x) => Math.floor(x));
  let rem = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  const out = [...floor];
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return { mcq: out[0], reasoning: out[1], matching: out[2], statements: out[3] };
}

/** One Gemini call per style when all four styles and E/M/H are used — avoids one mega-prompt with coupled constraints. */
function shouldSplitStandardForgeByStyle(
  types: { mcq: number; reasoning: number; matching: number; statements: number },
  diff: { easy: number; medium: number; hard: number },
  figureCount: number
): boolean {
  if (figureCount > 0) return false;
  const t = types;
  if (t.mcq <= 0 || t.reasoning <= 0 || t.matching <= 0 || t.statements <= 0) return false;
  if (diff.easy <= 0 || diff.medium <= 0 || diff.hard <= 0) return false;
  return true;
}
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

/** RPC `get_chapters_bulk_stats` returns `total_count` (and aliases); normalize for UI + aggregates. */
function normalizeChapterStatsRpcRow(s: Record<string, unknown>): ChapterStats {
  const num = (a: unknown, b?: unknown) => Number(a ?? b) || 0;
  return {
    total: num(s.total, s.total_count),
    easy_count: num(s.easy_count, s.easy),
    medium_count: num(s.medium_count, s.medium),
    hard_count: num(s.hard_count, s.hard),
    mcq_count: num(s.mcq_count, s.mcq),
    reasoning_count: num(s.reasoning_count, s.reasoning),
    matching_count: num(s.matching_count, s.matching),
    statements_count: num(s.statements_count, s.statements),
    figure_count: num(s.figure_count, s.figures),
  };
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

/** Standard forge: figure slots used for split decision and image pipeline (syllabus → 0). */
function standardChapterFigureCount(cfg: ChapterConfig): number {
  if (cfg.synthesisMode === 'syllabus') return 0;
  if (cfg.visualMode === 'image') {
    return (Object.values(cfg.selectedFigures || {}) as number[]).reduce((a, b) => a + b, 0);
  }
  return cfg.syntheticFigureCount || 0;
}

/** Count of `/api/gemini` text generations for one chapter — matches `handleRunForge`. */
function countForgeTextCallsForChapter(cfg: ChapterConfig): number {
  if (cfg.synthesisMode === 'syllabus') {
    const topics = Object.values(cfg.topicCounts || {}) as { count: number; enabled: boolean }[];
    return topics.filter((t) => t.enabled && t.count > 0).length;
  }
  const figureCount = standardChapterFigureCount(cfg);
  if (shouldSplitStandardForgeByStyle(cfg.types, cfg.diff, figureCount)) {
    const styleOrder: QuestionType[] = ['mcq', 'reasoning', 'matching', 'statements'];
    return styleOrder.filter((k) => cfg.types[k] > 0).length;
  }
  return 1;
}

/** Image model calls (one per figure prompt) — upper bound = planned figure slots. */
function countForgeImageCallsForChapter(cfg: ChapterConfig): number {
  if (cfg.synthesisMode === 'syllabus') return 0;
  return standardChapterFigureCount(cfg);
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

/** INR per text API round-trip beyond the per-question variable line (proxy, latency, small fixed input). */
const STUDIO_TEXT_CALL_OVERHEAD_INR: Record<keyof typeof COST_ESTIMATES, number> = {
  'gemini-3-pro-preview': 0.55,
  'gemini-3-flash-preview': 0.08,
  'gemini-flash-lite-latest': 0.05,
};

/** INR per figure API call — approximate; varies by Google billing. */
const STUDIO_IMAGE_MODEL_IDS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'] as const;
type StudioImageModelId = (typeof STUDIO_IMAGE_MODEL_IDS)[number];
const STUDIO_IMAGE_MODEL_META: Record<
  StudioImageModelId,
  { label: string; icon: string; versionLine: string }
> = {
  'gemini-3-pro-image-preview': {
    label: 'Gemini 3 Pro Image',
    icon: 'mdi:image-filter-hdr',
    versionLine: 'Preview · figure trace & synthetic',
  },
  'gemini-2.5-flash-image': {
    label: 'Gemini 2.5 Flash Image',
    icon: 'mdi:flash',
    versionLine: 'Stable · faster / lower cost',
  },
};
const STUDIO_IMAGE_CALL_INR: Record<StudioImageModelId, number> = {
  'gemini-3-pro-image-preview': 6.5,
  'gemini-2.5-flash-image': 3.5,
};

const STUDIO_MODEL_IDS = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'] as const;
const STUDIO_MODEL_META: Record<
  (typeof STUDIO_MODEL_IDS)[number],
  { label: string; icon: string; versionLine: string }
> = {
  'gemini-3-pro-preview': {
    label: 'Gemini 3 Pro',
    icon: 'mdi:diamond-stone',
    versionLine: 'Preview · text generation',
  },
  'gemini-3-flash-preview': {
    label: 'Gemini 3 Flash',
    icon: 'mdi:lightning-bolt',
    versionLine: 'Preview · text generation',
  },
  'gemini-flash-lite-latest': {
    label: 'Gemini Flash-Lite',
    icon: 'mdi:feather',
    versionLine: 'Latest · text generation',
  },
};

const FORGE_STYLE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  reasoning: 'Assertion–Reason',
  matching: 'Matching',
  statements: 'Statements',
};

type ForgePhase = 'prep' | 'chapter' | 'gemini' | 'figures' | 'done';

/** Text-only forge skips figure mandates and image pipeline; with_figures uses chapter visual settings (standard mode). */
type ForgeVisualPhase = 'text_only' | 'with_figures';

type ForgeStyleRowState = {
  key: QuestionType;
  label: string;
  planned: number;
  produced: number;
  status: 'pending' | 'running' | 'done' | 'skipped';
  /** E/M/H for this style’s slice when using split-by-style (proportional to chapter mix). */
  diffLabel: string;
};

/** Live figure pipeline + reference preview in the forge overlay (standard + with figures). */
type ForgeFigureUiState = {
  modeLabel: string;
  subLabel: string;
  referenceThumbs: { dataUrl: string; label: string }[];
  expectedOutputs: number | null;
  renderedCount: number;
  outputDataUrls: string[];
  statusLine: string;
};

type ForgeDetailState = {
  chaptersTotal: number;
  chapterIndex: number;
  chapterName: string;
  line: string;
  phase: ForgePhase;
  /** Cumulative count written to question_bank_neet this run. */
  totalQuestions: number;
  /** Chapters fully saved this run (insert succeeded). */
  savedChaptersCount: number;
  lastSavedChapterLabel: string;
  chapterQuestions: number;
  modelLabel: string;
  geminiLine: string;
  styleRows: ForgeStyleRowState[];
  syllabusTopic: string | null;
  syllabusIndex: number;
  syllabusTotal: number;
  synthesisLabel: string;
  /** Chapter config: target difficulty mix (whole chapter). */
  plannedEasy: number;
  plannedMedium: number;
  plannedHard: number;
  plannedMcq: number;
  plannedReasoning: number;
  plannedMatching: number;
  plannedStatements: number;
  plannedTotalQs: number;
  /** How E/M/H maps to styles for this chapter. */
  recipeNote: string;
  log: { id: number; t: number; msg: string }[];
  /** Standard + Fill figure questions: reference thumbs, mode, and live render strip. */
  figureUi: ForgeFigureUiState | null;
};

function questionsToNeetBankRows(
  chapter: { id: string; name: string; subject_name: string; class_name: string },
  qs: Question[],
  promptSetId: string | null | undefined,
  promptGenerationSource: KbGenerationPromptSource,
  generationModelApiId: string,
  promptSetDisplayName: string
) {
  const modelLabel = bankLabelForTextGenerationModel(generationModelApiId);
  return qs.map((q) => ({
    chapter_id: chapter.id,
    chapter_name: chapter.name,
    subject_name: chapter.subject_name,
    class_name: chapter.class_name,
    question_text: q.text,
    options: q.options,
    correct_index: q.correctIndex,
    explanation: q.explanation,
    difficulty: q.difficulty,
    question_type: q.type,
    topic_tag: q.topic_tag || 'General',
    figure_url: q.figureDataUrl,
    source_figure_url: q.sourceFigureDataUrl,
    column_a: q.columnA,
    column_b: q.columnB,
    prompt_set_id: promptSetId ?? null,
    prompt_generation_source: promptGenerationSource,
    prompt_set_name: hubPromptSetDisplayNameFallback(promptGenerationSource, promptSetDisplayName),
    generation_model: modelLabel,
  }));
}

/** Space out sequential chapter forges to reduce 429 bursts (with jitter). */
function sleepForgeMs(baseMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, baseMs + Math.floor(Math.random() * 1600)));
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
  const [selectedImageModel, setSelectedImageModel] = useState<StudioImageModelId>('gemini-3-pro-image-preview');
  
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
  /** Rows successfully inserted this forge run (sanitized), for optional AI batch report. */
  const forgeRunSnapshotRef = useRef<AnalysisTableRow[]>([]);
  const [lastForgeAnalysisBatch, setLastForgeAnalysisBatch] = useState<{
    rows: AnalysisTableRow[];
    savedAt: number;
  } | null>(null);
  const [forgeAnalysisModalOpen, setForgeAnalysisModalOpen] = useState(false);
  const [forgeAnalysisPayload, setForgeAnalysisPayload] = useState<{
    rows: AnalysisTableRow[];
    label: string;
  } | null>(null);
  const [forgeAnalysisLoading, setForgeAnalysisLoading] = useState(false);
  const [forgeAnalysisReportMarkdown, setForgeAnalysisReportMarkdown] = useState<string | null>(null);
  const [forgeAnalysisError, setForgeAnalysisError] = useState<string | null>(null);
  const [forgeAnalysisTruncation, setForgeAnalysisTruncation] = useState<{
    analyzedCount: number;
    totalCount: number;
  } | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [browseFilters, setBrowseFilters] = useState({
      difficulty: 'all' as string,
      style: 'all' as string,
      hasFigure: false,
  });

  /** Browse + review: what to show on each question card (does not refetch). */
  const [questionCardDisplay, setQuestionCardDisplay] = useState({
    showSourceFigure: false,
    showPromptSource: false,
    showGenerationModel: false,
    showChapter: false,
    showTopic: true,
    showOptions: true,
    showCorrectAnswer: false,
    showExplanation: false,
  });
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(new Set());
  const [flagReasonsByQuestionId, setFlagReasonsByQuestionId] = useState<Record<string, string>>({});

  const [chapterConfigs, setChapterConfigs] = useState<Record<string, ChapterConfig>>({});
  const [extractedFigures, setExtractedFigures] = useState<{data: string, mimeType: string}[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [forgeProgress, setForgeProgress] = useState('');
  const [forgeDetail, setForgeDetail] = useState<ForgeDetailState | null>(null);
  const forgeLogIdRef = useRef(0);
  /** When on, every selected standard chapter uses the uniform total + weight presets below (not the active row alone). */
  const [applyActiveStandardMixToAllChapters, setApplyActiveStandardMixToAllChapters] = useState(false);
  /** Default ≈ 10% E / 30% M / 70% H when scaled (weights 1 : 3 : 7). */
  const [batchUniformStandardTotal, setBatchUniformStandardTotal] = useState(10);
  const [batchUniformDiffWeights, setBatchUniformDiffWeights] = useState({
    easy: 1,
    medium: 3,
    hard: 7,
  });
  /** Default 7 : 1 : 1 : 1 (MCQ-heavy batch). */
  const [batchUniformTypeWeights, setBatchUniformTypeWeights] = useState({
    mcq: 7,
    reasoning: 1,
    matching: 1,
    statements: 1,
  });
  const [studioChapterConfigOpen, setStudioChapterConfigOpen] = useState(false);
  /** null = use KB prompt preferences (builtin / local / active cloud set). UUID = force that cloud set for forge. */
  const [forgePromptSetOverrideId, setForgePromptSetOverrideId] = useState<string | null>(null);
  const [forgePromptSets, setForgePromptSets] = useState<KbPromptSetRow[]>([]);
  /** When on, chapter source text over the model budget is split into sequential Gemini calls (counts auto-scaled per segment). */
  const [forgeSplitLongSource, setForgeSplitLongSource] = useState(false);

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

  /** Syllabus chapters never run the figure leg — hide/disable “figure” forge when every selected chapter is syllabus. */
  const studioForgeSelectionAllSyllabus = useMemo(() => {
    if (selectedChapterIds.size === 0) return false;
    return Array.from(selectedChapterIds).every(
      (id) => chapterConfigs[id]?.synthesisMode === 'syllabus'
    );
  }, [selectedChapterIds, chapterConfigs]);

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

  useEffect(() => {
    if (!selectedKbId) {
      setForgePromptSets([]);
      setForgePromptSetOverrideId(null);
      return;
    }
    let cancelled = false;
    listKbPromptSets(selectedKbId)
      .then((rows) => {
        if (!cancelled) setForgePromptSets(rows);
      })
      .catch(() => {
        if (!cancelled) setForgePromptSets([]);
      });
    setForgePromptSetOverrideId(null);
    return () => {
      cancelled = true;
    };
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

  /** Live forge estimate: text (per-Q + per text API) + image (per figure API) shown separately and summed. */
  const forgeCostPreview = useMemo(() => {
    const modelKey = selectedModel as keyof typeof COST_ESTIMATES;
    const rate = COST_ESTIMATES[modelKey] || 0;
    const overhead = STUDIO_TEXT_CALL_OVERHEAD_INR[modelKey] ?? 0;
    const imgKey = selectedImageModel as StudioImageModelId;
    const imageRate = STUDIO_IMAGE_CALL_INR[imgKey] ?? STUDIO_IMAGE_CALL_INR['gemini-3-pro-image-preview'];
    const q = grandTotals.questions;
    let textCalls = 0;
    let imageCalls = 0;
    Array.from(selectedChapterIds).forEach((id) => {
      const cfg = chapterConfigs[id];
      if (!cfg) return;
      textCalls += countForgeTextCallsForChapter(cfg);
      imageCalls += countForgeImageCallsForChapter(cfg);
    });
    const variableInr = q * rate;
    const textOverheadInr = textCalls * overhead;
    const textSubtotalInr = variableInr + textOverheadInr;
    const imageInr = imageCalls * imageRate;
    const totalInr = textSubtotalInr + imageInr;
    const textMeta = STUDIO_MODEL_META[selectedModel as keyof typeof STUDIO_MODEL_META];
    const imgMeta = STUDIO_IMAGE_MODEL_META[imgKey];
    return {
      inrTotal: totalInr.toFixed(2),
      textSubtotalInr: textSubtotalInr.toFixed(2),
      rate,
      questions: q,
      textCalls,
      imageCalls,
      variableInr: variableInr.toFixed(2),
      textOverheadInr: textOverheadInr.toFixed(2),
      imageInr: imageInr.toFixed(2),
      imageRate,
      textModelLabel: textMeta?.label ?? selectedModel,
      textModelApiId: selectedModel,
      textModelVersionLine: textMeta?.versionLine ?? '',
      imageModelLabel: imgMeta?.label ?? selectedImageModel,
      imageModelApiId: selectedImageModel,
      imageModelVersionLine: imgMeta?.versionLine ?? '',
    };
  }, [grandTotals.questions, selectedChapterIds, chapterConfigs, selectedModel, selectedImageModel]);

  const selectedChapterIdsKey = useMemo(
    () => Array.from(selectedChapterIds).sort().join(','),
    [selectedChapterIds]
  );

  /** When on, apply one shared total + E/M/H + style mix (from editable weights) to every selected standard chapter. */
  useEffect(() => {
    if (!applyActiveStandardMixToAllChapters || !activeEditingChapterId) return;

    const total = Math.max(1, Math.min(500, Math.floor(Number(batchUniformStandardTotal) || 1)));
    const diff = scaleDifficultyToTotal(batchUniformDiffWeights, total);
    const types = scaleTypeWeightsToTotal(batchUniformTypeWeights, total);

    setChapterConfigs((prev) => {
      const anchor = prev[activeEditingChapterId];
      if (!anchor || anchor.synthesisMode !== 'standard') return prev;

      const next = { ...prev };
      let changed = false;
      for (const rid of selectedChapterIds) {
        const id = String(rid);
        const t = next[id];
        if (!t || t.synthesisMode !== 'standard') continue;
        if (
          t.diff.easy === diff.easy &&
          t.diff.medium === diff.medium &&
          t.diff.hard === diff.hard &&
          t.types.mcq === types.mcq &&
          t.types.reasoning === types.reasoning &&
          t.types.matching === types.matching &&
          t.types.statements === types.statements &&
          t.total === total &&
          t.isProportional === false
        ) {
          continue;
        }
        next[id] = {
          ...t,
          diff: { ...diff },
          types: { ...types },
          total,
          isProportional: false,
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    applyActiveStandardMixToAllChapters,
    activeEditingChapterId,
    selectedChapterIdsKey,
    batchUniformStandardTotal,
    batchUniformDiffWeights.easy,
    batchUniformDiffWeights.medium,
    batchUniformDiffWeights.hard,
    batchUniformTypeWeights.mcq,
    batchUniformTypeWeights.reasoning,
    batchUniformTypeWeights.matching,
    batchUniformTypeWeights.statements,
  ]);

  useEffect(() => {
    if (!applyActiveStandardMixToAllChapters || !activeEditingChapterId) return;
    const c = chapterConfigs[activeEditingChapterId];
    if (c && c.synthesisMode !== 'standard') setApplyActiveStandardMixToAllChapters(false);
  }, [activeEditingChapterId, applyActiveStandardMixToAllChapters, chapterConfigs]);

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
      if (chapterIds.length === 0) return;
      const cacheKey = selectedKbId || 'default';
      const now = Date.now();
      if (statsCache.current[cacheKey] && now - statsCache.current[cacheKey].timestamp < 60000) {
        setChapterStats(statsCache.current[cacheKey].data);
        return;
      }
      const { data } = await supabase.rpc('get_chapters_bulk_stats', { target_chapter_ids: chapterIds });
      if (data) {
        const stats: Record<string, ChapterStats> = {};
        (data as Record<string, unknown>[]).forEach((row) => {
          const id = String((row as { chapter_id?: string }).chapter_id ?? '');
          if (!id) return;
          stats[id] = normalizeChapterStatsRpcRow(row);
        });
        setChapterStats(stats);
        statsCache.current[cacheKey] = { data: stats, timestamp: now };
      }
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
              const joinName =
                  nested && typeof nested === 'object' && !Array.isArray(nested)
                      ? (nested as { name?: string }).name
                      : Array.isArray(nested) && nested[0]
                        ? (nested[0] as { name?: string }).name
                        : undefined;
              let storedName =
                typeof item.prompt_set_name === 'string' && item.prompt_set_name.trim() !== ''
                  ? item.prompt_set_name.trim()
                  : null;
              if (storedName && isLikelyUuid(storedName)) storedName = null;
              const srcLabel = labelPromptGenerationSource(item.prompt_generation_source);
              let promptDisplay = storedName ?? joinName ?? srcLabel ?? null;
              if (!promptDisplay && item.prompt_generation_source === 'cloud_set') {
                promptDisplay = 'Cloud prompt set';
              }
              const promptSourceTooltip =
                describePromptGenerationSource(item.prompt_generation_source) +
                (promptDisplay ? ` Card label: “${promptDisplay}”.` : '');
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
                  prompt_set_name: promptDisplay,
                  prompt_source_tooltip: promptSourceTooltip,
                  generation_model: item.generation_model ?? null,
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

  const patchForgeDetail = useCallback((patch: Partial<ForgeDetailState>, logMsg?: string) => {
    setForgeDetail((prev) => {
      if (!prev) return prev;
      let log = prev.log;
      if (logMsg) {
        forgeLogIdRef.current += 1;
        log = [...prev.log, { id: forgeLogIdRef.current, t: Date.now(), msg: logMsg }].slice(-80);
      }
      return { ...prev, ...patch, log };
    });
    if (typeof patch.line === 'string') setForgeProgress(patch.line);
  }, []);

  const handleRunForge = async (forgeVisualPhase: ForgeVisualPhase) => {
      const chapterIds = Array.from(selectedChapterIds);
      if (chapterIds.length === 0) return alert("Select chapters.");
      setMode('browse');
      setReviewQueue([]); 
      setIsForgingBatch(true); 
      stopForgingRef.current = false;
      forgeRunSnapshotRef.current = [];
      const textForgeLabel =
        STUDIO_MODEL_META[selectedModel as keyof typeof STUDIO_MODEL_META]?.label ?? selectedModel;
      const imageForgeLabel =
        STUDIO_IMAGE_MODEL_META[selectedImageModel]?.label ?? selectedImageModel;
      const modelLabelForge = `${textForgeLabel} · figures: ${imageForgeLabel}`;
      forgeLogIdRef.current = 1;
      const forgeModeLabel =
        forgeVisualPhase === 'text_only' ? 'text questions only' : 'text + figures (chapter config)';
      setForgeDetail({
        chaptersTotal: chapterIds.length,
        chapterIndex: 1,
        chapterName: '',
        line: 'Preparing forge…',
        phase: 'prep',
        totalQuestions: 0,
        savedChaptersCount: 0,
        lastSavedChapterLabel: '—',
        chapterQuestions: 0,
        modelLabel: modelLabelForge,
        geminiLine: '',
        styleRows: [],
        syllabusTopic: null,
        syllabusIndex: 0,
        syllabusTotal: 0,
        synthesisLabel: '',
        plannedEasy: 0,
        plannedMedium: 0,
        plannedHard: 0,
        plannedMcq: 0,
        plannedReasoning: 0,
        plannedMatching: 0,
        plannedStatements: 0,
        plannedTotalQs: 0,
        recipeNote: '',
        log: [
          {
            id: 1,
            t: Date.now(),
            msg: `Started · ${chapterIds.length} chapter(s) · ${forgeModeLabel} · text ${textForgeLabel} (${selectedModel}) · image ${imageForgeLabel} (${selectedImageModel})${forgeSplitLongSource ? ' · long-source multi-call ON (auto chunks)' : ''} · each chapter saves to hub when done`,
          },
        ],
        figureUi: null,
      });
      setForgeProgress('Preparing forge…');
      let savedToHubThisRun = 0;
      const failedForgeChapters: { name: string; error: string }[] = [];
      let suppressForgeSummaryAlert = false;
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
          if (excludedTopicLabelsNormalized.length > 0) {
            patchForgeDetail(
              {
                line: `Topic exclusions · ${excludedTopicLabelsNormalized.length} label(s) sent to Gemini (banned in prompt)`,
              },
              `Exclusions active — model must not use these topic_tags: ${excludedTopicLabelsNormalized.slice(0, 6).join(', ')}${excludedTopicLabelsNormalized.length > 6 ? '…' : ''}`
            );
          }
          const forgeProvenance = await resolveForgePromptProvenance(selectedKbId, forgePromptSetOverrideId);
          const batchPromptSetId = forgeProvenance.promptSetId;
          const batchPromptGenerationSource = forgeProvenance.generationSource;
          const batchPromptSetName = await hydrateHubPromptSetDisplayName(selectedKbId, forgeProvenance);
          for (let i = 0; i < chapterIds.length; i++) {
              if (stopForgingRef.current) break;
              if (i > 0) {
                patchForgeDetail(
                  { line: 'Brief pause before next chapter…', geminiLine: 'Spacing API calls' },
                  '⏸ Between chapters'
                );
                await sleepForgeMs(1400);
              }
              const chapId = chapterIds[i];
              const chapter = chapters.find(c => c.id === chapId);
              const config = { ...chapterConfigs[chapId] }; 
              if (!chapter || !config) continue;
              const progressPrefix = `[${i+1}/${chapterIds.length}] ${String(chapter.name)}`;
              patchForgeDetail(
                {
                  chapterIndex: i + 1,
                  chapterName: String(chapter.name),
                  chapterQuestions: 0,
                  styleRows: [],
                  syllabusTopic: null,
                  syllabusIndex: 0,
                  syllabusTotal: 0,
                  synthesisLabel: config.synthesisMode === 'syllabus' ? 'Syllabus-focused' : 'Standard',
                  phase: 'chapter',
                  line: `${progressPrefix}: boundary lookup…`,
                  plannedEasy: 0,
                  plannedMedium: 0,
                  plannedHard: 0,
                  plannedMcq: 0,
                  plannedReasoning: 0,
                  plannedMatching: 0,
                  plannedStatements: 0,
                  plannedTotalQs: 0,
                  recipeNote: '',
                  figureUi: null,
                },
                `Chapter ${i + 1}/${chapterIds.length}: ${String(chapter.name)}`
              );
              setForgeProgress(`${progressPrefix}: Boundary Lookup...`);
              
              for (
                let chapterAttempt = 1;
                chapterAttempt <= 2 && !stopForgingRef.current;
                chapterAttempt++
              ) {
                if (chapterAttempt === 2) {
                  patchForgeDetail(
                    {
                      line: `${progressPrefix}: retrying chapter (2nd attempt)…`,
                      geminiLine: 'Backoff before full chapter retry…',
                    },
                    '↻ Chapter retry'
                  );
                  await sleepForgeMs(2800);
                }
                let producedBeforeInsert = 0;
                try {
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
                      const totalSyllabusQ = enabledTopics.reduce((acc, [, tConf]) => acc + tConf.count, 0);
                      patchForgeDetail(
                        {
                          phase: 'gemini',
                          syllabusTotal: enabledTopics.length,
                          syllabusIndex: 0,
                          styleRows: [],
                          plannedEasy: 0,
                          plannedMedium: totalSyllabusQ,
                          plannedHard: 0,
                          plannedMcq: totalSyllabusQ,
                          plannedReasoning: 0,
                          plannedMatching: 0,
                          plannedStatements: 0,
                          plannedTotalQs: totalSyllabusQ,
                          recipeNote:
                            'Syllabus mode: each topic runs its own Gemini call — Medium difficulty, MCQ-only, count from the topic card.',
                        },
                        `Syllabus mode · ${enabledTopics.length} topic(s)`
                      );
                      let topicOrd = 0;
                      for (const [topicName, topicConfig] of enabledTopics) {
                          if (stopForgingRef.current) break;
                          topicOrd += 1;
                          const line = `${progressPrefix}: topic ${topicOrd}/${enabledTopics.length} · ${topicName}`;
                          patchForgeDetail({
                            syllabusTopic: String(topicName),
                            syllabusIndex: topicOrd,
                            line,
                            geminiLine: 'Preparing Gemini request…',
                          });
                          setForgeProgress(line);
                          const gen = await generateQuizQuestions(
                              String(chapter.name),
                              { easy: 0, medium: topicConfig.count, hard: 0 },
                              topicConfig.count,
                              { text: rawText },
                              { mcq: topicConfig.count, reasoning: 0, matching: 0, statements: 0 },
                              (st) => {
                                setForgeProgress(`${progressPrefix}: ${topicName} · ${st}`);
                                setForgeDetail((p) => (p ? { ...p, geminiLine: st } : p));
                              },
                              0,
                              false,
                              undefined,
                              selectedModel,
                              'text',
                              [String(topicName)],
                              undefined,
                              undefined,
                              undefined,
                              excludedTopicLabelsNormalized,
                              selectedKbId,
                              forgePromptSetOverrideId,
                              forgeSplitLongSource
                          );
                          chapterGeneratedQs.push(...gen);
                          producedBeforeInsert += gen.length;
                          setForgeDetail((p) =>
                            p
                              ? {
                                  ...p,
                                  chapterQuestions: p.chapterQuestions + gen.length,
                                  geminiLine: `Received ${gen.length} question(s)`,
                                }
                              : p
                          );
                          patchForgeDetail(
                            { line: `${progressPrefix}: topic ${topicOrd} done (+${gen.length} Q)` },
                            `✓ ${topicName.slice(0, 48)}${topicName.length > 48 ? '…' : ''} · +${gen.length} Q`
                          );
                      }
                  } else {
                      config.total = Object.values(config.types).reduce((a: number, b: number) => a + b, 0);
                      const diffForGen = config.diff;
                      const typesForGen = { ...config.types };
                      const includeFigures = forgeVisualPhase === 'with_figures';
                      let figureCount = 0;
                      let sourceImages: { data: string; mimeType: string }[] = [];
                      if (includeFigures) {
                          if (config.visualMode === 'image') {
                          figureCount = (Object.values(config.selectedFigures || {}) as number[]).reduce(
                            (a: number, b: number) => a + b,
                            0
                          );
                          patchForgeDetail(
                            { line: `${progressPrefix}: scanning chapter visuals…`, phase: 'chapter' },
                            'Scanning reference images / PDF'
                          );
                          setForgeProgress(`${progressPrefix}: Scanning Visuals...`);
                          sourceImages = await extractChapterReferenceImages(docPath ?? null, pdfPath ?? null);
                        } else {
                          figureCount = config.syntheticFigureCount || 0;
                        }
                      }

                      const willSplitStyles = shouldSplitStandardForgeByStyle(typesForGen, diffForGen, figureCount);
                      patchForgeDetail({
                        plannedEasy: diffForGen.easy,
                        plannedMedium: diffForGen.medium,
                        plannedHard: diffForGen.hard,
                        plannedMcq: typesForGen.mcq,
                        plannedReasoning: typesForGen.reasoning,
                        plannedMatching: typesForGen.matching,
                        plannedStatements: typesForGen.statements,
                        plannedTotalQs: config.total,
                        recipeNote:
                          (includeFigures ? '' : 'Text-only forge: no figure prompts or image generation. ') +
                          (willSplitStyles
                            ? 'Split-by-style: your chapter E/M/H mix is scaled per style (largest remainder) — each style’s call gets its own Easy/Medium/Hard counts adding up to that style’s question total.'
                            : 'Single Gemini call: one JSON array with your exact style counts and global E/M/H totals.'),
                      });

                      const sourceCtxForGen = {
                        text: rawText,
                        ...(includeFigures && sourceImages.length > 0 ? { images: sourceImages } : {}),
                      };
                      const visualModeForGen: 'image' | 'text' = includeFigures ? config.visualMode : 'text';

                      if (includeFigures) {
                        const selectedEntries = Object.entries(config.selectedFigures || {}) as [string, number][];
                        const selectedWithCount = selectedEntries.filter(([, n]) => n > 0);
                        const modeLabel =
                          config.visualMode === 'image'
                            ? sourceImages.length > 0
                              ? 'Standard · chapter reference'
                              : 'Standard · no reference asset'
                            : 'Standard · synthetic (text)';
                        const subLabel =
                          config.visualMode === 'image'
                            ? sourceImages.length > 0
                              ? selectedWithCount.length > 0
                                ? `${selectedWithCount.length} slot(s) in use · ${figureCount} figure budget`
                                : 'No reference slots selected — layout shows placeholder; renders follow prompts if any'
                              : 'No extractable DOCX/PDF images — compositions use prompts only'
                            : `${config.syntheticFigureCount || 0} synthetic slot(s) · no chapter bitmap`;
                        const referenceThumbs = selectedWithCount
                          .map(([iStr, n]) => {
                            const i = parseInt(iStr, 10);
                            const img = sourceImages[i];
                            if (!img?.data) return null;
                            return {
                              dataUrl: `data:${img.mimeType};base64,${img.data}`,
                              label: `#${i + 1} ×${n}`,
                            };
                          })
                          .filter((x): x is { dataUrl: string; label: string } => x !== null);
                        patchForgeDetail({
                          figureUi: {
                            modeLabel,
                            subLabel,
                            referenceThumbs,
                            expectedOutputs: null,
                            renderedCount: 0,
                            outputDataUrls: [],
                            statusLine: 'Waiting on text generation…',
                          },
                        });
                      }

                      const runFigurePipeline = async (gen: Question[]) => {
                          if (!includeFigures) return;
                          const figureQs = gen.filter((q) => q.figurePrompt);
                          if (figureQs.length === 0 || figureCount <= 0) {
                            setForgeDetail((p) =>
                              p?.figureUi
                                ? {
                                    ...p,
                                    phase: 'figures',
                                    line: `${progressPrefix}: no figure images to render`,
                                    figureUi: {
                                      ...p.figureUi,
                                      expectedOutputs: 0,
                                      statusLine:
                                        figureQs.length === 0
                                          ? 'No figure_prompt fields in this batch.'
                                          : 'Figure budget is zero — skipped image API.',
                                    },
                                  }
                                : p
                            );
      return;
    }

                            patchForgeDetail(
                              {
                                phase: 'figures',
                                line: `${progressPrefix}: rendering figures…`,
                              },
                              `Figures · ${figureQs.length} prompt(s)`
                            );
                            setForgeDetail((p) =>
                              p?.figureUi
                                ? {
                                    ...p,
                                    figureUi: {
                                      ...p.figureUi,
                                      expectedOutputs: figureQs.length,
                                      renderedCount: 0,
                                      outputDataUrls: [],
                                      statusLine: `Starting ${figureQs.length} image render(s)…`,
                                    },
                                  }
                                : p
                            );
                            setForgeProgress(`${progressPrefix}: Processing Visuals...`);
                            const bumpOutputs = (newPngBase64s: string[]) => {
                              if (newPngBase64s.length === 0) return;
                              const newUrls = newPngBase64s.map(
                                (b64) => `data:image/png;base64,${b64}`
                              );
                              setForgeDetail((p) =>
                                p?.figureUi
                                  ? {
                                      ...p,
                                      figureUi: {
                                        ...p.figureUi,
                                        renderedCount: p.figureUi.renderedCount + newUrls.length,
                                        outputDataUrls: [...p.figureUi.outputDataUrls, ...newUrls].slice(
                                          -36
                                        ),
                                        statusLine: `Rendered ${p.figureUi.renderedCount + newUrls.length}/${figureQs.length}`,
                                      },
                                    }
                                  : p
                              );
                            };

                            if (config.visualMode === 'image') {
                                if (sourceImages.length > 0) {
                                    const sourceEditGroups: Record<number, Question[]> = {};
                                    figureQs.forEach((q) => {
                                      const sIdx =
                                        q.sourceImageIndex !== undefined &&
                                        sourceImages[q.sourceImageIndex]
                                          ? q.sourceImageIndex
                                          : 0;
                                      const sourceImg = sourceImages[sIdx];
                                      if (sourceImg?.data) {
                                        q.sourceFigureDataUrl = `data:${sourceImg.mimeType};base64,${sourceImg.data}`;
                                      }
                                      if (!sourceEditGroups[sIdx]) sourceEditGroups[sIdx] = [];
                                      sourceEditGroups[sIdx].push(q);
                                    });
                                    for (const [imgIdxStr, groupQs] of Object.entries(sourceEditGroups)) {
                                      if (stopForgingRef.current) break;
                                      const imgIdx = parseInt(imgIdxStr, 10);
                                      const sourceImg = sourceImages[imgIdx];
                                      if (!sourceImg?.data) continue;
                                      setForgeDetail((p) =>
                                        p?.figureUi
                                          ? {
                                              ...p,
                                              line: `${progressPrefix}: figures · reference #${imgIdx + 1} (${groupQs.length})…`,
                                              figureUi: {
                                                ...p.figureUi,
                                                statusLine: `Rendering ${groupQs.length} from ref #${imgIdx + 1}…`,
                                              },
                                            }
                                          : p
                                      );
                                      const prompts = groupQs.map((q) => q.figurePrompt!).filter(Boolean);
                                      const images = await generateCompositeStyleVariants(
                                        sourceImg.data,
                                        sourceImg.mimeType,
                                        prompts,
                                        false,
                                        selectedImageModel
                                      );
                                      const outs: string[] = [];
                                      groupQs.forEach((q, cIdx) => {
                                        if (images[cIdx]) {
                                          q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`;
                                          outs.push(images[cIdx]!);
                                        }
                                      });
                                      bumpOutputs(outs);
                                    }
                                } else {
                                    setForgeDetail((p) =>
                                      p?.figureUi
                                        ? {
                                            ...p,
                                            figureUi: {
                                              ...p.figureUi,
                                              statusLine: 'No reference bitmaps — prompt-only composition…',
                                            },
                                          }
                                        : p
                                    );
                                    const images = await generateCompositeFigures(
                                      figureQs.map((q) => q.figurePrompt!),
                                      selectedImageModel
                                    );
                                    const outs: string[] = [];
                                    figureQs.forEach((q, idx) => {
                                      if (images[idx]) {
                                        q.figureDataUrl = `data:image/png;base64,${images[idx]}`;
                                        outs.push(images[idx]!);
                                      }
                                    });
                                    bumpOutputs(outs);
                                }
                            } else {
                                setForgeDetail((p) =>
                                  p?.figureUi
                                    ? {
                                        ...p,
                                        figureUi: {
                                          ...p.figureUi,
                                          statusLine: 'Synthetic batch (single API call)…',
                                        },
                                      }
                                    : p
                                );
                                const images = await generateCompositeFigures(
                                  figureQs.map((q) => q.figurePrompt!),
                                  selectedImageModel
                                );
                                const outs: string[] = [];
                                figureQs.forEach((q, idx) => {
                                  if (images[idx]) {
                                    q.figureDataUrl = `data:image/png;base64,${images[idx]}`;
                                    outs.push(images[idx]!);
                                  }
                                });
                                bumpOutputs(outs);
                            }

                            setForgeDetail((p) =>
                              p?.figureUi
                                ? {
                                    ...p,
                                    figureUi: {
                                      ...p.figureUi,
                                      statusLine: `Figure pass complete · ${p.figureUi.renderedCount}/${figureQs.length} ok`,
                                    },
                                  }
                                : p
                            );
                      };

                      if (willSplitStyles) {
                          const styleOrder: QuestionType[] = ['mcq', 'reasoning', 'matching', 'statements'];
                          const plannedRows: ForgeStyleRowState[] = styleOrder.map((k) => {
                            const n = typesForGen[k];
                            const d = n > 0 ? scaleDifficultyToTotal(diffForGen, n) : { easy: 0, medium: 0, hard: 0 };
                            return {
                              key: k,
                              label: FORGE_STYLE_LABELS[k],
                              planned: n,
                              produced: 0,
                              status: n <= 0 ? 'skipped' : 'pending',
                              diffLabel: n > 0 ? `E${d.easy} · M${d.medium} · H${d.hard}` : '—',
                            };
                          });
                          patchForgeDetail(
                            {
                              phase: 'gemini',
                              styleRows: plannedRows,
                              geminiLine: '',
                            },
                            `Split-by-style · ${plannedRows.filter((r) => r.planned > 0).length} Gemini call(s)`
                          );
                          const genParts: Question[] = [];
                          let sub = 0;
                          for (const styleKey of styleOrder) {
                              if (stopForgingRef.current) break;
                              const n = typesForGen[styleKey];
                              if (n <= 0) continue;
                              sub += 1;
                              const diffSlice = scaleDifficultyToTotal(diffForGen, n);
                              const lineBusy = `${progressPrefix}: Gemini ${sub}/4 · ${FORGE_STYLE_LABELS[styleKey]} · ${n} Q (E${diffSlice.easy}/M${diffSlice.medium}/H${diffSlice.hard})`;
                              setForgeDetail((p) =>
                                p
                                  ? {
                                      ...p,
                                      styleRows: p.styleRows.map((r) =>
                                        r.key === styleKey ? { ...r, status: 'running' } : r
                                      ),
                                      line: lineBusy,
                                      geminiLine: 'Sending request…',
                                    }
                                  : p
                              );
                              setForgeProgress(lineBusy);
                              const part = await generateQuizQuestions(
          String(chapter.name),
                                  diffSlice,
                                  n,
                                  sourceCtxForGen,
                                  styleKey,
                                  (status) => {
                                    setForgeProgress(`${progressPrefix}: ${FORGE_STYLE_LABELS[styleKey]} (${sub}/4) · ${status}`);
                                    setForgeDetail((p) => (p ? { ...p, geminiLine: status } : p));
                                  },
          0,
          false,
          undefined,
          selectedModel,
                                  visualModeForGen,
          undefined,
          undefined,
          undefined,
          undefined,
                                  excludedTopicLabelsNormalized,
                                  selectedKbId,
                                  forgePromptSetOverrideId,
                                  forgeSplitLongSource
                              );
                              genParts.push(...part);
                              producedBeforeInsert += part.length;
                              setForgeDetail((p) =>
                                p
                                  ? {
                                      ...p,
                                      styleRows: p.styleRows.map((r) =>
                                        r.key === styleKey
                                          ? { ...r, status: 'done', produced: part.length }
                                          : r
                                      ),
                                      chapterQuestions: p.chapterQuestions + part.length,
                                      geminiLine: `${FORGE_STYLE_LABELS[styleKey]} · ${part.length} Q parsed`,
                                    }
                                  : p
                              );
                              patchForgeDetail(
                                { line: `${progressPrefix}: ${FORGE_STYLE_LABELS[styleKey]} done` },
                                `✓ ${FORGE_STYLE_LABELS[styleKey]} · +${part.length} Q`
                              );
                          }
                          await runFigurePipeline(genParts);
                          chapterGeneratedQs = genParts;
      } else {
                          patchForgeDetail(
                            {
                              phase: 'gemini',
                              styleRows: [],
                              line: `${progressPrefix}: single Gemini batch (mixed styles)…`,
                              geminiLine: 'Building prompt…',
                            },
                            `Mixed batch · ${config.total} Q · ${figureCount > 0 ? `${figureCount} with figures` : 'text only'}`
                          );
                          setForgeProgress(`${progressPrefix}: Synthesizing Questions…`);
                          const gen: Question[] = await generateQuizQuestions(
                              String(chapter.name),
                              diffForGen,
                              config.total,
                              sourceCtxForGen,
                              typesForGen,
                              (status) => {
                                setForgeProgress(`${progressPrefix}: ${status}`);
                                setForgeDetail((p) => (p ? { ...p, geminiLine: status } : p));
                              },
                              figureCount,
                              false,
                              includeFigures ? JSON.stringify(config.selectedFigures || {}) : undefined,
                              selectedModel,
                              visualModeForGen,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              excludedTopicLabelsNormalized,
                              selectedKbId,
                              forgePromptSetOverrideId,
                              forgeSplitLongSource
                          );
                          producedBeforeInsert += gen.length;
                          setForgeDetail((p) =>
                            p
                              ? {
                                  ...p,
                                  chapterQuestions: p.chapterQuestions + gen.length,
                                  geminiLine: `Batch complete · ${gen.length} Q`,
                                }
                              : p
                          );
                          patchForgeDetail(
                            { line: `${progressPrefix}: mixed batch done` },
                            `✓ Mixed styles · +${gen.length} Q`
                          );
                          await runFigurePipeline(gen);
                          chapterGeneratedQs = gen;
                      }
                  }
                  if (chapterGeneratedQs.length > 0) {
                    const rows = questionsToNeetBankRows(
                      chapter,
                      chapterGeneratedQs,
                      batchPromptSetId,
                      batchPromptGenerationSource,
                      selectedModel,
                      batchPromptSetName
                    );
                    assertBankRowsPassLatexValidation(rows, { chapterName: String(chapter.name) });
                    const { error: insertErr } = await supabase.from('question_bank_neet').insert(rows);
                    if (insertErr) {
                      throw new Error(
                        `Hub save failed (${rows.length} new question(s)): ${insertErr.message}${insertErr.code ? ` [${insertErr.code}]` : ''}`
                      );
                    }
                    for (const r of rows) {
                      forgeRunSnapshotRef.current.push(
                        sanitizeRowForAnalysis({ ...(r as object) } as Record<string, unknown>)
                      );
                    }
                    const nSaved = chapterGeneratedQs.length;
                    savedToHubThisRun += nSaved;
                    const chLabel = String(chapter.name);
                    forgeLogIdRef.current += 1;
                    const logId = forgeLogIdRef.current;
                    setForgeDetail((p) => {
                      if (!p) return p;
                      const nextTotal = p.totalQuestions + nSaved;
                      const nextChapters = p.savedChaptersCount + 1;
                      const shortCh =
                        chLabel.length > 40 ? `${chLabel.slice(0, 40)}…` : chLabel;
                      return {
                        ...p,
                        totalQuestions: nextTotal,
                        savedChaptersCount: nextChapters,
                        lastSavedChapterLabel: shortCh,
                        phase: 'done',
                        line: `${progressPrefix}: saved ${nSaved} Q → hub total ${nextTotal} Q · ${nextChapters} chapter(s)`,
                        log: [
                          ...p.log,
                          {
                            id: logId,
                            t: Date.now(),
                            msg: `✓ Saved ${nSaved} Q · ${shortCh} → run total ${nextTotal} Q, ${nextChapters} ch`,
                          },
                        ].slice(-80),
                      };
                    });
                    setForgeProgress(`${progressPrefix}: saved ${nSaved} Q to hub`);
                  } else {
                    patchForgeDetail(
                      {
                        phase: 'done',
                        line: `${progressPrefix}: no questions generated`,
                      },
                      `Chapter skipped · 0 Q`
                    );
                  }
                  break;
                } catch (chapErr: unknown) {
                  console.error('Chapter forge error', chapErr);
                  const msg = chapErr instanceof Error ? chapErr.message : String(chapErr);
                  patchForgeDetail(
                    {
                      line: `${progressPrefix}: error — ${msg.slice(0, 72)}${msg.length > 72 ? '…' : ''}`,
                      geminiLine: msg.slice(0, 400),
                      phase: 'done',
                    },
                    chapterAttempt === 1 && producedBeforeInsert === 0
                      ? `⚠ ${String(chapter.name).slice(0, 40)}${String(chapter.name).length > 40 ? '…' : ''} · will retry`
                      : `✗ ${String(chapter.name).slice(0, 40)}${String(chapter.name).length > 40 ? '…' : ''}`
                  );
                  if (producedBeforeInsert > 0) {
                    failedForgeChapters.push({
                      name: String(chapter.name),
                      error: `${msg} (partial progress not saved — avoids duplicate rows)`,
                    });
                    break;
                  }
                  if (chapterAttempt >= 2) {
                    failedForgeChapters.push({ name: String(chapter.name), error: msg });
                    break;
                  }
                }
              }
      }
    } catch (e: any) {
        suppressForgeSummaryAlert = true;
        alert("Batch Error: " + e.message);
    } finally {
        setIsForgingBatch(false);
        setForgeProgress('');
        setForgeDetail(null);
        setMode('browse');
        if (savedToHubThisRun > 0 && forgeRunSnapshotRef.current.length > 0) {
          setLastForgeAnalysisBatch({
            rows: [...forgeRunSnapshotRef.current],
            savedAt: Date.now(),
          });
          setForgeAnalysisReportMarkdown(null);
          setForgeAnalysisError(null);
          setForgeAnalysisTruncation(null);
        }
        forgeRunSnapshotRef.current = [];
        if (savedToHubThisRun > 0) {
          void fetchQuestions();
          if (selectedChapterIds.size > 0) void fetchBulkStats(Array.from(selectedChapterIds));
          if (!suppressForgeSummaryAlert) {
            const interrupted = stopForgingRef.current;
            const failBlock =
              failedForgeChapters.length > 0
                ? `\n\nFailed chapters (${failedForgeChapters.length}):\n${failedForgeChapters
                    .map((f) => `• ${f.name}: ${f.error.slice(0, 240)}${f.error.length > 240 ? '…' : ''}`)
                    .join('\n')}`
                : '';
            if (failedForgeChapters.length > 0 || interrupted || savedToHubThisRun > 0) {
              alert(
                `Forge summary${interrupted ? ' · interrupted' : ''}\n\n` +
                  `✓ Saved ${savedToHubThisRun} question(s) to the hub.` +
                  failBlock +
                  (interrupted ? '\n\nRemaining chapters were not started or were skipped.' : '')
              );
            }
          }
        } else if (!suppressForgeSummaryAlert && failedForgeChapters.length > 0) {
          alert(
            `Forge finished with no questions saved.\n\nFailed chapters (${failedForgeChapters.length}):\n${failedForgeChapters
              .map((f) => `• ${f.name}: ${f.error.slice(0, 240)}${f.error.length > 240 ? '…' : ''}`)
              .join('\n')}`
          );
        }
      }
    };

  const handleCommitReview = async () => {
    // ... (Commit logic same as original) ...
    if (reviewQueue.length === 0) return;
    setIsSaving(true);
    setForgeProgress('Cloud Sync...');
    try {
        const rows = await Promise.all(
          reviewQueue.map(async (item: any) => {
            const src: KbGenerationPromptSource =
              item.prompt_generation_source === 'builtin_default' ||
              item.prompt_generation_source === 'browser_local' ||
              item.prompt_generation_source === 'cloud_set'
                ? item.prompt_generation_source
                : 'browser_local';
            let prompt_set_name = hubPromptSetDisplayNameFallback(src, item.prompt_set_name);
            if (src === 'cloud_set' && item.prompt_set_id && selectedKbId) {
              const nm = await fetchKbPromptSetName(selectedKbId, String(item.prompt_set_id));
              if (nm) prompt_set_name = nm;
            }
            return {
              chapter_id: item.chapter_id,
              chapter_name: item.chapter_name,
              subject_name: item.subject_name,
              class_name: item.class_name,
              question_text: item.question_text,
              options: item.options,
              correct_index: item.correct_index,
              explanation: item.explanation,
              difficulty: item.difficulty,
              question_type: item.question_type,
              topic_tag: item.topic_tag || 'General',
              figure_url: item.figure_url,
              source_figure_url: item.source_figure_url,
              column_a: item.column_a,
              column_b: item.column_b,
              prompt_set_id: item.prompt_set_id ?? null,
              prompt_generation_source: item.prompt_generation_source ?? null,
              prompt_set_name,
              generation_model: item.generation_model ?? null,
            };
          })
        );
        assertBankRowsPassLatexValidation(rows);
        const { error } = await supabase.from('question_bank_neet').insert(rows);
        if (error) throw error;
        alert(`Synced ${reviewQueue.length} items.`);
        setReviewQueue([]); setMode('browse'); fetchQuestions();
    } catch (err: any) { alert("Commit failed: " + err.message); } finally { setIsSaving(false); setForgeProgress(''); }
  };

  const handleInterruptStudio = () => {
    stopForgingRef.current = true;
  };

  const openForgeAnalysisModalFromLastBatch = useCallback(() => {
    if (!lastForgeAnalysisBatch?.rows.length) return;
    setForgeAnalysisPayload({
      rows: lastForgeAnalysisBatch.rows,
      label: `Last forge · ${lastForgeAnalysisBatch.rows.length} question(s)`,
    });
    setForgeAnalysisReportMarkdown(null);
    setForgeAnalysisError(null);
    setForgeAnalysisTruncation(null);
    setForgeAnalysisModalOpen(true);
  }, [lastForgeAnalysisBatch]);

  const openForgeAnalysisModalFromSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (mode !== 'browse' && mode !== 'review') return;
    const sourceList = mode === 'review' ? reviewQueue : questions;
    const picked = sourceList.filter((q) => selectedIds.has(q.id));
    const rows = picked.map((q) => questionItemToAnalysisRow(q as Record<string, unknown>));
    if (rows.length === 0) return;
    setForgeAnalysisPayload({
      rows,
      label: `${mode === 'review' ? 'Review queue' : 'Browse'} · ${rows.length} selected`,
    });
    setForgeAnalysisReportMarkdown(null);
    setForgeAnalysisError(null);
    setForgeAnalysisTruncation(null);
    setForgeAnalysisModalOpen(true);
  }, [selectedIds, mode, questions, reviewQueue]);

  const runForgeAnalysisGenerate = useCallback(async () => {
    if (!forgeAnalysisPayload?.rows.length) return;
    setForgeAnalysisLoading(true);
    setForgeAnalysisError(null);
    try {
      const result = await runForgeBatchQualityAnalysis(forgeAnalysisPayload.rows, selectedModel);
      setForgeAnalysisReportMarkdown(result.markdown);
      setForgeAnalysisTruncation(
        result.truncated
          ? { analyzedCount: result.analyzedCount, totalCount: result.totalCount }
          : null
      );
    } catch (e: unknown) {
      setForgeAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setForgeAnalysisLoading(false);
    }
  }, [forgeAnalysisPayload, selectedModel]);

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

  /** Chapters whose hub stats are summed in the browse header: explicit selection, else sidebar scope (search + class/subject pills). */
  const browseStatsScopeChapterIds = useMemo(() => {
    if (selectedChapterIds.size > 0) return Array.from(selectedChapterIds).map(String);
    return filteredSidebarChapters.map((c: { id: string }) => String(c.id));
  }, [selectedChapterIds, filteredSidebarChapters]);

  const browseRepoStatsContextLabel = useMemo(() => {
    if (selectedChapterIds.size > 0) {
      return selectedChapterIds.size === 1 ? '1 chapter selected' : `${selectedChapterIds.size} chapters selected`;
    }
    const parts: string[] = [];
    if (chapterSearch.trim()) parts.push('search');
    if (selectedClassFilters.size > 0) parts.push('class');
    if (selectedSubjectFilters.size > 0) parts.push('subject');
    if (parts.length === 0) return 'All chapters in KB';
    return `Filtered (${parts.join(' · ')})`;
  }, [
    selectedChapterIds,
    chapterSearch,
    selectedClassFilters,
    selectedSubjectFilters,
  ]);

  /** Hub totals for browse header (from bulk stats RPC, keyed by chapter id). */
  const browseRepoAggregateStats = useMemo(() => {
    let total = 0;
    let easy = 0;
    let medium = 0;
    let hard = 0;
    let mcq = 0;
    let reasoning = 0;
    let matching = 0;
    let statements = 0;
    for (const id of browseStatsScopeChapterIds) {
      const raw = chapterStats[String(id)];
      if (!raw) continue;
      const s = normalizeChapterStatsRpcRow(raw as unknown as Record<string, unknown>);
      total += s.total;
      easy += s.easy_count;
      medium += s.medium_count;
      hard += s.hard_count;
      mcq += s.mcq_count;
      reasoning += s.reasoning_count;
      matching += s.matching_count;
      statements += s.statements_count;
    }
    return { total, easy, medium, hard, mcq, reasoning, matching, statements };
  }, [browseStatsScopeChapterIds, chapterStats]);

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
    <div className={`${workspacePageClass} flex-1 overflow-hidden relative`}>
        {/* PROGRESS OVERLAY — forge or save */}
        {(isSaving || isForgingBatch) && (
            isForgingBatch && forgeDetail ? (
            <div className="fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-zinc-950/60 p-3 backdrop-blur-sm [color-scheme:light]">
              <div className="flex max-h-[min(92vh,860px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:max-w-2xl lg:max-w-3xl">
                <div className="shrink-0 border-b border-zinc-100 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">Neural forge</p>
                      <h3 className="mt-0.5 truncate text-base font-bold text-white sm:text-lg">Generating questions</h3>
                    </div>
                    <div className="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                      style={{
                        width: `${forgeDetail.chaptersTotal > 0 ? Math.min(100, (forgeDetail.chapterIndex / forgeDetail.chaptersTotal) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold text-white/90">
                    Chapter {forgeDetail.chapterIndex} / {forgeDetail.chaptersTotal}
                    {forgeDetail.chapterName ? ` · ${forgeDetail.chapterName}` : ''}
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 custom-scrollbar space-y-3">
                  <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Current step</p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-zinc-900">{forgeDetail.line}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-md bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                        {forgeDetail.phase}
                      </span>
                      {forgeDetail.synthesisLabel ? (
                        <span className="rounded-md bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600 ring-1 ring-zinc-200">
                          {forgeDetail.synthesisLabel}
                        </span>
                      ) : null}
                      <span className="rounded-md bg-white px-2 py-0.5 text-[9px] font-bold text-zinc-600 ring-1 ring-zinc-200">
                        Model {forgeDetail.modelLabel}
                      </span>
                    </div>
                  </section>

                  <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Gemini</p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed text-indigo-950">{forgeDetail.geminiLine || '—'}</p>
                  </section>

                  {forgeDetail.figureUi ? (
                    <section className="rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/90 to-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-violet-700">Figure pipeline</p>
                          <p className="mt-1 text-[11px] font-bold leading-snug text-violet-950">
                            {forgeDetail.figureUi.modeLabel}
                          </p>
                          <p className="mt-0.5 text-[9px] leading-relaxed text-violet-800/90">
                            {forgeDetail.figureUi.subLabel}
                          </p>
                        </div>
                        {forgeDetail.synthesisLabel ? (
                          <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-zinc-600 ring-1 ring-violet-100">
                            {forgeDetail.synthesisLabel}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 text-[8px] font-black uppercase tracking-widest text-violet-600/85">
                        Reference (selected slots)
                      </p>
                      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] custom-scrollbar">
                        {forgeDetail.figureUi.referenceThumbs.length > 0 ? (
                          forgeDetail.figureUi.referenceThumbs.map((t, i) => (
                            <div
                              key={`${t.label}-${i}`}
                              className="w-20 shrink-0 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm sm:w-24"
                            >
                              <div className="flex h-[4.5rem] items-center justify-center bg-white sm:h-[5rem]">
                                <img
                                  src={t.dataUrl}
                                  alt=""
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                              <p className="border-t border-violet-100 bg-violet-100/60 py-0.5 text-center text-[7px] font-bold text-violet-900">
                                {t.label}
                              </p>
                            </div>
                          ))
                        ) : (
                          [0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="flex h-[5.25rem] w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-violet-200/90 bg-white/70 px-1"
                            >
                              <iconify-icon icon="mdi:image-off-outline" width="22" className="text-violet-300" />
                              <span className="text-center text-[7px] font-semibold leading-tight text-violet-500">
                                No ref
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="mt-3 rounded-lg border border-violet-100 bg-white/80 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[8px] font-black uppercase tracking-widest text-violet-600/90">
                            {forgeDetail.phase === 'figures' ? 'Live render' : 'Figure stage'}
                          </p>
                          {forgeDetail.figureUi.expectedOutputs != null &&
                          forgeDetail.figureUi.expectedOutputs > 0 ? (
                            <span className="text-[9px] font-black tabular-nums text-violet-900">
                              {forgeDetail.figureUi.renderedCount}/{forgeDetail.figureUi.expectedOutputs}
                            </span>
                          ) : null}
                        </div>
                        {forgeDetail.figureUi.expectedOutputs === 0 ? (
                          <p className="mt-2 text-[10px] font-medium leading-snug text-amber-900">
                            {forgeDetail.figureUi.statusLine}
                          </p>
                        ) : forgeDetail.figureUi.expectedOutputs != null &&
                          forgeDetail.figureUi.expectedOutputs > 0 ? (
                          <>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-200/80">
                              <div
                                className="h-full rounded-full bg-violet-600 transition-[width] duration-300 ease-out"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (forgeDetail.figureUi.renderedCount /
                                      forgeDetail.figureUi.expectedOutputs) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="mt-2 font-mono text-[10px] leading-relaxed text-violet-950">
                              {forgeDetail.figureUi.statusLine}
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-200/70">
                              <div className="h-full w-[35%] animate-pulse rounded-full bg-violet-400/90" />
                            </div>
                            <p className="mt-2 font-mono text-[10px] leading-relaxed text-violet-950">
                              {forgeDetail.figureUi.statusLine}
                            </p>
                          </>
                        )}
                      </div>

                      <p className="mt-3 text-[8px] font-black uppercase tracking-widest text-emerald-700/90">
                        Created figures (scroll sideways)
                      </p>
                      <div className="mt-1.5 flex min-h-[6rem] gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] custom-scrollbar">
                        {forgeDetail.figureUi.outputDataUrls.length > 0 ? (
                          forgeDetail.figureUi.outputDataUrls.map((url, i) => (
                            <div
                              key={`out-${i}-${url.length}`}
                              className="w-24 shrink-0 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100/80 sm:w-28"
                            >
                              <div className="flex h-24 items-center justify-center bg-zinc-50/80">
                                <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                              </div>
                              <p className="border-t border-emerald-100 bg-emerald-50/90 py-0.5 text-center text-[7px] font-bold text-emerald-900">
                                #{i + 1}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="flex min-h-[5.5rem] w-full items-center justify-center rounded-xl border border-dashed border-violet-200/80 bg-violet-50/30 px-3 text-center text-[9px] font-medium leading-relaxed text-violet-700/85">
                            {forgeDetail.phase === 'figures'
                              ? 'Thumbnails appear here as each image API call completes.'
                              : 'Previews show after the figure-rendering step runs.'}
                          </div>
                        )}
                      </div>
                    </section>
                  ) : forgeDetail.synthesisLabel === 'Syllabus-focused' ? (
                    <section className="rounded-xl border border-zinc-200 bg-zinc-50/90 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Figures</p>
                      <p className="mt-1 text-[10px] font-semibold leading-snug text-zinc-700">
                        Syllabus mode — topic text only. No chapter figure or synthetic image pipeline for this
                        run.
                      </p>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="flex h-14 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white text-[7px] font-bold uppercase tracking-wide text-zinc-400"
                          >
                            Topic
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {forgeDetail.plannedTotalQs > 0 || forgeDetail.recipeNote ? (
                    <section className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Chapter plan</p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-emerald-50/90 py-2 ring-1 ring-emerald-100">
                          <p className="text-[8px] font-black uppercase text-emerald-700">Easy</p>
                          <p className="text-lg font-black text-emerald-900">{forgeDetail.plannedEasy}</p>
                        </div>
                        <div className="rounded-lg bg-amber-50/90 py-2 ring-1 ring-amber-100">
                          <p className="text-[8px] font-black uppercase text-amber-800">Medium</p>
                          <p className="text-lg font-black text-amber-950">{forgeDetail.plannedMedium}</p>
                        </div>
                        <div className="rounded-lg bg-rose-50/90 py-2 ring-1 ring-rose-100">
                          <p className="text-[8px] font-black uppercase text-rose-800">Hard</p>
                          <p className="text-lg font-black text-rose-950">{forgeDetail.plannedHard}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-zinc-700">
                        <span>MCQ {forgeDetail.plannedMcq}</span>
                        <span>Asst–R {forgeDetail.plannedReasoning}</span>
                        <span>Match {forgeDetail.plannedMatching}</span>
                        <span>Stmt {forgeDetail.plannedStatements}</span>
                        <span className="text-zinc-500">· Σ {forgeDetail.plannedTotalQs} Q</span>
                      </div>
                      {forgeDetail.recipeNote ? (
                        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">{forgeDetail.recipeNote}</p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5">
                      <p className="text-[8px] font-black uppercase text-emerald-700">This chapter</p>
                      <p className="text-xl font-black text-emerald-900">{forgeDetail.chapterQuestions}</p>
                      <p className="text-[9px] text-emerald-800/80">generated (not yet saved until chapter ends)</p>
                    </div>
                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 sm:col-span-1">
                      <p className="text-[8px] font-black uppercase text-violet-700">Saved to hub (this run)</p>
                      <p className="text-xl font-black text-violet-900">{forgeDetail.totalQuestions}</p>
                      <p className="text-[9px] font-bold text-violet-800/90">
                        {forgeDetail.savedChaptersCount} chapter{forgeDetail.savedChaptersCount === 1 ? '' : 's'}
                      </p>
                      <p
                        className="mt-1 line-clamp-2 text-[9px] leading-snug text-violet-700/90 [overflow-wrap:anywhere]"
                        title={forgeDetail.lastSavedChapterLabel}
                      >
                        Last: {forgeDetail.lastSavedChapterLabel}
                      </p>
                    </div>
                    {forgeDetail.syllabusTotal > 0 ? (
                      <div className="col-span-2 rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 sm:col-span-1">
                        <p className="text-[8px] font-black uppercase text-amber-800">Syllabus topic</p>
                        <p className="text-xs font-bold text-amber-950">
                          {forgeDetail.syllabusIndex}/{forgeDetail.syllabusTotal}
                        </p>
                        <p className="line-clamp-2 text-[10px] font-medium text-amber-900/90" title={forgeDetail.syllabusTopic || ''}>
                          {forgeDetail.syllabusTopic || '—'}
                        </p>
                      </div>
                    ) : null}
                  </section>

                  {forgeDetail.styleRows.some((r) => r.planned > 0) ? (
                    <section className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">By style (split calls)</p>
                      <ul className="mt-2 space-y-1.5">
                        {forgeDetail.styleRows.map((r) => (
                          <li
                            key={r.key}
                            className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                              r.status === 'running'
                                ? 'border-indigo-200 bg-indigo-50'
                                : r.status === 'done'
                                  ? 'border-emerald-100 bg-emerald-50/50'
                                  : r.status === 'skipped'
                                    ? 'border-zinc-100 bg-zinc-50/50 opacity-50'
                                    : 'border-zinc-100 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-zinc-800">{r.label}</span>
                              <span className="shrink-0 text-[10px] font-bold text-zinc-600">
                                {r.status === 'skipped'
                                  ? '—'
                                  : r.status === 'done'
                                    ? `${r.produced}/${r.planned}`
                                    : r.status === 'running'
                                      ? `… / ${r.planned}`
                                      : `${r.planned} planned`}
                              </span>
                            </div>
                            {r.planned > 0 ? (
                              <p className="text-[9px] font-semibold text-zinc-500">Difficulty slice: {r.diffLabel}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="rounded-xl border border-zinc-200 bg-zinc-900/[0.03] p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Activity log</p>
                    <div className="mt-2 max-h-36 overflow-y-auto font-mono text-[10px] leading-relaxed text-zinc-700 custom-scrollbar">
                      {forgeDetail.log.length === 0 ? (
                        <span className="text-zinc-400">Waiting…</span>
                      ) : (
                        forgeDetail.log.map((e) => (
                          <div key={e.id} className="border-b border-zinc-100/80 py-1 last:border-0">
                            {e.msg}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/90 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={handleInterruptStudio}
                    className="w-full rounded-xl border-2 border-rose-200 bg-white py-2.5 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-50"
                  >
                    Interrupt forge
                  </button>
                  <p className="mt-2 text-center text-[9px] text-zinc-500">
                    Stops after the current Gemini call. Finished chapters are already in the hub.
                  </p>
                </div>
              </div>
            </div>
            ) : (
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
                  One chapter error retries once if no questions were produced yet; otherwise the chapter is skipped and forge continues. Interrupt stops before the next chapter or topic.
                </p>
            </div>
            )
        )}
        
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch">
            <aside className="flex min-h-0 w-full flex-1 flex-col border-b border-zinc-100 bg-white shadow-sm shrink-0 z-20 lg:max-w-[20rem] lg:w-80 lg:shrink-0 lg:flex-none lg:self-stretch lg:border-b-0 lg:border-r">
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white lg:border-l lg:border-zinc-200/90">
                {/* Header + browse tools — right of chapter tray */}
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
                <div className="bg-zinc-50/90 border-t border-zinc-100 px-3 sm:px-6 py-2 flex flex-col gap-2">
                    <div className="rounded-xl border border-zinc-200/90 bg-gradient-to-br from-zinc-100/95 via-zinc-50 to-zinc-100/80 px-3 py-2.5 sm:px-4 sm:py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)]">
                        {browseStatsScopeChapterIds.length === 0 ? (
                            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                                No chapters in this knowledge base
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2 sm:gap-2.5">
                                <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                                        Question bank
                                    </span>
                                    <span className="hidden h-3 w-px bg-zinc-300 sm:inline" aria-hidden />
                                    <span className="text-lg font-black tabular-nums tracking-tight text-zinc-800 sm:text-xl">
                                        {browseRepoAggregateStats.total.toLocaleString()}
                                    </span>
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                                        total
                                    </span>
                                </div>
                                <p className="text-center text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400 sm:text-left">
                                    {browseRepoStatsContextLabel}
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 text-[11px] text-zinc-600 sm:justify-start sm:gap-x-2">
                                    <span className="font-semibold text-zinc-500">Difficulty</span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Easy {browseRepoAggregateStats.easy.toLocaleString()}
                                    </span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Med {browseRepoAggregateStats.medium.toLocaleString()}
                                    </span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Hard {browseRepoAggregateStats.hard.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 text-[11px] text-zinc-600 sm:justify-start sm:gap-x-2">
                                    <span className="font-semibold text-zinc-500">Styles</span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        MCQ {browseRepoAggregateStats.mcq.toLocaleString()}
                                    </span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Assertion {browseRepoAggregateStats.reasoning.toLocaleString()}
                                    </span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Match {browseRepoAggregateStats.matching.toLocaleString()}
                                    </span>
                                    <span className="rounded-md bg-white/70 px-2 py-0.5 font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200/80">
                                        Stmt {browseRepoAggregateStats.statements.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <button onClick={handleSelectAllOnPage} className={`px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${selectedIds.size === (mode === 'review' ? reviewQueue.length : questions.length) && (mode === 'review' ? reviewQueue.length : questions.length) > 0 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}><iconify-icon icon={selectedIds.size === (mode === 'review' ? reviewQueue.length : questions.length) && (mode === 'review' ? reviewQueue.length : questions.length) > 0 ? "mdi:check-circle" : "mdi:circle-outline"} /> Select All</button>
                        {(mode === 'browse' || mode === 'review') && selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={openForgeAnalysisModalFromSelection}
                                disabled={isForgingBatch}
                                title="Send selected rows (table fields, images omitted) to Gemini for a quality report"
                                className="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-[8px] font-black uppercase tracking-widest text-violet-800 shadow-sm transition-all hover:bg-violet-100 flex items-center gap-2 disabled:opacity-50"
                            >
                                <iconify-icon icon="mdi:clipboard-text-search" width="16" />
                                AI report ({selectedIds.size})
                            </button>
                        )}
                        {mode === 'browse' && (
                            <>
                                <div className="hidden h-6 w-px bg-zinc-200 sm:block" />
                                <div className="flex flex-wrap items-center gap-1.5"><span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mr-1">Rigor:</span>{(['all', 'Easy', 'Medium', 'Hard'] as const).map(d => (<button key={d} onClick={() => { setBrowseFilters({...browseFilters, difficulty: d}); setCurrentPage(1); }} className={`px-3 py-1 rounded-full text-[8px] font-black uppercase transition-all border ${browseFilters.difficulty === d ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}>{d}</button>))}</div>
                                <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-3"><select value={browseFilters.style} onChange={e => { setBrowseFilters({...browseFilters, style: e.target.value}); setCurrentPage(1); }} className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-[8px] font-black uppercase text-indigo-600 outline-none"><option value="all">ALL STYLES</option><option value="mcq">MCQ</option><option value="reasoning">ASSERTION</option><option value="matching">MATCHING</option><option value="statements">STATEMENTS</option></select></div>
                                <button onClick={() => { setBrowseFilters({...browseFilters, hasFigure: !browseFilters.hasFigure}); setCurrentPage(1); }} className={`px-3 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${browseFilters.hasFigure ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-zinc-200 text-zinc-400'}`}><iconify-icon icon="mdi:image-outline" /> Figure Only</button>
                            </>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-2">
                        <span className="w-full text-[7px] font-bold uppercase tracking-widest text-zinc-400 sm:w-auto sm:mr-1">Cards:</span>
                        <button
                          type="button"
                          title="Reference figure used for image-style questions"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showSourceFigure: !p.showSourceFigure }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showSourceFigure ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi:image-search-outline" width="14" /> Source fig
                        </button>
                        <button
                          type="button"
                          title="Shows prompt pipeline (matches DB prompt_generation_source). Hover the purple chip on a card for the full tooltip."
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showPromptSource: !p.showPromptSource }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showPromptSource ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi:text-box-multiple-outline" width="14" /> Prompt source
                        </button>
                        <button
                          type="button"
                          title="Gemini text model saved on the row (generation_model)"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showGenerationModel: !p.showGenerationModel }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showGenerationModel ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi:robot-outline" width="14" /> AI model
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showChapter: !p.showChapter }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showChapter ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi-book-open-variant" width="14" /> Chapter
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showTopic: !p.showTopic }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showTopic ? 'bg-zinc-700 border-zinc-700 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi-tag-outline" width="14" /> Topic
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showOptions: !p.showOptions }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showOptions ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi:format-list-numbered" width="14" /> Choices
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showCorrectAnswer: !p.showCorrectAnswer }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showCorrectAnswer ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi-check-decagram" width="14" /> Answer
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCardDisplay((p) => ({ ...p, showExplanation: !p.showExplanation }))}
                          className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${questionCardDisplay.showExplanation ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}
                        >
                          <iconify-icon icon="mdi-lightbulb-on-outline" width="14" /> Explanation
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 pt-2">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{mode === 'review' ? reviewQueue.length : totalCount} Items</span>
                    </div>
                </div>
            )}
        </header>

        {mode === 'browse' && lastForgeAnalysisBatch && lastForgeAnalysisBatch.rows.length > 0 && (
            <div className="shrink-0 border-b border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-2.5 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] font-semibold leading-snug text-violet-950 sm:max-w-xl">
                        <span className="font-black uppercase tracking-widest text-violet-700">Post-forge</span>{' '}
                        {lastForgeAnalysisBatch.rows.length} question(s) just saved — run an AI quality pass (difficulty tags, NEET style,
                        topic fit, explanations, distractors, scores).
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={openForgeAnalysisModalFromLastBatch}
                            disabled={isForgingBatch}
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-violet-900 shadow-sm transition-all hover:bg-violet-100 disabled:opacity-50"
                        >
                            <iconify-icon icon="mdi:chart-box-outline" width="18" />
                            AI quality report
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLastForgeAnalysisBatch(null);
                                setForgeAnalysisModalOpen(false);
                            }}
                            className="rounded-xl px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-violet-600/80 hover:text-violet-900"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        )}

        <Dialog.Root
            open={forgeAnalysisModalOpen}
            onOpenChange={(open) => {
                setForgeAnalysisModalOpen(open);
                if (!open) setForgeAnalysisPayload(null);
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[185] bg-black/45 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-[195] flex max-h-[min(92vh,820px)] w-[calc(100vw-1.25rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl [color-scheme:light] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/90 px-4 py-3 sm:px-5">
                        <div>
                            <Dialog.Title className="text-sm font-black tracking-tight text-zinc-900">
                                AI batch quality report
                            </Dialog.Title>
                            <Dialog.Description className="mt-0.5 text-[10px] font-medium text-zinc-500">
                                {forgeAnalysisPayload?.label ?? '—'} · text{' '}
                                <span className="font-mono">{selectedModel}</span> · image{' '}
                                <span className="font-mono">{selectedImageModel}</span>
                            </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-800"
                                aria-label="Close"
                            >
                                <iconify-icon icon="mdi:close" width="20" />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5 sm:px-5">
                        <button
                            type="button"
                            disabled={forgeAnalysisLoading || !forgeAnalysisPayload?.rows.length}
                            onClick={() => void runForgeAnalysisGenerate()}
                            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50"
                        >
                            {forgeAnalysisLoading ? (
                                <>
                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Analyzing…
                                </>
                            ) : (
                                <>
                                    <iconify-icon icon="mdi:play-circle-outline" width="18" />
                                    Run analysis
                                </>
                            )}
                        </button>
                        {forgeAnalysisReportMarkdown && (
                            <button
                                type="button"
                                onClick={() => {
                                    void navigator.clipboard.writeText(forgeAnalysisReportMarkdown);
                                }}
                                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:bg-zinc-50"
                            >
                                Copy markdown
                            </button>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 custom-scrollbar">
                        {forgeAnalysisTruncation ? (
                            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-950">
                                Large batch: analysis covers the first {forgeAnalysisTruncation.analyzedCount} of{' '}
                                {forgeAnalysisTruncation.totalCount} rows. Use filters or analyze selected subsets for the rest.
                            </p>
                        ) : null}
                        {forgeAnalysisError ? (
                            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{forgeAnalysisError}</p>
                        ) : null}
                        {forgeAnalysisReportMarkdown ? (
                            <div className="whitespace-pre-wrap text-left text-[13px] leading-relaxed text-zinc-800">
                                {forgeAnalysisReportMarkdown}
                </div>
                        ) : (
                            !forgeAnalysisLoading && (
                                <p className="text-sm text-zinc-500">
                                    Sends sanitized table fields (inline images replaced with placeholders) to the server Gemini proxy. Run
                                    when you are ready.
                                </p>
                            )
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>

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
                                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                    <div className="flex min-w-0 w-full flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm md:max-w-xl">
                                      <div>
                                        <label className="text-[9px] font-black uppercase tracking-wide text-zinc-500">
                                          Text generation model
                                        </label>
                                        <p className="mt-0.5 text-[8px] font-medium leading-snug text-zinc-400">
                                          Gemini API id in monospace under each option. Used for stems, options, explanations.
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                      {STUDIO_MODEL_IDS.map((m) => {
                                        const meta = STUDIO_MODEL_META[m];
                                            const active = selectedModel === m;
                                        return (
                                              <button
                                                key={m}
                                                type="button"
                                                disabled={isForgingBatch}
                                                onClick={() => setSelectedModel(m)}
                                                className={`flex min-w-[7.5rem] flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-all sm:min-w-[8.5rem] ${
                                                  active
                                                    ? 'border-indigo-400 bg-indigo-50 shadow-sm ring-1 ring-indigo-100'
                                                    : 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300'
                                                } disabled:opacity-50`}
                                              >
                                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-800">
                                            <iconify-icon icon={meta.icon} width="14" /> {meta.label}
                                                </span>
                                                <span className="mt-0.5 font-mono text-[7px] font-medium leading-tight text-zinc-500 [overflow-wrap:anywhere]">
                                                  {m}
                                                </span>
                                                <span className="mt-0.5 text-[7px] font-medium text-zinc-400">{meta.versionLine}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                      </div>
                                      <div className="border-t border-zinc-100 pt-3">
                                        <label className="text-[9px] font-black uppercase tracking-wide text-zinc-500">
                                          Figure / image model
                                        </label>
                                        <p className="mt-0.5 text-[8px] font-medium leading-snug text-zinc-400">
                                          Used only when you run <strong className="font-semibold text-zinc-600">Fill figure questions</strong>{' '}
                                          (composite trace and synthetic diagrams).
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {STUDIO_IMAGE_MODEL_IDS.map((m) => {
                                            const meta = STUDIO_IMAGE_MODEL_META[m];
                                            const active = selectedImageModel === m;
                                            return (
                                              <button
                                                key={m}
                                                type="button"
                                                disabled={isForgingBatch}
                                                onClick={() => setSelectedImageModel(m)}
                                                className={`flex min-w-[7.5rem] flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-all sm:min-w-[8.5rem] ${
                                                  active
                                                    ? 'border-violet-400 bg-violet-50 shadow-sm ring-1 ring-violet-100'
                                                    : 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300'
                                                } disabled:opacity-50`}
                                              >
                                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-800">
                                                  <iconify-icon icon={meta.icon} width="14" /> {meta.label}
                                                </span>
                                                <span className="mt-0.5 font-mono text-[7px] font-medium leading-tight text-zinc-500 [overflow-wrap:anywhere]">
                                                  {m}
                                                </span>
                                                <span className="mt-0.5 text-[7px] font-medium text-zinc-400">{meta.versionLine}</span>
                                      </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2 w-full md:w-auto md:min-w-[200px]">
                                      <label className="text-[9px] font-black uppercase tracking-wide text-zinc-500">Prompt set</label>
                                      <select
                                        value={forgePromptSetOverrideId ?? ''}
                                        onChange={(e) => setForgePromptSetOverrideId(e.target.value ? e.target.value : null)}
                                        disabled={!selectedKbId || isForgingBatch}
                                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 outline-none focus:border-indigo-300 disabled:opacity-50"
                                      >
                                        <option value="">KB preference (default)</option>
                                        {forgePromptSets.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.name} ({s.set_kind})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-1.5 text-[9px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 md:self-start">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-rose-600 focus:ring-rose-500/30"
                                        checked={forgeSplitLongSource}
                                        onChange={(e) => setForgeSplitLongSource(e.target.checked)}
                                        disabled={isForgingBatch}
                                      />
                                      <span className="leading-tight">
                                        Split long source
                                        <span className="block font-normal text-zinc-500">
                                          Extra calls only if chapter text exceeds model budget; question counts scale per segment.
                                        </span>
                                      </span>
                                    </label>
                                    <div className="flex w-full min-w-0 flex-col gap-2 md:max-w-xl">
                                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                                        <button
                                          type="button"
                                          onClick={() => setStudioChapterConfigOpen(true)}
                                          disabled={!activeConfig}
                                          className="border border-zinc-200 bg-white px-4 py-2.5 rounded-lg font-semibold text-[10px] uppercase tracking-wide text-zinc-800 shadow-sm hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shrink-0 sm:flex-none disabled:opacity-40"
                                        >
                                          <iconify-icon icon="mdi:cog-outline" width="18" /> Config
                                      </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleRunForge('text_only')}
                                          disabled={isForgingBatch}
                                          className="border border-zinc-200 bg-white px-4 py-2.5 rounded-lg font-semibold text-[10px] uppercase tracking-wide text-zinc-800 shadow-sm hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 active:scale-[0.99] shrink-0 sm:flex-1 disabled:opacity-50"
                                        >
                                          <iconify-icon icon="mdi:text-box-outline" width="18" /> Fill text questions
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleRunForge('with_figures')}
                                          disabled={isForgingBatch || studioForgeSelectionAllSyllabus}
                                          title={
                                            studioForgeSelectionAllSyllabus
                                              ? 'Syllabus mode is text-only. Use Fill text questions.'
                                              : 'Uses Visual mode in chapter config (reference images or synthetic figure count).'
                                          }
                                          className="bg-zinc-900 text-white px-4 py-2.5 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-md hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.99] shrink-0 sm:flex-1 disabled:opacity-50"
                                        >
                                          <iconify-icon icon="mdi:image-plus-outline" width="18" /> Fill figure questions
                                        </button>
                                  </div>
                                      <p className="text-[9px] font-medium leading-snug text-zinc-500">
                                        Same models and prompts. <strong className="text-zinc-600">Text</strong> skips figure
                                        mandates and image rendering. <strong className="text-zinc-600">Figures</strong> uses
                                        chapter Config → Visual mode on each <strong className="text-zinc-600">standard</strong>{' '}
                                        chapter. Syllabus chapters stay text-only; if every selected chapter is syllabus, use
                                        Fill text questions.
                                      </p>
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
                                                        <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-[8px] font-medium leading-snug text-zinc-600">
                                                          To use one shared total and mix for every standard chapter, turn on the toggle under <strong className="font-semibold text-zinc-800">Selected batch</strong> and edit the uniform preset there.
                                                        </p>
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
                                              <span className="text-[10px] font-medium uppercase text-indigo-300">INR total</span>
                                            </div>
                                            <div className="mt-2 space-y-1.5 text-[8px] font-medium leading-snug text-zinc-300">
                                              <p>
                                                <span className="font-black uppercase tracking-wide text-emerald-300/90">Text</span>{' '}
                                                <span className="font-mono text-zinc-400">{forgeCostPreview.textModelApiId}</span>
                                                <span className="text-zinc-500"> · {forgeCostPreview.textModelVersionLine}</span>
                                                <br />
                                                <span className="tabular-nums text-zinc-400">
                                                  ₹{forgeCostPreview.textSubtotalInr} = {forgeCostPreview.questions} Q × ₹
                                                  {forgeCostPreview.rate.toFixed(2)} + {forgeCostPreview.textCalls} call
                                                  {forgeCostPreview.textCalls === 1 ? '' : 's'} × ₹
                                                  {(
                                                    STUDIO_TEXT_CALL_OVERHEAD_INR[
                                                      selectedModel as keyof typeof STUDIO_TEXT_CALL_OVERHEAD_INR
                                                    ] ?? 0
                                                  ).toFixed(2)}{' '}
                                                  (≈ ₹{forgeCostPreview.variableInr} + ₹{forgeCostPreview.textOverheadInr})
                                                </span>
                                              </p>
                                              <p>
                                                <span className="font-black uppercase tracking-wide text-violet-300/90">Image</span>{' '}
                                                <span className="font-mono text-zinc-400">{forgeCostPreview.imageModelApiId}</span>
                                                <span className="text-zinc-500"> · {forgeCostPreview.imageModelVersionLine}</span>
                                                <br />
                                                <span className="tabular-nums text-zinc-400">
                                                  ₹{forgeCostPreview.imageInr} = {forgeCostPreview.imageCalls} figure
                                                  {forgeCostPreview.imageCalls === 1 ? '' : 's'} × ₹
                                                  {forgeCostPreview.imageRate.toFixed(2)}
                                                </span>
                                              </p>
                                            </div>
                                            <p className="mt-1 text-[8px] text-zinc-500">
                                              Approximate only; actual Google AI billing may differ.
                                            </p>
                                            {applyActiveStandardMixToAllChapters && (
                                              <p className="mt-1 text-[9px] font-semibold text-amber-200/90">
                                                Uniform batch: same total + preset weights on every standard chapter
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
                                        <div className="mb-4 flex flex-col gap-3">
                                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2 shrink-0">
                                          <iconify-icon icon="mdi:layers-triple" className="text-indigo-600" width="20" /> Selected batch
                                        </h3>
                                            <div className="min-w-0 w-full sm:max-w-[min(100%,340px)] space-y-2">
                                              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
                                                <input
                                                  type="checkbox"
                                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                                                  checked={applyActiveStandardMixToAllChapters}
                                                  disabled={
                                                    !activeEditingChapterId ||
                                                    chapterConfigs[activeEditingChapterId]?.synthesisMode !== 'standard'
                                                  }
                                                  onChange={(e) => {
                                                    const on = e.target.checked;
                                                    if (on && activeEditingChapterId) {
                                                      const cfg = chapterConfigs[activeEditingChapterId];
                                                      if (cfg?.synthesisMode === 'standard' && cfg.total > 0) {
                                                        setBatchUniformStandardTotal(
                                                          Math.max(1, Math.min(500, cfg.total))
                                                        );
                                                      }
                                                    }
                                                    setApplyActiveStandardMixToAllChapters(on);
                                                  }}
                                                />
                                                <span className="min-w-0">
                                                  <span className="block text-[9px] font-black uppercase tracking-wide text-amber-950">
                                                    Same counts for all standard chapters
                                                  </span>
                                                  <span className="mt-0.5 block text-[8px] font-medium leading-snug text-zinc-600">
                                                    Set one <strong className="font-semibold text-zinc-800">total</strong> and editable weight presets below; every selected <strong className="font-semibold text-zinc-800">standard</strong> chapter is updated. Syllabus rows are skipped.
                                                  </span>
                                                </span>
                                              </label>
                                              {applyActiveStandardMixToAllChapters &&
                                                activeEditingChapterId &&
                                                chapterConfigs[activeEditingChapterId]?.synthesisMode === 'standard' && (
                                                  <div className="rounded-lg border border-amber-200/80 bg-white px-2.5 py-2.5 shadow-sm space-y-2.5">
                                                    <p className="text-[8px] font-semibold uppercase tracking-wide text-amber-900/90">
                                                      Uniform preset (all standard chapters)
                                                    </p>
                                                    <label className="block">
                                                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide">
                                                        Total questions per chapter
                                                      </span>
                                                      <input
                                                        type="number"
                                                        min={1}
                                                        max={500}
                                                        value={batchUniformStandardTotal}
                                                        onChange={(e) => {
                                                          const v = parseInt(e.target.value, 10);
                                                          setBatchUniformStandardTotal(
                                                            Number.isFinite(v)
                                                              ? Math.max(1, Math.min(500, v))
                                                              : 1
                                                          );
                                                        }}
                                                        className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-semibold tabular-nums text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                      />
                                                    </label>
                                                    <div>
                                                      <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide mb-1">
                                                        Difficulty weights → E / M / H (default 1∶3∶7 parts)
                                                      </p>
                                                      <div className="grid grid-cols-3 gap-1.5">
                                                        {(
                                                          [
                                                            ['easy', 'E', batchUniformDiffWeights.easy],
                                                            ['medium', 'M', batchUniformDiffWeights.medium],
                                                            ['hard', 'H', batchUniformDiffWeights.hard],
                                                          ] as const
                                                        ).map(([key, letter, val]) => (
                                                          <label key={key} className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-semibold text-zinc-400 uppercase">
                                                              {letter}
                                                            </span>
                                                            <input
                                                              type="number"
                                                              min={0}
                                                              max={100}
                                                              value={val}
                                                              onChange={(e) => {
                                                                const v = parseInt(e.target.value, 10);
                                                                setBatchUniformDiffWeights((w) => ({
                                                                  ...w,
                                                                  [key]: Number.isFinite(v)
                                                                    ? Math.max(0, Math.min(100, v))
                                                                    : 0,
                                                                }));
                                                              }}
                                                              className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] font-semibold tabular-nums focus:border-amber-400 focus:outline-none"
                                                            />
                                                          </label>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <div>
                                                      <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide mb-1">
                                                        Style weights (default 7∶1∶1∶1 — MCQ-heavy)
                                                      </p>
                                                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                                        {(
                                                          [
                                                            ['mcq', 'MCQ', batchUniformTypeWeights.mcq],
                                                            ['reasoning', 'Assert', batchUniformTypeWeights.reasoning],
                                                            ['matching', 'Match', batchUniformTypeWeights.matching],
                                                            ['statements', 'Stmt', batchUniformTypeWeights.statements],
                                                          ] as const
                                                        ).map(([key, short, val]) => (
                                                          <label key={key} className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-[7px] font-semibold text-zinc-400 uppercase truncate">
                                                              {short}
                                                            </span>
                                                            <input
                                                              type="number"
                                                              min={0}
                                                              max={100}
                                                              value={val}
                                                              onChange={(e) => {
                                                                const v = parseInt(e.target.value, 10);
                                                                setBatchUniformTypeWeights((w) => ({
                                                                  ...w,
                                                                  [key]: Number.isFinite(v)
                                                                    ? Math.max(0, Math.min(100, v))
                                                                    : 0,
                                                                }));
                                                              }}
                                                              className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] font-semibold tabular-nums focus:border-amber-400 focus:outline-none"
                                                            />
                                                          </label>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <p className="text-[7px] font-medium leading-snug text-zinc-500">
                                                      Counts use largest-remainder scaling so E+M+H and all style counts each sum exactly to the total.
                                                    </p>
                                                  </div>
                                                )}
                                            </div>
                                          </div>
                                        </div>
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
                                            const rowDiff = config?.diff ?? { easy: 0, medium: 0, hard: 0 };
                                            const rowTypes = config?.types ?? { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
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
                                                        <span className="text-[8px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded" title="Easy">
                                                          E:{rowDiff.easy}
                                                        </span>
                                                        <span className="text-[8px] font-semibold text-amber-800 bg-amber-50 px-1 py-0.5 rounded" title="Medium">
                                                          M:{rowDiff.medium}
                                                        </span>
                                                        <span className="text-[8px] font-semibold text-rose-700 bg-rose-50 px-1 py-0.5 rounded" title="Hard">
                                                          H:{rowDiff.hard}
                                                        </span>
                                                        <span
                                                          className="text-[7px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 max-w-full truncate"
                                                          title="MCQ · Assertion · Matching · Statements"
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
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 pb-4 w-full min-w-0">
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
                                    showExplanation={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showExplanation
                                    }
                                    showSource={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showSourceFigure
                                    }
                                    showPromptSet={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showPromptSource
                                    }
                                    promptSetName={q.prompt_set_name ?? null}
                                    promptSourceTooltip={q.prompt_source_tooltip ?? null}
                                    showGenerationModel={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showGenerationModel
                                    }
                                    generationModelLabel={q.generation_model ?? null}
                                    showChapter={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showChapter
                                    }
                                    chapterName={q.chapter_name ?? null}
                                    showTopicTag={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showTopic
                                    }
                                    showOptions={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showOptions
                                    }
                                    showCorrectAnswer={
                                      (mode === 'browse' || mode === 'review') && questionCardDisplay.showCorrectAnswer
                                    }
                                    isSelected={selectedIds.has(String(q.id))}
                                    onToggleSelect={(id) => handleToggleSelect(String(id))}
                                    onFlagOutOfSyllabus={mode === 'browse' ? handleFlagOutOfSyllabus : undefined}
                                    isFlaggedOutOfSyllabus={flaggedQuestionIds.has(String(q.id))}
                                    flagReason={flagReasonsByQuestionId[String(q.id)] ?? null}
                                />
                            ))
                         )}
                        </div>
                        {mode === 'browse' && selectedChapterIds.size > 0 && (
                            <div className="sticky bottom-0 z-10 mt-auto flex flex-col items-center gap-2 border-t border-zinc-200/90 bg-zinc-100/95 px-2 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-zinc-100/80">
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest tabular-nums">
                                        {totalCount} items
                                    </span>
                                    <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                                        <button
                                            type="button"
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-all hover:text-indigo-600 disabled:opacity-30"
                                            aria-label="Previous page"
                                        >
                                            <iconify-icon icon="mdi:chevron-left" />
                                        </button>
                                        <span className="min-w-[4.5rem] px-2 text-center text-[9px] font-black uppercase text-indigo-600 tabular-nums">
                                            P.{currentPage} / {totalPages || 1}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={currentPage >= totalPages}
                                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-all hover:text-indigo-600 disabled:opacity-30"
                                            aria-label="Next page"
                                        >
                                            <iconify-icon icon="mdi:chevron-right" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
            </div>
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
