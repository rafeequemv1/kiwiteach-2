
import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { SelectedChapter, TypeDistribution } from '../types';
import type { ExamPaperProfileRow } from '../../Admin/ExamPaper/types';
import {
  expandExamPaperProfileToSelectedChapters,
  profileToGlobalTypes,
  type ChapterRowForProfileExpand,
} from '../services/expandExamPaperProfile';

export interface NewTestPickerConfirmPayload {
  chapters: SelectedChapter[];
  knowledgeBaseId: string;
  initialTopic?: string;
  initialTotalTarget?: number;
  initialDistributionMode?: 'count' | 'percent';
  initialGlobalTypes?: TypeDistribution;
  initialGlobalFigureCount?: number;
}

interface KBItem {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
}

interface SubjectRow {
  id: string;
  name: string;
  class_id: string;
}

interface ChapterRow {
  id: string;
  name: string;
  chapter_number: number | null;
  subject_id: string;
  subject_name?: string | null;
  class_name?: string | null;
}

interface NewTestChapterPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: NewTestPickerConfirmPayload) => void;
  title?: string;
}

const toSelectedChapters = (rows: ChapterRow[]): SelectedChapter[] =>
  rows.map((ch) => ({
    id: ch.id,
    name: ch.name,
    subjectName: ch.subject_name || '',
    className: ch.class_name || '',
    count: 10,
    figureCount: 0,
    difficulty: 'Global',
    source: 'db',
    selectionMode: 'count',
    visualMode: 'image',
  }));

