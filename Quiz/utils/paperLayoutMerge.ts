import type { LayoutConfig } from '../types';

const PAPER_LAYOUT_DEFAULTS: LayoutConfig = {
  forcedBreaks: [],
  showIntroPage: false,
  showChapterListOnCover: true,
  includeExplanations: false,
  groupBySubject: true,
  showDifficulty: false,
  viewMode: 'scroll',
  figureSizes: {},
};

/**
 * Merge saved `layout_config` with defaults. Section headers (groupBySubject) default ON
 * unless the saved config explicitly sets `groupBySubject: false`.
 */
export function mergePaperLayout(raw: LayoutConfig | Record<string, unknown> | null | undefined): LayoutConfig {
  const base = PAPER_LAYOUT_DEFAULTS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...base };
  }
  const o = raw as Record<string, unknown>;
  const viewMode = o.viewMode === 'grid' ? 'grid' : o.viewMode === 'scroll' ? 'scroll' : base.viewMode;
  const forced =
    Array.isArray(o.forcedBreaks) && o.forcedBreaks.every((x) => typeof x === 'string')
      ? (o.forcedBreaks as string[])
      : base.forcedBreaks;
  const figures =
    o.figureSizes && typeof o.figureSizes === 'object' && !Array.isArray(o.figureSizes)
      ? (o.figureSizes as Record<string, 'small' | 'medium' | 'large'>)
      : base.figureSizes;

  return {
    ...base,
    forcedBreaks: forced,
    showIntroPage: typeof o.showIntroPage === 'boolean' ? o.showIntroPage : base.showIntroPage,
    showChapterListOnCover:
      typeof o.showChapterListOnCover === 'boolean' ? o.showChapterListOnCover : base.showChapterListOnCover,
    includeExplanations:
      typeof o.includeExplanations === 'boolean' ? o.includeExplanations : base.includeExplanations,
    groupBySubject: o.groupBySubject === false ? false : true,
    showDifficulty: typeof o.showDifficulty === 'boolean' ? o.showDifficulty : base.showDifficulty,
    viewMode,
    figureSizes: figures,
  };
}
