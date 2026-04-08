
import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import { generateQuizQuestions, ensureApiKey } from '../../services/geminiService';
import { listKbPromptSets, type KbPromptSetRow } from '../../services/kbPromptService';
import { Question } from '../../Quiz/types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import { getLatexIssuesForBankRow, type LatexFieldIssue } from '../../utils/latexBankValidation';

interface QuestionDbLatexLabProps {
  onBack: () => void;
  embedded?: boolean;
}

const MODEL_OPTIONS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
] as const;

type LabMode = 'sample' | 'scan';

type ScanResultView = 'failures_table' | 'all_rendered';

/** Subset of scanned rows to render (paginated). */
type ScanRenderedFilter = 'all' | 'failed_only' | 'ok_only';

const SCAN_VIEW_PAGE_SIZES = [10, 25, 50, 100] as const;

/** One row after a bank scan — full text for re-render + validation issues. */
type ScanRowFull = {
  id: string;
  chapter_name: string | null;
  question_text: string;
  options: string[];
  explanation: string;
  column_a: string[];
  column_b: string[];
  issues: LatexFieldIssue[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const CHAPTER_CHUNK = 100;
const PAGE_SIZE = 400;

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === 'string' ? x : String(x)));
}

const QuestionDbLatexLab: React.FC<QuestionDbLatexLabProps> = ({ onBack, embedded }) => {
  const [labMode, setLabMode] = useState<LabMode>('sample');
  const [kbList, setKbList] = useState<{ id: string; name: string }[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [scanKbId, setScanKbId] = useState<string>('');
  const [promptSets, setPromptSets] = useState<KbPromptSetRow[]>([]);
  /** Empty string = use KB prompt preferences (no override). */
  const [promptSetOverrideId, setPromptSetOverrideId] = useState<string>('');
  const [topic, setTopic] = useState('Organic chemistry — stereochemistry (sample)');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [count, setCount] = useState(2);
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Question[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [scanBusy, setScanBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scanScanned, setScanScanned] = useState(0);
  const [scanAllRows, setScanAllRows] = useState<ScanRowFull[]>([]);
  const [scanResultView, setScanResultView] = useState<ScanResultView>('failures_table');
  const [scanRenderedFilter, setScanRenderedFilter] = useState<ScanRenderedFilter>('all');
  const [scanRenderedPage, setScanRenderedPage] = useState(1);
  const [scanViewPageSize, setScanViewPageSize] =
    useState<(typeof SCAN_VIEW_PAGE_SIZES)[number]>(25);
  const [scanShowRaw, setScanShowRaw] = useState(false);
  const [selectedBadIds, setSelectedBadIds] = useState<Set<string>>(() => new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const failingRows = useMemo(() => scanAllRows.filter((r) => r.issues.length > 0), [scanAllRows]);
  const okRows = useMemo(() => scanAllRows.filter((r) => r.issues.length === 0), [scanAllRows]);

  const renderedFilteredRows = useMemo(() => {
    if (scanRenderedFilter === 'failed_only') return failingRows;
    if (scanRenderedFilter === 'ok_only') return okRows;
    return scanAllRows;
  }, [scanAllRows, failingRows, okRows, scanRenderedFilter]);

  const renderedListTotal = renderedFilteredRows.length;
  const renderedTotalPages =
    renderedListTotal === 0 ? 0 : Math.ceil(renderedListTotal / scanViewPageSize);
  const pageForSlice =
    renderedTotalPages === 0 ? 1 : Math.min(Math.max(1, scanRenderedPage), renderedTotalPages);

  const renderedPageRows = useMemo(() => {
    if (renderedFilteredRows.length === 0) return [];
    const start = (pageForSlice - 1) * scanViewPageSize;
    return renderedFilteredRows.slice(start, start + scanViewPageSize);
  }, [renderedFilteredRows, pageForSlice, scanViewPageSize]);

  useEffect(() => {
    if (renderedTotalPages === 0) return;
    if (scanRenderedPage > renderedTotalPages) setScanRenderedPage(renderedTotalPages);
    if (scanRenderedPage < 1) setScanRenderedPage(1);
  }, [renderedTotalPages, scanRenderedPage]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      void supabase
        .from('knowledge_bases')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setKbList(data || []);
        });
    });
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      setPromptSets([]);
      setPromptSetOverrideId('');
      return;
    }
    let cancelled = false;
    listKbPromptSets(selectedKbId)
      .then((rows) => {
        if (!cancelled) setPromptSets(rows);
      })
      .catch(() => {
        if (!cancelled) setPromptSets([]);
      });
    setPromptSetOverrideId('');
    return () => {
      cancelled = true;
    };
  }, [selectedKbId]);

  const runSample = async () => {
    if (!topic.trim()) {
      alert('Enter a chapter or topic line (same field Neural Studio sends as TARGET CHAPTER).');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus('');
    setResults(null);
    try {
      await ensureApiKey();
      const kbId = selectedKbId.trim() || undefined;
      const override =
        kbId && promptSetOverrideId.trim() ? promptSetOverrideId.trim() : undefined;
      const qs = await generateQuizQuestions(
        topic.trim(),
        difficulty,
        Math.min(3, Math.max(1, count)),
        undefined,
        'mcq',
        (s) => setStatus(s),
        0,
        false,
        undefined,
        model,
        'text',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        kbId ?? null,
        override ?? null
      );
      setResults(qs);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const fetchAllQuestionsForKb = useCallback(async (kbId: string) => {
    const { data: chaps, error: chErr } = await supabase.from('chapters').select('id').eq('kb_id', kbId);
    if (chErr) throw chErr;
    const chapterIds = (chaps || []).map((c: { id: string }) => c.id);
    if (chapterIds.length === 0) return [] as Array<Record<string, unknown>>;

    const all: Record<string, unknown>[] = [];
    for (const chChunk of chunk(chapterIds, CHAPTER_CHUNK)) {
      let from = 0;
      while (true) {
        const { data, error: qErr } = await supabase
          .from('question_bank_neet')
          .select('id, question_text, options, explanation, column_a, column_b, chapter_name')
          .in('chapter_id', chChunk)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (qErr) throw qErr;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
    return all;
  }, []);

  const runBankScan = async () => {
    if (!scanKbId.trim()) {
      alert('Choose a knowledge base to scan.');
      return;
    }
    setScanBusy(true);
    setScanError(null);
    setScanAllRows([]);
    setScanResultView('failures_table');
    setScanRenderedFilter('all');
    setScanRenderedPage(1);
    setSelectedBadIds(new Set());
    setScanScanned(0);
    setScanProgress('Loading questions…');
    try {
      const rows = await fetchAllQuestionsForKb(scanKbId.trim());
      if (rows.length === 0) {
        setScanScanned(0);
        setScanProgress('No questions found for chapters in this knowledge base.');
        return;
      }
      const accumulated: ScanRowFull[] = [];
      let n = 0;
      for (const row of rows) {
        const id = String(row.id ?? '');
        if (!id) continue;
        const questionText = typeof row.question_text === 'string' ? row.question_text : '';
        const options = normalizeStringArray(row.options);
        const explanation = typeof row.explanation === 'string' ? row.explanation : '';
        const column_a = normalizeStringArray(row.column_a);
        const column_b = normalizeStringArray(row.column_b);
        const issues = getLatexIssuesForBankRow({
          question_text: row.question_text,
          options: row.options,
          explanation: row.explanation,
          column_a: row.column_a,
          column_b: row.column_b,
        });
        accumulated.push({
          id,
          chapter_name: row.chapter_name != null ? String(row.chapter_name) : null,
          question_text: questionText,
          options,
          explanation,
          column_a,
          column_b,
          issues,
        });
        n += 1;
        if (n % 40 === 0 || n === rows.length) {
          setScanScanned(n);
          setScanProgress(`Checked ${n} / ${rows.length}…`);
          await new Promise((r) => requestAnimationFrame(r));
        }
      }
      const badCount = accumulated.filter((r) => r.issues.length > 0).length;
      setScanScanned(rows.length);
      setScanAllRows(accumulated);
      setScanProgress(`Done · ${rows.length} checked · ${badCount} with KaTeX errors`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanError(msg);
      setScanProgress('');
    } finally {
      setScanBusy(false);
    }
  };

  const toggleBadSelect = (id: string) => {
    setSelectedBadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFailing = () => {
    if (failingRows.length === 0) return;
    const every = failingRows.every((r) => selectedBadIds.has(r.id));
    if (every) setSelectedBadIds(new Set());
    else setSelectedBadIds(new Set(failingRows.map((r) => r.id)));
  };

  const selectAllOnRenderedPage = () => {
    const idsOnPage = renderedPageRows.map((r) => r.id);
    if (idsOnPage.length === 0) return;
    const allOn = idsOnPage.every((id) => selectedBadIds.has(id));
    setSelectedBadIds((prev) => {
      const next = new Set(prev);
      if (allOn) idsOnPage.forEach((id) => next.delete(id));
      else idsOnPage.forEach((id) => next.add(id));
      return next;
    });
  };

  const allOnPageSelected =
    renderedPageRows.length > 0 && renderedPageRows.every((r) => selectedBadIds.has(r.id));

  const copyBadIds = async () => {
    const text = failingRows.map((r) => r.id).join('\n');
    if (!text) {
      alert('No failing question IDs to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert('Could not copy to clipboard.');
      return;
    }
    alert(`${failingRows.length} id(s) copied.`);
  };

  const deleteSelectedBad = async () => {
    const ids = Array.from(selectedBadIds);
    if (ids.length === 0) {
      alert('Select at least one row.');
      return;
    }
    if (!confirm(`Delete ${ids.length} question(s) from the bank? This cannot be undone.`)) return;
    setDeleteBusy(true);
    setScanError(null);
    try {
      const { error: delErr } = await supabase.from('question_bank_neet').delete().in('id', ids);
      if (delErr) throw delErr;
      setScanAllRows((prev) => prev.filter((r) => !selectedBadIds.has(r.id)));
      setSelectedBadIds(new Set());
      setScanProgress((p) => `${p} · removed ${ids.length} from list`);
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 w-full flex-1 flex-col font-sans'
          : 'mx-auto max-w-6xl animate-fade-in p-2 font-sans md:p-4'
      }
    >
      <div
        className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ${
          embedded ? 'min-h-0 flex-1' : 'min-h-[560px]'
        }`}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 bg-gradient-to-r from-violet-950 to-zinc-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner">
              <iconify-icon icon="mdi:function-variant" width="24" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-white">Question DB · LaTeX check</h2>
              <p className="mt-0.5 text-[11px] font-medium text-violet-200/90">
                Sample generation or scan saved rows for{' '}
                <span className="font-mono text-[10px]">katex-error</span> (same check as pre-save)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-black/20 p-0.5">
              <button
                type="button"
                onClick={() => setLabMode('sample')}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  labMode === 'sample' ? 'bg-white text-violet-900 shadow-sm' : 'text-violet-200 hover:text-white'
                }`}
              >
                Sample
              </button>
              <button
                type="button"
                onClick={() => setLabMode('scan')}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  labMode === 'scan' ? 'bg-white text-violet-900 shadow-sm' : 'text-violet-200 hover:text-white'
                }`}
              >
                Scan bank
              </button>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white transition-colors hover:bg-white/20"
            >
              Exit
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-b border-zinc-200 bg-zinc-50/90 p-5 md:w-[300px] md:border-b-0 md:border-r">
            {labMode === 'sample' ? (
              <>
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Knowledge base
                  </label>
                  <select
                    value={selectedKbId}
                    onChange={(e) => setSelectedKbId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                  >
                    <option value="">None — app default prompts only</option>
                    {kbList.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                    Choose a KB to load merged <span className="font-medium">Latex</span> (and related) blocks like Neural
                    Studio.
                  </p>
                </div>

                {selectedKbId ? (
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Prompt set override
                    </label>
                    <select
                      value={promptSetOverrideId}
                      onChange={(e) => setPromptSetOverrideId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                    >
                      <option value="">KB default (active source in Prompts)</option>
                      {promptSets.map((ps) => (
                        <option key={ps.id} value={ps.id}>
                          {ps.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Target chapter / topic
                  </label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                    placeholder="Chapter name or syllabus line passed to forge…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Difficulty
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'Easy' | 'Medium' | 'Hard')}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-xs font-medium shadow-sm outline-none focus:border-violet-500"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Count (1–3)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={3}
                      value={count}
                      onChange={(e) => setCount(Math.min(3, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center text-xs font-semibold shadow-sm outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium shadow-sm outline-none focus:border-violet-500"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-600">
                  <input
                    type="checkbox"
                    checked={showRaw}
                    onChange={(e) => setShowRaw(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  Show raw strings above previews (debug)
                </label>

                <button
                  type="button"
                  disabled={busy || !topic.trim()}
                  onClick={() => void runSample()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-45"
                >
                  {busy ? (
                    <iconify-icon icon="mdi:loading" className="animate-spin" />
                  ) : (
                    <iconify-icon icon="mdi:play-circle-outline" />
                  )}
                  Generate sample
                </button>

                {status ? (
                  <p className="text-[10px] leading-snug text-violet-700">{status}</p>
                ) : null}
                {error ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">{error}</p>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Knowledge base to scan
                  </label>
                  <select
                    value={scanKbId}
                    onChange={(e) => setScanKbId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none focus:border-violet-500"
                  >
                    <option value="">Select…</option>
                    {kbList.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                    Loads every <span className="font-medium">question_bank_neet</span> row whose chapter belongs to this
                    KB, then runs the same validation as before save.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={scanBusy || !scanKbId}
                  onClick={() => void runBankScan()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 py-3.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-amber-600/25 transition-all hover:bg-amber-700 disabled:opacity-45"
                >
                  {scanBusy ? (
                    <iconify-icon icon="mdi:loading" className="animate-spin" />
                  ) : (
                    <iconify-icon icon="mdi:database-search-outline" />
                  )}
                  Scan for LaTeX errors
                </button>

                {scanProgress ? (
                  <p className="text-[10px] leading-snug text-amber-900/90">{scanProgress}</p>
                ) : null}
                {scanError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">{scanError}</p>
                ) : null}

                {scanAllRows.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-[11px] text-zinc-600">
                    <p className="font-semibold text-zinc-800">
                      {scanAllRows.length} question(s) · {failingRows.length} KaTeX error(s)
                    </p>
                    <button
                      type="button"
                      disabled={deleteBusy || selectedBadIds.size === 0}
                      onClick={() => void deleteSelectedBad()}
                      className="w-full rounded-lg bg-rose-600 py-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-rose-700 disabled:opacity-40"
                    >
                      {deleteBusy ? 'Deleting…' : `Delete selected (${selectedBadIds.size})`}
                    </button>
                    <button
                      type="button"
                      disabled={failingRows.length === 0}
                      onClick={() => void copyBadIds()}
                      className="w-full rounded-lg border border-zinc-200 py-2 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                    >
                      Copy all failing IDs
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto bg-white p-5">
            {labMode === 'sample' ? (
              <>
                {!results?.length && !busy ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-zinc-400">
                    <iconify-icon icon="mdi:function-variant" width="48" className="opacity-40" />
                    <p className="mt-3 text-sm font-semibold text-zinc-500">No sample yet</p>
                    <p className="mt-1 max-w-sm text-xs text-zinc-400">
                      Run a tiny batch and confirm stems, options, and explanations render cleanly before saving to the
                      bank.
                    </p>
                  </div>
                ) : null}

                {results && results.length > 0 ? (
                  <div className="space-y-6">
                    {results.map((q, i) => {
                      const opts = Array.isArray(q.options) ? q.options : [];
                      return (
                        <article
                          key={q.id || i}
                          className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-5 shadow-sm"
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                              Q{i + 1}
                            </span>
                            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200">
                              {q.difficulty || difficulty}
                            </span>
                            <span className="text-[10px] text-zinc-500">KaTeX + SMILES preview</span>
                          </div>

                          {showRaw ? (
                            <pre className="mb-2 max-h-40 overflow-auto rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 font-mono text-[10px] text-zinc-800 whitespace-pre-wrap">
                              {q.text}
                            </pre>
                          ) : null}
                          <div className="math-content mb-4 text-base font-semibold leading-relaxed text-zinc-900">
                            {renderWithSmiles(parsePseudoLatexAndMath(q.text || ''), 160)}
                          </div>

                          <div className="mb-4 grid gap-2 sm:grid-cols-2">
                            {opts.map((opt, oi) => (
                              <div
                                key={oi}
                                className={`rounded-xl border p-3 text-xs font-medium ${
                                  oi === q.correctIndex
                                    ? 'border-emerald-400 bg-emerald-50/80 text-emerald-900'
                                    : 'border-zinc-200 bg-white text-zinc-700'
                                }`}
                              >
                                <span className="mr-2 font-bold opacity-50">
                                  ({String.fromCharCode(65 + oi)})
                                </span>
                                {showRaw ? (
                                  <pre className="mt-1 max-h-20 overflow-auto font-mono text-[9px] whitespace-pre-wrap text-zinc-600">
                                    {opt}
                                  </pre>
                                ) : null}
                                <span className="math-content inline">
                                  {renderWithSmiles(parsePseudoLatexAndMath(opt), 90)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="rounded-xl border border-zinc-200 bg-white p-4">
                            <h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                              Explanation
                            </h4>
                            {showRaw ? (
                              <pre className="mb-2 max-h-28 overflow-auto font-mono text-[10px] text-zinc-600 whitespace-pre-wrap">
                                {q.explanation || ''}
                              </pre>
                            ) : null}
                            <div className="math-content text-xs leading-relaxed text-zinc-700">
                              {renderWithSmiles(parsePseudoLatexAndMath(q.explanation || ''), 120)}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-4">
                {!scanBusy && scanAllRows.length === 0 && !scanError ? (
                  <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-zinc-400">
                    <iconify-icon icon="mdi:database-search-outline" width="48" className="opacity-40" />
                    <p className="mt-3 text-sm font-semibold text-zinc-500">Scan saved questions</p>
                    <p className="mt-1 max-w-md text-xs text-zinc-400">
                      Pick a knowledge base and run the scan. Rows where KaTeX reports an error (same as pre-save
                      validation) appear here so you can delete or re-forge them.
                    </p>
                  </div>
                ) : null}

                {scanAllRows.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="flex rounded-lg bg-zinc-200/60 p-0.5">
                        <button
                          type="button"
                          onClick={() => setScanResultView('failures_table')}
                          className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                            scanResultView === 'failures_table'
                              ? 'bg-white text-zinc-900 shadow-sm'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Failing only ({failingRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setScanResultView('all_rendered')}
                          className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                            scanResultView === 'all_rendered'
                              ? 'bg-white text-zinc-900 shadow-sm'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Rendered view
                        </button>
                      </div>
                      {scanResultView === 'all_rendered' ? (
                        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-600">
                          <input
                            type="checkbox"
                            checked={scanShowRaw}
                            onChange={(e) => setScanShowRaw(e.target.checked)}
                            className="rounded border-zinc-300"
                          />
                          Show raw above previews
                        </label>
                      ) : null}
                    </div>

                    {scanResultView === 'all_rendered' ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Render subset
                          </p>
                          <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-0.5">
                            {(
                              [
                                { id: 'all' as const, label: `All (${scanAllRows.length})` },
                                { id: 'failed_only' as const, label: `Failed (${failingRows.length})` },
                                { id: 'ok_only' as const, label: `OK only (${okRows.length})` },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setScanRenderedFilter(opt.id);
                                  setScanRenderedPage(1);
                                }}
                                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                                  scanRenderedFilter === opt.id
                                    ? 'bg-white text-zinc-900 shadow-sm'
                                    : 'text-zinc-600 hover:text-zinc-900'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <label className="flex items-center gap-2 text-[11px] text-zinc-600">
                            <span className="font-medium">Per page</span>
                            <select
                              value={scanViewPageSize}
                              onChange={(e) => {
                                setScanViewPageSize(Number(e.target.value) as (typeof SCAN_VIEW_PAGE_SIZES)[number]);
                                setScanRenderedPage(1);
                              }}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium"
                            >
                              {SCAN_VIEW_PAGE_SIZES.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={renderedTotalPages === 0 || pageForSlice <= 1}
                              onClick={() => setScanRenderedPage((p) => Math.max(1, p - 1))}
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <span className="text-[11px] font-medium text-zinc-600">
                              Page {renderedTotalPages === 0 ? 0 : pageForSlice} /{' '}
                              {renderedTotalPages || 0}
                            </span>
                            <button
                              type="button"
                              disabled={
                                renderedTotalPages === 0 || pageForSlice >= renderedTotalPages
                              }
                              onClick={() =>
                                setScanRenderedPage((p) =>
                                  renderedTotalPages ? Math.min(renderedTotalPages, p + 1) : p
                                )
                              }
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                        {renderedListTotal > 0 ? (
                          <p className="text-[11px] text-zinc-500">
                            Showing{' '}
                            <span className="font-semibold text-zinc-700">
                              {(pageForSlice - 1) * scanViewPageSize + 1}–
                              {Math.min(pageForSlice * scanViewPageSize, renderedListTotal)}
                            </span>{' '}
                            of <span className="font-semibold text-zinc-700">{renderedListTotal}</span>{' '}
                            {scanRenderedFilter === 'all'
                              ? '(all)'
                              : scanRenderedFilter === 'failed_only'
                                ? '(failed only)'
                                : '(OK only)'}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {scanResultView === 'failures_table' ? (
                      <>
                        {failingRows.length > 0 ? (
                          <div>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-zinc-800">
                                Failing questions ({failingRows.length})
                              </h3>
                              <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={
                                    failingRows.length > 0 &&
                                    failingRows.every((r) => selectedBadIds.has(r.id))
                                  }
                                  onChange={selectAllFailing}
                                  className="rounded border-zinc-300"
                                />
                                Select all failing
                              </label>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-zinc-200">
                              <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
                                <thead>
                                  <tr className="border-b border-zinc-200 bg-zinc-50">
                                    <th className="w-10 p-2" />
                                    <th className="p-2 font-semibold text-zinc-600">ID</th>
                                    <th className="p-2 font-semibold text-zinc-600">Chapter</th>
                                    <th className="p-2 font-semibold text-zinc-600">Fields</th>
                                    <th className="p-2 font-semibold text-zinc-600">Stem preview</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {failingRows.map((r) => {
                                    const stemFlat = r.question_text.replace(/\s+/g, ' ').trim();
                                    const stemPreview = stemFlat.slice(0, 120);
                                    const stemShow =
                                      stemFlat.length > stemPreview.length ? `${stemPreview}…` : stemPreview;
                                    return (
                                      <tr key={r.id} className="border-b border-zinc-100 hover:bg-violet-50/30">
                                        <td className="p-2 align-top">
                                          <input
                                            type="checkbox"
                                            checked={selectedBadIds.has(r.id)}
                                            onChange={() => toggleBadSelect(r.id)}
                                            className="rounded border-zinc-300"
                                          />
                                        </td>
                                        <td className="max-w-[140px] break-all p-2 align-top font-mono text-[10px] text-zinc-700">
                                          {r.id}
                                        </td>
                                        <td className="max-w-[120px] p-2 align-top text-zinc-600">
                                          {r.chapter_name || '—'}
                                        </td>
                                        <td className="max-w-[200px] p-2 align-top text-rose-800">
                                          {r.issues.map((i) => i.field).join(', ')}
                                        </td>
                                        <td className="p-2 align-top text-zinc-600">{stemShow || '—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 p-4 text-center text-sm text-emerald-900">
                            No KaTeX errors in this scan. Switch to <strong>Rendered view</strong> to visually verify every
                            question. Delete controls in the sidebar still apply to any row you select there.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-zinc-500">
                            Same KaTeX path as test papers — tick to select; delete from the sidebar.
                          </p>
                          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-600">
                            <input
                              type="checkbox"
                              checked={allOnPageSelected}
                              onChange={selectAllOnRenderedPage}
                              disabled={renderedPageRows.length === 0}
                              className="rounded border-zinc-300 disabled:opacity-40"
                            />
                            Select all on this page ({renderedPageRows.length})
                          </label>
                        </div>
                        {renderedListTotal === 0 ? (
                          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-600">
                            No questions in this subset.{' '}
                            {scanRenderedFilter === 'failed_only'
                              ? 'Nothing failed validation.'
                              : scanRenderedFilter === 'ok_only'
                                ? 'Every row in the scan had a KaTeX error.'
                                : 'Scan returned no rows.'}
                          </p>
                        ) : null}
                        {renderedPageRows.map((r, idx) => {
                          const globalIdx = (pageForSlice - 1) * scanViewPageSize + idx + 1;
                          return (
                          <article
                            key={r.id}
                            className={`rounded-2xl border p-5 shadow-sm ${
                              r.issues.length > 0
                                ? 'border-rose-200 bg-rose-50/20'
                                : 'border-zinc-200 bg-zinc-50/40'
                            }`}
                          >
                            <div className="mb-3 flex flex-wrap items-start gap-3 border-b border-zinc-200/80 pb-3">
                              <input
                                type="checkbox"
                                checked={selectedBadIds.has(r.id)}
                                onChange={() => toggleBadSelect(r.id)}
                                className="mt-1 rounded border-zinc-300"
                                aria-label={`Select question ${globalIdx}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                                    #{globalIdx}
                                  </span>
                                  {r.issues.length > 0 ? (
                                    <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                      KaTeX error · {r.issues.map((x) => x.field).join(', ')}
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                      OK
                                    </span>
                                  )}
                                  <span className="text-[10px] text-zinc-500">{r.chapter_name || '—'}</span>
                                </div>
                                <p className="mt-1 break-all font-mono text-[9px] text-zinc-400">{r.id}</p>
                              </div>
                            </div>

                            {scanShowRaw ? (
                              <pre className="mb-2 max-h-32 overflow-auto rounded-lg border border-amber-200/80 bg-amber-50/50 p-2 font-mono text-[10px] text-zinc-800 whitespace-pre-wrap">
                                {r.question_text}
                              </pre>
                            ) : null}
                            <div className="math-content mb-4 text-base font-semibold leading-relaxed text-zinc-900">
                              {renderWithSmiles(parsePseudoLatexAndMath(r.question_text || ''), 160)}
                            </div>

                            {r.options.length > 0 ? (
                              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                                {r.options.map((opt, oi) => (
                                  <div
                                    key={oi}
                                    className="rounded-xl border border-zinc-200 bg-white p-3 text-xs font-medium text-zinc-700"
                                  >
                                    <span className="mr-2 font-bold opacity-50">
                                      ({String.fromCharCode(65 + oi)})
                                    </span>
                                    {scanShowRaw ? (
                                      <pre className="mt-1 max-h-16 overflow-auto font-mono text-[9px] whitespace-pre-wrap text-zinc-600">
                                        {opt}
                                      </pre>
                                    ) : null}
                                    <span className="math-content inline">
                                      {renderWithSmiles(parsePseudoLatexAndMath(opt), 90)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {r.column_a.length > 0 || r.column_b.length > 0 ? (
                              <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3 text-[11px] text-zinc-600">
                                <p className="mb-2 font-semibold text-zinc-500">Matching columns</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    {r.column_a.map((cell, ci) => (
                                      <div key={`a-${ci}`} className="math-content border-b border-zinc-100 py-1">
                                        {renderWithSmiles(parsePseudoLatexAndMath(cell), 80)}
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    {r.column_b.map((cell, ci) => (
                                      <div key={`b-${ci}`} className="math-content border-b border-zinc-100 py-1">
                                        {renderWithSmiles(parsePseudoLatexAndMath(cell), 80)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="rounded-xl border border-zinc-200 bg-white p-4">
                              <h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                Explanation
                              </h4>
                              {scanShowRaw ? (
                                <pre className="mb-2 max-h-24 overflow-auto font-mono text-[10px] whitespace-pre-wrap text-zinc-600">
                                  {r.explanation}
                                </pre>
                              ) : null}
                              <div className="math-content text-xs leading-relaxed text-zinc-700">
                                {renderWithSmiles(parsePseudoLatexAndMath(r.explanation || ''), 120)}
                              </div>
                            </div>
                          </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {scanBusy ? (
                  <p className="text-center text-sm text-violet-600">
                    <iconify-icon icon="mdi:loading" className="mr-2 inline animate-spin" />
                    Scanning…
                  </p>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default QuestionDbLatexLab;
