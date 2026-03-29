import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PLATFORM_BRANDING, primaryButtonStyle, resolvePlatformBranding, secondaryButtonStyle } from '../../branding/defaults';
import {
  fetchPlatformBrandingRow,
  notifyPlatformBrandingUpdated,
  savePlatformBranding,
} from '../../branding/platformBrandingService';
import type { ButtonRadiusKey, ButtonVariantKey, PlatformBrandingRow } from '../../branding/types';

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] font-semibold text-zinc-800">{label}</label>
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-zinc-200 bg-white p-0.5"
          title={label}
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        spellCheck={false}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-[12px] text-zinc-900 outline-none focus:border-zinc-400"
        placeholder="#000000"
      />
      {hint ? <p className="text-[11px] leading-snug text-zinc-500">{hint}</p> : null}
    </div>
  );
}

const RADIUS_OPTIONS: { v: ButtonRadiusKey; label: string }[] = [
  { v: 'none', label: 'None' },
  { v: 'sm', label: 'SM' },
  { v: 'md', label: 'MD' },
  { v: 'lg', label: 'LG' },
  { v: 'xl', label: 'XL' },
  { v: 'full', label: 'Pill' },
];

const VARIANT_OPTIONS: { v: ButtonVariantKey; label: string }[] = [
  { v: 'solid', label: 'Solid (gradient)' },
  { v: 'soft', label: 'Soft fill' },
  { v: 'outline', label: 'Outline' },
];

interface PlatformBrandingPanelProps {
  userId: string;
}

