import type { Question } from '../types';

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function topicKeyForQuestion(q: Question): string {
  const t = q.topic_tag;
  if (t != null && String(t).trim() !== '') return String(t).trim().toLowerCase();
  return '__untagged__';
}

export function questionHasFigure(q: Question): boolean {
  const u = q.figureDataUrl || (q as { figure_url?: string | null }).figure_url;
  return typeof u === 'string' && u.trim().length > 0;
}

/** Fetch enough rows from the bank/RPC so we can pick a diverse subset client-side. */
export function eligibleOversampleLimit(need: number): number {
  const n = Math.max(1, need);
  return Math.min(600, Math.max(n * 12, n + 64));
}

/** Larger pool for figure-only queries (rare in bank vs text-only). */
export function figureEligibleOversampleLimit(need: number): number {
  const n = Math.max(1, need);
  return Math.min(2500, Math.max(n * 100, n + 200, 500));
}

const STYLE_KEYS = ['mcq', 'reasoning', 'matching', 'statements'] as const;
export type BankStyleKey = (typeof STYLE_KEYS)[number];

/**
 * After picking figure questions (any style), how many non-figure slots remain per style
 * so totals still match `neededFromBank`, with redistribution if figures skew types.
 */
export function remainingStylePlanAfterFigures(
  planFull: Record<BankStyleKey, number>,
  figPicked: Question[],
  rem: number
): Record<BankStyleKey, number> {
  const figBy: Record<BankStyleKey, number> = {
    mcq: 0,
    reasoning: 0,
    matching: 0,
    statements: 0,
  };
  for (const q of figPicked) {
    const t = (q.type || 'mcq') as string;
    const k = (STYLE_KEYS as readonly string[]).includes(t) ? (t as BankStyleKey) : 'mcq';
    figBy[k]++;
  }
  const out: Record<BankStyleKey, number> = {
    mcq: Math.max(0, planFull.mcq - figBy.mcq),
    reasoning: Math.max(0, planFull.reasoning - figBy.reasoning),
    matching: Math.max(0, planFull.matching - figBy.matching),
    statements: Math.max(0, planFull.statements - figBy.statements),
  };
  let s = STYLE_KEYS.reduce((acc, k) => acc + out[k], 0);
  if (s === rem) return out;
  if (s < rem) {
    let diff = rem - s;
    let i = 0;
    while (diff > 0 && i < 500) {
      const k = STYLE_KEYS[i % STYLE_KEYS.length];
      out[k]++;
      diff--;
      i++;
    }
    return out;
  }
  let diff = s - rem;
  let guard = 0;
  while (diff > 0 && guard++ < 500) {
    let best: BankStyleKey = 'mcq';
    let bestVal = -1;
    for (const k of STYLE_KEYS) {
      if (out[k] > bestVal) {
        bestVal = out[k];
        best = k;
      }
    }
    if (out[best] > 0) {
      out[best]--;
      diff--;
    } else {
      break;
    }
  }
  return out;
}

function qid(q: Question): string {
  return String(q.originalId || q.id);
}

/**
 * Pick `need` questions using **uniform topic spread**: always prefer the `topic_tag` bucket with the
 * fewest picks so far (water-filling), maximizing how many distinct topics appear and keeping counts even.
 * Falls back to any remaining pool order if buckets are exhausted.
 */
export function selectQuestionsMaxTopicSpread(pool: Question[], need: number): Question[] {
  if (need <= 0) return [];
  if (pool.length <= need) return [...pool];

  const buckets = new Map<string, Question[]>();
  for (const q of pool) {
    const k = topicKeyForQuestion(q);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(q);
  }
  for (const arr of buckets.values()) shuffleInPlace(arr);

  const keys = [...buckets.keys()];
  shuffleInPlace(keys);

  const picked: Question[] = [];
  const used = new Set<string>();
  const pickedCount = new Map<string, number>();
  for (const k of keys) pickedCount.set(k, 0);

  const pruneUsedFromBucket = (k: string): void => {
    const b = buckets.get(k)!;
    while (b.length > 0) {
      const id = qid(b[b.length - 1]);
      if (used.has(id)) b.pop();
      else break;
    }
  };

  while (picked.length < need) {
    let bestK: string | null = null;
    let bestCount = Infinity;
    let bestRemain = -1;

    for (const k of keys) {
      pruneUsedFromBucket(k);
      const b = buckets.get(k)!;
      if (b.length === 0) continue;
      const c = pickedCount.get(k) ?? 0;
      const remain = b.length;
      if (c < bestCount || (c === bestCount && remain > bestRemain)) {
        bestCount = c;
        bestRemain = remain;
        bestK = k;
      }
    }

    if (bestK === null) break;

    const b = buckets.get(bestK)!;
    const q = b.pop()!;
    const id = qid(q);
    if (used.has(id)) continue;
    used.add(id);
    picked.push(q);
    pickedCount.set(bestK, (pickedCount.get(bestK) ?? 0) + 1);
  }

  if (picked.length < need) {
    for (const q of pool) {
      if (picked.length >= need) break;
      const id = qid(q);
      if (used.has(id)) continue;
      used.add(id);
      picked.push(q);
    }
  }

  return picked.slice(0, need);
}

/**
 * Split global figure quota across chapters by question count (largest remainder).
 */
export function allocateFigureSlotsByChapter(
  rows: { id: string; count: number }[],
  globalFigureCount?: number | null
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.id, 0);
  const total = rows.reduce((s, r) => s + Math.max(0, r.count), 0);
  const rawG = globalFigureCount == null || !Number.isFinite(Number(globalFigureCount)) ? 0 : Number(globalFigureCount);
  const G = Math.max(0, Math.min(Math.floor(rawG), total));
  if (total <= 0 || G <= 0) return out;

  const weights = rows.map((r) => ({ ...r, w: Math.max(0, r.count) }));
  const sumW = weights.reduce((s, r) => s + r.w, 0);
  if (sumW <= 0) return out;

  const parts = weights.map((r) => {
    const raw = (G * r.w) / sumW;
    return { id: r.id, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let assigned = parts.reduce((s, p) => s + p.floor, 0);
  let rem = G - assigned;
  parts.forEach((p) => out.set(p.id, p.floor));
  const order = [...parts].sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (rem > 0 && i < order.length * 4) {
    const p = order[i % order.length];
    const cap = weights.find((w) => w.id === p.id)?.w ?? 0;
    if ((out.get(p.id) ?? 0) < cap) {
      out.set(p.id, (out.get(p.id) ?? 0) + 1);
      rem--;
    }
    i++;
  }
  return out;
}
