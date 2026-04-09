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
  return Math.min(420, Math.max(n * 8, n + 48));
}

/**
 * Pick `need` questions by round-robin across topic_tag buckets so one subtopic does not dominate.
 * Falls back to arbitrary order if buckets are exhausted.
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

  const tryTakeOne = (): boolean => {
    for (const k of keys) {
      const b = buckets.get(k)!;
      while (b.length > 0) {
        const q = b.pop()!;
        const id = String(q.originalId || q.id);
        if (used.has(id)) continue;
        used.add(id);
        picked.push(q);
        return true;
      }
    }
    return false;
  };

  while (picked.length < need) {
    if (!tryTakeOne()) break;
  }

  if (picked.length < need) {
    for (const q of pool) {
      if (picked.length >= need) break;
      const id = String(q.originalId || q.id);
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
