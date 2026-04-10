import '../../types';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase/client';
import { fetchBusinessesForUser, fetchClassesForUser, fetchInstitutesForUser } from '../../supabase/orgScope';

export interface BusinessRow {
  id: string;
  name: string;
  subscription_tier_id?: string | null;
  details?: Record<string, unknown> | null;
}

export interface InstituteRow {
  id: string;
  name: string;
  color?: string;
  business_id?: string | null;
}

export interface OrgClassRow {
  id: string;
  name: string;
  institute_id: string;
}

interface BusinessOrgPanelProps {
  userId: string;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
  embedded?: boolean;
  mode?: 'admin' | 'settings';
}

interface SubscriptionTierRow {
  id: string;
  name: string;
  sort_order: number;
}

interface KnowledgeBaseRow {
  id: string;
  name: string;
}

interface BusinessKnowledgeBaseAccessRow {
  business_id: string;
  knowledge_base_id: string;
}

const COLORS = ['indigo', 'rose', 'emerald', 'amber', 'violet'] as const;

function formatOrgDeleteError(raw: string): string {
  const m = raw || '';
  if (/Student must have business_id, institute_id, and class_id/i.test(m)) {
    return 'This class still has students on the roster. The roster cannot leave a student without a class. Reassign or remove those students in Students, then delete the class.';
  }
  if (/students_institute_id_fkey|violates foreign key.*institute/i.test(m)) {
    return 'This institute still has students on the roster linked to it. Reassign or remove those students in Students, then try again.';
  }
  if (/students_class_id|violates foreign key.*class/i.test(m)) {
    return 'This class still has students on the roster. Reassign or remove them in Students, then try again.';
  }
  return m;
}

/**
 * Businesses → institutes → classes. Institutes may be unassigned (legacy).
 */
