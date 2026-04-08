import React from 'react';
import type { Question } from '../../Quiz/types';
import { PaperRich } from '../../utils/paperRich';
import {
  matchingRowLetter,
  ROMAN_ROW_SUFFIX,
  resolveMatchingPaperColumns,
} from '../../utils/matchingPaperColumns';

type Props = {
  questions: Question[];
};

/**
 * Full-width “mini question paper” using the same {@link PaperRich} pipeline as Result / print preview.
 */
const LatexLabPaperDemoPanel: React.FC<Props> = ({ questions }) => {
  return (
    <div className="pb-10">
      <div
        className="mx-auto overflow-hidden rounded-sm border-[1.5pt] border-black bg-white shadow-md"
        style={{ maxWidth: '210mm' }}
      >
        <div className="border-b-[0.5pt] border-black bg-zinc-50 px-4 py-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-black">
            LaTeX lab · demo question paper
          </h3>
          <p className="mt-1 text-[10px] leading-snug text-zinc-600">
            Same path as test paper preview:{' '}
            <span className="font-mono text-[9px] text-zinc-800">PaperRich</span> →{' '}
            <span className="font-mono text-[9px] text-zinc-800">parsePseudoLatexAndMath</span> → KaTeX (+ mhchem{' '}
            <span className="font-mono text-[9px]">\\ce</span>). No SMILES canvas.
          </p>
        </div>

        <div className="space-y-5 px-5 py-5 text-black">
          {questions.map((q, idx) => {
            const matching = resolveMatchingPaperColumns(q);
            const colA = matching?.colA;
            const colB = matching?.colB;
            const stem = matching?.stemForPaper ?? String(q.text || '');
            const headL = matching?.headerLeft ?? 'Column A';
            const headR = matching?.headerRight ?? 'Column B';
            const opts = Array.isArray(q.options) ? q.options : [];
            const stable = q.id || `demo-${idx}`;

            return (
              <article
                key={stable}
                className="border-b border-zinc-200 pb-5 last:border-b-0 last:pb-0"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-black bg-white px-1.5 py-0.5 text-[9px] font-black text-black">
                    Q{idx + 1}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-700">
                    {q.type}
                  </span>
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-900">
                    {q.difficulty}
                  </span>
                  {q.topic_tag ? (
                    <span className="text-[9px] text-zinc-500">{q.topic_tag}</span>
                  ) : null}
                </div>

                <div className="flex gap-2 items-start leading-tight">
                  <b className="shrink-0 tabular-nums text-black">{idx + 1}.</b>
                  <div className="min-w-0 flex-1 text-[13px] text-black">
                    <div className="math-content break-words leading-snug [&_.katex]:text-inherit">
                      <PaperRich key={`stem-${stable}`} text={stem} />
                    </div>
                  </div>
                </div>

                {colA && colB && colA.length > 0 ? (
                  <div className="ml-6 mt-3 border border-black overflow-hidden rounded-sm">
                    <table
                      className="w-full border-collapse text-[12px] text-black"
                      style={{ fontSize: '0.9em' }}
                    >
                      <thead>
                        <tr className="border-b-[0.5pt] border-black bg-zinc-50">
                          <th className="w-1/2 border-r-[0.5pt] border-black px-2 py-1.5 text-left font-bold">
                            {headL}
                          </th>
                          <th className="w-1/2 px-2 py-1.5 text-left font-bold">{headR}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {colA.map((ca, i) => (
                          <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                            <td className="border-r-[0.5pt] border-black px-2 py-1.5 align-top">
                              <span className="font-semibold">({matchingRowLetter(i)})</span>{' '}
                              <span className="math-content inline [&_.katex]:text-inherit">
                                <PaperRich key={`ca-${stable}-${i}`} text={ca} />
                              </span>
                            </td>
                            <td className="px-2 py-1.5 align-top">
                              <span className="font-semibold">
                                ({ROMAN_ROW_SUFFIX[i] ?? i + 1})
                              </span>{' '}
                              <span className="math-content inline [&_.katex]:text-inherit">
                                <PaperRich key={`cb-${stable}-${i}`} text={colB[i] || ''} />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {opts.length > 0 ? (
                  <div className="ml-6 mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    {opts.map((o, oi) => (
                      <div key={oi} className="flex gap-2 text-[12px] font-medium leading-snug text-black">
                        <span className="shrink-0">({oi + 1})</span>
                        <span className="math-content min-w-0 [&_.katex]:text-inherit">
                          <PaperRich key={`opt-${stable}-${oi}`} text={o} className="min-w-0" />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {q.explanation ? (
                  <div className="ml-6 mt-3 rounded border border-zinc-200 bg-zinc-50/80 px-3 py-2">
                    <p className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                      Explanation (demo)
                    </p>
                    <div className="math-content text-[11px] leading-snug text-zinc-800 [&_.katex]:text-inherit">
                      <PaperRich key={`exp-${stable}`} text={q.explanation} />
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LatexLabPaperDemoPanel;
