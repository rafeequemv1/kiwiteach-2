import '../../types';
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';

interface FlagRow {
  flag_id: string;
  created_at: string;
  question_id: string;
  question_text: string;
  chapter_name: string | null;
  subject_name: string | null;
  class_name: string | null;
  topic_tag: string | null;
  knowledge_base_name: string | null;
  flagged_by_email: string | null;
  flagged_by_name: string | null;
  flagged_by_role: string | null;
  exam_tag: string;
}

const OutOfSyllabusFlagsPanel: React.FC = () => {
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [ignoringQuestionId, setIgnoringQuestionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_out_of_syllabus_flags');
      if (error) {
        alert(error.message);
        return;
      }
      setRows((data as FlagRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Delete this question from question bank? This cannot be undone.')) return;
    setDeletingQuestionId(questionId);
    try {
      const { error } = await supabase.rpc('admin_delete_flagged_question', {
        p_question_id: questionId,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setRows((prev) => prev.filter((row) => row.question_id !== questionId));
    } finally {
      setDeletingQuestionId(null);
    }
  };

  const handleIgnoreQuestion = async (questionId: string) => {
    if (!confirm('Ignore this flag and keep the question in database?')) return;
    setIgnoringQuestionId(questionId);
    try {
      const { error } = await supabase.rpc('admin_ignore_flagged_question', {
        p_question_id: questionId,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setRows((prev) => prev.filter((row) => row.question_id !== questionId));
    } finally {
      setIgnoringQuestionId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Out-of-syllabus flags</h3>
          <p className="text-[11px] text-zinc-500">NEET flagged questions with reporter details</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
        >
          <iconify-icon icon="mdi:refresh" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Loading flags...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          No flagged questions found
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.flag_id} className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{row.question_text}</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {row.subject_name || 'Subject'} • {row.chapter_name || 'Chapter'} • {row.class_name || 'Class'}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
                  {row.exam_tag || 'neet'}
                </span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
                <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                  Flagged by: {row.flagged_by_name || row.flagged_by_email || 'Unknown'}
                </span>
                <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                  Role: {row.flagged_by_role || 'unknown'}
                </span>
                {row.knowledge_base_name && (
                  <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                    KB: {row.knowledge_base_name}
                  </span>
                )}
                {row.topic_tag && (
                  <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                    Topic: {row.topic_tag}
                  </span>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleIgnoreQuestion(row.question_id)}
                  disabled={ignoringQuestionId === row.question_id || deletingQuestionId === row.question_id}
                  className="mr-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                >
                  <iconify-icon icon="mdi:eye-off-outline" />
                  Ignore
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteQuestion(row.question_id)}
                  disabled={deletingQuestionId === row.question_id || ignoringQuestionId === row.question_id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  <iconify-icon icon="mdi:trash-can-outline" />
                  Delete question
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OutOfSyllabusFlagsPanel;
