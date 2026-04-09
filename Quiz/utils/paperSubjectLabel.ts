/** Aligns with `chapters.biology_branch` in Supabase. */
export type BiologyBranch = 'botany' | 'zoology';

export function isBiologySubjectName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n === 'biology' || n.includes('biology');
}

/**
 * Section title for test paper / creator: Biology is never shown as one bucket —
 * use Botany, Zoology, or an explicit untagged label when `biology_branch` is missing.
 */
export function paperSubjectSectionLabel(
  subjectName: string | null | undefined,
  biologyBranch: BiologyBranch | null | undefined
): string {
  const raw = (subjectName && String(subjectName).trim()) || '';
  const n = raw.toLowerCase();
  if (n === 'botany') return 'Botany';
  if (n === 'zoology') return 'Zoology';
  if (isBiologySubjectName(raw)) {
    if (biologyBranch === 'botany') return 'Botany';
    if (biologyBranch === 'zoology') return 'Zoology';
    return 'Bio (untagged)';
  }
  return raw || 'General';
}

/** NEET-style section order on the paper. */
const SECTION_SORT_ORDER: string[] = ['Physics', 'Chemistry', 'Botany', 'Zoology', 'Bio (untagged)'];

export function comparePaperSubjectSections(a: string, b: string): number {
  const ia = SECTION_SORT_ORDER.indexOf(a);
  const ib = SECTION_SORT_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

/** Display line for chapter rows (picker / lists): never "Biology" alone when branch is known. */
export function paperChapterSubjectLine(
  subjectName: string | null | undefined,
  biologyBranch: BiologyBranch | null | undefined
): string {
  return paperSubjectSectionLabel(subjectName, biologyBranch);
}
