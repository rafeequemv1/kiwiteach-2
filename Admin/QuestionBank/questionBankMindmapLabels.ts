import { paperChapterSubjectLine, paperSubjectSectionLabel } from '../../Quiz/utils/paperSubjectLabel';
import type { MindMapChapterRow } from './questionBankMindmapService';

/** Subject node: never show raw legacy “Biology” as the only life-science label when branch is unknown at subject level. */
export function mindMapSubjectPillLabel(subjectName: string | null | undefined): string {
  return paperSubjectSectionLabel(subjectName, null) || 'Subject';
}

/**
 * Chapter node: append Botany/Zoology (or Bio untagged) when it differs from the parent subject pill
 * — e.g. legacy Biology subject with zoology-tagged chapters.
 */
export function mindMapChapterPillLabel(
  ch: MindMapChapterRow,
  parentSubjectName: string | null | undefined
): string {
  const base =
    ch.chapter_number != null
      ? `${ch.chapter_number}. ${ch.chapter_name}`
      : ch.chapter_name || 'Chapter';
  const br =
    ch.biology_branch === 'botany' || ch.biology_branch === 'zoology' ? ch.biology_branch : null;
  const section = paperChapterSubjectLine(parentSubjectName, br);
  const parentSection = paperSubjectSectionLabel(parentSubjectName, null);
  if (section === parentSection) return base;
  return `${base} · ${section}`;
}
