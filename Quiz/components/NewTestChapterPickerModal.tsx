
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
import { isBiologySubjectName, paperChapterSubjectLine } from '../utils/paperSubjectLabel';

/** Matches Knowledge Base “split biology” rules; excludes Biochemistry. */
function isLegacyBiologySubjectName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n === 'botany' || n === 'zoology') return false;
  if (['bio', 'neet biology'].includes(n)) return true;
  return isBiologySubjectName(name) && !n.includes('biochemistry');
}

const BIO_SPLIT_PREFIX = 'bio-split:';

function parseBioSplitSubjectId(
  id: string
): { baseSubjectId: string; branch: 'botany' | 'zoology' } | null {
  if (!id.startsWith(BIO_SPLIT_PREFIX)) return null;
  const rest = id.slice(BIO_SPLIT_PREFIX.length);
  const i = rest.lastIndexOf(':');
  if (i <= 0) return null;
  const base = rest.slice(0, i);
  const br = rest.slice(i + 1).toLowerCase();
  if (br !== 'botany' && br !== 'zoology') return null;
  if (!base) return null;
  return { baseSubjectId: base, branch: br };
}

function syntheticBioSplitSubjectId(baseSubjectId: string, branch: 'botany' | 'zoology'): string {
  return `${BIO_SPLIT_PREFIX}${baseSubjectId}:${branch}`;
}

