import '../../types';
import React, { useState, useEffect } from 'react';
import { refineSystemPrompt } from '../../services/geminiService';
import { NEURAL_STUDIO_FORGE_SECTIONS } from '../../services/neuralStudioPromptBlueprint';
import { DEFAULT_PROMPTS, SECTIONS, KIWITEACH_SYSTEM_PROMPTS_KEY } from './neetPromptConfig';
import NeetKbPromptStudio from './NeetKbPromptStudio';

type PromptsTab = 'system' | 'neural_forge' | 'bundle';

interface NeetPromptSetDetailProps {
  onBack: () => void;
  embedded?: boolean;
}

const NeetPromptSetDetail: React.FC<NeetPromptSetDetailProps> = ({ onBack, embedded }) => {
  const [activeTab, setActiveTab] = useState<PromptsTab>('system');
  const [prompts, setPrompts] = useState<Record<string, string>>(DEFAULT_PROMPTS);
  const [persistMode, setPersistMode] = useState<'local' | 'cloud' | 'builtin'>('local');
  const [promptStudioOpen, setPromptStudioOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiTargetSection, setAiTargetSection] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(KIWITEACH_SYSTEM_PROMPTS_KEY);
    if (saved) {
      try {
        setPrompts({ ...DEFAULT_PROMPTS, ...JSON.parse(saved) });
      } catch (e) {
        console.error('Failed to parse local prompts', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!promptStudioOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPromptStudioOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promptStudioOpen]);

  const handleSavePrompt = (section: string, text: string) => {
    setSaving(true);
    setTimeout(() => {
      const updated = { ...prompts, [section]: text };
      setPrompts(updated);
      if (persistMode === 'local') {
        localStorage.setItem(KIWITEACH_SYSTEM_PROMPTS_KEY, JSON.stringify(updated));
      }
      setSaving(false);
    }, 500);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all system prompts to defaults? (Reference layer text is not cleared.)')) {
      setPrompts(DEFAULT_PROMPTS);
      localStorage.removeItem(KIWITEACH_SYSTEM_PROMPTS_KEY);
    }
  };

  const handleAiRefine = async () => {
    if (!aiTargetSection || !aiInstruction) return;
    setIsRefining(true);
    try {
      const currentText = prompts[aiTargetSection];
      const refined = await refineSystemPrompt(currentText, aiInstruction);
      setPrompts((prev) => ({ ...prev, [aiTargetSection]: refined }));
      setIsAiOpen(false);
      setAiInstruction('');
    } catch (e: any) {
      alert('AI Error: ' + e.message);
    } finally {
      setIsRefining(false);
    }
  };

  const buildJsonBundle = () => {
    return JSON.stringify(
      {
        promptSet: 'neet',
        version: 1,
        systemPrompts: SECTIONS.reduce(
          (acc, s) => {
            acc[s.id] = prompts[s.id] ?? '';
            return acc;
          },
          {} as Record<string, string>
        ),
        persistMode,
        neuralForgeSections: NEURAL_STUDIO_FORGE_SECTIONS.map((x) => ({ title: x.title, body: x.body })),
      },
      null,
      2
    );
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(label);
      setTimeout(() => setCopyFlash(null), 2000);
    } catch {
      alert('Could not copy to clipboard.');
    }
  };

  const concatenatedSystemPrompt = SECTIONS.map((s) => `## ${s.id}\n${prompts[s.id] || ''}`).join('\n\n');

  const escapeCsvCell = (value: string): string => {
    const v = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/[",\n]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  /** All editable system sections plus static Neural Studio forge docs (same as JSON bundle scope). */
  const buildAllPromptsCsv = (): string => {
    const lines: string[] = ['category,section_key,section_label,content'];
    for (const s of SECTIONS) {
      lines.push(
        ['system_prompt', s.id, s.label, prompts[s.id] ?? ''].map(escapeCsvCell).join(',')
      );
    }
    for (const doc of NEURAL_STUDIO_FORGE_SECTIONS) {
      const key =
        doc.title
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '_')
          .slice(0, 96) || 'forge_section';
      lines.push(
        ['neural_studio_forge_doc', key, doc.title, doc.body].map(escapeCsvCell).join(',')
      );
    }
    return lines.join('\n');
  };

  const downloadPromptsCsv = () => {
    const csv = `\uFEFF${buildAllPromptsCsv()}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kiwiteach-neet-prompts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = 'noopener';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabScrollClass = embedded
    ? 'min-h-0 flex-1 overflow-y-auto pb-4 pr-1 custom-scrollbar'
    : 'space-y-4 pb-4';

  return (
    <div
      className={`flex min-w-0 flex-col gap-6 pb-2 ${
        embedded ? 'h-full min-h-0 flex-1 overflow-hidden' : ''
      }`}
    >
      <div className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
              aria-label="Back to prompt sets"
            >
              <iconify-icon icon="mdi:arrow-left" width="20" />
            </button>
            <div>
              {!embedded && <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Prompts</p>}
              <h2 className="text-base font-semibold text-zinc-900">NEET</h2>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-zinc-500">
                Cloud prompt sets and reference papers (per knowledge base) plus local browser defaults. Neural Studio
                uses the active source for this KB when generating in Question DB.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-zinc-600">
          Open Prompt Studio to choose the knowledge base, <strong>which prompts Question Bank uses</strong> (built-in,
          browser, or cloud), upload reference papers, and manage saved sets.
        </p>
        <button
          type="button"
          onClick={() => setPromptStudioOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          <iconify-icon icon="mdi:cloud-cog-outline" width="18" />
          Open Prompt Studio
        </button>
      </div>

      {promptStudioOpen && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-zinc-900/50 p-3 backdrop-blur-sm"
          onClick={() => setPromptStudioOpen(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-studio-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
              <h3 id="prompt-studio-modal-title" className="text-sm font-semibold text-zinc-900">
                Prompt Studio (cloud)
              </h3>
              <button
                type="button"
                onClick={() => setPromptStudioOpen(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
              <NeetKbPromptStudio prompts={prompts} setPrompts={setPrompts} onPersistModeChange={setPersistMode} />
            </div>
          </div>
        </div>
      )}

      {persistMode === 'cloud' && (
        <p className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Section <strong>Apply</strong> updates the editor only. Use <strong>Save editor → active cloud set</strong> in
          Prompt Studio to persist to Supabase.
        </p>
      )}

      <div className="shrink-0 flex flex-col gap-3 border-t border-zinc-200 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'system' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              System prompts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('neural_forge')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'neural_forge' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Neural Studio forge
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bundle')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'bundle' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              JSON / full text
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadPromptsCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
              title="Download every system prompt section and Neural Studio forge docs as CSV"
            >
              <iconify-icon icon="mdi:file-delimited-outline" width="14" />
              Download all (CSV)
            </button>
            {activeTab === 'system' && (
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs font-medium text-zinc-500 hover:text-red-600"
              >
                Reset defaults
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'neural_forge' ? (
        <div className={embedded ? `${tabScrollClass} space-y-4` : 'space-y-4 pb-4'}>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px] leading-relaxed text-zinc-700">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">How questions are forged</p>
            <p className="mt-2">
              Editable blocks live under <strong>System prompts</strong>. The forge also adds dynamic mandates (types,
              difficulty, figures, syllabus) and optional source text or images via{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[11px] text-zinc-800">generateQuizQuestions</code>.
            </p>
          </div>
          {NEURAL_STUDIO_FORGE_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-800">{section.title}</h3>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-600">
                {section.body}
              </pre>
            </div>
          ))}
        </div>
      ) : activeTab === 'bundle' ? (
        <div
          className={
            embedded
              ? `${tabScrollClass} flex flex-col gap-4`
              : 'flex flex-1 flex-col gap-4 overflow-hidden pb-4'
          }
        >
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText('json', buildJsonBundle())}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:content-copy" width="14" />
              {copyFlash === 'json' ? 'Copied' : 'Copy JSON bundle'}
            </button>
            <button
              type="button"
              onClick={() => copyText('text', concatenatedSystemPrompt)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:text-box-outline" width="14" />
              {copyFlash === 'text' ? 'Copied' : 'Copy concatenated system prompts'}
            </button>
            <button
              type="button"
              onClick={downloadPromptsCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:file-delimited-outline" width="14" />
              Download all (CSV)
            </button>
          </div>
          <div
            className={`min-h-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 shadow-inner ${
              embedded ? 'min-h-[200px] flex-1' : 'flex-1'
            }`}
          >
            <pre
              className={`custom-scrollbar overflow-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-100 ${
                embedded ? 'max-h-full min-h-[180px] h-full' : 'h-full max-h-[min(60vh,520px)]'
              }`}
            >
              {buildJsonBundle()}
            </pre>
          </div>
          <p className="shrink-0 text-[11px] text-zinc-500">
            Use the JSON bundle to version-control prompts or to seed another environment. Re-import is manual (paste
            into sections or extend the app later).
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-5 xl:grid-cols-2 ${
            embedded ? tabScrollClass : 'pb-4'
          }`}
        >
          {SECTIONS.map((section) => (
            <div
              key={section.id}
              className={`flex h-[400px] flex-col gap-2 ${section.wide ? 'xl:col-span-2' : ''}`}
            >
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${section.iconBg} ${section.iconText}`}
                  >
                    <iconify-icon icon={section.icon} width="14" />
                  </div>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${section.labelClass}`}>
                    {section.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAiTargetSection(section.id);
                    setIsAiOpen(true);
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900"
                >
                  <iconify-icon icon="mdi:auto-fix" width="14" />
                  Refine
                </button>
              </div>
              <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-zinc-300">
                <textarea
                  value={prompts[section.id] || ''}
                  onChange={(e) => setPrompts((p) => ({ ...p, [section.id]: e.target.value }))}
                  className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-[11px] leading-relaxed text-zinc-700 outline-none"
                  placeholder={`Define strict rules for ${section.id} questions...`}
                />
                <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-3 py-2">
                  <span className="pl-1 text-[10px] tabular-nums text-zinc-400">
                    {(prompts[section.id] || '').length} chars
                  </span>
                    <button
                      type="button"
                      onClick={() => handleSavePrompt(section.id, prompts[section.id])}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <iconify-icon icon="mdi:content-save-outline" width="14" />
                      {persistMode === 'local' ? 'Apply' : 'Apply (editor)'}
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                <iconify-icon icon="mdi:auto-fix" width="22" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Refine prompt</h3>
                <p className="text-[11px] text-zinc-500">Target: {aiTargetSection}</p>
              </div>
            </div>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-600">Instruction</label>
            <textarea
              autoFocus
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="e.g. Make distractors focus on sign errors in numerical answers…"
              className="mb-4 h-28 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAiOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAiRefine}
                disabled={isRefining || !aiInstruction.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {isRefining ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <iconify-icon icon="mdi:auto-fix" width="16" />
                )}
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeetPromptSetDetail;
