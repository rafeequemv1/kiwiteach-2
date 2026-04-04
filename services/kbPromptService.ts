import { supabase } from '../supabase/client';
import { DEFAULT_PROMPTS } from '../Admin/Prompts/neetPromptConfig';

export type KbPromptSetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  knowledge_base_id: string;
  name: string;
  set_kind: 'manual' | 'reference_derived';
  reference_layer_id: string | null;
  prompts_json: Record<string, string>;
  created_by: string | null;
};

export type PromptReferenceLayerRow = {
  id: string;
  created_at: string;
  updated_at: string;
  knowledge_base_id: string;
  title: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  analysis_json: unknown;
  analysis_status: string;
  analysis_error: string | null;
  created_by: string | null;
};

/** When a KB has an active cloud prompt set, merge DB JSON with defaults for generation. Otherwise null → use browser localStorage + legacy reference block. */
export async function fetchMergedPromptsForKbGeneration(knowledgeBaseId: string): Promise<Record<string, string> | null> {
  const { data: pref, error: pErr } = await supabase
    .from('kb_prompt_preferences')
    .select('active_prompt_set_id')
    .eq('knowledge_base_id', knowledgeBaseId)
    .maybeSingle();

  if (pErr || !pref?.active_prompt_set_id) return null;

  const { data: setRow, error: sErr } = await supabase
    .from('kb_prompt_sets')
    .select('prompts_json')
    .eq('id', pref.active_prompt_set_id)
    .single();

  if (sErr || !setRow?.prompts_json || typeof setRow.prompts_json !== 'object') return null;

  const fromDb = setRow.prompts_json as Record<string, unknown>;
  const merged: Record<string, string> = { ...DEFAULT_PROMPTS };
  for (const key of Object.keys(DEFAULT_PROMPTS)) {
    const v = fromDb[key];
    if (typeof v === 'string' && v.trim() !== '') merged[key] = v;
  }
  return merged;
}

export async function fetchKbPromptPreferences(knowledgeBaseId: string): Promise<string | null> {
  const { data } = await supabase
    .from('kb_prompt_preferences')
    .select('active_prompt_set_id')
    .eq('knowledge_base_id', knowledgeBaseId)
    .maybeSingle();
  return data?.active_prompt_set_id ?? null;
}

export async function setKbActivePromptSet(knowledgeBaseId: string, activePromptSetId: string | null): Promise<void> {
  const payload = {
    knowledge_base_id: knowledgeBaseId,
    active_prompt_set_id: activePromptSetId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('kb_prompt_preferences').upsert(payload, { onConflict: 'knowledge_base_id' });
  if (error) throw error;
}

export async function listKbPromptSets(knowledgeBaseId: string): Promise<KbPromptSetRow[]> {
  const { data, error } = await supabase
    .from('kb_prompt_sets')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as KbPromptSetRow[];
}

export async function insertKbPromptSet(input: {
  knowledgeBaseId: string;
  name: string;
  setKind: 'manual' | 'reference_derived';
  promptsJson: Record<string, string>;
  referenceLayerId?: string | null;
  userId: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('kb_prompt_sets')
    .insert({
      knowledge_base_id: input.knowledgeBaseId,
      name: input.name,
      set_kind: input.setKind,
      reference_layer_id: input.referenceLayerId ?? null,
      prompts_json: input.promptsJson,
      created_by: input.userId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

export async function updateKbPromptSet(
  id: string,
  updates: { name?: string; promptsJson?: Record<string, string>; referenceLayerId?: string | null }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.promptsJson !== undefined) patch.prompts_json = updates.promptsJson;
  if (updates.referenceLayerId !== undefined) patch.reference_layer_id = updates.referenceLayerId;
  const { error } = await supabase.from('kb_prompt_sets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteKbPromptSet(id: string): Promise<void> {
  const { error } = await supabase.from('kb_prompt_sets').delete().eq('id', id);
  if (error) throw error;
}

export async function listPromptReferenceLayers(knowledgeBaseId: string): Promise<PromptReferenceLayerRow[]> {
  const { data, error } = await supabase
    .from('prompt_reference_layers')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as PromptReferenceLayerRow[];
}

export async function insertPromptReferenceLayer(input: {
  knowledgeBaseId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  title: string | null;
  userId: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('prompt_reference_layers')
    .insert({
      knowledge_base_id: input.knowledgeBaseId,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      title: input.title,
      created_by: input.userId,
      analysis_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

export async function updatePromptReferenceLayerAnalysis(
  id: string,
  patch: { analysisJson?: unknown; analysisStatus: string; analysisError?: string | null }
): Promise<void> {
  const row: Record<string, unknown> = {
    analysis_status: patch.analysisStatus,
    analysis_error: patch.analysisError ?? null,
    updated_at: new Date().toISOString(),
  };
  if (patch.analysisJson !== undefined) row.analysis_json = patch.analysisJson;
  const { error } = await supabase.from('prompt_reference_layers').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePromptReferenceLayer(id: string): Promise<void> {
  const { error } = await supabase.from('prompt_reference_layers').delete().eq('id', id);
  if (error) throw error;
}
