import { supabase } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SyllabusSetRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  knowledge_base_id: string | null;
  user_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SyllabusEntryRow = {
  id: string;
  syllabus_set_id: string;
  class_name: string;
  subject_name: string;
  chapter_name: string;
  topic_list: string;
  unit_number?: number | null;
  chapter_number?: number | null;
  unit_name?: string | null;
};

export type TopicExclusionRow = {
  id: string;
  user_id: string;
  knowledge_base_id: string | null;
  kb_class_id: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  topic_label: string;
  note: string | null;
  created_at?: string;
};

/** Sets visible for a KB: yours + platform (user_id null), optionally filtered by knowledge_base_id. */
export async function fetchSyllabusSetsForUser(
  client: SupabaseClient,
  userId: string,
  knowledgeBaseId?: string | null
): Promise<SyllabusSetRow[]> {
  const { data: mine, error: e1 } = await client.from('syllabus_sets').select('*').eq('user_id', userId);
  if (e1) throw e1;
  const { data: platform, error: e2 } = await client.from('syllabus_sets').select('*').is('user_id', null);
  if (e2) throw e2;
  let rows = [...(mine || []), ...(platform || [])] as SyllabusSetRow[];
  if (knowledgeBaseId) {
    rows = rows.filter((s) => !s.knowledge_base_id || s.knowledge_base_id === knowledgeBaseId);
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export async function fetchSyllabusEntries(
  client: SupabaseClient,
  syllabusSetId: string
): Promise<SyllabusEntryRow[]> {
  const { data, error } = await client
    .from('syllabus_entries')
    .select('*')
    .eq('syllabus_set_id', syllabusSetId)
    .order('class_name')
    .order('subject_name')
    .order('chapter_number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as SyllabusEntryRow[];
}

export async function createSyllabusSet(
  client: SupabaseClient,
  params: { userId: string; name: string; knowledgeBaseId: string | null; description?: string }
): Promise<SyllabusSetRow> {
  const row: Record<string, unknown> = {
    user_id: params.userId,
    name: params.name.trim(),
    description: params.description ?? null,
  };
  // Omit FK when unset — some PostgREST setups treat explicit null differently for optional FKs.
  if (params.knowledgeBaseId) {
    row.knowledge_base_id = params.knowledgeBaseId;
  }
  const { data, error } = await client.from('syllabus_sets').insert(row).select('*');
  if (error) {
    const msg = [error.message, (error as { details?: string }).details].filter(Boolean).join(' — ');
    throw new Error(msg || 'Insert failed');
  }
  const inserted = data?.[0];
  if (!inserted) {
    throw new Error(
      'Syllabus was not returned after insert. Check RLS policies on syllabus_sets (insert + select).'
    );
  }
  return inserted as SyllabusSetRow;
}

export async function updateSyllabusSetMeta(
  client: SupabaseClient,
  setId: string,
  patch: { name?: string; knowledge_base_id?: string | null; description?: string | null }
): Promise<void> {
  const { error } = await client.from('syllabus_sets').update(patch).eq('id', setId);
  if (error) throw error;
}

export async function deleteSyllabusSet(client: SupabaseClient, setId: string): Promise<void> {
  const { error } = await client.from('syllabus_sets').delete().eq('id', setId);
  if (error) throw error;
}

/** Topic strings for question-bank / forge: all entries matching chapter (and optional subject) across sets for this KB. */
export async function fetchSyllabusTopicsForChapter(params: {
  kbId: string | null;
  chapterName: string;
  subjectName?: string | null;
}): Promise<string[]> {
  const chapter = params.chapterName.trim();
  if (!chapter) return [];

  let setQuery = supabase.from('syllabus_sets').select('id');
  if (params.kbId) {
    setQuery = setQuery.or(`knowledge_base_id.eq.${params.kbId},knowledge_base_id.is.null`);
  }
  const { data: sets, error: se } = await setQuery;
  if (se) throw se;
  const ids = (sets || []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return [];

  let q = supabase
    .from('syllabus_entries')
    .select('topic_list')
    .in('syllabus_set_id', ids)
    .ilike('chapter_name', `%${chapter}%`);
  if (params.subjectName?.trim()) {
    q = q.ilike('subject_name', `%${params.subjectName.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const blob = (data || []).map((d: { topic_list: string }) => d.topic_list).join(', ');
  return Array.from(
    new Set(
      blob
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Labels to forbid in AI prompts / optional DB filter; includes global rows (kb null) and kb-specific. */
export async function fetchUserExcludedTopicLabels(
  client: SupabaseClient,
  userId: string,
  knowledgeBaseId?: string | null
): Promise<string[]> {
  let q = client.from('question_topic_exclusions').select('topic_label').eq('user_id', userId);
  if (knowledgeBaseId) {
    q = q.or(`knowledge_base_id.eq.${knowledgeBaseId},knowledge_base_id.is.null`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const labels = (data || []).map((r: { topic_label: string }) => norm(r.topic_label)).filter(Boolean);
  return Array.from(new Set(labels));
}

export function topicTagIsExcluded(topicTag: string | null | undefined, excludedNormalized: string[]): boolean {
  if (!topicTag || excludedNormalized.length === 0) return false;
  const t = norm(topicTag);
  return excludedNormalized.some((ex) => t === ex || t.includes(ex) || ex.includes(t));
}

export async function fetchTopicExclusions(client: SupabaseClient, userId: string): Promise<TopicExclusionRow[]> {
  const { data, error } = await client
    .from('question_topic_exclusions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as TopicExclusionRow[];
}

export async function insertTopicExclusion(
  client: SupabaseClient,
  row: Omit<TopicExclusionRow, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await client.from('question_topic_exclusions').insert({
    user_id: row.user_id,
    knowledge_base_id: row.knowledge_base_id,
    kb_class_id: row.kb_class_id,
    subject_id: row.subject_id,
    chapter_id: row.chapter_id,
    topic_label: row.topic_label.trim(),
    note: row.note ?? null,
  });
  if (error) throw error;
}

export async function deleteTopicExclusion(client: SupabaseClient, id: string, userId: string): Promise<void> {
  const { error } = await client.from('question_topic_exclusions').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function updateTopicExclusion(
  client: SupabaseClient,
  id: string,
  userId: string,
  patch: {
    topic_label?: string;
    note?: string | null;
  }
): Promise<void> {
  const updateRow: Record<string, unknown> = {};
  if (typeof patch.topic_label === 'string') updateRow.topic_label = patch.topic_label.trim();
  if (patch.note !== undefined) updateRow.note = patch.note ? patch.note : null;
  const { error } = await client.from('question_topic_exclusions').update(updateRow).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/** Optional: suggest topic strings from syllabus rows for a chapter id (uses chapter name from DB). */
export async function fetchSuggestedTopicLabelsForChapter(
  client: SupabaseClient,
  kbId: string | null,
  chapterId: string
): Promise<string[]> {
  const { data: ch, error } = await client
    .from('chapters')
    .select('name, subject_name')
    .eq('id', chapterId)
    .maybeSingle();
  if (error || !ch) return [];
  return fetchSyllabusTopicsForChapter({
    kbId,
    chapterName: ch.name || '',
    subjectName: ch.subject_name,
  });
}
