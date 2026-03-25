
import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { SelectedChapter } from '../types';

interface KBItem {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
}

interface SubjectItem {
  id: string;
  name: string;
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
  onConfirm: (chapters: SelectedChapter[], knowledgeBaseId: string) => void;
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
  title = 'Select chapters for this test',
}) => {
  const [kbs, setKbs] = useState<KBItem[]>([]);
  const [selectedKb, setSelectedKb] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

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
      setSelectedClass('');
      setSelectedSubject('');
      setChapters([]);
      setSelectedIds(new Set());
    });
  }, [open, selectedKb]);

  useEffect(() => {
    if (!open || !selectedClass) {
      setSubjects([]);
      setSelectedSubject('');
      setChapters([]);
      return;
    }
    supabase.from('subjects').select('id, name').eq('class_id', selectedClass).order('name').then(({ data }) => {
      setSubjects(data || []);
      setSelectedSubject('');
      setChapters([]);
      setSelectedIds(new Set());
    });
  }, [open, selectedClass]);

  useEffect(() => {
    if (!open || !selectedSubject) {
      setChapters([]);
      return;
    }
    supabase
      .from('chapters')
      .select('id, name, chapter_number, subject_id, subject_name, class_name')
      .eq('subject_id', selectedSubject)
      .order('chapter_number', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setChapters([]);
          return;
        }
        setChapters((data || []) as ChapterRow[]);
      });
  }, [open, selectedSubject]);

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

  const handleConfirm = () => {
    const picked = chapters.filter((c) => selectedIds.has(c.id));
    if (picked.length === 0) return;
    onConfirm(toSelectedChapters(picked), selectedKb);
    setSelectedIds(new Set());
    setSearch('');
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
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/90 px-5 py-4">
          <h2 id="new-test-chapter-picker-title" className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">Choose a knowledge base, class, and subject, then pick one or more chapters.</p>
        </div>

        <div className="shrink-0 space-y-2 border-b border-zinc-100 px-5 py-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Knowledge base</label>
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Class</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500"
              >
                <option value="">Select class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Subject</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={!selectedClass}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="">Select subject…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <input
            type="search"
            placeholder="Search chapters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!selectedSubject}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-zinc-50"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
          ) : !selectedSubject ? (
            <p className="py-8 text-center text-sm text-zinc-400">Select class and subject to list chapters.</p>
          ) : filteredChapters.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No chapters match.</p>
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
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/80 px-5 py-3">
          <span className="text-[12px] text-zinc-500">{selectedIds.size} selected</span>
          <div className="flex gap-2">
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
              onClick={handleConfirm}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Continue to test creator
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewTestChapterPickerModal;
