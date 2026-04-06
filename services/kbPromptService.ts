import { supabase } from '../supabase/client';
import { DEFAULT_PROMPTS } from '../Admin/Prompts/neetPromptConfig';

/** UI + DB values for `kb_prompt_preferences.generation_prompt_source`. */
export type KbGenerationPromptSource = 'builtin_default' | 'browser_local' | 'cloud_set';

/** Single-select id for "built-in app defaults" (not a UUID). */
export const KB_GEN_SOURCE_BUILTIN = '__builtin__';
/** Single-select id for browser localStorage + reference layer path. */
export const KB_GEN_SOURCE_BROWSER_LOCAL = '__local__';

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

function mergePromptSetJsonOverDefaults(fromDb: Record<string, unknown>): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_PROMPTS };
  for (const key of Object.keys(DEFAULT_PROMPTS)) {
    const v = fromDb[key];
    if (typeof v === 'string' && v.trim() !== '') merged[key] = v;
  }
  return merged;
}

export type FetchMergedPromptsOptions = {
  /** If set, load this cloud prompt set for the same KB (ignores kb_prompt_preferences for merge source). */
  promptSetIdOverride?: string | null;
};

/**
 * When `builtin_default`: return shipped DEFAULT_PROMPTS (deterministic).
 * When `browser_local` or no row: null → geminiService uses getSystemPrompt + reference block.
 * When `cloud_set`: merge active `kb_prompt_sets.prompts_json` over defaults.
 * When `options.promptSetIdOverride`: merge that set’s JSON (must belong to this KB).
 */
export async function fetchMergedPromptsForKbGeneration(
  knowledgeBaseId: string,
  options?: FetchMergedPromptsOptions
): Promise<Record<string, string> | null> {
  const overrideId = options?.promptSetIdOverride?.trim();
  if (overrideId) {
    const { data: setRow, error: oErr } = await supabase
      .from('kb_prompt_sets')
      .select('prompts_json, knowledge_base_id')
      .eq('id', overrideId)
      .maybeSingle();
    if (oErr || !setRow || setRow.knowledge_base_id !== knowledgeBaseId) return null;
    if (!setRow.prompts_json || typeof setRow.prompts_json !== 'object') return null;
    return mergePromptSetJsonOverDefaults(setRow.prompts_json as Record<string, unknown>);
  }

  const { data: pref, error: pErr } = await supabase
    .from('kb_prompt_preferences')
    .select('active_prompt_set_id, generation_prompt_source')
    .eq('knowledge_base_id', knowledgeBaseId)
    .maybeSingle();

  if (pErr) return null;

  const source = (pref?.generation_prompt_source as KbGenerationPromptSource | undefined) ?? 'browser_local';
  const activeId = pref?.active_prompt_set_id ?? null;

  if (source === 'builtin_default') {
    return { ...DEFAULT_PROMPTS };
  }

  if (source === 'browser_local') {
    return null;
  }

  if (source !== 'cloud_set' || !activeId) {
    return null;
  }

  const { data: setRow, error: sErr } = await supabase
    .from('kb_prompt_sets')
    .select('prompts_json')
    .eq('id', activeId)
    .single();

  if (sErr || !setRow?.prompts_json || typeof setRow.prompts_json !== 'object') return null;

  return mergePromptSetJsonOverDefaults(setRow.prompts_json as Record<string, unknown>);
}

export type KbPromptGenerationPrefs = {
  generationSource: KbGenerationPromptSource;
  activePromptSetId: string | null;
};

