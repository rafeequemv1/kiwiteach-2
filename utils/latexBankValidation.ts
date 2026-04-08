import { parsePseudoLatexAndMath } from './latexParser';
import type { Question } from '../Quiz/types';

export type LatexFieldIssue = {
  field: string;
  /** Short raw excerpt for error messages */
  preview: string;
};

export type BankRowLike = {
  question_text?: unknown;
  options?: unknown;
  explanation?: unknown;
  column_a?: unknown;
  column_b?: unknown;
};

function htmlHasKatexError(html: string): boolean {
  return /\bkatex-error\b/i.test(html);
}

/**
 * Runs the same pseudo-LaTeX → KaTeX path as the student UI, then checks for KaTeX error nodes
 * (`katex-error` class), which appear when `throwOnError: false` but math failed to parse.
 */
export function validateBankQuestionStrings(input: BankRowLike): { ok: true } | { ok: false; issues: LatexFieldIssue[] } {
  const issues: LatexFieldIssue[] = [];

  const check = (field: string, raw: unknown) => {
    if (raw == null) return;
    const s = typeof raw === 'string' ? raw : String(raw);
    if (!s.trim()) return;
    const html = parsePseudoLatexAndMath(s);
    if (htmlHasKatexError(html)) {
      const preview = s.replace(/\s+/g, ' ').trim().slice(0, 140);
      issues.push({ field, preview: preview.length < s.length ? `${preview}…` : preview });
    }
  };

  check('question_text', input.question_text);
  check('explanation', input.explanation);

  const opts = input.options;
  if (Array.isArray(opts)) {
    opts.forEach((o, i) => check(`option_${i + 1}`, o));
  }

  const ca = input.column_a;
  if (Array.isArray(ca)) {
    ca.forEach((c, i) => check(`column_a_${i + 1}`, c));
  }

  const cb = input.column_b;
  if (Array.isArray(cb)) {
    cb.forEach((c, i) => check(`column_b_${i + 1}`, c));
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/** Non-throwing list of issues (empty if OK). */
export function getLatexIssuesForBankRow(row: BankRowLike): LatexFieldIssue[] {
  const v = validateBankQuestionStrings(row);
  return v.ok ? [] : v.issues;
}

export function validateQuestionLatexForBank(q: Question): { ok: true } | { ok: false; issues: LatexFieldIssue[] } {
  return validateBankQuestionStrings({
    question_text: q.text,
    options: q.options,
    explanation: q.explanation,
    column_a: q.columnA ?? q.column_a,
    column_b: q.columnB ?? q.column_b,
  });
}

/**
 * Throws if any row fails LaTeX validation (forge / review commit). Message lists up to a few failures.
 */
export function assertBankRowsPassLatexValidation(
  rows: BankRowLike[],
  context?: { chapterName?: string; hint?: string }
): void {
  const detailLines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const v = validateBankQuestionStrings({
      question_text: row.question_text,
      options: row.options,
      explanation: row.explanation,
      column_a: row.column_a,
      column_b: row.column_b,
    });
    if (!v.ok) {
      const fields = v.issues.map((it) => it.field).join(', ');
      const ex = v.issues[0]?.preview ?? '';
      const exShort = ex.length > 100 ? `${ex.slice(0, 100)}…` : ex;
      detailLines.push(
        exShort ? `Question ${i + 1} (${fields}) — "${exShort}"` : `Question ${i + 1} (${fields})`
      );
    }
  }
  if (detailLines.length === 0) return;

  const head = context?.chapterName
    ? `LaTeX render check failed before save (${context.chapterName}).`
    : 'LaTeX render check failed before save.';
  const tail =
    context?.hint ??
    'Regenerate or edit stems/options/explanations so KaTeX can render them (see Question DB · LaTeX check).';
  const body = detailLines.slice(0, 6).join('\n');
  const more = detailLines.length > 6 ? `\n… and ${detailLines.length - 6} more question(s).` : '';
  console.warn('[latexBankValidation]', head, detailLines);
  throw new Error(`${head}\n${body}${more}\n\n${tail}`);
}
