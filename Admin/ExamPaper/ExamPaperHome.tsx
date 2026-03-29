import '../../types';
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';
import ExamPaperFormModal from './ExamPaperFormModal';
import type { ExamPaperProfileRow } from './types';
import { BIO_BRANCH_SUFFIX, GLOBAL_BIO_PREFIX, STYLE_KEYS, STYLE_LABELS } from './types';

interface KbOption {
  id: string;
  name: string;
}

function sumMix(m: Record<string, number> | null | undefined): number {
  if (!m || typeof m !== 'object') return 0;
  return Object.values(m).reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0);
}

interface ExamPaperHomeProps {
  userId: string;
}

const ExamPaperHome: React.FC<ExamPaperHomeProps> = ({ userId }) => {
  const [kbList, setKbList] = useState<KbOption[]>([]);
  const [kbId, setKbId] = useState<string>('');
  const [rows, setRows] = useState<ExamPaperProfileRow[]>([]);
  const [loadingKb, setLoadingKb] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExamPaperProfileRow | null>(null);

  const loadKbs = useCallback(async () => {
    setLoadingKb(true);
    try {
      const { data, error } = await supabase.from('knowledge_bases').select('id, name').order('name', { ascending: true });
      if (error) throw error;
      const list = (data || []) as KbOption[];
      setKbList(list);
      setKbId((prev) => {
        if (prev && list.some((k) => k.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingKb(false);
    }
  }, []);

  const loadProfiles = useCallback(async (id: string) => {
    if (!id) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from('exam_paper_profiles')
        .select('*')
        .eq('knowledge_base_id', id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as ExamPaperProfileRow[]);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to load exam papers');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void loadKbs();
  }, [loadKbs]);

  useEffect(() => {
    void loadProfiles(kbId);
  }, [kbId, loadProfiles]);

  const kbName = kbList.find((k) => k.id === kbId)?.name || '';

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: ExamPaperProfileRow) => {
    setEditing(row);
    setModalOpen(true);
  };

  const handleDelete = async (row: ExamPaperProfileRow) => {
    if (!confirm(`Delete exam paper blueprint "${row.name}"?`)) return;
    try {
      const { error } = await supabase.from('exam_paper_profiles').delete().eq('id', row.id);
      if (error) throw error;
      await loadProfiles(kbId);
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  };

  const summarizeStyles = (row: ExamPaperProfileRow) => {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    const perSub = meta?.use_per_subject_style_mix === true;
    const parts: string[] = [];
    if (perSub) parts.push('per-subject');
    STYLE_KEYS.forEach((k) => {
      const v = row.style_mix?.[k];
      if (v != null && v > 0) parts.push(`${STYLE_LABELS[k]} ${v}${row.style_mode === 'percent' ? '%' : ''}`);
    });
    return parts.length ? parts.join(' · ') : '—';
  };

  const summarizeSubjects = (row: ExamPaperProfileRow) => {
    const keys = Object.keys(row.subject_mix || {});
    const s = sumMix(row.subject_mix);
    if (keys.length === 0) return '—';
    const bioSplit = keys.some((k) => k.includes(BIO_BRANCH_SUFFIX) || k.startsWith(GLOBAL_BIO_PREFIX));
    const bioNote = bioSplit ? 'Bio botany/zoology · ' : '';
    return `${bioNote}${keys.length} row(s) · sum ${s}${row.subject_mode === 'percent' ? '%' : ' q'}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Knowledge base</label>
          <select
            value={kbId}
            onChange={(e) => setKbId(e.target.value)}
            disabled={loadingKb || kbList.length === 0}
            className="mt-1.5 w-full max-w-md rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-400 sm:w-auto sm:min-w-[280px]"
          >
            {kbList.length === 0 ? <option value="">No knowledge bases</option> : null}
            {kbList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-zinc-500">
            Blueprints are stored per knowledge base. Use them later to assemble full-syllabus papers with target style and subject mix.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!kbId}
          className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-40"
        >
          New exam paper
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loadingRows ? (
          <p className="p-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : !kbId ? (
          <p className="p-8 text-center text-sm text-zinc-500">Select a knowledge base.</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">No exam paper blueprints for this knowledge base yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Figures</th>
                  <th className="px-4 py-3">Styles</th>
                  <th className="px-4 py-3">Subjects</th>
                  <th className="px-4 py-3 w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{row.name}</div>
                      {row.description ? <div className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">{row.description}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-medium uppercase text-[11px] text-zinc-600">{row.exam_type}</td>
                    <td className="px-4 py-3 font-mono text-zinc-800">{row.total_questions}</td>
                    <td className="px-4 py-3 font-mono text-zinc-800">{row.figure_question_count}</td>
                    <td className="max-w-[220px] px-4 py-3 text-[12px] text-zinc-600">{summarizeStyles(row)}</td>
                    <td className="max-w-[180px] px-4 py-3 text-[12px] text-zinc-600">{summarizeSubjects(row)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100"
                          title="Edit"
                        >
                          <iconify-icon icon="mdi:pencil" width="18" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          className="rounded-lg border border-zinc-200 p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete"
                        >
                          <iconify-icon icon="mdi:trash-can-outline" width="18" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && kbId ? (
        <ExamPaperFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          knowledgeBaseId={kbId}
          knowledgeBaseName={kbName}
          userId={userId}
          initial={editing}
          onSaved={() => void loadProfiles(kbId)}
        />
      ) : null}
    </div>
  );
};

export default ExamPaperHome;
