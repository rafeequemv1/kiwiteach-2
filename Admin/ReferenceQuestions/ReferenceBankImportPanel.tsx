import '../../types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { ParseSanityWarning } from '../../utils/examQuestionCountHeuristic';
import {
  type BankImportDraft,
  bankDraftToReferenceInsert,
  ensureReferenceBankImagePublicUrl,
  emptyBankDraft,
  formatRefBankPendingLabel,
  parseBankCsvFileText,
  runLocalReferenceBankExtract,
  sortBankDraftsExamOrder,
} from './referenceBankImport';

type RefUploadSetRow = {
  id: string;
  created_at: string;
  original_filename: string | null;
  source_kind: string;
  ingestion_year: number | null;
};

type Props = {
  onRefreshAll: () => void | Promise<void>;
  onClearMathpixStaged: () => void;
  mathpixStagedActive: boolean;
  savedRows: { reference_upload_set_id?: string | null }[];
  /** Incremented when Mathpix/Gemini parse succeeds so bank draft state is cleared. */
  resetSignal?: number;
};

function Snip({ text, className }: { text: string; className?: string }) {
  const t = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  return <p className={className}>{t}</p>;
}

export default function ReferenceBankImportPanel({
  onRefreshAll,
  onClearMathpixStaged,
  mathpixStagedActive,
  savedRows,
  resetSignal = 0,
}: Props) {
  const [uploadSets, setUploadSets] = useState<RefUploadSetRow[]>([]);
  const [bankPreviewRows, setBankPreviewRows] = useState<BankImportDraft[]>([]);
  const [bankPendingCommit, setBankPendingCommit] = useState<{ files: File[]; kind: 'csv' | 'doc' } | null>(null);
  const [bankDocQueue, setBankDocQueue] = useState<File[]>([]);
  const [bankParsing, setBankParsing] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankParseWarnings, setBankParseWarnings] = useState<ParseSanityWarning[]>([]);
  const [previewBulkYear, setPreviewBulkYear] = useState('');
  const [previewBulkSubject, setPreviewBulkSubject] = useState('');
  const [panelError, setPanelError] = useState<string | null>(null);
  const bankDocInputRef = useRef<HTMLInputElement>(null);
  const bankCsvInputRef = useRef<HTMLInputElement>(null);
  const lastResetSignal = useRef<number | null>(null);

  const loadUploadSets = useCallback(async () => {
    const { data, error } = await supabase
      .from('reference_upload_sets')
      .select('id, created_at, original_filename, source_kind, ingestion_year')
      .order('created_at', { ascending: false })
      .limit(120);
    if (error) throw error;
    setUploadSets((data || []) as RefUploadSetRow[]);
  }, []);

  useEffect(() => {
    void loadUploadSets().catch(() => {});
  }, [loadUploadSets]);

  const countBySetId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of savedRows) {
      const id = r.reference_upload_set_id;
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [savedRows]);

  const bankPreviewSourceLabel = useMemo(
    () =>
      (bankPendingCommit?.files?.length ? formatRefBankPendingLabel(bankPendingCommit.files) : null) || 'Imported file',
    [bankPendingCommit]
  );

  const cancelBankPreview = useCallback(() => {
    setBankPreviewRows([]);
    setBankPendingCommit(null);
    setBankParseWarnings([]);
    setPreviewBulkYear('');
    setPreviewBulkSubject('');
  }, []);

  useEffect(() => {
    if (lastResetSignal.current === null) {
      lastResetSignal.current = resetSignal;
      return;
    }
    if (resetSignal === lastResetSignal.current) return;
    lastResetSignal.current = resetSignal;
    cancelBankPreview();
    setBankDocQueue([]);
  }, [resetSignal, cancelBankPreview]);

  const applyPreviewBulkMeta = useCallback(() => {
    const y = previewBulkYear.trim();
    const sub = previewBulkSubject.trim();
    if (!y && !sub) return;
    setBankPreviewRows((rows) =>
      rows.map((r) => ({
        ...r,
        ...(y ? { year: y } : {}),
        ...(sub ? { subject_name: sub } : {}),
      }))
    );
  }, [previewBulkYear, previewBulkSubject]);

  const downloadCsvTemplate = () => {
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const headers = [
      'question_text',
      'question_format',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'correct_index',
      'explanation',
      'question_type',
      'difficulty',
      'subject_name',
      'chapter_name',
      'topic_tag',
      'class_name',
      'year',
      'source_exam',
      'paper_code',
      'paper_part',
      'source_question_number',
      'image_url',
      'image_base64',
      'image_mime',
    ];
    const sampleUrlRow = [
      'Assertion reason question sample',
      'text',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'B',
      '1',
      'Reasoning for the answer',
      'assertion_reason',
      '',
      'Biology',
      'Genetics',
      'Mendelian inheritance',
      'NEET',
      '2025',
      'NEET',
      'SET-A',
      'Section A',
      '1',
      'https://example.com/image.png',
      '',
      '',
    ];
    const sampleEmbeddedFigureRow = [
      'Which curve shows first-order decay? (see figure)',
      'figure',
      'Curve A',
      'Curve B',
      'Curve C',
      'Curve D',
      'A',
      '0',
      'Local image via image_base64 + image_mime (leave image_url empty).',
      'mcq',
      'medium',
      'Chemistry',
      'Chemical kinetics',
      'Rate laws',
      'NEET',
      '2025',
      'NEET',
      'SET-A',
      'Section B',
      '15',
      '',
      tinyPngBase64,
      'image/png',
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv =
      `${headers.map(esc).join(',')}\n` +
      `${sampleUrlRow.map(esc).join(',')}\n` +
      `${sampleEmbeddedFigureRow.map(esc).join(',')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reference_bank_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const createReferenceUploadSet = async (sourceKind: string, label: string): Promise<string | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const y = previewBulkYear.trim();
    const yearNum = y ? Number(y) : null;
    const { data: inserted, error } = await supabase
      .from('reference_upload_sets')
      .insert({
        original_filename: label.slice(0, 500),
        source_kind: sourceKind,
        uploaded_by: user?.id ?? null,
        ingestion_year: Number.isFinite(yearNum as number) ? yearNum : null,
        metadata: { import_label: label.slice(0, 500) },
      })
      .select('id')
      .single();
    if (error) {
      alert(error.message);
      return null;
    }
    await loadUploadSets();
    return inserted!.id as string;
  };

  const handleBankCsv = async (file: File) => {
    if (mathpixStagedActive) onClearMathpixStaged();
    setPanelError(null);
    const txt = await file.text();
    const parsed = parseBankCsvFileText(txt);
    if (parsed.length === 0) {
      alert('CSV is empty or no question rows found.');
      return;
    }
    setBankPendingCommit({ files: [file], kind: 'csv' });
    setBankParseWarnings([]);
    setBankPreviewRows(parsed);
  };

  const appendBankDocFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setBankDocQueue((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      for (const f of incoming) {
        const k = `${f.name}:${f.size}:${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }
      return next;
    });
    if (bankDocInputRef.current) bankDocInputRef.current.value = '';
  };

  const removeBankDocFromQueue = (index: number) => {
    setBankDocQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const parseAllBankDocs = async () => {
    if (mathpixStagedActive) onClearMathpixStaged();
    if (bankDocQueue.length === 0) {
      alert('Add at least one document.');
      return;
    }
    setBankParsing(true);
    setPanelError(null);
    setBankParseWarnings([]);
    const combined: BankImportDraft[] = [];
    const sanity: ParseSanityWarning[] = [];
    try {
      let fileOrd = 0;
      for (const file of bankDocQueue) {
        const { drafts, parseSanity } = await runLocalReferenceBankExtract(file);
        if (parseSanity) sanity.push(parseSanity);
        if (drafts.length === 0) {
          alert(`No questions extracted from ${file.name}.`);
          return;
        }
        combined.push(...drafts.map((d) => ({ ...d, import_file_ordinal: fileOrd })));
        fileOrd += 1;
      }
      setBankPendingCommit({ files: [...bankDocQueue], kind: 'doc' });
      setBankDocQueue([]);
      setBankPreviewRows(sortBankDraftsExamOrder(combined));
      setBankParseWarnings(sanity);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to parse documents';
      setPanelError(msg);
      alert(msg);
    } finally {
      setBankParsing(false);
    }
  };

  const saveBankPreview = async () => {
    if (bankPreviewRows.length === 0) {
      alert('Nothing to upload.');
      return;
    }
    setBankSaving(true);
    setPanelError(null);
    try {
      const sourceKind = bankPendingCommit?.kind || 'doc';
      const importLabel =
        bankPendingCommit?.files?.length ? formatRefBankPendingLabel(bankPendingCommit.files) : bankPreviewSourceLabel;
      const slugBase = (importLabel || 'ref-import').replace(/[^\w.\-]+/g, '_').slice(0, 60);

      const setId = await createReferenceUploadSet(sourceKind, importLabel);
      if (!setId) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ordered = sortBankDraftsExamOrder(bankPreviewRows);
      const withUploadedImages = await Promise.all(
        ordered.map(async (d, i) => {
          const url = await ensureReferenceBankImagePublicUrl(d.image_url, setId, `${slugBase}-q${i + 1}`);
          return { ...d, image_url: url ?? d.image_url };
        })
      );
      const payload = withUploadedImages.map((d) => bankDraftToReferenceInsert(d, setId, user?.id ?? null));
      const { error } = await supabase.from('reference_questions').insert(payload);
      if (error) throw error;

      cancelBankPreview();
      await loadUploadSets();
      await onRefreshAll();
      alert('Reference questions saved to library.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setPanelError(msg);
      alert(msg);
    } finally {
      setBankSaving(false);
    }
  };

  const deleteBankSet = async (setId: string) => {
    if (!confirm('Delete this upload batch and all reference questions in it?')) return;
    setBankSaving(true);
    setPanelError(null);
    try {
      const { error } = await supabase.from('reference_upload_sets').delete().eq('id', setId);
      if (error) throw error;
      await loadUploadSets();
      await onRefreshAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setPanelError(msg);
      alert(msg);
    } finally {
      setBankSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
      <h3 className="text-base font-semibold text-zinc-900">Reference bank import (PYQ-style)</h3>
      <p className="mt-1 max-w-3xl text-[13px] leading-snug text-zinc-500">
        Same workflow as <strong>PYQ import</strong>, stored in <span className="font-mono">reference_questions</span> +{' '}
        <span className="font-mono">reference_upload_sets</span> (not <span className="font-mono">pyq_questions_neet</span>). For documents: add
        files and <strong>Parse all locally</strong> (no AI). For <strong>CSV</strong>: embed images in the sheet — quoted{' '}
        <span className="font-mono">data:image/…;base64,…</span> in <span className="font-mono">image_url</span>, or{' '}
        <span className="font-mono">image_base64</span> + <span className="font-mono">image_mime</span>. On save, data URLs upload to the{' '}
        <strong>reference-question-images</strong> bucket. Exam year / exam name are kept in row <strong>metadata</strong> (optional bulk fields
        below). Use <strong>Mathpix DOCX · AI</strong> below for the separate pipeline that uses <span className="font-mono">reference_question_sets</span>.
      </p>
      {mathpixStagedActive ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          Mathpix/Gemini staging is active — starting a bank import will clear that draft.
        </p>
      ) : null}
      {panelError ? (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">{panelError}</p>
      ) : null}

      {bankPreviewRows.length === 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 p-5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40">
            <iconify-icon icon="mdi:table-arrow-down" width="28" className="text-indigo-500" />
            <p className="mt-2 text-sm font-semibold text-zinc-900">CSV template</p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              Same columns as PYQ template; saved into <span className="font-mono">reference_questions</span>.
            </p>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:download-outline" width="18" />
              Download template
            </button>
          </div>

          <label className="flex cursor-pointer flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-white p-5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/30">
            <iconify-icon icon="mdi:file-delimited-outline" width="28" className="text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-zinc-900">Import CSV</p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              Multiline quoted fields supported. Clears Mathpix draft if one is open.
            </p>
            <span className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white pointer-events-none">
              Choose CSV file
            </span>
            <input
              ref={bankCsvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleBankCsv(f);
                e.target.value = '';
              }}
            />
          </label>

          <div className="flex flex-col rounded-xl border-2 border-dashed border-zinc-200 bg-white p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/30">
            <iconify-icon icon="mdi:file-document-multiple-outline" width="28" className="text-violet-600" />
            <p className="mt-2 text-sm font-semibold text-zinc-900">DOC · DOCX · TXT (multi)</p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              Local extract (no AI). Numbered MCQs and (A)–(D) options; DOCX figures via IMAGE_N.
            </p>
            <input
              ref={bankDocInputRef}
              type="file"
              accept=".doc,.docx,.txt"
              multiple
              className="hidden"
              onChange={(e) => appendBankDocFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => bankDocInputRef.current?.click()}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[12px] font-semibold text-violet-800 shadow-sm hover:bg-violet-50"
            >
              <iconify-icon icon="mdi:folder-open-outline" width="18" />
              Add documents
            </button>
            {bankDocQueue.length > 0 ? (
              <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-[11px] text-zinc-700">
                {bankDocQueue.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1"
                  >
                    <span className="min-w-0 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[10px] font-semibold text-rose-600 hover:underline"
                      onClick={() => removeBankDocFromQueue(i)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              disabled={bankParsing || bankDocQueue.length === 0}
              onClick={() => void parseAllBankDocs()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {bankParsing ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                  Parsing locally…
                </>
              ) : (
                <>
                  <iconify-icon icon="mdi:file-document-outline" width="18" />
                  Parse all locally
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900" title={bankPreviewSourceLabel}>
                {bankPreviewSourceLabel}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-600">
                <span className="font-mono font-semibold text-indigo-700">{bankPreviewRows.length}</span> questions · not saved to library
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bankSaving}
                onClick={() => void saveBankPreview()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {bankSaving ? 'Saving…' : 'Save to library'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Discard this import and start over?')) cancelBankPreview();
                }}
                className="px-2 py-2 text-[12px] font-medium text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800"
              >
                New import
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3">
            <p className="text-[11px] font-semibold text-indigo-900">Metadata (optional)</p>
            <p className="mt-0.5 text-[10px] leading-snug text-indigo-900/75">
              Set <strong>exam year</strong> and/or <strong>subject</strong> for all rows before save (also written to each row’s metadata / fields).
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Exam year</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 2024"
                  value={previewBulkYear}
                  onChange={(e) => setPreviewBulkYear(e.target.value)}
                  className="w-[88px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
                />
              </label>
              <label className="flex min-w-[140px] flex-1 flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Subject (optional)</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. Physics"
                  value={previewBulkSubject}
                  onChange={(e) => setPreviewBulkSubject(e.target.value)}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
                />
              </label>
              <button
                type="button"
                onClick={() => applyPreviewBulkMeta()}
                disabled={!previewBulkYear.trim() && !previewBulkSubject.trim()}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-800 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
              >
                Apply to all rows
              </button>
            </div>
          </div>

          {bankParseWarnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-[12px] leading-snug text-amber-950">
              <p className="font-semibold text-amber-900">Count sanity check</p>
              <ul className="mt-2 list-inside list-disc text-[11px]">
                {bankParseWarnings.map((w, i) => (
                  <li key={`${w.fileLabel}-${i}`}>
                    <span className="font-medium">{w.fileLabel}</span>: ~{w.heuristicCount} vs {w.extractedCount} extracted
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setBankParseWarnings([])}
                className="mt-2 text-[11px] font-semibold text-amber-800 underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="w-14 py-2 pl-3">Q#</th>
                  <th className="py-2">Question</th>
                  <th className="w-28 py-2">Subject</th>
                  <th className="w-20 py-2">Year</th>
                  <th className="w-14 py-2 pr-3">Fig</th>
                </tr>
              </thead>
              <tbody>
                {bankPreviewRows.slice(0, 50).map((r, i) => (
                  <tr key={`${i}-${r.question_text.slice(0, 20)}`} className="border-t border-zinc-100 align-top">
                    <td className="py-2 pl-3 font-mono text-[10px] text-zinc-600">{r.source_question_number?.trim() || '—'}</td>
                    <td className="py-2 pr-2">
                      <Snip text={r.question_text} className="line-clamp-2 font-medium text-zinc-900 break-words [overflow-wrap:anywhere]" />
                    </td>
                    <td className="py-2">
                      <input
                        value={r.subject_name}
                        onChange={(e) =>
                          setBankPreviewRows((rows) => {
                            const next = [...rows];
                            next[i] = { ...next[i], subject_name: e.target.value };
                            return next;
                          })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-1 py-1 text-[10px]"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={r.year}
                        onChange={(e) =>
                          setBankPreviewRows((rows) => {
                            const next = [...rows];
                            next[i] = { ...next[i], year: e.target.value };
                            return next;
                          })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-1 py-1 text-[10px]"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">{r.image_url?.trim() ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bankPreviewRows.length > 50 && (
              <p className="border-t border-zinc-100 px-3 py-2 text-center text-[11px] text-zinc-500">
                Showing first 50 of {bankPreviewRows.length}
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-8 border-t border-zinc-100 pt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Bank upload batches (reference_upload_sets)
        </p>
        {uploadSets.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">No bank batches yet — use CSV or local documents above.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uploadSets.map((s) => (
              <div key={s.id} className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-[12px]">
                <p className="truncate font-semibold text-zinc-900" title={s.original_filename || ''}>
                  {s.original_filename || 'Batch'}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {new Date(s.created_at).toLocaleString()} · {s.source_kind}
                  {s.ingestion_year != null ? ` · year ${s.ingestion_year}` : ''}
                </p>
                <p className="mt-1 text-[11px] text-zinc-700">
                  <span className="font-mono font-semibold text-indigo-700">{countBySetId.get(s.id) ?? 0}</span> questions
                </p>
                <button
                  type="button"
                  disabled={bankSaving}
                  onClick={() => void deleteBankSet(s.id)}
                  className="mt-2 rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Delete batch
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
