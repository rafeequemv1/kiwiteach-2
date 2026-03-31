/**
 * Deterministic MCQ extraction from exam-style plain text (DOCX → text with IMAGE_N).
 * No AI — best for papers with clear numbering, (A)–(D) or (1)–(4) options, and Ans/Key lines.
 */

export type LocalMcqRow = {
  source_question_number: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  doc_image_index: number | null;
};

function normalizeCorrectLetter(c: string): 'A' | 'B' | 'C' | 'D' {
  const t = c.trim();
  if (/^[1-4]$/.test(t)) return (['A', 'B', 'C', 'D'] as const)[parseInt(t, 10) - 1];
  const u = t.toUpperCase();
  if (u === 'A' || u === 'B' || u === 'C' || u === 'D') return u;
  return 'A';
}

/** 0-based index for Reference drafts. */
export function correctLetterToIndex(letter: string): number {
  const L = normalizeCorrectLetter(letter);
  return Math.max(0, Math.min(3, L.charCodeAt(0) - 65));
}

function firstImageIndex(text: string): number | null {
  const m = text.match(/\bIMAGE_(\d+)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Collect numbered question starts: "12. Stem" / "3) Stem" */
function collectQuestionHits(full: string): { num: string; prefixEnd: number; blockStart: number }[] {
  const text = full.replace(/\r\n/g, '\n');
  const re = /(?:^|\n)\s*(\d{1,4})\s*[.)]\s+/g;
  const hits: { num: string; prefixEnd: number; blockStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      num: m[1],
      prefixEnd: m.index + m[0].length,
      blockStart: m.index,
    });
  }
  return hits;
}

function splitQuestionBodies(full: string): { num: string; body: string }[] {
  const text = full.replace(/\r\n/g, '\n');
  const hits = collectQuestionHits(text);
  const blocks: { num: string; body: string }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].blockStart : text.length;
    const body = text.slice(hits[i].prefixEnd, end).trim();
    if (body.length > 0) blocks.push({ num: hits[i].num, body });
  }
  return blocks;
}

function stripAnswerLine(body: string): { work: string; correct: string; explanation: string } {
  let work = body.trim();
  let explanation = '';
  let correct = 'A';
  const ansRe =
    /(?:^|\n)\s*(?:Ans(?:wer)?|Correct(?:\s+answer)?|Key|Sol(?:ution)?)\s*[.:]\s*\(?([A-Da-d1-4])\)?(?:[^\n]*)?/gim;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = ansRe.exec(work)) !== null) last = m;
  if (last) {
    correct = last[1];
    const tail = work.slice(last.index + last[0].length).trim();
    if (tail.length > 0) explanation = tail;
    work = work.slice(0, last.index).trim();
  }
  return { work, correct: normalizeCorrectLetter(correct), explanation };
}

/** Try (1)…(2)…(3)…(4) or (A)…(B)…(C)…(D) in one blob */
function tryParenDelimited(work: string): { stem: string; a: string; b: string; c: string; d: string } | null {
  const t = work.trim();
  const num =
    /^([\s\S]*?)\(\s*1\s*\)\s*([\s\S]+?)\s*\(\s*2\s*\)\s*([\s\S]+?)\s*\(\s*3\s*\)\s*([\s\S]+?)\s*\(\s*4\s*\)\s*([\s\S]+)$/im.exec(t);
  if (num) {
    const stem = num[1].trim();
    const a = num[2].trim();
    const b = num[3].trim();
    const c = num[4].trim();
    const d = num[5].trim();
    if (!stem || !a || !b || !c || !d) return null;
    return { stem, a, b, c, d };
  }
  const letPat =
    /^([\s\S]*?)\(\s*A\s*\)\s*([\s\S]+?)\s*\(\s*B\s*\)\s*([\s\S]+?)\s*\(\s*C\s*\)\s*([\s\S]+?)\s*\(\s*D\s*\)\s*([\s\S]+)$/im.exec(t);
  if (letPat) {
    const stem = letPat[1].trim();
    const a = letPat[2].trim();
    const b = letPat[3].trim();
    const c = letPat[4].trim();
    const d = letPat[5].trim();
    if (!stem || !a || !b || !c || !d) return null;
    return { stem, a, b, c, d };
  }
  return null;
}

const OPT_LINE = /^\s*\(?([A-Da-d1-4])\)?[\s.)]+\s*(.+)$/;

function tryLineOptions(work: string): { stem: string; a: string; b: string; c: string; d: string } | null {
  const lines = work
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let optIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (OPT_LINE.test(lines[i])) {
      optIdx = i;
      break;
    }
  }
  if (optIdx === -1) return null;
  const stem = lines.slice(0, optIdx).join('\n').trim();
  const oLines = lines.slice(optIdx);
  type Pair = { k: string; v: string };
  const pairs: Pair[] = [];
  for (const row of oLines) {
    const rm = row.match(OPT_LINE);
    if (rm) pairs.push({ k: rm[1].toUpperCase(), v: rm[2].trim() });
  }
  if (pairs.length < 4) return null;
  const map = new Map<string, string>();
  for (const p of pairs) {
    let key = p.k;
    if (/^[1-4]$/.test(key)) key = ['A', 'B', 'C', 'D'][parseInt(key, 10) - 1];
    if (key === 'A' || key === 'B' || key === 'C' || key === 'D') map.set(key, p.v);
  }
  const a = map.get('A') || '';
  const b = map.get('B') || '';
  const c = map.get('C') || '';
  const d = map.get('D') || '';
  if (!a.trim() || !b.trim() || !c.trim() || !d.trim()) return null;
  return { stem, a, b, c, d };
}

function parseOneBlock(body: string, source_question_number: string): LocalMcqRow | null {
  const stripped = stripAnswerLine(body);
  const work = stripped.work;
  if (work.length < 8) return null;

  const del = tryParenDelimited(work);
  const line = del ?? tryLineOptions(work);
  if (!line) return null;
  const stem = line.stem.trim();
  if (stem.length < 2) return null;

  const question_text = stem.trim();
  const img = firstImageIndex(question_text + '\n' + line.a + line.b + line.c + line.d);

  return {
    source_question_number,
    question_text,
    option_a: line.a,
    option_b: line.b,
    option_c: line.c,
    option_d: line.d,
    correct_answer: stripped.correct,
    explanation: stripped.explanation.trim(),
    doc_image_index: img,
  };
}

/**
 * Extract rows from full document text. Skips blocks that do not match a simple MCQ layout.
 */
export function extractLocalMcqRowsFromText(fullText: string): LocalMcqRow[] {
  const text = String(fullText ?? '').replace(/\r\n/g, '\n');
  const blocks = splitQuestionBodies(text);
  const out: LocalMcqRow[] = [];
  for (const b of blocks) {
    const row = parseOneBlock(b.body, b.num);
    if (row) out.push(row);
  }
  return out;
}
