import React from 'react';

/** Accepts get_chapters_bulk_stats rows or TestCreatorView-normalized stats. */
export interface ChapterStatsChipsInput {
  total?: number;
  total_count?: number;
  easy_count?: number;
  medium_count?: number;
  hard_count?: number;
  easy?: number;
  medium?: number;
  hard?: number;
  mcq_count?: number;
  reasoning_count?: number;
  matching_count?: number;
  statements_count?: number;
  mcq?: number;
  reasoning?: number;
  matching?: number;
  statements?: number;
  figure_count?: number;
  figures?: number;
}

function Chip({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  if (value <= 0) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[6px] font-black uppercase tracking-tighter ${className}`}>
      {label}:{value}
    </span>
  );
}

export const ChapterStatChips: React.FC<{
  stats: ChapterStatsChipsInput | null | undefined;
  /** Tighter top margin for nested list rows */
  dense?: boolean;
  /** Use light chips on indigo/emerald selected rows (Test Creator sidebar) */
  onColoredBackground?: boolean;
}> = ({ stats, dense, onColoredBackground }) => {
  if (!stats) return null;
  const total = Number(stats.total ?? stats.total_count) || 0;
  const e = Number(stats.easy_count ?? stats.easy) || 0;
  const m = Number(stats.medium_count ?? stats.medium) || 0;
  const h = Number(stats.hard_count ?? stats.hard) || 0;
  const mcq = Number(stats.mcq_count ?? stats.mcq) || 0;
  const r = Number(stats.reasoning_count ?? stats.reasoning) || 0;
  const mt = Number(stats.matching_count ?? stats.matching) || 0;
  const st = Number(stats.statements_count ?? stats.statements) || 0;
  const fig = Number(stats.figure_count ?? stats.figures) || 0;

  const hasDiffOrType = e + m + h + mcq + r + mt + st > 0;
  const inv = onColoredBackground;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${dense ? 'mt-1' : 'mt-2'}`}>
      <span
        className={`rounded px-1.5 py-0.5 text-[6px] font-black uppercase tracking-tighter ${
          inv
            ? total > 0
              ? 'border border-white/40 bg-white/20 text-white'
              : 'border border-white/25 bg-white/10 text-white/80'
            : total > 0
              ? 'bg-zinc-900 text-white'
              : 'border border-zinc-200 bg-zinc-50 text-zinc-400'
        }`}
      >
        {total} Q
      </span>
      {hasDiffOrType && (
        <>
          <Chip
            label="E"
            value={e}
            className={
              inv
                ? 'border border-emerald-200/40 bg-emerald-500/25 text-emerald-50'
                : 'border border-emerald-100 bg-emerald-50 text-emerald-700'
            }
          />
          <Chip
            label="M"
            value={m}
            className={
              inv ? 'border border-amber-200/40 bg-amber-500/25 text-amber-50' : 'border border-amber-100 bg-amber-50 text-amber-800'
            }
          />
          <Chip
            label="H"
            value={h}
            className={inv ? 'border border-rose-200/40 bg-rose-500/25 text-rose-50' : 'border border-rose-100 bg-rose-50 text-rose-700'}
          />
          <Chip
            label="MCQ"
            value={mcq}
            className={
              inv ? 'border border-white/30 bg-white/15 text-white' : 'border border-indigo-100 bg-indigo-50 text-indigo-700'
            }
          />
          <Chip
            label="ASR"
            value={r}
            className={
              inv ? 'border border-violet-200/40 bg-violet-500/25 text-violet-50' : 'border border-violet-100 bg-violet-50 text-violet-700'
            }
          />
          <Chip
            label="MT"
            value={mt}
            className={
              inv ? 'border border-cyan-200/40 bg-cyan-500/25 text-cyan-50' : 'border border-cyan-100 bg-cyan-50 text-cyan-800'
            }
          />
          <Chip
            label="ST"
            value={st}
            className={
              inv ? 'border border-white/25 bg-white/10 text-white/90' : 'border border-zinc-200 bg-zinc-100 text-zinc-600'
            }
          />
        </>
      )}
      {fig > 0 && (
        <span
          className={`rounded px-1.5 py-0.5 text-[6px] font-black uppercase tracking-tighter ${
            inv ? 'border border-white/30 bg-white/15 text-white' : 'border border-indigo-100 bg-indigo-50 text-indigo-600'
          }`}
        >
          FIG:{fig}
        </span>
      )}
    </div>
  );
};
