import '../../types';
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';
import {
  deleteKbPromptSet,
  deletePromptReferenceLayer,
  fetchKbPromptPreferences,
  insertKbPromptSet,
  insertPromptReferenceLayer,
  listKbPromptSets,
  listPromptReferenceLayers,
  setKbActivePromptSet,
  updateKbPromptSet,
  updatePromptReferenceLayerAnalysis,
  type KbPromptSetRow,
  type PromptReferenceLayerRow,
} from '../../services/kbPromptService';
import { analyzeReferenceDocument, generateSystemPromptsFromAnalysis, type ReferenceAnalysis } from '../../services/promptReferenceAi';
import { DEFAULT_PROMPTS, KIWITEACH_SYSTEM_PROMPTS_KEY } from './neetPromptConfig';

const LOCAL_SOURCE = '__local__';
const BUCKET = 'prompt-reference-docs';

type PersistMode = 'local' | 'cloud';

interface NeetKbPromptStudioProps {
  prompts: Record<string, string>;
  setPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onPersistModeChange: (mode: PersistMode) => void;
}

function mergeLoadedPrompts(raw: Record<string, string> | null | undefined): Record<string, string> {
  return { ...DEFAULT_PROMPTS, ...(raw || {}) };
}

const NeetKbPromptStudio: React.FC<NeetKbPromptStudioProps> = ({ prompts, setPrompts, onPersistModeChange }) => {
  const [kbList, setKbList] = useState<{ id: string; name: string }[]>([]);
  const [kbId, setKbId] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promptSets, setPromptSets] = useState<KbPromptSetRow[]>([]);
  const [layers, setLayers] = useState<PromptReferenceLayerRow[]>([]);
  const [activeSource, setActiveSource] = useState<string>(LOCAL_SOURCE);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refModalOpen, setRefModalOpen] = useState(false);
  const [refModalTitle, setRefModalTitle] = useState('');
  const [refModalFile, setRefModalFile] = useState<File | null>(null);

  const syncLists = useCallback(async (id: string) => {
    try {
      const [sets, lays] = await Promise.all([listKbPromptSets(id), listPromptReferenceLayers(id)]);
      setPromptSets(sets);
      setLayers(lays);
      setListError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setListError(msg);
      setPromptSets([]);
      setLayers([]);
    }
  }, []);

  const loadEditorForActive = useCallback(
    async (src: string) => {
      if (src === LOCAL_SOURCE) {
        const saved = localStorage.getItem(KIWITEACH_SYSTEM_PROMPTS_KEY);
        if (saved) {
          try {
            setPrompts({ ...DEFAULT_PROMPTS, ...JSON.parse(saved) });
          } catch {
            setPrompts({ ...DEFAULT_PROMPTS });
          }
        } else {
          setPrompts({ ...DEFAULT_PROMPTS });
        }
        return;
      }
      const { data, error } = await supabase.from('kb_prompt_sets').select('prompts_json').eq('id', src).single();
      if (error || !data?.prompts_json) {
        setPrompts({ ...DEFAULT_PROMPTS });
        return;
      }
      setPrompts(mergeLoadedPrompts(data.prompts_json as Record<string, string>));
    },
    [setPrompts]
  );

  const bootstrapKb = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      try {
        const activeId = await fetchKbPromptPreferences(id);
        await syncLists(id);
        const src = activeId || LOCAL_SOURCE;
        setActiveSource(src);
        onPersistModeChange(activeId ? 'cloud' : 'local');
        await loadEditorForActive(src);
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to load prompt data');
      } finally {
        setLoading(false);
      }
    },
    [loadEditorForActive, onPersistModeChange, syncLists]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase
      .from('knowledge_bases')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setKbList(data || []);
        if (data?.length && !kbId) setKbId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (kbId) void bootstrapKb(kbId);
  }, [kbId, bootstrapKb]);

  useEffect(() => {
    if (!refModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setRefModalOpen(false);
        setRefModalTitle('');
        setRefModalFile(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refModalOpen, busy]);

  const handleActiveSourceChange = async (value: string) => {
    if (!kbId) return;
    setBusy('source');
    try {
      await setKbActivePromptSet(kbId, value === LOCAL_SOURCE ? null : value);
      await syncLists(kbId);
      setActiveSource(value);
      onPersistModeChange(value === LOCAL_SOURCE ? 'local' : 'cloud');
      await loadEditorForActive(value);
    } catch (e: any) {
      alert(e?.message || 'Failed to update active prompt source');
    } finally {
      setBusy(null);
    }
  };

  const saveCloudPromptSet = async () => {
    if (!kbId || activeSource === LOCAL_SOURCE) {
      alert('Select a saved prompt set as the active source (not Browser local).');
      return;
    }
    setBusy('save');
    try {
      await updateKbPromptSet(activeSource, { promptsJson: prompts });
      await syncLists(kbId);
      alert('Saved prompt set to Supabase.');
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const createManualSet = async () => {
    if (!kbId) return;
    const name = window.prompt('Name for this manual prompt set?', 'Custom NEET prompts');
    if (!name?.trim()) return;
    setBusy('create');
    try {
      const id = await insertKbPromptSet({
        knowledgeBaseId: kbId,
        name: name.trim(),
        setKind: 'manual',
        promptsJson: prompts,
        userId,
      });
      await setKbActivePromptSet(kbId, id);
      await syncLists(kbId);
      setActiveSource(id);
      onPersistModeChange('cloud');
    } catch (e: any) {
      alert(e?.message || 'Create failed');
    } finally {
      setBusy(null);
    }
  };

  const removeSet = async (id: string) => {
    if (!confirm('Delete this prompt set from Supabase?')) return;
    setBusy('del');
    try {
      await deleteKbPromptSet(id);
      if (activeSource === id) {
        await setKbActivePromptSet(kbId, null);
        setActiveSource(LOCAL_SOURCE);
        onPersistModeChange('local');
        await loadEditorForActive(LOCAL_SOURCE);
      }
      await syncLists(kbId);
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const uploadReferenceLayer = async (file: File, displayTitle?: string) => {
    if (!kbId) return;
    const layerId = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
    const path = `${kbId}/${layerId}/${safeName}`;
    const fallbackTitle = safeName.replace(/\.[^.]+$/, '');
    const title = (displayTitle && displayTitle.trim()) || fallbackTitle;
    setBusy('upload');
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      await insertPromptReferenceLayer({
        knowledgeBaseId: kbId,
        storagePath: path,
        originalFilename: file.name,
        mimeType: file.type || null,
        title,
        userId,
      });
      await syncLists(kbId);
      setRefModalOpen(false);
      setRefModalTitle('');
      setRefModalFile(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const openRefUploadModal = () => {
    setRefModalTitle('');
    setRefModalFile(null);
    setRefModalOpen(true);
  };

  const submitRefUploadModal = () => {
    if (!refModalFile) {
      alert('Choose a DOCX or PDF file.');
      return;
    }
    void uploadReferenceLayer(refModalFile, refModalTitle);
  };

  const runAnalyze = async (layer: PromptReferenceLayerRow) => {
    setBusy(`analyze-${layer.id}`);
    try {
      await updatePromptReferenceLayerAnalysis(layer.id, { analysisStatus: 'analyzing' });
      await syncLists(kbId);
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(layer.storage_path);
      if (dlErr || !blob) throw new Error(dlErr?.message || 'Download failed');
      const buf = await blob.arrayBuffer();
      const analysis = await analyzeReferenceDocument({
        arrayBuffer: buf,
        mimeType: layer.mime_type || blob.type || 'application/octet-stream',
        fileName: layer.original_filename,
      });
      await updatePromptReferenceLayerAnalysis(layer.id, {
        analysisJson: analysis,
        analysisStatus: 'complete',
        analysisError: null,
      });
      await syncLists(kbId);
    } catch (e: any) {
      await updatePromptReferenceLayerAnalysis(layer.id, {
        analysisStatus: 'failed',
        analysisError: e?.message || String(e),
      });
      await syncLists(kbId);
      alert(e?.message || 'Analysis failed');
    } finally {
      setBusy(null);
    }
  };

  const runGeneratePromptsFromLayer = async (layer: PromptReferenceLayerRow) => {
    if (!layer.analysis_json || layer.analysis_status !== 'complete') {
      alert('Run analysis on this reference layer first.');
      return;
    }
    setBusy(`gen-${layer.id}`);
    try {
      const next = await generateSystemPromptsFromAnalysis(layer.analysis_json as ReferenceAnalysis);
      setPrompts(next);
      alert('Editor filled with AI-generated system prompts. Save as a new prompt set or switch active source and save.');
    } catch (e: any) {
      alert(e?.message || 'Generation failed');
    } finally {
      setBusy(null);
    }
  };

  const saveDerivedSet = async (layer: PromptReferenceLayerRow) => {
    if (!kbId) return;
    const name = window.prompt('Name for this reference-derived prompt set?', `From ${layer.original_filename}`);
    if (!name?.trim()) return;
    setBusy('save-derived');
    try {
      const id = await insertKbPromptSet({
        knowledgeBaseId: kbId,
        name: name.trim(),
        setKind: 'reference_derived',
        promptsJson: prompts,
        referenceLayerId: layer.id,
        userId,
      });
      await setKbActivePromptSet(kbId, id);
      await syncLists(kbId);
      setActiveSource(id);
      onPersistModeChange('cloud');
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const removeLayer = async (layer: PromptReferenceLayerRow) => {
    if (!confirm(`Remove reference layer "${layer.original_filename}"?`)) return;
    setBusy('rm-layer');
    try {
      await supabase.storage.from(BUCKET).remove([layer.storage_path]);
      await deletePromptReferenceLayer(layer.id);
      if (selectedLayerId === layer.id) setSelectedLayerId(null);
      await syncLists(kbId);
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/30 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-sky-800">Prompt Studio (cloud)</p>
          <h3 className="text-sm font-semibold text-zinc-900">Knowledge base, active set, reference papers</h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
            Separate from <strong>Reference Questions</strong> (question bank). Here you store <em>prompt profiles</em> and
            optional <em>reference papers</em> (DOCX/PDF) to analyze and distill into system prompts per knowledge base.
          </p>
        </div>
      </div>

      {listError && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Could not load Prompt Studio data.</span>{' '}
            <span className="text-amber-900/90">{listError}</span>
            {/schema cache|not find the table|42P01/i.test(listError) ? (
              <span className="mt-1 block text-amber-800">
                Run the migration{' '}
                <code className="rounded bg-white/80 px-1">supabase/migrations/20260508120000_prompt_studio_kb_prompts.sql</code>{' '}
                on your Supabase project (SQL Editor or <code className="rounded bg-white/80 px-1">supabase db push</code>
                ), then refresh.
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-amber-900 underline hover:no-underline"
            onClick={() => setListError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] font-medium text-zinc-600">
          Knowledge base
          <select
            value={kbId}
            onChange={(e) => setKbId(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900"
          >
            {kbList.length === 0 && <option value="">No knowledge bases</option>}
            {kbList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[240px] flex-[2] flex-col gap-1 text-[11px] font-medium text-zinc-600">
          Active for generation (this KB)
          <select
            value={activeSource}
            onChange={(e) => void handleActiveSourceChange(e.target.value)}
            disabled={!kbId || loading || busy === 'source'}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 disabled:opacity-50"
          >
            <option value={LOCAL_SOURCE}>Browser local (this device)</option>
            {promptSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.set_kind === 'reference_derived' ? 'from reference paper' : 'manual'})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-sky-200/60 pt-3">
        <button
          type="button"
          onClick={() => void saveCloudPromptSet()}
          disabled={!kbId || activeSource === LOCAL_SOURCE || !!busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          <iconify-icon icon="mdi:cloud-upload-outline" width="14" />
          Save editor → active cloud set
        </button>
        <button
          type="button"
          onClick={() => void createManualSet()}
          disabled={!kbId || !!busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          <iconify-icon icon="mdi:playlist-plus" width="14" />
          New manual prompt set
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-800">Reference layers (uploaded papers)</p>
            <p className="text-[10px] text-zinc-500">
              DOCX with embedded figures or PDF. Analyze → generate prompts → save a prompt set.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openRefUploadModal()}
            disabled={!kbId || !!busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
          >
            <iconify-icon icon="mdi:plus" width="16" />
            Add reference paper
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {layers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                    No reference layers yet. Use <strong>Add reference paper</strong>.
                  </td>
                </tr>
              )}
              {layers.map((layer) => (
                <tr
                  key={layer.id}
                  className={`border-b border-zinc-50 ${selectedLayerId === layer.id ? 'bg-sky-50/50' : ''}`}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-800">{layer.title || layer.original_filename}</div>
                    <div className="text-[10px] text-zinc-500">{layer.original_filename}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {layer.analysis_status}
                    {layer.analysis_error ? (
                      <span className="ml-1 text-red-600" title={layer.analysis_error}>
                        (error)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-zinc-50 disabled:opacity-40"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runAnalyze(layer);
                        }}
                      >
                        Analyze AI
                      </button>
                      <button
                        type="button"
                        className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-zinc-50 disabled:opacity-40"
                        disabled={!!busy || layer.analysis_status !== 'complete'}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runGeneratePromptsFromLayer(layer);
                        }}
                      >
                        Write prompts (AI)
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void saveDerivedSet(layer);
                        }}
                      >
                        Save prompt set
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-100 bg-white px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeLayer(layer);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {refModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!busy) {
              setRefModalOpen(false);
              setRefModalTitle('');
              setRefModalFile(null);
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-labelledby="ref-upload-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="ref-upload-title" className="text-sm font-semibold text-zinc-900">
              Add reference paper
            </h4>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Upload a DOCX (Mathpix / embedded figures) or PDF. Stored in bucket <code className="text-zinc-700">prompt-reference-docs</code>.
            </p>
            <label className="mt-4 block text-[11px] font-medium text-zinc-600">Label (optional)</label>
            <input
              type="text"
              value={refModalTitle}
              onChange={(e) => setRefModalTitle(e.target.value)}
              placeholder="e.g. Allen NEET mock 2024"
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <label className="mt-3 block text-[11px] font-medium text-zinc-600">File</label>
            <input
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-1 block w-full text-[11px] text-zinc-600 file:mr-2 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-2 file:py-1 file:text-[11px] file:font-medium"
              onChange={(e) => setRefModalFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRefModalOpen(false);
                  setRefModalTitle('');
                  setRefModalFile(null);
                }}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitRefUploadModal()}
                disabled={!!busy || !kbId}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy === 'upload' ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <iconify-icon icon="mdi:cloud-upload-outline" width="16" />
                )}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {promptSets.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Saved prompt sets</p>
          <ul className="space-y-1 text-[11px] text-zinc-700">
            {promptSets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-2 py-1">
                <span>
                  {s.name}{' '}
                  <span className="text-zinc-400">
                    ({s.set_kind}){activeSource === s.id ? ' · active' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[10px] text-red-600 hover:underline"
                  disabled={!!busy}
                  onClick={() => void removeSet(s.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default NeetKbPromptStudio;
