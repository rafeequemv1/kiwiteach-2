export type ExamType = 'mcq' | 'descriptive' | 'mixed';
export type MixMode = 'percent' | 'count';

export interface ExamPaperProfileRow {
  id: string;
  created_at: string;
  updated_at: string;
  knowledge_base_id: string;
  name: string;
  description: string | null;
  exam_type: ExamType;
  total_questions: number;
  figure_question_count: number;
  style_mode: MixMode;
  style_mix: Record<string, number>;
  subject_mode: MixMode;
  subject_mix: Record<string, number>;
  chapter_mode: MixMode;
  chapter_mix: Record<string, number>;
  /**
   * Common keys:
   * - `use_per_subject_style_mix` — when true, `style_mix_by_subject` applies (see below).
   * - `style_mix_by_subject` — `Record<subjectKey, { mcq, reasoning, matching, statements }>`; same `style_mode` as columns (percent or count per subject bucket).
   */
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
}

export const STYLE_KEYS = ['mcq', 'reasoning', 'matching', 'statements'] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export const STYLE_LABELS: Record<StyleKey, string> = {
  mcq: 'MCQ',
  reasoning: 'Reasoning',
  matching: 'Matching',
  statements: 'Statements',
};

/**
 * Global subject_mix keys (KB-wide: all classes merged).
 * - `g:bio:botany` | `g:bio:zoology` | `g:bio:unset` — life-science buckets (Botany / Zoology / untagged legacy Biology) across every class.
 * - `g:sub:<slug>` — other subjects, slug from normalized subject_name.
 */
export const GLOBAL_BIO_PREFIX = 'g:bio:' as const;
export const GLOBAL_SUB_PREFIX = 'g:sub:' as const;

/** Legacy: plain subject UUID, or `${uuid}__bio:botany|zoology|unset` (per-class subject rows). */
export const BIO_BRANCH_SUFFIX = '__bio:' as const;

export function subjectNameToGlobalMixSlug(name: string | null | undefined): string {
  const s = (name || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 56);
  return s || 'unknown';
}

export function globalSubjectMixBioKey(branch: 'botany' | 'zoology' | 'unset'): string {
  return `${GLOBAL_BIO_PREFIX}${branch}`;
}

export function globalSubjectMixSubKey(subjectName: string | null | undefined): string {
  return `${GLOBAL_SUB_PREFIX}${subjectNameToGlobalMixSlug(subjectName)}`;
}

export function humanizeGlobalSubSlug(slug: string): string {
  if (!slug) return 'Subject';
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function parseSubjectMixKey(key: string): { subjectId: string; bioBranch: 'botany' | 'zoology' | 'unset' | null } {
  if (key.startsWith(GLOBAL_BIO_PREFIX)) {
    const rest = key.slice(GLOBAL_BIO_PREFIX.length);
    if (rest === 'botany' || rest === 'zoology' || rest === 'unset') {
      return { subjectId: key, bioBranch: rest };
    }
  }
  if (key.startsWith(GLOBAL_SUB_PREFIX)) {
    return { subjectId: key.slice(GLOBAL_SUB_PREFIX.length), bioBranch: null };
  }
  const i = key.indexOf(BIO_BRANCH_SUFFIX);
  if (i === -1) return { subjectId: key, bioBranch: null };
  const subjectId = key.slice(0, i);
  const rest = key.slice(i + BIO_BRANCH_SUFFIX.length);
  if (rest === 'botany' || rest === 'zoology' || rest === 'unset') {
    return { subjectId, bioBranch: rest };
  }
  return { subjectId: key, bioBranch: null };
}
