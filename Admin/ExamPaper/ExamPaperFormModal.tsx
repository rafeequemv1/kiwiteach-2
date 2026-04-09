import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { ExamPaperProfileRow, ExamType, MixMode, StyleKey } from './types';
import {
  BIO_BRANCH_SUFFIX,
  GLOBAL_BIO_PREFIX,
  GLOBAL_SUB_PREFIX,
  STYLE_KEYS,
  STYLE_LABELS,
  globalSubjectMixBioKey,
  globalSubjectMixSubKey,
  humanizeGlobalSubSlug,
  parseSubjectMixKey,
  subjectNameToGlobalMixSlug,
} from './types';
import { isBiologySubjectName, paperChapterSubjectLine } from '../../Quiz/utils/paperSubjectLabel';

function sumValues(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function emptyStyleMix(): Record<StyleKey, number> {
  return { mcq: 0, reasoning: 0, matching: 0, statements: 0 };
}

function cloneStyleMixFromUnknown(raw: unknown): Record<StyleKey, number> {
  const out = emptyStyleMix();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  STYLE_KEYS.forEach((k) => {
    const v = o[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  });
  return out;
}

function defaultTemplateStyleMixFromInitial(initial: ExamPaperProfileRow | null): Record<StyleKey, number> {
  const tmpl = emptyStyleMix();
  const gsm = initial?.style_mix;
  if (gsm && typeof gsm === 'object') {
    STYLE_KEYS.forEach((k) => {
      const v = (gsm as Record<string, unknown>)[k];
      tmpl[k] = typeof v === 'number' ? Math.max(0, v) : 0;
    });
    return tmpl;
  }
  tmpl.mcq = 70;
  tmpl.reasoning = 10;
  tmpl.matching = 10;
  tmpl.statements = 10;
  return tmpl;
}

/** Questions allocated to this subject row (from subject_mix + subject_mode). */
function subjectQuestionAllocation(
  subjectKey: string,
  mix: Record<string, number>,
  subjectMode: MixMode,
  totalQuestions: number
): number {
  const raw = mix[subjectKey] ?? 0;
  if (subjectMode === 'percent') {
    return Math.max(0, Math.round((raw / 100) * totalQuestions));
  }
  return Math.max(0, Math.round(raw));
}

/** KB-wide key: same subject name across all classes shares one row; biology splits only by botany/zoology/unset. */
function globalSubjectMixKeyForChapter(c: ChapterRow): string {
  const sub = (c.subject_name || '').trim().toLowerCase();
  if (sub === 'botany') return globalSubjectMixBioKey('botany');
  if (sub === 'zoology') return globalSubjectMixBioKey('zoology');
  if (isBiologySubjectName(c.subject_name)) {
    const br =
      c.biology_branch === 'botany' || c.biology_branch === 'zoology' ? c.biology_branch : 'unset';
    return globalSubjectMixBioKey(br);
  }
  return globalSubjectMixSubKey(c.subject_name);
}

/** Legacy per–subject_id keys (before global rows). Used to migrate saved profiles. */
function legacySubjectMixKeyForChapter(c: ChapterRow): string {
  const sid = c.subject_id?.trim();
  if (!sid) return `__non_uuid:${(c.subject_name || 'subject').slice(0, 40)}`;
  const sub = (c.subject_name || '').trim().toLowerCase();
  if (sub === 'botany' || sub === 'zoology') return sid;
  if (isBiologySubjectName(c.subject_name)) {
    const br =
      c.biology_branch === 'botany' || c.biology_branch === 'zoology' ? c.biology_branch : 'unset';
    return `${sid}${BIO_BRANCH_SUFFIX}${br}`;
  }
  return sid;
}

function labelForGlobalSubjectMixKey(key: string): string {
  if (key.startsWith(GLOBAL_BIO_PREFIX)) {
    const rest = key.slice(GLOBAL_BIO_PREFIX.length);
    if (rest === 'botany') return 'Botany (all classes)';
    if (rest === 'zoology') return 'Zoology (all classes)';
    if (rest === 'unset') return 'Life science — branch not set (all classes)';
  }
  if (key.startsWith(GLOBAL_SUB_PREFIX)) {
    const slug = key.slice(GLOBAL_SUB_PREFIX.length);
    if (slug.startsWith('legacy_')) return `Subject (legacy) · ${slug.replace(/^legacy_/, '')}`;
    if (slug.startsWith('orphan_')) return `Unmapped saved key · ${slug.replace(/^orphan_/, '')}`;
    return `${humanizeGlobalSubSlug(slug)} (all classes)`;
  }
  return key;
}

function migrateSubjectMixToGlobal(legacy: Record<string, number>, chapters: ChapterRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (gk: string, val: number) => {
    if (!Number.isFinite(val) || val <= 0) return;
    out[gk] = (out[gk] || 0) + val;
  };

  for (const [k, rawV] of Object.entries(legacy)) {
    const num = Number(rawV);
    if (!Number.isFinite(num) || num <= 0) continue;

    if (k.startsWith(GLOBAL_BIO_PREFIX) || k.startsWith(GLOBAL_SUB_PREFIX)) {
      add(k, num);
      continue;
    }

    const match = chapters.find((c) => legacySubjectMixKeyForChapter(c) === k);
    if (match) {
      add(globalSubjectMixKeyForChapter(match), num);
      continue;
    }

    const parsed = parseSubjectMixKey(k);
    if (parsed.bioBranch) {
      add(globalSubjectMixBioKey(parsed.bioBranch), num);
      continue;
    }
    if (parsed.subjectId && !parsed.subjectId.startsWith('__')) {
      const byId = chapters.find((c) => (c.subject_id || '').trim() === parsed.subjectId);
      if (byId) {
        add(globalSubjectMixKeyForChapter(byId), num);
        continue;
      }
    }
    add(`${GLOBAL_SUB_PREFIX}orphan_${subjectNameToGlobalMixSlug(k).slice(0, 48)}`, num);
  }

  return out;
}

interface ChapterRow {
  id: string;
  name: string;
  subject_name: string | null;
  subject_id: string | null;
  chapter_number: number | null;
  class_name: string | null;
  biology_branch: 'botany' | 'zoology' | null;
}

interface SubjectOption {
  key: string;
  label: string;
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
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterPicker, setChapterPicker] = useState('');
  const [uniformSubjectScratch, setUniformSubjectScratch] = useState('');
  const [perSubjectStyles, setPerSubjectStyles] = useState(false);
  const [styleMixBySubject, setStyleMixBySubject] = useState<Record<string, Record<StyleKey, number>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !knowledgeBaseId) return;
    const loadMeta = async () => {
      const legacyMix = (initial?.subject_mix || {}) as Record<string, number>;
      const { data: chapRows } = await supabase
        .from('chapters')
        .select('id, name, subject_name, subject_id, chapter_number, class_name, biology_branch')
        .eq('kb_id', knowledgeBaseId);
      const list = (chapRows || []) as ChapterRow[];
      setChapters(list);

      const labelByKey = new Map<string, string>();
      for (const c of list) {
        const key = globalSubjectMixKeyForChapter(c);
        if (!labelByKey.has(key)) {
          labelByKey.set(key, labelForGlobalSubjectMixKey(key));
        }
      }

      const migrated = migrateSubjectMixToGlobal(legacyMix, list);

      const opts: SubjectOption[] = [];
      const seen = new Set<string>();
      for (const [key, label] of labelByKey.entries()) {
        opts.push({ key, label });
        seen.add(key);
      }
      for (const k of Object.keys(migrated)) {
        if (seen.has(k)) continue;
        opts.push({ key: k, label: labelForGlobalSubjectMixKey(k) });
        seen.add(k);
      }
      opts.sort((a, b) => a.label.localeCompare(b.label));
      setSubjects(opts);
      setSubjectMix(migrated);

      const tmpl = defaultTemplateStyleMixFromInitial(initial);
      const metaObj =
        initial?.metadata && typeof initial.metadata === 'object' && !Array.isArray(initial.metadata)
          ? (initial.metadata as Record<string, unknown>)
          : null;
      const savedRaw = metaObj?.style_mix_by_subject;
      const saved =
        savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)
          ? (savedRaw as Record<string, Record<string, number>>)
          : {};
      const smbs: Record<string, Record<StyleKey, number>> = {};
      for (const o of opts) {
        smbs[o.key] = saved[o.key] ? cloneStyleMixFromUnknown(saved[o.key]) : { ...tmpl };
      }
      setStyleMixBySubject(smbs);
    };
    void loadMeta();
  }, [open, knowledgeBaseId, initial]);

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
      const meta =
        initial.metadata && typeof initial.metadata === 'object' && !Array.isArray(initial.metadata)
          ? (initial.metadata as Record<string, unknown>)
          : null;
      setPerSubjectStyles(meta?.use_per_subject_style_mix === true);
      const sm = { ...emptyStyleMix() };
      STYLE_KEYS.forEach((k) => {
        const v = initial.style_mix?.[k];
        sm[k] = typeof v === 'number' ? v : 0;
      });
      setStyleMix(sm);
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
      setChapterMode('percent');
      setChapterMix({});
      setPerSubjectStyles(false);
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

  /** Split total questions evenly across the four style buckets (count mode) or 25% each (percent). */
  const equalizeStylesFromTotal = () => {
    if (styleMode === 'percent') {
      const each = Math.floor(100 / STYLE_KEYS.length);
      const rest = 100 - each * STYLE_KEYS.length;
      const next = { ...emptyStyleMix() };
      STYLE_KEYS.forEach((k, i) => {
        next[k] = each + (i < rest ? 1 : 0);
      });
      setStyleMix(next);
    } else {
      const n = STYLE_KEYS.length;
      const base = Math.floor(totalQuestions / n);
      const rest = totalQuestions - base * n;
      const next = { ...emptyStyleMix() };
      STYLE_KEYS.forEach((k, i) => {
        next[k] = base + (i < rest ? 1 : 0);
      });
      setStyleMix(next);
    }
  };

  /** Set every subject row to the same count (count mode) or same % slice (percent). */
  const applyUniformSubjectValue = (value: number) => {
    if (subjects.length === 0 || value < 0) return;
    const v = Math.max(0, value);
    const next: Record<string, number> = {};
    subjects.forEach((s) => {
      next[s.key] = v;
    });
    setSubjectMix(next);
  };

  const setStyleMixForSubject = (subjectKey: string, sk: StyleKey, val: number) => {
    setStyleMixBySubject((prev) => ({
      ...prev,
      [subjectKey]: {
        ...emptyStyleMix(),
        ...prev[subjectKey],
        [sk]: Math.max(0, val),
      },
    }));
  };

  const copyGlobalStyleMixToAllSubjects = () => {
    setStyleMixBySubject((prev) => {
      const next = { ...prev };
      subjects.forEach((s) => {
        next[s.key] = { ...styleMix };
      });
      return next;
    });
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
    const section = paperChapterSubjectLine(c.subject_name, c.biology_branch);
    return [c.class_name, section, num, c.name].filter(Boolean).join(' · ');
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

    if (perSubjectStyles) {
      for (const s of subjects) {
        const alloc = subjectQuestionAllocation(s.key, subjectMix, subjectMode, totalQuestions);
        if (alloc <= 0) continue;
        const row = styleMixBySubject[s.key] || emptyStyleMix();
        const rowSum = sumValues(row);
        if (styleMode === 'percent') {
          if (rowSum > 0 && Math.abs(rowSum - 100) > 2) {
            if (
              !confirm(
                `Style mix for "${s.label}" sums to ${rowSum}% (expected ~100% within that subject). Save anyway?`
              )
            ) {
              return;
            }
          }
        } else if (rowSum > alloc) {
          if (
            !confirm(
              `Style counts for "${s.label}" sum to ${rowSum} but ~${alloc} questions are allocated to that subject. Save anyway?`
            )
          ) {
            return;
          }
        }
      }
    }

    const baseMetadata =
      initial?.metadata && typeof initial.metadata === 'object' && !Array.isArray(initial.metadata)
        ? { ...(initial.metadata as Record<string, unknown>) }
        : {};
    if (perSubjectStyles) {
      baseMetadata.use_per_subject_style_mix = true;
      baseMetadata.style_mix_by_subject = { ...styleMixBySubject };
    } else {
      baseMetadata.use_per_subject_style_mix = false;
      delete baseMetadata.style_mix_by_subject;
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
      metadata: {
        ...baseMetadata,
        subject_keys_include_bio_split: subjects.some(
          (s) => s.key.startsWith(GLOBAL_BIO_PREFIX) || s.key.includes(BIO_BRANCH_SUFFIX)
        ),
        subject_mix_global_kb_wide: true,
      },
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

          <section className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
            <h4 className="text-sm font-semibold text-emerald-950">Uniform global (KB-wide subjects)</h4>
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/80">
              Subject rows below are <span className="font-semibold">one per subject across every class</span> (e.g. one Botany row = Plus One + Plus Two botany chapters combined). Style tools use{' '}
              <span className="font-semibold">Total questions</span> when in count mode, or 100% when in percent mode.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={equalizeStylesFromTotal}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-emerald-900 hover:bg-emerald-50"
              >
                Equal all style types
                {styleMode === 'count' ? ` (from total ${totalQuestions})` : ' (25% each)'}
              </button>
              <button
                type="button"
                onClick={distributeSubjectsEvenly}
                disabled={subjects.length === 0}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-40"
              >
                Equal per subject row
                {subjectMode === 'count' ? ` (split ${totalQuestions})` : ' (split 100%)'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-emerald-200/60 pt-3">
              <div className="min-w-[140px] flex-1">
                <label className="text-[10px] font-semibold uppercase text-emerald-800/90">
                  Same {subjectMode === 'percent' ? '%' : 'count'} for every subject
                </label>
                <input
                  type="number"
                  min={0}
                  value={uniformSubjectScratch}
                  onChange={(e) => setUniformSubjectScratch(e.target.value)}
                  placeholder={subjectMode === 'percent' ? 'e.g. 33' : 'e.g. 30'}
                  className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const n = parseFloat(uniformSubjectScratch);
                  if (!Number.isFinite(n) || n < 0) {
                    alert('Enter a non-negative number.');
                    return;
                  }
                  applyUniformSubjectValue(n);
                }}
                disabled={subjects.length === 0}
                className="rounded-lg bg-emerald-800 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-900 disabled:opacity-40"
              >
                Apply to all subjects
              </button>
            </div>
          </section>

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
              {perSubjectStyles ? (
                <>
                  <span className="font-semibold">Global default</span> (used when “per subject” is off, or as the starting template). Sum:{' '}
                  <span className="font-mono font-semibold text-zinc-800">{styleSum}</span>
                  {styleMode === 'percent' ? '%' : ' questions'}
                </>
              ) : (
                <>
                  Applies to the whole paper. Sum: <span className="font-mono font-semibold text-zinc-800">{styleSum}</span>
                  {styleMode === 'percent' ? '%' : ' questions'}
                </>
              )}
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-zinc-800">
                <input
                  type="checkbox"
                  checked={perSubjectStyles}
                  onChange={(e) => setPerSubjectStyles(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Set question styles per subject
              </label>
              {perSubjectStyles && subjects.length > 0 && (
                <button
                  type="button"
                  onClick={copyGlobalStyleMixToAllSubjects}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Copy global mix → all subjects
                </button>
              )}
            </div>
            {perSubjectStyles && (
              <p className="mt-2 text-[11px] text-zinc-500">
                Uses the same mode as above ({styleMode === 'percent' ? 'percentages within each subject’s share of the paper' : 'counts within that subject’s question total'}). Turn off to use only the global row.
              </p>
            )}
            {perSubjectStyles && subjects.length === 0 && (
              <p className="mt-2 text-[12px] text-amber-700">
                No subject rows yet — wait for chapters to load, or pick a knowledge base with chapters.
              </p>
            )}
            {perSubjectStyles && subjects.length > 0 && (
              <div className="mt-4 max-h-[min(360px,50vh)] space-y-3 overflow-y-auto pr-1">
                {subjects.map((s) => {
                  const row = styleMixBySubject[s.key] || emptyStyleMix();
                  const alloc = subjectQuestionAllocation(s.key, subjectMix, subjectMode, totalQuestions);
                  const rowSum = sumValues(row);
                  return (
                    <div key={s.key} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-900">{s.label}</span>
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          ~{alloc} Q from subject mix · styles sum {rowSum}
                          {styleMode === 'percent' ? '%' : ''}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {STYLE_KEYS.map((k) => (
                          <div key={k}>
                            <label className="text-[9px] font-semibold uppercase text-zinc-500">{STYLE_LABELS[k]}</label>
                            <input
                              type="number"
                              min={0}
                              value={row[k]}
                              onChange={(e) =>
                                setStyleMixForSubject(s.key, k, parseFloat(e.target.value) || 0)
                              }
                              className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  Equal split (all rows)
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              <span className="font-semibold">Global distribution only</span> — each row pools all classes (e.g. 45 for Botany draws from Plus One and Plus Two botany chapters together). Use separate{' '}
              <span className="font-semibold">Botany</span> and <span className="font-semibold">Zoology</span> rows; for legacy chapters still on a combined Biology subject, <code className="text-[10px]">biology_branch</code> splits them (otherwise “Life science — branch not set”). Sum:{' '}
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
                {chapters.map((c) => {
                  const section = paperChapterSubjectLine(c.subject_name, c.biology_branch);
                  return (
                    <option key={c.id} value={c.id}>
                      {[c.class_name, section, c.chapter_number != null ? `Ch ${c.chapter_number}` : null, c.name]
                        .filter(Boolean)
                        .join(' · ')}
                    </option>
                  );
                })}
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