const PlatformBrandingPanel: React.FC<PlatformBrandingPanelProps> = ({ userId }) => {
  const [draft, setDraft] = useState<PlatformBrandingRow>(() => ({ ...DEFAULT_PLATFORM_BRANDING }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolved = useMemo(() => resolvePlatformBranding(draft), [draft]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const row = await fetchPlatformBrandingRow();
      setDraft({ ...DEFAULT_PLATFORM_BRANDING, ...row, id: 'default' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = <K extends keyof PlatformBrandingRow>(key: K, value: PlatformBrandingRow[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await savePlatformBranding(draft, userId);
      if (error) throw error;
      setMessage('Saved. The dashboard theme updates immediately.');
      notifyPlatformBrandingUpdated();
    } catch (e: any) {
      setMessage(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setDraft({ ...DEFAULT_PLATFORM_BRANDING });
    setMessage('Form reset to defaults — click Save to apply to the database.');
  };

  const tokenRows: { key: string; label: string; hex: string }[] = [
    { key: 'primary', label: 'Primary (nav active, emphasis)', hex: draft.primary_color },
    { key: 'secondary', label: 'Secondary (gradients, accents)', hex: draft.secondary_color },
    { key: 'page', label: 'Page background', hex: draft.page_background },
    { key: 'surface', label: 'Cards / surfaces', hex: draft.surface_color },
    { key: 'text', label: 'Primary text', hex: draft.text_primary },
    { key: 'muted', label: 'Muted text', hex: draft.text_muted },
    { key: 'warm', label: 'Accent warm', hex: draft.accent_warm },
    { key: 'sb1', label: 'Sidebar gradient top', hex: draft.sidebar_color_top },
    { key: 'sb2', label: 'Sidebar gradient mid', hex: draft.sidebar_color_mid },
    { key: 'sb3', label: 'Sidebar gradient bottom', hex: draft.sidebar_color_bottom },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/50">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:gap-6 md:p-6">
        <div className="min-w-0 flex-1 space-y-8 md:max-w-xl">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading branding…</p>
          ) : (
            <>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Product</h3>
                <p className="mt-1 text-[12px] text-zinc-500">Display name used in previews and documentation.</p>
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Name</label>
                <input
                  type="text"
                  value={draft.product_name}
                  onChange={(e) => patch('product_name', e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-400"
                />
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Core colors</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ColorField label="Primary" value={draft.primary_color} onChange={(v) => patch('primary_color', v)} />
                  <ColorField label="Secondary" value={draft.secondary_color} onChange={(v) => patch('secondary_color', v)} />
                  <ColorField label="Page background" value={draft.page_background} onChange={(v) => patch('page_background', v)} />
                  <ColorField label="Surface" value={draft.surface_color} onChange={(v) => patch('surface_color', v)} />
                  <ColorField label="Text primary" value={draft.text_primary} onChange={(v) => patch('text_primary', v)} />
                  <ColorField label="Text muted" value={draft.text_muted} onChange={(v) => patch('text_muted', v)} />
                  <ColorField label="Accent warm" value={draft.accent_warm} onChange={(v) => patch('accent_warm', v)} />
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Sidebar gradient</h3>
                <p className="mt-1 text-[12px] text-zinc-500">Three stops for the vertical dashboard sidebar.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <ColorField label="Top" value={draft.sidebar_color_top} onChange={(v) => patch('sidebar_color_top', v)} />
                  <ColorField label="Mid" value={draft.sidebar_color_mid} onChange={(v) => patch('sidebar_color_mid', v)} />
                  <ColorField label="Bottom" value={draft.sidebar_color_bottom} onChange={(v) => patch('sidebar_color_bottom', v)} />
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Typography</h3>
                <p className="mt-1 text-[12px] text-zinc-500">CSS font stacks (comma-separated).</p>
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sans / UI</label>
                <input
                  type="text"
                  value={draft.font_family_sans}
                  onChange={(e) => patch('font_family_sans', e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-[12px] text-zinc-900 outline-none focus:border-zinc-400"
                />
                <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Headings</label>
                <input
                  type="text"
                  value={draft.font_family_heading}
                  onChange={(e) => patch('font_family_heading', e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-[12px] text-zinc-900 outline-none focus:border-zinc-400"
                />
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">Buttons</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Radius</label>
                    <select
                      value={draft.button_radius}
                      onChange={(e) => patch('button_radius', e.target.value as ButtonRadiusKey)}
                      className="mt-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                    >
                      {RADIUS_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Style</label>
                    <select
                      value={draft.button_variant}
                      onChange={(e) => patch('button_variant', e.target.value as ButtonVariantKey)}
                      className="mt-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                    >
                      {VARIANT_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2 pb-8">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || loading}
                  className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save to database'}
                </button>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Reset form to defaults
                </button>
              </div>
              {message ? <p className="text-sm text-zinc-600 pb-4">{message}</p> : null}
            </>
          )}
        </div>

        <div className="w-full shrink-0 space-y-4 md:w-[340px] lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Live preview</h3>
            <p className="mt-1 text-[11px] text-zinc-500">Uses current form values (saved or not).</p>

            <div
              className="mt-4 overflow-hidden rounded-xl border border-zinc-200 shadow-inner"
              style={{ backgroundColor: resolved.page_background }}
            >
              <div className="flex" style={{ minHeight: 200 }}>
                <div
                  className="flex w-[108px] shrink-0 flex-col gap-1 p-2"
                  style={{ background: resolved.sidebarGradient }}
                >
                  <div className="mb-2 flex items-center gap-1.5 px-1">
                    <div className="h-6 w-6 rounded bg-white/15" />
                    <div className="h-2 w-12 rounded bg-white/30" />
                  </div>
                  <div
                    className="rounded-md px-2 py-1.5 text-[9px] font-semibold text-white shadow-sm"
                    style={{ backgroundColor: resolved.primary_color }}
                  >
                    Active
                  </div>
                  <div className="rounded-md px-2 py-1.5 text-[9px] text-white/80 hover:bg-white/10">Item</div>
                  <div className="rounded-md px-2 py-1.5 text-[9px] text-white/80 hover:bg-white/10">Item</div>
                </div>
                <div className="min-w-0 flex-1 p-3" style={{ backgroundColor: resolved.page_background }}>
                  <div
                    className="rounded-lg border p-3 shadow-sm"
                    style={{
                      backgroundColor: resolved.surface_color,
                      borderColor: `${resolved.text_muted}33`,
                    }}
                  >
                    <p
                      className="text-[11px] font-bold leading-tight"
                      style={{ fontFamily: resolved.font_family_heading, color: resolved.text_primary }}
                    >
                      {resolved.product_name}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug" style={{ fontFamily: resolved.font_family_sans, color: resolved.text_muted }}>
                      Dashboard body copy preview.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="px-3 py-1.5 text-[10px]" style={primaryButtonStyle(resolved)}>
                        Primary
                      </button>
                      <button type="button" className="px-3 py-1.5 text-[10px]" style={secondaryButtonStyle(resolved)}>
                        Secondary
                      </button>
                    </div>
                    <div
                      className="mt-2 inline-block rounded px-2 py-0.5 text-[9px] font-semibold"
                      style={{ backgroundColor: `${resolved.accent_warm}44`, color: resolved.text_primary }}
                    >
                      Warm badge
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Token map</h3>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-[11px]">
              {tokenRows.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 last:border-0">
                  <span className="min-w-0 flex-1 text-zinc-600">{t.label}</span>
                  <span className="flex items-center gap-2 font-mono text-zinc-900">
                    <span className="h-5 w-5 shrink-0 rounded border border-zinc-200" style={{ backgroundColor: t.hex }} title={t.hex} />
                    {t.hex}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformBrandingPanel;
