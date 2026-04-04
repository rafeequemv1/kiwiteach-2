import '../../types';
import React, { useState } from 'react';
import NeetPromptSetDetail from './NeetPromptSetDetail';
import { DEFAULT_PROMPTS, KIWITEACH_SYSTEM_PROMPTS_KEY } from './neetPromptConfig';

type PromptHubView = 'hub' | 'neet';

interface PromptSetMeta {
  id: PromptHubView;
  label: string;
  description: string;
  icon: string;
  /** Only 'neet' is navigable; 'hub' is internal */
  navigable?: boolean;
}

const VISIBLE_SETS: PromptSetMeta[] = [
  {
    id: 'neet',
    label: 'NEET',
    description: 'Medical entrance — system prompts, forge notes, reference quality layer, and JSON export.',
    icon: 'mdi:stethoscope',
    navigable: true,
  },
];

interface PromptsHomeProps {
  /** Hide duplicate page title when wrapped in Admin section frame */
  embedded?: boolean;
}

const PromptsHome: React.FC<PromptsHomeProps> = ({ embedded }) => {
  const [hubView, setHubView] = useState<PromptHubView>('hub');

  const neetPreview = ((): string => {
    if (typeof window === 'undefined') return DEFAULT_PROMPTS.General;
    try {
      const saved = localStorage.getItem(KIWITEACH_SYSTEM_PROMPTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, string>;
        if (parsed.General) return parsed.General;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_PROMPTS.General;
  })();

  if (hubView === 'neet') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <NeetPromptSetDetail onBack={() => setHubView('hub')} embedded={embedded} />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-col gap-6 pb-2 ${
        embedded ? 'h-full min-w-0 flex-1 overflow-hidden' : ''
      }`}
    >
      {!embedded && (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Prompts</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Choose a prompt set to edit system logic, export JSON, and configure the reference-paper quality layer.
          </p>
        </div>
      )}

      <section className={`space-y-3 ${embedded ? 'min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar' : ''}`}>
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Prompt sets</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {VISIBLE_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => set.navigable && setHubView(set.id)}
              className="rounded-lg border border-zinc-200 bg-white text-left transition-colors hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="border-b border-zinc-200/80 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100">
                    <iconify-icon icon={set.icon} className="text-zinc-700" width="22" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">{set.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{set.description}</p>
                  </div>
                  <iconify-icon icon="mdi:chevron-right" className="shrink-0 text-zinc-400" width="22" />
                </div>
              </div>
              <div className="px-4 py-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Core prompt preview</p>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-700 custom-scrollbar">
                  {set.id === 'neet' ? neetPreview : ''}
                </pre>
              </div>
            </button>
          ))}

          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center">
            <iconify-icon icon="mdi:layers-plus" className="text-zinc-300" width="36" />
            <p className="mt-2 text-sm font-medium text-zinc-600">More prompt sets</p>
            <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-zinc-500">
              Additional exam tracks (for example JEE or state boards) will appear here as separate cards.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PromptsHome;