const BusinessOrgPanel: React.FC<BusinessOrgPanelProps> = ({
  userId,
  onRefresh,
  title = 'Business',
  subtitle = 'Businesses, centres, and class batches',
  embedded,
  mode = 'admin',
}) => {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [institutes, setInstitutes] = useState<InstituteRow[]>([]);
  const [classes, setClasses] = useState<OrgClassRow[]>([]);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [instituteBusinessId, setInstituteBusinessId] = useState<string>('');
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeInstituteId, setActiveInstituteId] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [loading, setLoading] = useState(true);
  const [studentCountByClass, setStudentCountByClass] = useState<Record<string, number>>({});
  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTierRow[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRow[]>([]);
  const [businessKbAccess, setBusinessKbAccess] = useState<BusinessKnowledgeBaseAccessRow[]>([]);
  const [savingBusinessKb, setSavingBusinessKb] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [br, irRes] = await Promise.all([fetchBusinessesForUser(userId), fetchInstitutesForUser(userId)]);

      if (!br.error && br.data) setBusinesses(br.data as BusinessRow[]);
      else {
        if (br.error) console.warn('businesses:', br.error.message);
        setBusinesses([]);
      }

      let instRows: { id: string; name: string; business_id?: string | null }[] | null = irRes.data as
        | { id: string; name: string; business_id?: string | null }[]
        | null;
      let irErr = irRes.error;
      if (irErr && /business_id|does not exist|42703/i.test(`${irErr.message} ${irErr.code || ''}`)) {
        const irFb = await supabase.from('institutes').select('id, name').eq('user_id', userId).order('name');
        instRows = (irFb.data as { id: string; name: string }[] | null)?.map((r) => ({ ...r, business_id: null })) ?? null;
        irErr = irFb.error;
      }
      if (!irErr && instRows) {
        setInstitutes(
          instRows.map((row, i) => ({
            ...row,
            business_id: row.business_id ?? null,
            color: COLORS[i % COLORS.length],
          }))
        );
      } else {
        if (irErr) console.warn('institutes:', irErr.message);
        setInstitutes([]);
      }

      if (mode === 'admin') {
        const [tierRes, kbRes, bizKbRes] = await Promise.all([
          supabase
            .from('subscription_tiers')
            .select('id, name, sort_order')
            .eq('audience', 'b2b')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabase.from('knowledge_bases').select('id, name').order('name', { ascending: true }),
          supabase.from('business_knowledge_base_access').select('business_id, knowledge_base_id'),
        ]);
        if (!tierRes.error && tierRes.data) setSubscriptionTiers(tierRes.data as SubscriptionTierRow[]);
        else {
          if (tierRes.error) console.warn('subscription tiers:', tierRes.error.message);
          setSubscriptionTiers([]);
        }
        if (!kbRes.error && kbRes.data) setKnowledgeBases(kbRes.data as KnowledgeBaseRow[]);
        else {
          if (kbRes.error) console.warn('knowledge bases:', kbRes.error.message);
          setKnowledgeBases([]);
        }
        if (!bizKbRes.error && bizKbRes.data) setBusinessKbAccess(bizKbRes.data as BusinessKnowledgeBaseAccessRow[]);
        else {
          if (bizKbRes.error) console.warn('business KB access:', bizKbRes.error.message);
          setBusinessKbAccess([]);
        }
      } else {
        setSubscriptionTiers([]);
        setKnowledgeBases([]);
        setBusinessKbAccess([]);
      }

      const instIds = (instRows || []).map((r) => r.id);
      const cr = await fetchClassesForUser(userId, instIds);
      if (!cr.error && cr.data) {
        const cls = cr.data as OrgClassRow[];
        setClasses(cls);
        const classIds = cls.map((c) => c.id);
        if (classIds.length > 0) {
          const { data: profileRows, error: prErr } = await supabase
            .from('profiles')
            .select('class_id, role')
            .in('class_id', classIds)
            .ilike('role', 'student');
          if (!prErr && profileRows) {
            const nextCounts: Record<string, number> = {};
            for (const row of profileRows as { class_id?: string | null }[]) {
              const cid = row.class_id || null;
              if (!cid) continue;
              nextCounts[cid] = (nextCounts[cid] || 0) + 1;
            }
            setStudentCountByClass(nextCounts);
          } else {
            if (prErr) console.warn('profiles student count:', prErr.message);
            setStudentCountByClass({});
          }
        } else {
          setStudentCountByClass({});
        }
      } else {
        if (cr.error) console.warn('classes:', cr.error.message);
        setClasses([]);
        setStudentCountByClass({});
      }
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const unassignedInstitutes = institutes.filter((i) => !i.business_id);

  const studentCountForInstitute = (instituteId: string) =>
    classes
      .filter((c) => c.institute_id === instituteId)
      .reduce((sum, c) => sum + (studentCountByClass[c.id] || 0), 0);

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusinessName.trim()) return;
    const { error } = await supabase
      .from('businesses')
      .insert({ name: newBusinessName.trim(), user_id: userId })
      .select('id, name')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setNewBusinessName('');
    await load();
    onRefresh?.();
  };

  const handleAssignBusinessTier = async (businessId: string, tierId: string | null) => {
    const { error } = await supabase
      .from('businesses')
      .update({ subscription_tier_id: tierId })
      .eq('id', businessId);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
    onRefresh?.();
  };

  const handleDeleteBusiness = async (id: string) => {
    if (!confirm('Remove this business? Institutes under it become unassigned.')) return;
    // Do not filter by user_id: same-business teachers may delete; RLS enforces access.
    const { data, error } = await supabase.from('businesses').delete().eq('id', id).select('id');
    if (error) {
      alert(error.message);
      return;
    }
    if (!data?.length) {
      alert('Could not remove this business. You may not have permission, or it no longer exists.');
      return;
    }
    await load();
    onRefresh?.();
  };

  const businessHasKb = (businessId: string, kbId: string) =>
    businessKbAccess.some((r) => r.business_id === businessId && r.knowledge_base_id === kbId);

  const handleToggleBusinessKb = async (businessId: string, kbId: string, nextChecked: boolean) => {
    setSavingBusinessKb(`${businessId}:${kbId}`);
    try {
      if (nextChecked) {
        const { error } = await supabase
          .from('business_knowledge_base_access')
          .insert({ business_id: businessId, knowledge_base_id: kbId });
        if (error) throw error;
        setBusinessKbAccess((prev) => [...prev, { business_id: businessId, knowledge_base_id: kbId }]);
      } else {
        const { error } = await supabase
          .from('business_knowledge_base_access')
          .delete()
          .eq('business_id', businessId)
          .eq('knowledge_base_id', kbId);
        if (error) throw error;
        setBusinessKbAccess((prev) =>
          prev.filter((r) => !(r.business_id === businessId && r.knowledge_base_id === kbId)),
        );
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to update business knowledge access');
    } finally {
      setSavingBusinessKb(null);
    }
  };

  const handleAddInstitute = async (e: React.FormEvent, businessId: string | null) => {
    e.preventDefault();
    if (!newInstituteName.trim()) return;
    const row: Record<string, unknown> = {
      name: newInstituteName.trim(),
      user_id: userId,
    };
    if (businessId) row.business_id = businessId;
    let { error } = await supabase.from('institutes').insert(row).select('id').maybeSingle();
    if (error && /business_id|does not exist|42703/i.test(`${error.message} ${error.code || ''}`)) {
      const { error: e2 } = await supabase
        .from('institutes')
        .insert({ name: newInstituteName.trim(), user_id: userId })
        .select('id')
        .maybeSingle();
      error = e2;
    }
    if (error) {
      alert(error.message);
      return;
    }
    setNewInstituteName('');
    await load();
    onRefresh?.();
  };

  const handleDeleteInstitute = async (id: string) => {
    if (!confirm('Delete this institute and all linked classes?')) return;
    const { count: rosterN, error: countErr } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('institute_id', id);
    if (!countErr && rosterN && rosterN > 0) {
      alert(
        `This institute has ${rosterN} student(s) on the roster. Reassign or remove them in Students before deleting the institute.`,
      );
      return;
    }
    const { data, error } = await supabase.from('institutes').delete().eq('id', id).select('id');
    if (error) {
      alert(formatOrgDeleteError(error.message));
      return;
    }
    if (!data?.length) {
      alert(
        'Could not delete this institute. You may not have permission, or linked data (e.g. students) still references it.',
      );
      return;
    }
    await load();
    onRefresh?.();
  };

  const handleAssignInstituteToBusiness = async (instituteId: string, businessId: string | null) => {
    const { error } = await supabase
      .from('institutes')
      .update({ business_id: businessId })
      .eq('id', instituteId);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
    onRefresh?.();
  };

  const handleAddClass = async (e: React.FormEvent, instituteId: string) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const { error } = await supabase
      .from('classes')
      .insert({
        name: newClassName.trim(),
        institute_id: instituteId,
        user_id: userId,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      alert(error.message);
      return;
    }
    setNewClassName('');
    await load();
    onRefresh?.();
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm('Remove this class / batch?')) return;
    const { count: rosterN, error: countErr } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', id);
    if (!countErr && rosterN && rosterN > 0) {
      alert(
        `This class has ${rosterN} student(s) on the roster. Reassign or remove them in Students, then try again.`,
      );
      return;
    }
    const { data, error } = await supabase.from('classes').delete().eq('id', id).select('id');
    if (error) {
      alert(formatOrgDeleteError(error.message));
      return;
    }
    if (!data?.length) {
      alert('Could not remove this class. You may not have permission, or it no longer exists.');
      return;
    }
    await load();
    onRefresh?.();
  };

  const renderInstituteBlock = (inst: InstituteRow) => (
    <div
      key={inst.id}
      className="overflow-hidden rounded-md border border-zinc-200 bg-white transition-colors hover:border-zinc-300"
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600">
            <iconify-icon icon="mdi:domain" width="18" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-zinc-900">{inst.name}</span>
            <span className="text-[10px] text-zinc-500">
              {classes.filter((c) => c.institute_id === inst.id).length} classes • {studentCountForInstitute(inst.id)} students
            </span>
          </div>
        </div>
        {mode === 'admin' && (
          <select
            value={inst.business_id || ''}
            onChange={(e) => void handleAssignInstituteToBusiness(inst.id, e.target.value || null)}
            className="min-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px] font-medium text-zinc-700 outline-none focus:border-zinc-400"
            title="Assign institute to business"
          >
            <option value="">Unassigned</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveInstituteId(activeInstituteId === inst.id ? null : inst.id)}
            className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors ${
              activeInstituteId === inst.id
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
            }`}
            aria-expanded={activeInstituteId === inst.id}
          >
            <iconify-icon icon={activeInstituteId === inst.id ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18" />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleDeleteInstitute(inst.id)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
          >
            <iconify-icon icon="mdi:trash-can-outline" width="16" />
          </button>
        </div>
      </div>

      {activeInstituteId === inst.id && (
        <div className="border-t border-zinc-200 bg-zinc-50/50 px-3 py-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {classes
              .filter((c) => c.institute_id === inst.id)
              .map((cls) => (
                <div
                  key={cls.id}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700"
                >
                  <span className="max-w-[140px] truncate">{cls.name}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">
                    {studentCountByClass[cls.id] || 0}
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleDeleteClass(cls.id)}
                    className="text-zinc-400 hover:text-rose-600 disabled:opacity-50"
                    aria-label={`Remove ${cls.name}`}
                  >
                    <iconify-icon icon="mdi:close" width="14" />
                  </button>
                </div>
              ))}
            {classes.filter((c) => c.institute_id === inst.id).length === 0 && (
              <span className="text-[11px] text-zinc-400">No classes yet.</span>
            )}
          </div>
          <form onSubmit={(e) => handleAddClass(e, inst.id)} className="flex gap-2">
            <input
              type="text"
              placeholder="Class / batch name"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-[11px] font-medium outline-none focus:border-zinc-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Add class
            </button>
          </form>
        </div>
      )}
    </div>
  );

  const shell = embedded ? '' : 'rounded-md border border-zinc-200 bg-white p-5 shadow-sm md:p-6';

  return (
    <div className={shell}>
      {!embedded && (
        <div className="mb-5 flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-zinc-700">
            <iconify-icon icon="mdi:briefcase-outline" width="20"></iconify-icon>
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h3>
            <p className="text-[12px] text-zinc-500">{subtitle}</p>
          </div>
        </div>
      )}

      {loading && <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Loading…</p>}

      {mode === 'admin' && (
        <form onSubmit={handleAddBusiness} className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="New business name"
            value={newBusinessName}
            onChange={(e) => setNewBusinessName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none transition-colors focus:border-zinc-400 focus:bg-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            <iconify-icon icon="mdi:plus" width="16" /> Add business
          </button>
        </form>
      )}

      <div className="mb-6 rounded-md border border-dashed border-zinc-200 bg-zinc-50/60 p-4">
        <p className="mb-2 text-[11px] font-medium text-zinc-600">
          {mode === 'admin' ? 'Add institute under a business' : 'Add institute'}
        </p>
        <form
          onSubmit={(e) => handleAddInstitute(e, instituteBusinessId || null)}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          {mode === 'admin' && (
            <select
              value={instituteBusinessId}
              onChange={(e) => setInstituteBusinessId(e.target.value)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 outline-none focus:border-zinc-400 sm:max-w-[200px]"
            >
              <option value="">Unassigned (no business)</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Institute / centre name"
            value={newInstituteName}
            onChange={(e) => setNewInstituteName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-zinc-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Add institute
          </button>
        </form>
      </div>

      {mode === 'settings' ? (
        <div className="space-y-2">
          {institutes.map((inst) => renderInstituteBlock(inst))}
          {institutes.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-zinc-200 py-10 text-center">
              <iconify-icon icon="mdi:domain-off" width="36" className="text-zinc-300" />
              <p className="text-[11px] font-medium text-zinc-500">No institutes yet</p>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="space-y-4">
        {businesses.map((biz) => {
          const nested = institutes.filter((i) => i.business_id === biz.id);
          return (
            <div
              key={biz.id}
              className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50/40 transition-colors hover:border-zinc-300"
            >
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700">
                    <iconify-icon icon="mdi:briefcase-account-outline" width="20" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-zinc-900">{biz.name}</span>
                    <span className="text-[10px] text-zinc-500">
                      {nested.length} institutes
                      {biz.subscription_tier_id
                        ? ` • ${
                            subscriptionTiers.find((t) => t.id === biz.subscription_tier_id)?.name || 'Tier assigned'
                          }`
                        : ' • No tier'}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={biz.subscription_tier_id || ''}
                    onChange={(e) => void handleAssignBusinessTier(biz.id, e.target.value || null)}
                    className="min-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px] font-medium text-zinc-700 outline-none focus:border-zinc-400"
                    title="Assign subscription tier"
                  >
                    <option value="">No tier</option>
                    {subscriptionTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setActiveBusinessId(activeBusinessId === biz.id ? null : biz.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors ${
                      activeBusinessId === biz.id
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
                    }`}
                  >
                    <iconify-icon icon={activeBusinessId === biz.id ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18" />
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleDeleteBusiness(biz.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" width="16" />
                  </button>
                </div>
              </div>

              {activeBusinessId === biz.id && (
                <div className="space-y-2 border-t border-zinc-200 bg-white px-3 py-3">
                  <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      Knowledge access for this business (paper creation)
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {knowledgeBases.map((kb) => {
                        const checked = businessHasKb(biz.id, kb.id);
                        const disabled = savingBusinessKb === `${biz.id}:${kb.id}`;
                        return (
                          <label
                            key={kb.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5"
                          >
                            <span className="truncate text-[11px] font-medium text-zinc-800">{kb.name}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => void handleToggleBusinessKb(biz.id, kb.id, e.target.checked)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {nested.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">No institutes under this business yet.</p>
                  ) : (
                    nested.map((inst) => renderInstituteBlock(inst))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unassignedInstitutes.length > 0 && (
          <div className="overflow-hidden rounded-md border border-amber-200/80 bg-amber-50/30">
            <button
              type="button"
              onClick={() => setShowUnassigned((s) => !s)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <iconify-icon icon="mdi:domain-off" width="20" className="text-amber-700" />
                <span className="text-[13px] font-medium text-zinc-900">
                  Unassigned institutes ({unassignedInstitutes.length})
                </span>
              </div>
              <iconify-icon icon={showUnassigned ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="20" />
            </button>
            {showUnassigned && (
              <div className="space-y-2 border-t border-amber-100 bg-white px-3 py-3">
                {unassignedInstitutes.map((inst) => renderInstituteBlock(inst))}
              </div>
            )}
          </div>
        )}

        {businesses.length === 0 && unassignedInstitutes.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-zinc-200 py-10 text-center">
            <iconify-icon icon="mdi:briefcase-off-outline" width="36" className="text-zinc-300" />
            <p className="text-[11px] font-medium text-zinc-500">No businesses or institutes yet</p>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};

export default BusinessOrgPanel;