/** Replace combined “Biology” with Botany + Zoology when KB has no separate B/Z subjects yet. */
function expandSubjectsForNewTestPicker(rows: SubjectRow[]): SubjectRow[] {
  const lower = (s: SubjectRow) => s.name.trim().toLowerCase();
  const hasNamed = (n: string) => rows.some((r) => lower(r) === n);
  const hasBot = hasNamed('botany');
  const hasZoo = hasNamed('zoology');

  const out: SubjectRow[] = [];
  for (const s of rows) {
    if (!isLegacyBiologySubjectName(s.name)) {
      out.push(s);
      continue;
    }
    if (hasBot && hasZoo) continue;
    if (hasBot && !hasZoo) {
      out.push({
        id: syntheticBioSplitSubjectId(s.id, 'zoology'),
        name: 'Zoology',
        class_id: s.class_id,
      });
      continue;
    }
    if (!hasBot && hasZoo) {
      out.push({
        id: syntheticBioSplitSubjectId(s.id, 'botany'),
        name: 'Botany',
        class_id: s.class_id,
      });
      continue;
    }
    out.push({
      id: syntheticBioSplitSubjectId(s.id, 'botany'),
      name: 'Botany',
      class_id: s.class_id,
    });
    out.push({
      id: syntheticBioSplitSubjectId(s.id, 'zoology'),
      name: 'Zoology',
      class_id: s.class_id,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function baseSubjectIdsFromPickerRows(rows: SubjectRow[]): Set<string> {
  const set = new Set<string>();
  for (const s of rows) {
    const p = parseBioSplitSubjectId(s.id);
    set.add(p ? p.baseSubjectId : s.id);
  }
  return set;
}

function partitionSelectedSubjectIds(selected: string[]): {
  plainIds: string[];
  branchPicks: { baseSubjectId: string; branch: 'botany' | 'zoology' }[];
} {
  const plainIds: string[] = [];
  const branchPicks: { baseSubjectId: string; branch: 'botany' | 'zoology' }[] = [];
  for (const id of selected) {
    const p = parseBioSplitSubjectId(id);
    if (p) branchPicks.push({ baseSubjectId: p.baseSubjectId, branch: p.branch });
    else plainIds.push(id);
  }
  return { plainIds, branchPicks };
}

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
  biology_branch?: 'botany' | 'zoology' | null;
}

function effectiveChapterLifeBranch(c: ChapterRow): 'botany' | 'zoology' | null {
  if (c.biology_branch === 'botany' || c.biology_branch === 'zoology') return c.biology_branch;
  const sn = (c.subject_name || '').trim().toLowerCase();
  if (sn === 'botany') return 'botany';
  if (sn === 'zoology') return 'zoology';
  return null;
}

function filterChaptersBySubjectSelection(
  list: ChapterRow[],
  plainIds: string[],
  branchPicks: { baseSubjectId: string; branch: 'botany' | 'zoology' }[]
): ChapterRow[] {
  const plainSet = new Set(plainIds);
  const branchMap = new Map<string, Set<'botany' | 'zoology'>>();
  for (const p of branchPicks) {
    if (!branchMap.has(p.baseSubjectId)) branchMap.set(p.baseSubjectId, new Set());
    branchMap.get(p.baseSubjectId)!.add(p.branch);
  }
  return list.filter((c) => {
    if (plainSet.has(c.subject_id)) return true;
    const wanted = branchMap.get(c.subject_id);
    if (!wanted || wanted.size === 0) return false;
    const eff = effectiveChapterLifeBranch(c);
    return eff !== null && wanted.has(eff);
  });
}

interface NewTestChapterPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: NewTestPickerConfirmPayload) => void;
  title?: string;
}

const buildSelectedChapter = (ch: ChapterRow, count: number): SelectedChapter => {
  const sn = (ch.subject_name || '').trim().toLowerCase();
  let biology_branch: 'botany' | 'zoology' | null = null;
  if (sn === 'botany') biology_branch = 'botany';
  else if (sn === 'zoology') biology_branch = 'zoology';
  else if (ch.biology_branch === 'botany' || ch.biology_branch === 'zoology') biology_branch = ch.biology_branch;
  return {
    id: ch.id,
    name: ch.name,
    subjectName: ch.subject_name || '',
    biology_branch,
    className: ch.class_name || '',
    count: Math.max(0, Math.round(count)),
    figureCount: 0,
    difficulty: 'Global',
    source: 'db',
    selectionMode: 'count',
    visualMode: 'image',
  };
};

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
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, SubjectRow[]>>({});
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [defaultQuestionsPerChapter, setDefaultQuestionsPerChapter] = useState(10);
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});
  const [activeClassPill, setActiveClassPill] = useState<string | null>(null);
  const [activeSubjectPill, setActiveSubjectPill] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [allKbChapters, setAllKbChapters] = useState<ChapterRowForProfileExpand[]>([]);
  const [presets, setPresets] = useState<ExamPaperProfileRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  /** Target count of questions that include a figure (passed to test creator as global figure mix). */
  const [manualFigureQuestionCount, setManualFigureQuestionCount] = useState(0);

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
    if (open) {
      setWizardStep(1);
      setManualFigureQuestionCount(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !selectedKb) return;
    supabase.from('kb_classes').select('id, name').eq('kb_id', selectedKb).order('name').then(({ data }) => {
      const list = data || [];
      setClasses(list);
      setSelectedClassIds(list.length === 1 ? new Set([list[0].id]) : new Set());
      setSelectedSubjectIds(new Set());
      setSubjectsByClass({});
      setChapters([]);
      setSelectedIds(new Set());
      setChapterCounts({});
      setSearch('');
      setActiveClassPill(null);
      setActiveSubjectPill(null);
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
      setSubjectsByClass({});
      setSelectedSubjectIds(new Set());
      setChapters([]);
      setSelectedIds(new Set());
      setChapterCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        Array.from(selectedClassIds).map(async (cid) => {
          const { data } = await supabase.from('subjects').select('id, name, class_id').eq('class_id', cid).order('name');
          return [cid, (data || []) as SubjectRow[]] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, SubjectRow[]> = {};
      const allIds = new Set<string>();
      const uniqueById = new Map<string, SubjectRow>();
      results.forEach(([cid, rows]) => {
        const expanded = expandSubjectsForNewTestPicker(rows);
        next[cid] = expanded;
        expanded.forEach((s) => {
          allIds.add(s.id);
          if (!uniqueById.has(s.id)) uniqueById.set(s.id, s);
        });
      });
      setSubjectsByClass(next);
      setSelectedSubjectIds((prev) => {
        const kept = new Set([...prev].filter((id) => allIds.has(id)));
        if (uniqueById.size === 1) {
          const only = uniqueById.values().next().value!;
          return new Set([only.id]);
        }
        return kept;
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
    const selected = Array.from(selectedSubjectIds);
    const { plainIds, branchPicks } = partitionSelectedSubjectIds(selected);
    const subjectIdsNeeded = new Set<string>(plainIds);
    branchPicks.forEach((p) => subjectIdsNeeded.add(p.baseSubjectId));
    const ids = [...subjectIdsNeeded];
    if (ids.length === 0) {
      setChapters([]);
      return;
    }
    supabase
      .from('chapters')
      .select('id, name, chapter_number, subject_id, subject_name, class_name, biology_branch')
      .eq('kb_id', selectedKb)
      .in('subject_id', ids)
      .order('chapter_number', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setChapters([]);
          return;
        }
        let list = (data || []) as ChapterRow[];
        list = filterChaptersBySubjectSelection(list, plainIds, branchPicks);
        setChapters(list);
      });
  }, [open, selectedKb, selectedSubjectIds]);

  const totalSubjectsListed = useMemo(() => {
    let n = 0;
    for (const cid of selectedClassIds) {
      n += (subjectsByClass[cid] || []).length;
    }
    return n;
  }, [selectedClassIds, subjectsByClass]);

  const subjectFilterPills = useMemo(() => {
    const map = new Map<string, string>();
    for (const cid of selectedClassIds) {
      for (const s of subjectsByClass[cid] || []) {
        if (selectedSubjectIds.has(s.id)) map.set(s.id, s.name);
      }
    }
    const out: [string, string][] = [...map.entries()];
    out.sort((a, b) => a[1].localeCompare(b[1]));
    return out;
  }, [selectedClassIds, subjectsByClass, selectedSubjectIds]);

  const filteredChapters = useMemo(() => {
    let list = chapters;
    if (activeClassPill) {
      // Use base subject_ids under this KB class (synthetic bio-split ids map to their parent subject).
      const subjectIdsForClass = baseSubjectIdsFromPickerRows(subjectsByClass[activeClassPill] || []);
      if (subjectIdsForClass.size > 0) {
        list = list.filter((c) => subjectIdsForClass.has(c.subject_id));
      } else {
        const cn = classes.find((c) => c.id === activeClassPill)?.name?.trim() || '';
        list = cn ? list.filter((c) => (c.class_name || '').trim() === cn) : [];
      }
    }
    if (activeSubjectPill) {
      const split = parseBioSplitSubjectId(activeSubjectPill);
      if (split) {
        list = list.filter(
          (c) =>
            c.subject_id === split.baseSubjectId && effectiveChapterLifeBranch(c) === split.branch
        );
      } else {
        list = list.filter((c) => c.subject_id === activeSubjectPill);
      }
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [chapters, search, activeClassPill, activeSubjectPill, classes, subjectsByClass]);

  const toggleChapter = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setChapterCounts((c) => {
          const { [id]: _, ...rest } = c;
          return rest;
        });
      } else {
        next.add(id);
        setChapterCounts((c) => ({
          ...c,
          [id]: c[id] ?? defaultQuestionsPerChapter,
        }));
      }
      return next;
    });
  };

  const toggleClass = (id: string, checked: boolean) => {
    setSelectedClassIds((prev) => toggleInSet(prev, id, checked));
    if (!checked) setActiveClassPill((p) => (p === id ? null : p));
  };

  const toggleSubject = (id: string, checked: boolean) => {
    setSelectedSubjectIds((prev) => toggleInSet(prev, id, checked));
    if (!checked) setActiveSubjectPill((p) => (p === id ? null : p));
  };

  const selectAllClasses = () => {
    setSelectedClassIds(new Set(classes.map((c) => c.id)));
  };

  const clearClasses = () => {
    setSelectedClassIds(new Set());
  };

  const selectAllSubjects = () => {
    const ids = new Set<string>();
    for (const cid of selectedClassIds) {
      for (const s of subjectsByClass[cid] || []) {
        ids.add(s.id);
      }
    }
    setSelectedSubjectIds(ids);
  };

  const clearSubjects = () => {
    setSelectedSubjectIds(new Set());
  };

  const manualTotalQuestions = useMemo(() => {
    let s = 0;
    for (const id of selectedIds) {
      s += chapterCounts[id] ?? defaultQuestionsPerChapter;
    }
    return s;
  }, [selectedIds, chapterCounts, defaultQuestionsPerChapter]);

  useEffect(() => {
    setManualFigureQuestionCount((n) => Math.max(0, Math.min(n, manualTotalQuestions || 0)));
  }, [manualTotalQuestions]);

  const handleConfirmManual = () => {
    const picked = chapters.filter((c) => selectedIds.has(c.id));
    if (picked.length === 0) return;
    const selectedChapters = picked.map((ch) =>
      buildSelectedChapter(ch, chapterCounts[ch.id] ?? defaultQuestionsPerChapter)
    );
    const totalQs = selectedChapters.reduce((sum, ch) => sum + ch.count, 0);
    if (totalQs <= 0) return;
    const figN = Math.max(
      0,
      Math.min(manualFigureQuestionCount, totalQs)
    );
    onConfirm({
      chapters: selectedChapters,
      knowledgeBaseId: selectedKb,
      initialTotalTarget: totalQs,
      initialDistributionMode: 'count',
      initialGlobalFigureCount: figN,
    });
    setSelectedIds(new Set());
    setChapterCounts({});
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
        className="flex max-h-[min(92vh,800px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/90 px-5 py-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Step {wizardStep} of 2 · {wizardStep === 1 ? 'Scope' : 'Chapters'}
          </p>
          <h2 id="new-test-chapter-picker-title" className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            {wizardStep === 1
              ? 'Pick a knowledge base, optionally use a template, then choose classes and subjects.'
              : 'Filter the list, set default questions per chapter, then tick chapters — totals sync to the creator.'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {wizardStep === 1 ? (
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Knowledge base
              </label>
              <p className="mb-1.5 text-[11px] text-zinc-400">Templates and chapters below use this KB.</p>
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
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Exam paper templates
              </label>
              <p className="mb-2 text-[11px] text-zinc-400">
                Skip manual picks — a template carries totals, subject mix, and chapter spread for this KB.
              </p>
              {presetsLoading ? (
                <p className="text-[12px] text-zinc-400">Loading templates…</p>
              ) : presets.length === 0 ? (
                <p className="text-[12px] text-zinc-400">
                  No profiles yet. Add them under Admin → Exam papers, or continue with classes below.
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

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Classes & subjects</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllClasses}
                    disabled={classes.length === 0}
                    className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    All classes
                  </button>
                  <button
                    type="button"
                    onClick={clearClasses}
                    disabled={selectedClassIds.size === 0}
                    className="text-[11px] font-medium text-zinc-500 hover:underline disabled:opacity-40"
                  >
                    Clear classes
                  </button>
                  <button
                    type="button"
                    onClick={selectAllSubjects}
                    disabled={totalSubjectsListed === 0}
                    className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    All subjects
                  </button>
                  <button
                    type="button"
                    onClick={clearSubjects}
                    disabled={selectedSubjectIds.size === 0}
                    className="text-[11px] font-medium text-zinc-500 hover:underline disabled:opacity-40"
                  >
                    Clear subjects
                  </button>
                </div>
              </div>
              <p className="mb-2 text-[11px] text-zinc-400">
                Tick a class, then choose subjects under it. You need at least one subject to continue.
              </p>
              {classes.length === 0 ? (
                <p className="text-[12px] text-zinc-400">No classes in this knowledge base.</p>
              ) : (
                <ul className="max-h-[min(40vh,280px)] space-y-2 overflow-y-auto rounded-lg border border-zinc-100 bg-white p-2">
                  {classes.map((c) => {
                    const subs = subjectsByClass[c.id] || [];
                    const classSelected = selectedClassIds.has(c.id);
                    return (
                      <li key={c.id} className="rounded-md border border-zinc-100 bg-zinc-50/50 p-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] font-medium text-zinc-900 hover:bg-white/80">
                          <input
                            type="checkbox"
                            checked={classSelected}
                            onChange={(e) => toggleClass(c.id, e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
                          />
                          {c.name}
                        </label>
                        {classSelected ? (
                          <div className="ml-6 mt-2 space-y-1 border-l border-zinc-200 pl-3">
                            {subs.length === 0 ? (
                              <p className="text-[11px] text-zinc-400">Loading or no subjects for this class.</p>
                            ) : (
                              subs.map((s) => (
                                <label
                                  key={s.id}
                                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12px] text-zinc-700 hover:bg-white"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSubjectIds.has(s.id)}
                                    onChange={(e) => toggleSubject(s.id, e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600"
                                  />
                                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                </label>
                              ))
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          ) : (
          <div className="flex min-h-[min(56vh,520px)] min-w-0 flex-1 flex-col md:flex-row">
            <aside className="shrink-0 border-b border-zinc-100 bg-zinc-50/95 md:w-44 md:border-b-0 md:border-r md:border-zinc-100">
              <div className="p-3 md:sticky md:top-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Classes</p>
                <p className="mt-0.5 text-[10px] text-zinc-400">Narrow the chapter list</p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto custom-scrollbar md:max-h-[min(52vh,420px)]">
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveClassPill(null)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition-colors ${
                        activeClassPill === null
                          ? 'bg-zinc-900 text-white shadow-sm'
                          : 'text-zinc-600 hover:bg-white/80'
                      }`}
                    >
                      All classes
                    </button>
                  </li>
                  {classes
                    .filter((c) => selectedClassIds.has(c.id))
                    .map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setActiveClassPill((prev) => (prev === c.id ? null : c.id))}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition-colors ${
                            activeClassPill === c.id
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-zinc-700 hover:bg-white/80'
                          }`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="space-y-3 border-b border-zinc-100 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Default questions / chapter
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={defaultQuestionsPerChapter}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0)));
                        setDefaultQuestionsPerChapter(v);
                      }}
                      className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-indigo-500"
                    />
                    <p className="mt-1 max-w-md text-[11px] text-zinc-400">
                      Applied when you tick a chapter. Edit each row anytime; creator total follows the sum.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Figure questions (total)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={manualFigureQuestionCount}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0)));
                        setManualFigureQuestionCount(v);
                      }}
                      className="w-24 rounded-lg border border-violet-200 bg-violet-50/80 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-violet-500"
                    />
                    <p className="mt-1 max-w-[220px] text-[11px] text-zinc-400">
                      How many items should include a diagram. Capped to your selected question total ({manualTotalQuestions}).
                    </p>
                  </div>
                </div>

                {subjectFilterPills.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Filter by section</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveSubjectPill(null)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          activeSubjectPill === null
                            ? 'bg-zinc-200 text-zinc-800'
                            : 'bg-zinc-100/80 text-zinc-500 hover:bg-zinc-100'
                        }`}
                      >
                        All sections
                      </button>
                      {subjectFilterPills.map(([pillId, label]) => (
                        <button
                          key={pillId}
                          type="button"
                          onClick={() => setActiveSubjectPill((prev) => (prev === pillId ? null : pillId))}
                          className={`max-w-[140px] truncate rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            activeSubjectPill === pillId
                              ? 'bg-zinc-200 text-zinc-800'
                              : 'bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200/80 hover:bg-zinc-100'
                          }`}
                          title={label}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 px-4 py-3 sm:px-5">
                <input
                  type="search"
                  placeholder="Search chapters…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={selectedSubjectIds.size === 0}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-zinc-50"
                />
                {selectedSubjectIds.size === 0 ? (
                  <p className="text-[11px] text-zinc-400">Go back and select at least one subject to load chapters.</p>
                ) : null}
              </div>

              <div className="min-h-[160px] flex-1 overflow-y-auto px-4 pb-4 sm:px-5 custom-scrollbar">
                {loading ? (
                  <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
                ) : selectedSubjectIds.size === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-400">Select subjects in step 1 to list chapters.</p>
                ) : filteredChapters.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-400">No chapters for this filter.</p>
                ) : (
                  <ul className="space-y-1">
                    {filteredChapters.map((ch) => {
                      const checked = selectedIds.has(ch.id);
                      const qCount = chapterCounts[ch.id] ?? defaultQuestionsPerChapter;
                      return (
                        <li key={ch.id}>
                          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2 transition-colors hover:border-zinc-200 hover:bg-zinc-50 sm:flex-nowrap sm:items-center">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 sm:items-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleChapter(ch.id)}
                                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 sm:mt-0"
                              />
                              <span className="min-w-0 flex-1 text-sm font-medium text-zinc-800">
                                <span className="text-zinc-400">{ch.chapter_number != null ? `${ch.chapter_number}. ` : ''}</span>
                                {ch.name}
                                {ch.class_name || ch.subject_name ? (
                                  <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                                    {[ch.class_name, ch.subject_name ? paperChapterSubjectLine(ch.subject_name, ch.biology_branch) : '']
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            <div className="flex shrink-0 items-center gap-1 pl-7 sm:pl-0">
                              <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                                <span className="hidden sm:inline">Qs</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={500}
                                  disabled={!checked}
                                  value={checked ? qCount : defaultQuestionsPerChapter}
                                  onChange={(e) => {
                                    const v = Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0)));
                                    setChapterCounts((prev) => ({ ...prev, [ch.id]: v }));
                                  }}
                                  className="w-14 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-xs tabular-nums outline-none focus:border-indigo-500 disabled:opacity-40"
                                />
                              </label>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/80 px-5 py-3">
          <span className="text-[12px] text-zinc-500">
            {wizardStep === 1 ? (
              selectedClassIds.size > 0 && selectedSubjectIds.size > 0 ? (
                `${selectedClassIds.size} class(es), ${selectedSubjectIds.size} subject(s)`
              ) : (
                'Select at least one class and subject'
              )
            ) : (
              <>
                {selectedIds.size} chapter(s) selected
                {selectedIds.size > 0 ? (
                  <span className="text-zinc-400">
                    {' '}
                    · {manualTotalQuestions} questions total
                    {manualFigureQuestionCount > 0 && manualTotalQuestions > 0 ? (
                      <span>
                        {' '}
                        ·{' '}
                        {Math.min(manualFigureQuestionCount, manualTotalQuestions)} with figures
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {selectedIds.size > 0 && manualTotalQuestions <= 0 ? (
                  <span className="block text-amber-600">Raise default or per-chapter counts above 0.</span>
                ) : null}
              </>
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            {wizardStep === 1 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedClassIds.size === 0 || selectedSubjectIds.size === 0}
                  onClick={() => setWizardStep(2)}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || !selectedKb || manualTotalQuestions <= 0}
                  onClick={handleConfirmManual}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Continue with selected chapters
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewTestChapterPickerModal;