const NewTestChapterPickerModal: React.FC<NewTestChapterPickerModalProps> = ({
  open,
  onClose,
  onConfirm,
  title = 'New test — chapters & templates',
}) => {
  const [kbs, setKbs] = useState<KBItem[]>([]);
  const [selectedKb, setSelectedKb] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [subjectsUnion, setSubjectsUnion] = useState<SubjectRow[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [allKbChapters, setAllKbChapters] = useState<ChapterRowForProfileExpand[]>([]);
  const [presets, setPresets] = useState<ExamPaperProfileRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);

  const toggleInSet = useCallback((set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from('knowledge_bases').select('id, name').order('name');
        if (cancelled) return;
        setKbs(data || []);
        if (data?.length) {
          setSelectedKb((prev) => (prev && data.some((k) => k.id === prev) ? prev : data[0].id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedKb) return;
    supabase.from('kb_classes').select('id, name').eq('kb_id', selectedKb).order('name').then(({ data }) => {
      setClasses(data || []);
      setSelectedClassIds(new Set());
      setSelectedSubjectIds(new Set());
      setSubjectsUnion([]);
      setChapters([]);
      setSelectedIds(new Set());
      setSearch('');
    });
  }, [open, selectedKb]);

  useEffect(() => {
    if (!open || !selectedKb) return;
    setPresetsLoading(true);
    supabase
      .from('exam_paper_profiles')
      .select('*')
      .eq('knowledge_base_id', selectedKb)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setPresets([]);
        } else {
          setPresets((data || []) as ExamPaperProfileRow[]);
        }
        setPresetsLoading(false);
      });
  }, [open, selectedKb]);

  useEffect(() => {
    if (!open || !selectedKb) return;
    supabase
      .from('chapters')
      .select('id, name, chapter_number, subject_id, subject_name, class_name, biology_branch')
      .eq('kb_id', selectedKb)
      .order('chapter_number', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setAllKbChapters([]);
          return;
        }
        setAllKbChapters((data || []) as ChapterRowForProfileExpand[]);
      });
  }, [open, selectedKb]);

  useEffect(() => {
    if (!open || selectedClassIds.size === 0) {
      setSubjectsUnion([]);
      setSelectedSubjectIds(new Set());
      setChapters([]);
      setSelectedIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        Array.from(selectedClassIds).map((cid) =>
          supabase.from('subjects').select('id, name, class_id').eq('class_id', cid).order('name')
        )
      );
      if (cancelled) return;
      const map = new Map<string, SubjectRow>();
      results.forEach(({ data }) => {
        (data || []).forEach((s: SubjectRow) => {
          if (!map.has(s.id)) map.set(s.id, s);
        });
      });
      const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setSubjectsUnion(list);
      setSelectedSubjectIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (map.has(id)) next.add(id);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedClassIds]);

  useEffect(() => {
    if (!open || !selectedKb || selectedSubjectIds.size === 0) {
      setChapters([]);
      return;
    }
    supabase
      .from('chapters')
      .select('id, name, chapter_number, subject_id, subject_name, class_name')
      .eq('kb_id', selectedKb)
      .in('subject_id', Array.from(selectedSubjectIds))
      .order('chapter_number', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setChapters([]);
          return;
        }
        setChapters((data || []) as ChapterRow[]);
      });
  }, [open, selectedKb, selectedSubjectIds]);

  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((c) => c.name.toLowerCase().includes(q));
  }, [chapters, search]);

  const toggleChapter = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClass = (id: string, checked: boolean) => {
    setSelectedClassIds((prev) => toggleInSet(prev, id, checked));
  };

  const toggleSubject = (id: string, checked: boolean) => {
    setSelectedSubjectIds((prev) => toggleInSet(prev, id, checked));
  };

  const selectAllClasses = () => {
    setSelectedClassIds(new Set(classes.map((c) => c.id)));
  };

  const clearClasses = () => {
    setSelectedClassIds(new Set());
  };

  const selectAllSubjects = () => {
    setSelectedSubjectIds(new Set(subjectsUnion.map((s) => s.id)));
  };

  const clearSubjects = () => {
    setSelectedSubjectIds(new Set());
  };

  const handleConfirmManual = () => {
    const picked = chapters.filter((c) => selectedIds.has(c.id));
    if (picked.length === 0) return;
    onConfirm({
      chapters: toSelectedChapters(picked),
      knowledgeBaseId: selectedKb,
    });
    setSelectedIds(new Set());
    setSearch('');
  };

  const handleApplyPreset = (profile: ExamPaperProfileRow) => {
    const expanded = expandExamPaperProfileToSelectedChapters(profile, allKbChapters);
    if (expanded.length === 0) {
      alert(
        'This preset does not match any chapters in this knowledge base (check subject mix keys vs chapter subjects / biology_branch).'
      );
      return;
    }
    const gt = profileToGlobalTypes(profile);
    onConfirm({
      chapters: expanded,
      knowledgeBaseId: selectedKb,
      initialTopic: profile.name,
      initialTotalTarget: profile.total_questions,
      initialDistributionMode: 'count',
      initialGlobalTypes: gt,
      initialGlobalFigureCount: profile.figure_question_count ?? 0,
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-test-chapter-picker-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,800px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/90 px-5 py-4">
          <h2 id="new-test-chapter-picker-title" className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            Select one or more classes and subjects, then tick chapters — or apply an admin <strong>exam paper</strong>{' '}
            preset to build the blueprint automatically.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 border-b border-zinc-100 px-5 py-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Knowledge base
            </label>
            <select
              value={selectedKb}
              onChange={(e) => setSelectedKb(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500"
            >
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Classes</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllClasses}
                    disabled={classes.length === 0}
                    className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={clearClasses}
                    disabled={selectedClassIds.size === 0}
                    className="text-[11px] font-medium text-zinc-500 hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {classes.length === 0 ? (
                <p className="text-[12px] text-zinc-400">No classes in this knowledge base.</p>
              ) : (
                <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 bg-white p-2">
                  {classes.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={selectedClassIds.has(c.id)}
                          onChange={(e) => toggleClass(c.id, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
                        />
                        {c.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Subjects</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllSubjects}
                    disabled={subjectsUnion.length === 0}
                    className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={clearSubjects}
                    disabled={selectedSubjectIds.size === 0}
                    className="text-[11px] font-medium text-zinc-500 hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {selectedClassIds.size === 0 ? (
                <p className="text-[12px] text-zinc-400">Select at least one class to list subjects.</p>
              ) : subjectsUnion.length === 0 ? (
                <p className="text-[12px] text-zinc-400">No subjects for the selected classes.</p>
              ) : (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 bg-white p-2">
                  {subjectsUnion.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={selectedSubjectIds.has(s.id)}
                          onChange={(e) => toggleSubject(s.id, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Exam paper presets
              </label>
              {presetsLoading ? (
                <p className="text-[12px] text-zinc-400">Loading presets…</p>
              ) : presets.length === 0 ? (
                <p className="text-[12px] text-zinc-400">
                  No exam paper profiles for this KB yet. Create them under Admin → Exam papers.
                </p>
              ) : (
                <ul className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                  {presets.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-100/80 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">{p.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {p.total_questions} Q · {p.subject_mode === 'percent' ? '%' : '#'} subject mix
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        Use template
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-2 px-5 py-3">
            <input
              type="search"
              placeholder="Search chapters…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={selectedSubjectIds.size === 0}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="min-h-[200px] px-5 pb-4">
            {loading ? (
              <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
            ) : selectedSubjectIds.size === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">Select subjects to list chapters.</p>
            ) : filteredChapters.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No chapters for this filter.</p>
            ) : (
              <ul className="space-y-1">
                {filteredChapters.map((ch) => {
                  const checked = selectedIds.has(ch.id);
                  return (
                    <li key={ch.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2 transition-colors hover:border-zinc-200 hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChapter(ch.id)}
                          className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-zinc-800">
                          <span className="text-zinc-400">{ch.chapter_number != null ? `${ch.chapter_number}. ` : ''}</span>
                          {ch.name}
                          {ch.class_name ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                              {ch.class_name}
                              {ch.subject_name ? ` · ${ch.subject_name}` : ''}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/80 px-5 py-3">
          <span className="text-[12px] text-zinc-500">{selectedIds.size} chapter(s) selected</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || !selectedKb}
              onClick={handleConfirmManual}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Continue with selected chapters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewTestChapterPickerModal;
