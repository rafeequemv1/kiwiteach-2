import { supabase } from '../../supabase/client';
import {
  mindMapCacheGet,
  mindMapCacheSet,
  mindMapRpcMissingGet,
  mindMapRpcMissingSet,
} from './questionBankMindmapCache';

export type MindMapKbRow = { kb_id: string; kb_name: string; question_count: number };
export type MindMapClassRow = { class_id: string; class_name: string; question_count: number };
export type MindMapSubjectRow = { subject_id: string; subject_name: string; question_count: number };
export type MindMapChapterRow = {
  chapter_id: string;
  chapter_name: string;
  chapter_number: number | null;
  question_count: number;
};
export type MindMapTopicRow = { topic_label: string; question_count: number };

const K_ROOT = 'roots';
const K_CLASSES = (kbId: string) => `classes:${kbId}`;
const K_SUBJECTS = (classId: string) => `subjects:${classId}`;
const K_CHAPTERS = (subjectId: string) => `chapters:${subjectId}`;
const K_TOPICS = (chapterId: string) => `topics:${chapterId}`;

const IN_CHUNK = 80;
const COUNT_CONCURRENCY = 10;

function n(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

/** Human-readable Supabase / PostgREST errors (never "[object Object]"). */
export function formatMindMapError(e: unknown): string {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as Record<string, unknown>;
  const parts = [o.message, o.details, o.hint, o.code].filter(
    (x) => x != null && String(x).trim() !== ''
  );
  if (parts.length) return parts.map(String).join(' — ');
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isMindMapRpcUnavailable(e: unknown): boolean {
  const o = e as { code?: string; message?: string; status?: number };
  if (o?.status === 404) return true;
  const code = String(o?.code || '');
  if (code === 'PGRST202' || code === 'PGRST204' || code === '42883') return true;
  const msg = String(o?.message || '').toLowerCase();
  if (msg.includes('404')) return true;
  if (msg.includes('could not find the function')) return true;
  if (msg.includes('schema cache')) return true;
  if (msg.includes('not found')) return true;
  return false;
}

async function countQuestionsInChapterIds(chapterIds: string[]): Promise<number> {
  if (chapterIds.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < chapterIds.length; i += IN_CHUNK) {
    const slice = chapterIds.slice(i, i + IN_CHUNK);
    const { count, error } = await supabase
      .from('question_bank_neet')
      .select('*', { count: 'exact', head: true })
      .in('chapter_id', slice);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

async function countQuestionsPerChapter(chapterIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (let i = 0; i < chapterIds.length; i += COUNT_CONCURRENCY) {
    const slice = chapterIds.slice(i, i + COUNT_CONCURRENCY);
    await Promise.all(
      slice.map(async (id) => {
        const { count, error } = await supabase
          .from('question_bank_neet')
          .select('*', { count: 'exact', head: true })
          .eq('chapter_id', id);
        if (error) throw error;
        m.set(id, count ?? 0);
      })
    );
  }
  return m;
}

// --- Client fallbacks when RPCs are not deployed (404 / PGRST202) ---

async function fallbackKnowledgeBases(): Promise<MindMapKbRow[]> {
  const { data: kbs, error: e1 } = await supabase.from('knowledge_bases').select('id,name').order('name');
  if (e1) throw e1;
  const { data: chaps, error: e2 } = await supabase.from('chapters').select('id,kb_id');
  if (e2) throw e2;
  const byKb = new Map<string, string[]>();
  for (const c of chaps || []) {
    const kb = String((c as { kb_id?: string }).kb_id || '');
    if (!kb) continue;
    if (!byKb.has(kb)) byKb.set(kb, []);
    byKb.get(kb)!.push(String((c as { id: string }).id));
  }
  const out: MindMapKbRow[] = [];
  for (const kb of kbs || []) {
    const ids = byKb.get(kb.id) || [];
    const question_count = await countQuestionsInChapterIds(ids);
    out.push({
      kb_id: String(kb.id),
      kb_name: String((kb as { name?: string }).name ?? ''),
      question_count,
    });
  }
  return out;
}

async function fallbackClasses(kbId: string): Promise<MindMapClassRow[]> {
  const { data: classes, error: e1 } = await supabase
    .from('kb_classes')
    .select('id,name')
    .eq('kb_id', kbId)
    .order('name');
  if (e1) throw e1;
  const out: MindMapClassRow[] = [];
  for (const cl of classes || []) {
    const classId = String((cl as { id: string }).id);
    const { data: subs, error: e2 } = await supabase.from('subjects').select('id').eq('class_id', classId);
    if (e2) throw e2;
    const subIds = (subs || []).map((s) => String((s as { id: string }).id));
    let chapterIds: string[] = [];
    if (subIds.length > 0) {
      const { data: chaps, error: e3 } = await supabase
        .from('chapters')
        .select('id')
        .eq('kb_id', kbId)
        .in('subject_id', subIds);
      if (e3) throw e3;
      chapterIds = (chaps || []).map((c) => String((c as { id: string }).id));
    }
    const question_count = await countQuestionsInChapterIds(chapterIds);
    out.push({
      class_id: classId,
      class_name: String((cl as { name?: string }).name ?? ''),
      question_count,
    });
  }
  return out;
}

async function fallbackSubjects(classId: string): Promise<MindMapSubjectRow[]> {
  const { data: subjects, error: e1 } = await supabase
    .from('subjects')
    .select('id,name')
    .eq('class_id', classId)
    .order('name');
  if (e1) throw e1;
  const out: MindMapSubjectRow[] = [];
  for (const su of subjects || []) {
    const sid = String((su as { id: string }).id);
    const { data: chaps, error: e2 } = await supabase.from('chapters').select('id').eq('subject_id', sid);
    if (e2) throw e2;
    const chapterIds = (chaps || []).map((c) => String((c as { id: string }).id));
    const question_count = await countQuestionsInChapterIds(chapterIds);
    out.push({
      subject_id: sid,
      subject_name: String((su as { name?: string }).name ?? ''),
      question_count,
    });
  }
  return out;
}

async function fallbackChapters(subjectId: string): Promise<MindMapChapterRow[]> {
  const { data: chaps, error: e1 } = await supabase
    .from('chapters')
    .select('id,name,chapter_number')
    .eq('subject_id', subjectId)
    .order('chapter_number', { ascending: true, nullsFirst: false })
    .order('name');
  if (e1) throw e1;
  const rows = chaps || [];
  const ids = rows.map((c) => String((c as { id: string }).id));
  const counts = await countQuestionsPerChapter(ids);
  return rows.map((c) => {
    const id = String((c as { id: string }).id);
    const num = (c as { chapter_number?: number | null }).chapter_number;
    return {
      chapter_id: id,
      chapter_name: String((c as { name?: string }).name ?? ''),
      chapter_number: num == null ? null : n(num),
      question_count: counts.get(id) ?? 0,
    };
  });
}

async function fallbackTopicTags(chapterId: string): Promise<MindMapTopicRow[]> {
  const PAGE = 1000;
  const tallies = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('question_bank_neet')
      .select('topic_tag')
      .eq('chapter_id', chapterId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const raw = (row as { topic_tag?: string | null }).topic_tag;
      const label = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '(untagged)';
      tallies.set(label, (tallies.get(label) || 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return [...tallies.entries()]
    .map(([topic_label, question_count]) => ({ topic_label, question_count }))
    .sort((a, b) => a.topic_label.localeCompare(b.topic_label));
}

type RpcResult = { data: unknown; error: { message?: string; code?: string; status?: number } | null };

async function rpcOrFallback<T>(rpcCall: () => PromiseLike<RpcResult>, fallback: () => Promise<T>): Promise<T> {
  if (mindMapRpcMissingGet()) {
    return fallback();
  }
  const { data, error } = (await rpcCall()) as RpcResult;
  if (error) {
    if (isMindMapRpcUnavailable(error)) {
      mindMapRpcMissingSet();
      return fallback();
    }
    throw error;
  }
  return data as T;
}

export async function fetchMindMapKnowledgeBases(opts?: { bypassCache?: boolean }): Promise<MindMapKbRow[]> {
  if (!opts?.bypassCache) {
    const hit = mindMapCacheGet<MindMapKbRow[]>(K_ROOT);
    if (hit) return hit;
  }
  const rows = await rpcOrFallback(
    async () => supabase.rpc('question_bank_mindmap_knowledge_bases'),
    fallbackKnowledgeBases
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    kb_id: String(r.kb_id),
    kb_name: String(r.kb_name ?? ''),
    question_count: n(r.question_count),
  }));
  mindMapCacheSet(K_ROOT, list);
  return list;
}

export async function fetchMindMapClasses(kbId: string, opts?: { bypassCache?: boolean }): Promise<MindMapClassRow[]> {
  const key = K_CLASSES(kbId);
  if (!opts?.bypassCache) {
    const hit = mindMapCacheGet<MindMapClassRow[]>(key);
    if (hit) return hit;
  }
  const rows = await rpcOrFallback(
    async () => supabase.rpc('question_bank_mindmap_classes', { p_kb_id: kbId }),
    () => fallbackClasses(kbId)
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    class_id: String(r.class_id),
    class_name: String(r.class_name ?? ''),
    question_count: n(r.question_count),
  }));
  mindMapCacheSet(key, list);
  return list;
}

export async function fetchMindMapSubjects(classId: string, opts?: { bypassCache?: boolean }): Promise<MindMapSubjectRow[]> {
  const key = K_SUBJECTS(classId);
  if (!opts?.bypassCache) {
    const hit = mindMapCacheGet<MindMapSubjectRow[]>(key);
    if (hit) return hit;
  }
  const rows = await rpcOrFallback(
    async () => supabase.rpc('question_bank_mindmap_subjects', { p_class_id: classId }),
    () => fallbackSubjects(classId)
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    subject_id: String(r.subject_id),
    subject_name: String(r.subject_name ?? ''),
    question_count: n(r.question_count),
  }));
  mindMapCacheSet(key, list);
  return list;
}

export async function fetchMindMapChapters(subjectId: string, opts?: { bypassCache?: boolean }): Promise<MindMapChapterRow[]> {
  const key = K_CHAPTERS(subjectId);
  if (!opts?.bypassCache) {
    const hit = mindMapCacheGet<MindMapChapterRow[]>(key);
    if (hit) return hit;
  }
  const rows = await rpcOrFallback(
    async () => supabase.rpc('question_bank_mindmap_chapters', { p_subject_id: subjectId }),
    () => fallbackChapters(subjectId)
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    chapter_id: String(r.chapter_id),
    chapter_name: String(r.chapter_name ?? ''),
    chapter_number: r.chapter_number == null ? null : n(r.chapter_number),
    question_count: n(r.question_count),
  }));
  mindMapCacheSet(key, list);
  return list;
}

export async function fetchMindMapTopicTags(chapterId: string, opts?: { bypassCache?: boolean }): Promise<MindMapTopicRow[]> {
  const key = K_TOPICS(chapterId);
  if (!opts?.bypassCache) {
    const hit = mindMapCacheGet<MindMapTopicRow[]>(key);
    if (hit) return hit;
  }
  const rows = await rpcOrFallback(
    async () => supabase.rpc('question_bank_mindmap_topic_tags', { p_chapter_id: chapterId }),
    () => fallbackTopicTags(chapterId)
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    topic_label: String(r.topic_label ?? ''),
    question_count: n(r.question_count),
  }));
  mindMapCacheSet(key, list);
  return list;
}
