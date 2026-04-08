/**
 * Stem truncation + column recovery for printed question papers (Result screen + LaTeX lab).
 */

/** Row labels for matching tables: P, Q, R, S, … (aligns with typical option keying). */
export function matchingRowLetter(index: number): string {
  return String.fromCharCode(80 + Math.max(0, index));
}

export const ROMAN_ROW_SUFFIX = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'] as const;

/**
 * When columnA/columnB arrays exist, question text often repeats those lists after a
 * "Column A" / "Column I" header. The paper layout shows a single table instead.
 */
export function matchingStemTextForPaper(raw: string): string {
  let t = (raw || '').replace(/<br\s*\/?>/gi, '\n').trim();
  if (!t) return t;
  t = t.replace(/\\n(?=\s*Column\s+[AB]\b)/gi, '\n');
  t = t.replace(/\\n(?=\s*List\s+(?:[IV]|[12])\b)/gi, '\n');
  let cut = t.length;
  const blockStarts = [
    /\r?\n\s*Column\s+A\b[\s\S]*$/i,
    /\r?\n\s*Column\s+I\b[\s\S]*$/i,
    /\r?\n\s*Column\s+II\b[\s\S]*$/i,
    /\r?\n\s*Column\s+1\b[\s\S]*$/i,
  ];
  for (const re of blockStarts) {
    const m = re.exec(t);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  if (cut < t.length) {
    return t
      .slice(0, cut)
      .replace(/[:\s\u3000]+$/g, '')
      .trim();
  }
  return t;
}

/** Split "(P) … (Q) …" / "(i) … (ii) …" bodies into row cells (labels stripped). */
function parseMatchingListItems(body: string): string[] {
  const text = (body || '').trim();
  if (!text) return [];
  return text
    .split(/\s*(?=\([a-z0-9]+\))/gi)
    .map((s) => s.trim().replace(/^\([a-z0-9]+\)\s*/i, ''))
    .filter(Boolean);
}

type ExtractedMatchingColumns = {
  stem: string;
  colA: string[];
  colB: string[];
  headerLeft: string;
  headerRight: string;
};

/**
 * When the model puts Column A/B (or I/II) in the stem but omits columnA/columnB arrays or mis-tags type,
 * recover rows so the paper can still render a table.
 */
export function extractMatchingColumnsFromQuestionText(raw: string): ExtractedMatchingColumns | null {
  let t = (raw || '').replace(/<br\s*\/?>/gi, '\n').trim();
  if (!t) return null;
  t = t.replace(/\\n(?=\s*Column\s+[AB]\b)/gi, '\n');
  t = t.replace(/\\n(?=\s*Column\s+[IVX]+\b)/gi, '\n');

  const tryPair = (
    labelA: string,
    labelB: string,
    headerLeft: string,
    headerRight: string
  ): ExtractedMatchingColumns | null => {
    const reA = new RegExp(`(?:^|\\r?\\n)\\s*Column\\s+${labelA}\\b`, 'i');
    const reB = new RegExp(`(?:^|\\r?\\n)\\s*Column\\s+${labelB}\\b`, 'i');
    const idxA = t.search(reA);
    const idxB = t.search(reB);
    if (idxA === -1 || idxB === -1 || idxB <= idxA) return null;
    const stem = t.slice(0, idxA).replace(/[:\s\u3000]+$/g, '').trim();
    const stripLeadingCol = (label: string) =>
      new RegExp(`^[\\s\\r\\n]*Column\\s+${label}\\s*:?\\s*`, 'i');
    const afterA = t.slice(idxA).replace(stripLeadingCol(labelA), '');
    const relB = afterA.search(reB);
    if (relB === -1) return null;
    const colAText = afterA.slice(0, relB).trim();
    const afterB = afterA.slice(relB).replace(stripLeadingCol(labelB), '');
    let colBText = afterB.trim();
    const optLine = colBText.search(/\r?\n\s*\([1-9]\d?\)\s+\S/);
    if (optLine !== -1) colBText = colBText.slice(0, optLine).trim();
    const colA = parseMatchingListItems(colAText);
    const colB = parseMatchingListItems(colBText);
    if (colA.length === 0 || colB.length === 0) return null;
    return { stem, colA, colB, headerLeft, headerRight };
  };

  return (
    tryPair('A', 'B', 'Column A', 'Column B') ??
    tryPair('I', 'II', 'Column I', 'Column II') ??
    null
  );
}

export type MatchingPaperResolved = {
  colA: string[];
  colB: string[];
  stemForPaper: string;
  headerLeft: string;
  headerRight: string;
};

export function resolveMatchingPaperColumns(q: {
  text?: string;
  columnA?: string[];
  columnB?: string[];
  column_a?: string[];
  column_b?: string[];
}): MatchingPaperResolved | null {
  const rawText = String(q.text || '');
  const fromA = q.columnA || q.column_a;
  const fromB = q.columnB || q.column_b;
  if (fromA?.length && fromB?.length) {
    return {
      colA: fromA,
      colB: fromB,
      stemForPaper: matchingStemTextForPaper(rawText),
      headerLeft: 'Column A',
      headerRight: 'Column B',
    };
  }
  const extracted = extractMatchingColumnsFromQuestionText(rawText);
  if (!extracted) return null;
  return {
    colA: extracted.colA,
    colB: extracted.colB,
    stemForPaper: extracted.stem,
    headerLeft: extracted.headerLeft,
    headerRight: extracted.headerRight,
  };
}
