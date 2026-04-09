import type { SelectedChapter } from '../types';
import type { ExamPaperProfileRow } from '../../Admin/ExamPaper/types';
import {
  GLOBAL_BIO_PREFIX,
  GLOBAL_SUB_PREFIX,
  STYLE_KEYS,
  globalSubjectMixBioKey,
  subjectNameToGlobalMixSlug,
} from '../../Admin/ExamPaper/types';

export interface ChapterRowForProfileExpand {
  id: string;
  name: string;
  subject_name: string | null;
  subject_id: string | null;
  class_name: string | null;
  biology_branch: 'botany' | 'zoology' | null;
  chapter_number: number | null;
}

function isBiology(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n === 'biology' || n.includes('biology');
}

export function chapterGlobalSubjectMixKey(ch: ChapterRowForProfileExpand): string {
  const sub = (ch.subject_name || '').trim().toLowerCase();
  if (sub === 'botany') return globalSubjectMixBioKey('botany');
  if (sub === 'zoology') return globalSubjectMixBioKey('zoology');
  if (isBiology(ch.subject_name)) {
    const br =
      ch.biology_branch === 'botany' || ch.biology_branch === 'zoology' ? ch.biology_branch : 'unset';
    return `${GLOBAL_BIO_PREFIX}${br}`;
  }
  return `${GLOBAL_SUB_PREFIX}${subjectNameToGlobalMixSlug(ch.subject_name)}`;
}

function styleMixToChapterCounts(chCount: number, mix: Record<string, number>): Record<string, number> {
  const keys = [...STYLE_KEYS];
  const raw = keys.map((k) => Math.max(0, Number(mix[k]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const proportion =
    sum <= 0 ? keys.map(() => 1 / keys.length) : raw.map((v) => v / sum);
  const scaled = proportion.map((p) => Math.round(p * chCount));
  let diff = chCount - scaled.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0 && i < 200) {
    const j = i % keys.length;
    if (diff > 0) {
      scaled[j] += 1;
      diff -= 1;
    } else if (scaled[j] > 0) {
      scaled[j] -= 1;
      diff += 1;
    }
    i += 1;
  }
  return Object.fromEntries(keys.map((k, idx) => [k, scaled[idx]]));
}

/**
 * Turn a saved exam paper profile + KB chapters into blueprint rows for the test creator.
 * Respects global or per-subject style rows from profile metadata.
 */
export function expandExamPaperProfileToSelectedChapters(
  profile: ExamPaperProfileRow,
  allKbChapters: ChapterRowForProfileExpand[]
): SelectedChapter[] {
  const T = Math.max(1, profile.total_questions);
  const subjectMix = profile.subject_mix || {};
  const mode = profile.subject_mode;
  const globalStyle = profile.style_mix || {};

  const meta =
    profile.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata)
      ? (profile.metadata as Record<string, unknown>)
      : {};
  const perSubject = meta.use_per_subject_style_mix === true;
  const styleBySubjectRaw = meta.style_mix_by_subject;
  const styleBySubject =
    styleBySubjectRaw && typeof styleBySubjectRaw === 'object' && !Array.isArray(styleBySubjectRaw)
      ? (styleBySubjectRaw as Record<string, Record<string, number>>)
      : {};

  const buckets = new Map<string, ChapterRowForProfileExpand[]>();
  for (const ch of allKbChapters) {
    const k = chapterGlobalSubjectMixKey(ch);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(ch);
  }

  const out: SelectedChapter[] = [];

  for (const [subKey, shareRaw] of Object.entries(subjectMix)) {
    const share = Number(shareRaw);
    if (!Number.isFinite(share) || share <= 0) continue;

    const bucketTotal = mode === 'percent' ? Math.round((share / 100) * T) : Math.round(share);
    if (bucketTotal <= 0) continue;

    const chapterList = (buckets.get(subKey) || []).slice().sort((a, b) => {
      const na = a.chapter_number ?? 0;
      const nb = b.chapter_number ?? 0;
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name);
    });
    if (chapterList.length === 0) continue;

    const n = chapterList.length;
    const base = Math.floor(bucketTotal / n);
    let rem = bucketTotal - base * n;

    const mixForBucket =
      perSubject && styleBySubject[subKey] && Object.keys(styleBySubject[subKey]).length > 0
        ? styleBySubject[subKey]
        : globalStyle;

    chapterList.forEach((ch, i) => {
      const chCount = base + (i < rem ? 1 : 0);
      if (chCount <= 0) return;
      const styleCounts = styleMixToChapterCounts(chCount, mixForBucket);
      out.push({
        id: ch.id,
        name: ch.name,
        subjectName: ch.subject_name || '',
        biology_branch:
          ch.biology_branch === 'botany' || ch.biology_branch === 'zoology' ? ch.biology_branch : null,
        className: ch.class_name || '',
        count: chCount,
        figureCount: 0,
        difficulty: 'Global',
        source: 'db',
        selectionMode: 'count',
        visualMode: 'image',
        useStyleMix: true,
        styleCounts,
      });
    });
  }

  return out;
}

export function profileToGlobalTypes(profile: ExamPaperProfileRow): {
  mcq: number;
  reasoning: number;
  matching: number;
  statements: number;
} {
  const m = profile.style_mix || {};
  return {
    mcq: typeof m.mcq === 'number' ? m.mcq : 0,
    reasoning: typeof m.reasoning === 'number' ? m.reasoning : 0,
    matching: typeof m.matching === 'number' ? m.matching : 0,
    statements: typeof m.statements === 'number' ? m.statements : 0,
  };
}
