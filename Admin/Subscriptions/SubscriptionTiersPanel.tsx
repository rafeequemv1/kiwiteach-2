import '../../types';
import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

type Audience = 'b2b' | 'b2c';

interface SubscriptionTierRow {
  id: string;
  tier_key: string;
  name: string;
  description: string;
  sort_order: number;
  audience: Audience;
  is_active: boolean;
  features: {
    test_paper_generation?: boolean;
    online_exam?: boolean;
    student_profiles?: boolean;
    all_features?: boolean;
    [k: string]: any;
  };
}

const featureKeys = [
  { key: 'test_paper_generation', label: 'Test paper generation' },
  { key: 'online_exam', label: 'Online exams' },
  { key: 'student_profiles', label: 'Student profiles' },
] as const;

const SubscriptionTiersPanel: React.FC = () => {
  const [tiers, setTiers] = useState<SubscriptionTierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftFeatures, setDraftFeatures] = useState<Record<string, boolean>>({
    test_paper_generation: true,
    online_exam: false,
    student_profiles: false,
  });

  const selectedTier = useMemo(() => tiers.find((t) => t.id === selectedTierId) ?? null, [tiers, selectedTierId]);

  const hydrateDraftFromTier = useCallback((t: SubscriptionTierRow) => {
    setDraftName(t.name);
    setDraftDescription(t.description || '');
    setDraftFeatures({
      test_paper_generation: !!t.features?.test_paper_generation,
      online_exam: !!t.features?.online_exam,
      student_profiles: !!t.features?.student_profiles,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tierRes = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('audience', 'b2b')
        .order('sort_order', { ascending: true });
      if (tierRes.error) throw tierRes.error;
      const rows = (tierRes.data || []) as SubscriptionTierRow[];
      setTiers(rows);
      if (!selectedTierId && rows.length) setSelectedTierId(rows[0].id);
      const nextSelected = rows.find((r) => r.id === (selectedTierId || rows[0]?.id)) || rows[0] || null;
      if (nextSelected) hydrateDraftFromTier(nextSelected);
    } finally {
      setLoading(false);
    }
  }, [hydrateDraftFromTier, selectedTierId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleDraftFeature = (key: string) => {
    setDraftFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const computedFeatures = useMemo(() => {
    const test_paper_generation = !!draftFeatures.test_paper_generation;
    const online_exam = !!draftFeatures.online_exam;
    const student_profiles = !!draftFeatures.student_profiles;
    const all_features = test_paper_generation && online_exam && student_profiles;
    return {
      test_paper_generation,
      online_exam,
      student_profiles,
      all_features,
    };
  }, [draftFeatures]);

  const handleSelectTier = (id: string) => {
    setSelectedTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t) hydrateDraftFromTier(t);
  };

  const handleSaveUpdate = async () => {
    if (!selectedTier) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('subscription_tiers').update({
        name: draftName.trim() || selectedTier.name,
        description: draftDescription,
        features: computedFeatures,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedTier.id);
      if (error) throw error;
      await load();
      alert('Tier updated.');
    } catch (e: any) {
      alert(e?.message || 'Failed to update tier');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async () => {
    if (!selectedTier) return;
    if (!confirm(`Delete ${selectedTier.name}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('subscription_tiers').delete().eq('id', selectedTier.id);
      if (error) throw error;
      await load();
      alert('Tier deleted.');
    } catch (e: any) {
      alert(e?.message || 'Failed to delete tier');
    } finally {
      setSaving(false);
    }
  };

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const handleCreateTier = async () => {
    setSaving(true);
    try {
      const name = draftName.trim();
      if (!name) {
        alert('Tier name is required.');
        return;
      }
      const baseKey = `b2b_${slugify(name) || 'tier'}`;
      const tierKey = `${baseKey}_${Date.now().toString(36)}`;
      const { error } = await supabase.from('subscription_tiers').insert({
        audience: 'b2b',
        tier_key: tierKey,
        name,
        description: draftDescription,
        sort_order: tiers.length ? Math.max(...tiers.map((t) => t.sort_order)) + 1 : 1,
        features: computedFeatures,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await load();
      alert('Tier created.');
    } catch (e: any) {
      alert(e?.message || 'Failed to create tier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">Subscription tiers (B2B)</h3>
          <p className="text-[11px] text-zinc-500">Tier features (limits will be added later).</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          <iconify-icon icon="mdi:refresh" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white py-12 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Loading tiers...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-zinc-500">B2B tiers</div>
            <div className="space-y-2">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTier(t.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selectedTierId === t.id ? 'border-indigo-200 bg-indigo-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-900">{t.name}</p>
                      <p className="truncate text-[10px] font-medium text-zinc-500">{t.tier_key}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">
                      {t.sort_order}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      t.features?.test_paper_generation ? 'Test Paper' : null,
                      t.features?.online_exam ? 'Online Exam' : null,
                      t.features?.student_profiles ? 'Student Profiles' : null,
                    ]
                      .filter(Boolean)
                      .map((label) => (
                        <span
                          key={String(label)}
                          className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-indigo-700"
                        >
                          {label}
                        </span>
                      ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Edit tier</div>
                <div className="mt-1 text-xs font-semibold text-zinc-900">{selectedTier ? selectedTier.tier_key : 'None selected'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Tier name</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Description</label>
                <input
                  type="text"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Features</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {featureKeys.map((f) => (
                  <label
                    key={f.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 text-xs font-semibold text-zinc-800">{f.label}</span>
                    <input
                      type="checkbox"
                      checked={!!draftFeatures[f.key]}
                      onChange={() => toggleDraftFeature(f.key)}
                    />
                  </label>
                ))}
              </div>

              <div className="text-[10px] font-medium text-zinc-500">
                {computedFeatures.all_features ? 'All features enabled for this tier.' : 'Tier does not include all features.'}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => void handleSaveUpdate()}
                disabled={saving || !selectedTier}
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Update tier'}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteTier()}
                disabled={saving || !selectedTier}
                className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => void handleCreateTier()}
                disabled={saving || !draftName.trim()}
                className="inline-flex items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                title="Creates a new tier with the currently selected features."
              >
                Create tier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionTiersPanel;

