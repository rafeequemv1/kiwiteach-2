import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { ExamPaperProfileRow, ExamType, MixMode, StyleKey } from './types';
import { STYLE_KEYS, STYLE_LABELS } from './types';

function sumValues(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function emptyStyleMix(): Record<StyleKey, number> {
  return { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
}

interface ChapterRow {
  id: string;
  name: string;
  subject_name: string | null;
  chapter_number: number | null;
}

interface ExamPaperFormModalProps {
  open: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  userId: string;
  initial: ExamPaperProfileRow | null;
  onSaved: () => void;
}

const ExamPaperFormModal: React.FC<ExamPaperFormModalProps> = ({
  open,
  onClose,
  knowledgeBaseId,
  knowledgeBaseName,
  userId,
  initial,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [examType, setExamType] = useState<ExamType>('mcq');
  const [totalQuestions, setTotalQuestions] = useState(90);
  const [figureCount, setFigureCount] = useState(0);
  const [styleMode, setStyleMode] = useState<MixMode>('percent');
  const [styleMix, setStyleMix] = useState<Record<StyleKey, number>>(emptyStyleMix());
  const [subjectMode, setSubjectMode] = useState<MixMode>('percent');
  const [subjectMix, setSubjectMix] = useState<Record<string, number>>({});
  const [chapterMode, setChapterMode] = useState<MixMode>('percent');
  const [chapterMix, setChapterMix] = useState<Record<string, number>>({});
  const [subjects, setSubjects] = useState<{ key: string; label: string }[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterPicker, setChapterPicker] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !knowledgeBaseId) return;
    const loadMeta = async () => {
      const { data: chapRows } = await supabase
        .from('chapters')
        .select('id, name, subject_name, subject_id, chapter_number')
        .eq('kb_id', knowledgeBaseId);
      const list = (chapRows || []) as {
        id: string;
        name: string;
        subject_name: string | null;
        subject_id: string | null;
        chapter_number: number | null;
      }[];
      setChapters(
        list.map((c) => ({
          id: c.id,
          name: c.name,
          subject_name: c.subject_name,
          chapter_number: c.chapter_number,
        }))
      );
      const subMap = new Map<string, string>();
      list.forEach((c) => {
        const label = c.subject_name?.trim() || 'Subject';
        const key = c.subject_id || label;
        if (!subMap.has(key)) subMap.set(key, label);
      });
      setSubjects(Array.from(subMap.entries()).map(([key, label]) => ({ key, label })));
    };
    void loadMeta();
  }, [open, knowledgeBaseId]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setDescription(initial.description || '');
      setExamType(initial.exam_type);
      setTotalQuestions(initial.total_questions);
      setFigureCount(initial.figure_question_count);
      setStyleMode(initial.style_mode);
      setSubjectMode(initial.subject_mode);
      setChapterMode(initial.chapter_mode);
      const sm = { ...emptyStyleMix() };
      STYLE_KEYS.forEach((k) => {
        const v = initial.style_mix?.[k];
        sm[k] = typeof v === 'number' ? v : 0;
      });
      setStyleMix(sm);
      setSubjectMix({ ...(initial.subject_mix || {}) });
      setChapterMix({ ...(initial.chapter_mix || {}) });
    } else {
      setName('');
      setDescription('');
      setExamType('mcq');
      setTotalQuestions(90);
      setFigureCount(0);
      setStyleMode('percent');
      setStyleMix({ mcq: 70, reasoning: 10, matching: 10, statements: 10 });
      setSubjectMode('percent');
      setSubjectMix({});
      setChapterMode('percent');
      setChapterMix({});
    }
    setChapterPicker('');
  }, [open, initial]);

  const styleSum = useMemo(() => sumValues(styleMix as Record<string, number>), [styleMix]);
  const subjectSum = useMemo(() => sumValues(subjectMix), [subjectMix]);
  const chapterSum = useMemo(() => sumValues(chapterMix), [chapterMix]);

  const setSubjectValue = (key: string, val: number) => {
    setSubjectMix((prev) => ({ ...prev, [key]: val }));
  };

  const distributeSubjectsEvenly = () => {
    if (subjects.length === 0) return;
    if (subjectMode === 'percent') {
      const each = Math.floor(100 / subjects.length);
      const rest = 100 - each * subjects.length;
      const next: Record<string, number> = {};
      subjects.forEach((s, i) => {
        next[s.key] = each + (i < rest ? 1 : 0);
      });
      setSubjectMix(next);
    } else {
      const each = Math.floor(totalQuestions / subjects.length);
      const rest = totalQuestions - each * subjects.length;
      const next: Record<string, number> = {};
      subjects.forEach((s, i) => {
        next[s.key] = each + (i < rest ? 1 : 0);
      });
      setSubjectMix(next);
    }
  };

  const addChapterAllocation = () => {
    if (!chapterPicker) return;
    setChapterMix((prev) => ({ ...prev, [chapterPicker]: prev[chapterPicker] ?? 0 }));
    setChapterPicker('');
  };

  const setChapterValue = (id: string, val: number) => {
    setChapterMix((prev) => ({ ...prev, [id]: val }));
  };

  const removeChapter = (id: string) => {
    setChapterMix((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const chapterLabel = (id: string) => {
    const c = chapters.find((x) => x.id === id);
    if (!c) return id.slice(0, 8);
    const num = c.chapter_number != null ? `Ch ${c.chapter_number}` : '';
    return [c.subject_name, num, c.name].filter(Boolean).join(' · ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }
    if (figureCount > totalQuestions) {
      alert('Figure questions cannot exceed total questions.');
      return;
    }
    if (styleMode === 'percent' && Math.abs(styleSum - 100) > 0.01 && styleSum > 0) {
      if (!confirm(`Style mix sums to ${styleSum}% (expected ~100%). Save anyway?`)) return;
    }
    if (styleMode === 'count' && styleSum > totalQuestions) {
      if (!confirm(`Style counts sum to ${styleSum} but total is ${totalQuestions}. Save anyway?`)) return;
    }
    if (subjectMode === 'percent' && subjectSum > 0 && Math.abs(subjectSum - 100) > 0.01) {
      if (!confirm(`Subject mix sums to ${subjectSum}% (expected ~100%). Save anyway?`)) return;
    }
    if (subjectMode === 'count' && subjectSum > totalQuestions) {
      if (!confirm(`Subject counts sum to ${subjectSum} but total is ${totalQuestions}. Save anyway?`)) return;
    }

    const payload = {
      knowledge_base_id: knowledgeBaseId,
      name: name.trim(),
      description: description.trim() || null,
      exam_type: examType,
      total_questions: totalQuestions,
      figure_question_count: figureCount,
      style_mode: styleMode,
      style_mix: { ...styleMix },
      subject_mode: subjectMode,
      subject_mix: { ...subjectMix },
      chapter_mode: chapterMode,
      chapter_mix: { ...chapterMix },
      metadata: {},
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    setSaving(true);
    try {
      if (initial?.id) {
        const { error } = await supabase.from('exam_paper_profiles').update(payload).eq('id', initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exam_paper_profiles').insert({
          ...payload,
          created_by: userId,
        });
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{initial ? 'Edit exam paper' : 'New exam paper'}</h3>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Knowledge base: <span className="font-medium text-zinc-700">{knowledgeBaseName}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <iconify-icon icon="mdi:close" width="22" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="e.g. NEET Full Syllabus — Pattern A"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Optional notes for authors"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Exam type</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as ExamType)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              >
                <option value="mcq">MCQ</option>
                <option value="descriptive">Descriptive (future)</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Total questions</label>
              <input
                type="number"
                min={1}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Figure questions</label>
              <input
                type="number"
                min={0}
                value={figureCount}
                onChange={(e) => setFigureCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
              <p className="mt-1 text-[11px] text-zinc-500">How many items should include figures/diagrams.</p>
            </div>
          </div>

          <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-800">Question styles</h4>
              <select
                value={styleMode}
                onChange={(e) => setStyleMode(e.target.value as MixMode)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium"
              >
                <option value="percent">Percentages (sum ~100%)</option>
                <option value="count">Counts (per paper)</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Sum: <span className="font-mono font-semibold text-zinc-800">{styleSum}</span>
              {styleMode === 'percent' ? '%' : ' questions'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STYLE_KEYS.map((k) => (
                <div key={k}>
                  <label className="text-[10px] font-semibold uppercase text-zinc-500">{STYLE_LABELS[k]}</label>
                  <input
                    type="number"
                    min={0}
                    value={styleMix[k]}
                    onChange={(e) =>
                      setStyleMix((s) => ({ ...s, [k]: Math.max(0, parseFloat(e.target.value) || 0) }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-800">Subjects</h4>
              <div className="flex flex-wrap gap-2">
                <select
                  value={subjectMode}
                  onChange={(e) => setSubjectMode(e.target.value as MixMode)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium"
                >
                  <option value="percent">Percentages</option>
                  <option value="count">Counts</option>
                </select>
                <button
                  type="button"
                  onClick={distributeSubjectsEvenly}
                  disabled={subjects.length === 0}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Distribute evenly
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              From chapters in this KB. Sum:{' '}
              <span className="font-mono font-semibold text-zinc-800">{subjectSum}</span>
              {subjectMode === 'percent' ? '%' : ' questions'}
            </p>
            {subjects.length === 0 ? (
              <p className="mt-3 text-[12px] text-amber-700">No subjects found — add chapters to this knowledge base first.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {subjects.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-700">{s.label}</span>
                    <input
                      type="number"
                      min={0}
                      value={subjectMix[s.key] ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        setSubjectValue(s.key, Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-800">Chapters (optional)</h4>
              <select
                value={chapterMode}
                onChange={(e) => setChapterMode(e.target.value as MixMode)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium"
              >
                <option value="percent">Percentages</option>
                <option value="count">Counts</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Fine-grain allocation. Sum:{' '}
              <span className="font-mono font-semibold text-zinc-800">{chapterSum}</span>
              {chapterMode === 'percent' ? '%' : ' questions'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={chapterPicker}
                onChange={(e) => setChapterPicker(e.target.value)}
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[12px]"
              >
                <option value="">Select chapter to add…</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.subject_name, c.chapter_number != null ? `Ch ${c.chapter_number}` : null, c.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addChapterAllocation}
                disabled={!chapterPicker}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {Object.keys(chapterMix).length > 0 && (
              <ul className="mt-3 space-y-2">
                {Object.entries(chapterMix).map(([id, val]) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-700">{chapterLabel(id)}</span>
                    <input
                      type="number"
                      min={0}
                      value={val}
                      onChange={(e) => setChapterValue(id, Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-20 rounded border border-zinc-200 px-2 py-0.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeChapter(id)}
                      className="text-rose-600 hover:text-rose-800"
                      title="Remove"
                    >
                      <iconify-icon icon="mdi:trash-can-outline" width="18" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExamPaperFormModal;
