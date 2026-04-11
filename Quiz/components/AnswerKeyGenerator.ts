import { Question } from '../types';
import { matchingRowLetter, ROMAN_ROW_SUFFIX } from '../../utils/matchingPaperColumns';

/** Letter form (A)(B) for MCQ; arrow form for matching. */
export function formatCorrectAnswerShort(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    const parts = q.correctMatches.map((bIdx, aIdx) => {
      const r = ROMAN_ROW_SUFFIX[bIdx] ?? String(bIdx + 1);
      return `${matchingRowLetter(aIdx)}→${r}`;
    });
    return parts.join(', ');
  }
  const idx = Math.max(0, Math.min(25, q.correctIndex ?? 0));
  return `(${String.fromCharCode(65 + idx)})`;
}

/** One-column answer key row: numeric option index; matching uses letter map. */
export function answerDisplayForCompactRow(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    return formatCorrectAnswerShort(q);
  }
  return String((q.correctIndex ?? 0) + 1);
}

/** Bold answer line for print / explanations: `Ans: (1)` or matching map. */
export function answerKeyAnswerLine(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    return `Ans: ${formatCorrectAnswerShort(q)}`;
  }
  return `Ans: (${(q.correctIndex ?? 0) + 1})`;
}
