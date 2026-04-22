import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseUrl } from '../../config/env';
import { supabase } from '../../supabase/client';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

export interface ReviewerMarkRow {
  mark_id: string;
  mark_updated_at: string;
  admin_status: string;
  question_id: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  difficulty: string | null;
  question_type: string | null;
  topic_tag: string | null;
  figure_url: string | null;
  chapter_name: string | null;
  subject_name: string | null;
  class_name: string | null;
  knowledge_base_id: string | null;
  knowledge_base_name: string | null;
  mark_wrong: boolean;
  mark_out_of_syllabus: boolean;
  mark_latex_issue: boolean;
  mark_figure_issue: boolean;
  notes: string | null;
  reviewer_id: string;
  reviewer_email: string | null;
  reviewer_name: string | null;
  reviewer_role: string | null;
}

function optionsToLines(opts: string[] | null): string {
  if (!opts || !Array.isArray(opts)) return '';
  return opts.join('\n');
}

function linesToOptions(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

type ReviewerOption = { reviewer_id: string; reviewer_name: string; reviewer_email: string | null };

function mapRpcReviewerRow(r: Record<string, unknown>): ReviewerOption {
  const id = r.reviewer_id ?? (r as { REVIEWER_ID?: unknown }).REVIEWER_ID;
  const name = r.reviewer_name ?? (r as { REVIEWER_NAME?: unknown }).REVIEWER_NAME;
  const email = r.reviewer_email ?? (r as { REVIEWER_EMAIL?: unknown }).REVIEWER_EMAIL;
  const sid = id != null ? String(id) : '';
  const sname = name != null ? String(name).trim() : '';
  const semail = email != null ? String(email) : null;
  return {
    reviewer_id: sid,
    reviewer_name: sname || semail || (sid ? `${sid.slice(0, 8)}…` : ''),
    reviewer_email: semail,
  };
}

function reviewerOptionsFromQueueRows(rows: ReviewerMarkRow[]): ReviewerOption[] {
  const m = new Map<string, ReviewerOption>();
  for (const row of rows) {
    const id = row.reviewer_id;
    if (!id) continue;
    const label =
      (row.reviewer_name && row.reviewer_name.trim()) ||
      row.reviewer_email ||
      `${id.slice(0, 8)}…`;
    const existing = m.get(id);
    if (!existing || label.length > (existing.reviewer_name?.length ?? 0)) {
      m.set(id, {
        reviewer_id: id,
        reviewer_name: label,
        reviewer_email: row.reviewer_email,
      });
    }
  }
  return [...m.values()].sort((a, b) => a.reviewer_name.localeCompare(b.reviewer_name));
}

function mergeReviewerOptions(a: ReviewerOption[], b: ReviewerOption[]): ReviewerOption[] {
  const m = new Map<string, ReviewerOption>();
  for (const x of a) {
    if (x.reviewer_id) m.set(x.reviewer_id, x);
  }
  for (const y of b) {
    if (!y.reviewer_id) continue;
    const ex = m.get(y.reviewer_id);
    if (!ex) {
      m.set(y.reviewer_id, y);
    } else {
      const pick =
        (y.reviewer_name?.length ?? 0) > (ex.reviewer_name?.length ?? 0) ? y : ex;
      m.set(y.reviewer_id, {
        reviewer_id: y.reviewer_id,
        reviewer_name: pick.reviewer_name,
        reviewer_email: pick.reviewer_email ?? ex.reviewer_email ?? y.reviewer_email,
      });
    }
  }
  return [...m.values()].sort((a, b) => a.reviewer_name.localeCompare(b.reviewer_name));
}

const ReviewerQueuePanel: React.FC = () => {
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [reviewerFilter, setReviewerFilter] = useState<string>('');
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([]);
  const [rows, setRows] = useState<ReviewerMarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyMarkId, setBusyMarkId] = useState<string | null>(null);
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ReviewerMarkRow | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftOptions, setDraftOptions] = useState('');
  const [draftCorrect, setDraftCorrect] = useState(0);
  const [draftExplanation, setDraftExplanation] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const syncReviewerDropdown = useCallback(async (queueRows: ReviewerMarkRow[]) => {
    let rpcOpts: ReviewerOption[] = [];
    try {
      const { data, error } = await supabase.rpc('admin_list_question_bank_mark_queue_reviewers');
      if (!error && Array.isArray(data)) {
        rpcOpts = (data as Record<string, unknown>[])
          .map(mapRpcReviewerRow)
          .filter((o) => o.reviewer_id.length > 0);
      }
    } catch {
      /* RPC missing or network — still merge from queue rows */
    }
    const fromRows = reviewerOptionsFromQueueRows(queueRows);
    setReviewerOptions(mergeReviewerOptions(rpcOpts, fromRows));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // DB signature is (p_reviewer_id uuid, p_scope text). Omit p_reviewer_id when unset so PostgREST
      // applies the default; sending JSON null can prevent overload resolution ("schema cache" error).
      const reviewerId = reviewerFilter.trim();
      const rpcArgs: { p_scope: typeof scope; p_reviewer_id?: string } = { p_scope: scope };
      if (reviewerId) rpcArgs.p_reviewer_id = reviewerId;
      const { data, error } = await supabase.rpc('admin_list_question_bank_reviewer_marks', rpcArgs);
      if (error) {
        const msg = error.message || String(error);
        setListError(msg);
        alert(msg);
        setRows([]);
        await syncReviewerDropdown([]);
        return;
      }
      setListError(null);
      const raw = (data || []) as Record<string, unknown>[];
      const parsed = raw.map((r) => ({
          mark_id: String(r.mark_id),
          mark_updated_at: String(r.mark_updated_at),
          admin_status: String(r.admin_status),
          question_id: String(r.question_id),
          question_text: String(r.question_text ?? ''),
          options: Array.isArray(r.options) ? (r.options as string[]) : null,
          correct_index:
            r.correct_index != null && Number.isFinite(Number(r.correct_index))
              ? Number(r.correct_index)
              : null,
          explanation: r.explanation != null ? String(r.explanation) : null,
          difficulty: r.difficulty != null ? String(r.difficulty) : null,
          question_type: r.question_type != null ? String(r.question_type) : null,
          topic_tag: r.topic_tag != null ? String(r.topic_tag) : null,
          figure_url: r.figure_url != null ? String(r.figure_url) : null,
          chapter_name: r.chapter_name != null ? String(r.chapter_name) : null,
          subject_name: r.subject_name != null ? String(r.subject_name) : null,
          class_name: r.class_name != null ? String(r.class_name) : null,
          knowledge_base_id: r.knowledge_base_id != null ? String(r.knowledge_base_id) : null,
          knowledge_base_name: r.knowledge_base_name != null ? String(r.knowledge_base_name) : null,
          mark_wrong: !!r.mark_wrong,
          mark_out_of_syllabus: !!r.mark_out_of_syllabus,
          mark_latex_issue: !!r.mark_latex_issue,
          mark_figure_issue: !!r.mark_figure_issue,
          notes: r.notes != null ? String(r.notes) : null,
          reviewer_id: String(r.reviewer_id),
          reviewer_email: r.reviewer_email != null ? String(r.reviewer_email) : null,
          reviewer_name: r.reviewer_name != null ? String(r.reviewer_name) : null,
          reviewer_role: r.reviewer_role != null ? String(r.reviewer_role) : null,
        })) as ReviewerMarkRow[];
      setRows(parsed);
      await syncReviewerDropdown(parsed);
    } finally {
      setLoading(false);
    }
  }, [scope, reviewerFilter, syncReviewerDropdown]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveMark = async (markId: string, status: 'approved' | 'dismissed') => {
    setBusyMarkId(markId);
    try {
      const { error } = await supabase.rpc('admin_resolve_reviewer_mark', {
        p_mark_id: markId,
        p_status: status,
      });
      if (error) {
        alert(error.message);
        return;
      }
      await load();
    } finally {
      setBusyMarkId(null);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Delete this question from the question bank? This cannot be undone.')) return;
    setBusyQuestionId(questionId);
    try {
      const { error } = await supabase.rpc('admin_delete_flagged_question', {
        p_question_id: questionId,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setRows((prev) => prev.filter((r) => r.question_id !== questionId));
    } finally {
      setBusyQuestionId(null);
    }
  };

  const openEdit = (row: ReviewerMarkRow) => {
    setEditRow(row);
    setDraftText(row.question_text);
    setDraftOptions(optionsToLines(row.options));
    setDraftCorrect(
      row.correct_index != null && Number.isFinite(row.correct_index) ? row.correct_index : 0
    );
    setDraftExplanation(row.explanation || '');
  };

  const closeEdit = () => {
    setEditRow(null);
    setSavingEdit(false);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const opts = linesToOptions(draftOptions);
    if (opts.length < 2) {
      alert('Enter at least two options (one per line).');
      return;
    }
    if (draftCorrect < 0 || draftCorrect >= opts.length) {
      alert('Correct option index must match a line (0 = first option).');
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase.rpc('admin_update_question_bank_neet', {
        p_question_id: editRow.question_id,
        p_question_text: draftText,
        p_options: opts,
        p_correct_index: draftCorrect,
        p_explanation: draftExplanation || null,
      });
      if (error) {
        alert(error.message);
        return;
      }
      closeEdit();
      await load();
    } finally {
      setSavingEdit(false);
    }
  };

  const queueSummary = useMemo(() => {
    const open = rows.filter((r) => r.admin_status === 'open').length;
    const resolved = rows.filter((r) => r.admin_status !== 'open').length;
    return { open, resolved, total: rows.length };
  }, [rows]);

  const flagBadges = useMemo(() => {
    return (r: ReviewerMarkRow) => {
      const tags: { key: string; label: string }[] = [];
      if (r.mark_wrong) tags.push({ key: 'w', label: 'Wrong' });
      if (r.mark_out_of_syllabus) tags.push({ key: 'o', label: 'Out of syllabus' });
      if (r.mark_latex_issue) tags.push({ key: 'l', label: 'LaTeX' });
      if (r.mark_figure_issue) tags.push({ key: 'f', label: 'Figure' });
      return tags;
    };
  }, []);

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Reviewer queue</h3>
          <p className="text-[11px] text-zinc-500">
            Every saved question-bank review (flags or not) — verify, approve, edit the question, or delete. Use
            &quot;Include resolved&quot; for history.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'open' | 'all')}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-800"
            >
              <option value="open">Open only</option>
              <option value="all">Include resolved</option>
            </select>
            <select
              value={reviewerFilter}
              onChange={(e) => setReviewerFilter(e.target.value)}
              title="Filter by who filed the review (includes teachers & school admins with review access)"
              className="max-w-[min(100%,280px)] min-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-zinc-800"
            >
              <option value="">All reviewers</option>
              {reviewerOptions.map((o) => {
                const primary = o.reviewer_name || o.reviewer_email || o.reviewer_id.slice(0, 8);
                const suffix =
                  o.reviewer_email && o.reviewer_name && o.reviewer_email !== o.reviewer_name
                    ? ` — ${o.reviewer_email}`
                    : '';
                return (
                  <option key={o.reviewer_id} value={o.reviewer_id}>
                    {primary}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:refresh" />
              Refresh
            </button>
          </div>
          {!loading && rows.length > 0 ? (
            <p className="text-[10px] font-semibold tabular-nums text-zinc-500">
              Showing {queueSummary.total} · Open {queueSummary.open}
              {scope === 'all' ? ` · Resolved ${queueSummary.resolved}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            No reviewer items in this view
          </p>
          {listError ? (
            <div className="mx-auto max-w-md space-y-1">
              <p className="text-xs font-medium leading-relaxed text-rose-700">{listError}</p>
              {/schema cache|not find the function/i.test(listError) ? (
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  This app is calling{' '}
                  <code className="rounded bg-zinc-100 px-1">{new URL(getSupabaseUrl()).host}</code>. Migrations must
                  be applied on that same Supabase project, then refresh (or wait a minute for API schema reload).
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mx-auto max-w-md space-y-2 text-left text-[10px] leading-relaxed text-zinc-600">
            <p>
              <span className="font-semibold text-zinc-800">If you expected rows here:</span> apply the latest
              Supabase migrations in <code className="rounded bg-zinc-100 px-1">Kiwiteach-Quiz/supabase/migrations</code>{' '}
              (including <code className="rounded bg-zinc-100 px-1">20260422240000</code> for RPC argument order
              and <code className="rounded bg-zinc-100 px-1">20260423183000</code> if{' '}
              <code className="rounded bg-zinc-100 px-1">admin_status</code> is missing), then refresh. On Vercel,
              confirm <code className="rounded bg-zinc-100 px-1">VITE_SUPABASE_URL</code> matches that project.
            </p>
            <p>
              Try <span className="font-semibold">Include resolved</span> if marks were already approved or dismissed.
              Clear the reviewer filter if it hides everything.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const tags = flagBadges(row);
            const disabled =
              busyMarkId === row.mark_id ||
              busyQuestionId === row.question_id ||
              row.admin_status !== 'open';
            return (
              <div
                key={row.mark_id}
                className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div
                      className="math-content line-clamp-3 text-sm font-semibold text-zinc-900"
                      dangerouslySetInnerHTML={{ __html: parsePseudoLatexAndMath(row.question_text) }}
                    />
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      {row.subject_name || 'Subject'} · {row.chapter_name || 'Chapter'} ·{' '}
                      {row.class_name || 'Class'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      row.admin_status === 'open'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : row.admin_status === 'approved'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                  >
                    {row.admin_status}
                  </span>
                </div>

                <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50/90 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700">Reviewer</p>
                  <p className="mt-0.5 text-sm font-bold text-indigo-950">
                    {row.reviewer_name || row.reviewer_email || 'Unknown reviewer'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-indigo-900/80">
                    {row.reviewer_email ? <span>{row.reviewer_email}</span> : null}
                    {row.reviewer_email && row.reviewer_role ? ' · ' : null}
                    {row.reviewer_role ? <span className="capitalize">{row.reviewer_role}</span> : null}
                    {' · '}
                    <span className="tabular-nums">Updated {new Date(row.mark_updated_at).toLocaleString()}</span>
                  </p>
                </div>

                {tags.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span
                        key={t.key}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800"
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-2">
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
                      No flags / notes on this save
                    </span>
                  </div>
                )}

                <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-zinc-600">
                  {row.knowledge_base_name && (
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                      KB: {row.knowledge_base_name}
                    </span>
                  )}
                </div>

                {row.notes && (
                  <p className="mb-3 rounded-md border border-indigo-100 bg-indigo-50/80 px-2.5 py-1.5 text-[11px] text-indigo-950">
                    <span className="font-semibold text-indigo-800">Note: </span>
                    {row.notes}
                  </p>
                )}

                {row.figure_url ? (
                  <div className="mb-3 flex justify-center rounded border border-zinc-100 bg-zinc-50 p-2">
                    <img src={row.figure_url} alt="" className="max-h-36 max-w-full object-contain" />
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  {row.admin_status === 'open' && (
                    <>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void resolveMark(row.mark_id, 'approved')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <iconify-icon icon="mdi:check-circle-outline" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void resolveMark(row.mark_id, 'dismissed')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        <iconify-icon icon="mdi:close-circle-outline" />
                        Dismiss
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busyQuestionId === row.question_id}
                    onClick={() => openEdit(row)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    <iconify-icon icon="mdi:pencil-outline" />
                    Edit question
                  </button>
                  <button
                    type="button"
                    disabled={busyQuestionId === row.question_id || busyMarkId === row.mark_id}
                    onClick={() => void handleDeleteQuestion(row.question_id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h4 className="text-sm font-semibold text-zinc-900">Edit question</h4>
            <p className="mt-0.5 text-[10px] text-zinc-500">Updates the hub question; reviewer mark is unchanged until you approve or dismiss.</p>

            <label className="mt-3 block text-[10px] font-semibold text-zinc-600">
              Stem
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
              />
            </label>

            <label className="mt-2 block text-[10px] font-semibold text-zinc-600">
              Options (one per line)
              <textarea
                value={draftOptions}
                onChange={(e) => setDraftOptions(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-xs"
              />
            </label>

            <label className="mt-2 block text-[10px] font-semibold text-zinc-600">
              Correct option index (0 = first line)
              <input
                type="number"
                min={0}
                value={draftCorrect}
                onChange={(e) => setDraftCorrect(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
              />
            </label>

            <label className="mt-2 block text-[10px] font-semibold text-zinc-600">
              Explanation
              <textarea
                value={draftExplanation}
                onChange={(e) => setDraftExplanation(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewerQueuePanel;