export async function fetchKbPromptGenerationPrefs(knowledgeBaseId: string): Promise<KbPromptGenerationPrefs | null> {
  const { data, error } = await supabase
    .from('kb_prompt_preferences')
    .select('active_prompt_set_id, generation_prompt_source')
    .eq('knowledge_base_id', knowledgeBaseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const generationSource = (data.generation_prompt_source as KbGenerationPromptSource) || 'browser_local';
  return {
    generationSource,
    activePromptSetId: data.active_prompt_set_id ?? null,
  };
}

/** Value for `question_bank_neet.prompt_set_id` when generation used the active cloud prompt set. */
export async function resolveStoredPromptSetIdForKbGeneration(
  knowledgeBaseId: string | null | undefined
): Promise<string | null> {
  const p = await resolveForgePromptProvenance(knowledgeBaseId, null);
  return p.generationSource === 'cloud_set' ? p.promptSetId : null;
}

/** Provenance for hub rows: UUID when a cloud set was used; generation source always set when forging from Neural Studio. */
export type ForgePromptProvenance = {
  promptSetId: string | null;
  generationSource: KbGenerationPromptSource;
};

export async function resolveForgePromptProvenance(
  knowledgeBaseId: string | null | undefined,
  forgePromptSetOverrideId: string | null | undefined
): Promise<ForgePromptProvenance> {
  if (!knowledgeBaseId?.trim()) {
    return { promptSetId: null, generationSource: 'browser_local' };
  }
  const kb = knowledgeBaseId.trim();
  const override = forgePromptSetOverrideId?.trim();
  if (override) {
    const { data: row, error } = await supabase
      .from('kb_prompt_sets')
      .select('id')
      .eq('id', override)
      .eq('knowledge_base_id', kb)
      .maybeSingle();
    if (!error && row?.id) {
      return { promptSetId: row.id, generationSource: 'cloud_set' };
    }
    return { promptSetId: null, generationSource: 'browser_local' };
  }
  try {
    const prefs = await fetchKbPromptGenerationPrefs(kb);
    if (!prefs) {
      return { promptSetId: null, generationSource: 'browser_local' };
    }
    if (prefs.generationSource === 'cloud_set') {
      return {
        promptSetId: prefs.activePromptSetId ?? null,
        generationSource: 'cloud_set',
      };
    }
    return { promptSetId: null, generationSource: prefs.generationSource };
  } catch {
    return { promptSetId: null, generationSource: 'browser_local' };
  }
}

/** Display when no kb_prompt_sets name join (builtin / browser). */
export function labelPromptGenerationSource(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === 'builtin_default') return 'Built-in defaults';
  if (source === 'browser_local') return 'Browser / local prompts';
  return null;
}

/**
 * What `question_bank_neet.prompt_generation_source` means (for tooltips / admin help).
 * - `builtin_default`: shipped DEFAULT_PROMPTS in code (KB pref “built-in”).
 * - `browser_local`: this browser’s Prompts + localStorage (+ optional reference layer).
 * - `cloud_set`: merged `kb_prompt_sets` row; `prompt_set_id` names which set.
 */
export function describePromptGenerationSource(source: string | null | undefined): string {
  if (source === 'builtin_default') {
    return 'prompt_generation_source: built-in — app DEFAULT_PROMPTS (no cloud prompt set).';
  }
  if (source === 'browser_local') {
    return 'prompt_generation_source: browser/local — Admin → Prompts on this device (localStorage), optional NEET reference layer.';
  }
  if (source === 'cloud_set') {
    return 'prompt_generation_source: cloud_set — merged from kb_prompt_sets; name/UUID on the row.';
  }
  return 'prompt_generation_source: not recorded (legacy row or non–Neural Studio insert).';
}

/** @deprecated Use fetchKbPromptGenerationPrefs */
export async function fetchKbPromptPreferences(knowledgeBaseId: string): Promise<string | null> {
  const p = await fetchKbPromptGenerationPrefs(knowledgeBaseId);
  if (!p) return null;
  return p.generationSource === 'cloud_set' ? p.activePromptSetId : null;
}

export async function upsertKbPromptGenerationPreferences(input: {
  knowledgeBaseId: string;
  generationSource: KbGenerationPromptSource;
  activePromptSetId?: string | null;
}): Promise<void> {
  const active_prompt_set_id =
    input.generationSource === 'cloud_set' ? (input.activePromptSetId ?? null) : null;
  if (input.generationSource === 'cloud_set' && !active_prompt_set_id) {
    throw new Error('Cloud prompt set requires activePromptSetId');
  }
  const payload = {
    knowledge_base_id: input.knowledgeBaseId,
    generation_prompt_source: input.generationSource,
    active_prompt_set_id,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('kb_prompt_preferences').upsert(payload, { onConflict: 'knowledge_base_id' });
  if (error) throw error;
}

export async function setKbActivePromptSet(knowledgeBaseId: string, activePromptSetId: string | null): Promise<void> {
  if (activePromptSetId) {
    await upsertKbPromptGenerationPreferences({
      knowledgeBaseId,
      generationSource: 'cloud_set',
      activePromptSetId,
    });
  } else {
    await upsertKbPromptGenerationPreferences({
      knowledgeBaseId,
      generationSource: 'browser_local',
    });
  }
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
