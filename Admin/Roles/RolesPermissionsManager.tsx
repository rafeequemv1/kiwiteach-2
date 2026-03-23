import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabase/client';
import { APP_ROLES } from '../../auth/roles';

interface RoleRow {
  id: string;
  role_slug: string;
  display_name: string;
  description: string;
  is_system: boolean;
}

interface PermissionRow {
  id: string;
  perm_key: string;
  label: string;
  description: string;
  category: string;
  sort_order: number;
}

interface GrantRow {
  role_id: string;
  permission_id: string;
  allowed: boolean;
}

type DetailTab = 'general' | 'permissions' | 'members';

/** Matches `profiles.role` / auth — always presets, never deletable. */
const PROFILE_ROLES = new Set<string>(APP_ROLES);

const PRESET_SIDEBAR_ORDER = ['developer', 'school_admin', 'teacher', 'student'] as const;

function isPresetRole(r: RoleRow): boolean {
  return r.is_system || PROFILE_ROLES.has(r.role_slug);
}

function sortRolesForDisplay(list: RoleRow[]): RoleRow[] {
  const rank = (slug: string) => {
    const i = (PRESET_SIDEBAR_ORDER as readonly string[]).indexOf(slug);
    return i >= 0 ? i : 100;
  };
  return [...list].sort((a, b) => {
    const d = rank(a.role_slug) - rank(b.role_slug);
    if (d !== 0) return d;
    return a.display_name.localeCompare(b.display_name);
  });
}

function sanitizeRoleSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function categoryTitle(slug: string) {
  const s = (slug || 'general').toLowerCase();
  if (s === 'navigation' || s === 'nav') return 'Navigation';
  if (s === 'admin') return 'Administration';
  if (s === 'general') return 'General';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function permissionVisual(p: PermissionRow): { icon: string; box: string } {
  const key = p.perm_key.toLowerCase();
  if (key.includes('delete') || key.endsWith('.delete'))
    return { icon: 'mdi:delete-outline', box: 'bg-rose-100 text-rose-700' };
  if (key.includes('view') || key.includes('read') || key.startsWith('nav.'))
    return { icon: 'mdi:eye-outline', box: 'bg-amber-100 text-amber-800' };
  if (key.includes('edit') || key.includes('update') || key.includes('manage'))
    return { icon: 'mdi:pencil-outline', box: 'bg-emerald-100 text-emerald-800' };
  if (key.startsWith('admin.'))
    return { icon: 'mdi:shield-key-outline', box: 'bg-violet-100 text-violet-700' };
  return { icon: 'mdi:key-variant', box: 'bg-slate-200 text-slate-700' };
}

interface AppUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  business_id?: string | null;
}

interface RolesPermissionsManagerProps {
  /** When true, omit outer card and duplicate title row (e.g. Admin section frame). */
  embedded?: boolean;
}

const RolesPermissionsManager: React.FC<RolesPermissionsManagerProps> = ({ embedded }) => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('permissions');

  const [permSearch, setPermSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const [generalName, setGeneralName] = useState('');
  const [generalDesc, setGeneralDesc] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  const [addPermOpen, setAddPermOpen] = useState(false);
  const [newPermKey, setNewPermKey] = useState('');
  const [newPermLabel, setNewPermLabel] = useState('');
  const [newPermDesc, setNewPermDesc] = useState('');
  const [newPermCategory, setNewPermCategory] = useState('general');
  const [creatingPerm, setCreatingPerm] = useState(false);

  const [dupOpen, setDupOpen] = useState(false);
  const [dupSlug, setDupSlug] = useState('');
  const [dupName, setDupName] = useState('');
  const [duping, setDuping] = useState(false);
  const [dupSource, setDupSource] = useState<RoleRow | null>(null);

  const [members, setMembers] = useState<AppUserRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');

  const [seedBanner, setSeedBanner] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  /** Prefer SQL views `public.roles` / `public.permissions`; fall back to base tables if migrations not applied yet. */
  const loadAll = useCallback(async (opts?: { trySeed?: boolean }) => {
    const trySeed = opts?.trySeed !== false;
    setLoading(true);
    setSeedBanner(null);

    const fetchRolesPermsGrants = async () => {
      let rRes = await supabase.from('roles').select('*').order('role_slug');
      if (rRes.error) {
        rRes = await supabase.from('role_registry').select('*').order('role_slug');
      }
      let pRes = await supabase.from('permissions').select('*');
      if (pRes.error) {
        pRes = await supabase.from('permission_registry').select('*');
      }
      const gRes = await supabase.from('role_permission_grant').select('role_id, permission_id, allowed');
      return { rRes, pRes, gRes };
    };

    try {
      let { rRes, pRes, gRes } = await fetchRolesPermsGrants();

      if (rRes.error) throw rRes.error;
      if (pRes.error) throw pRes.error;
      if (gRes.error) throw gRes.error;

      let roleRows = (rRes.data || []) as RoleRow[];
      let permRows = (pRes.data || []) as PermissionRow[];

      if (trySeed && (roleRows.length === 0 || permRows.length === 0)) {
        const { error: seedErr } = await supabase.rpc('admin_ensure_role_permission_seed');
        if (!seedErr) {
          setSeedBanner(
            'Default roles and permissions are now stored in Supabase (views: public.roles, public.permissions; tables: role_registry, permission_registry; grants: role_permission_grant).',
          );
          const again = await fetchRolesPermsGrants();
          rRes = again.rRes;
          pRes = again.pRes;
          gRes = again.gRes;
          if (rRes.error) throw rRes.error;
          if (pRes.error) throw pRes.error;
          if (gRes.error) throw gRes.error;
          roleRows = (rRes.data || []) as RoleRow[];
          permRows = (pRes.data || []) as PermissionRow[];
        } else {
          setSeedBanner(
            `Database has no rows yet. Run migrations or click “Initialize defaults”. (${seedErr.message || 'seed failed'})`,
          );
        }
      }

      setRoles(roleRows);
      setPermissions(permRows);
      setGrants((gRes.data || []) as GrantRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load roles & permissions';
      setSeedBanner(
        `${msg} — Apply migrations in supabase/migrations (role_registry, permission_registry, role_permission_grant). Expected app roles: ${APP_ROLES.join(', ')}.`,
      );
      setRoles([]);
      setPermissions([]);
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const runSeedManually = useCallback(async () => {
    setSeeding(true);
    setSeedBanner(null);
    try {
      const { error } = await supabase.rpc('admin_ensure_role_permission_seed');
      if (error) throw error;
      setSeedBanner('Saved default roles and permissions to the database.');
      await loadAll({ trySeed: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Seed failed';
      alert(msg);
    } finally {
      setSeeding(false);
    }
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedSlug && roles.length) {
      setSelectedSlug(roles[0].role_slug);
    }
  }, [roles, selectedSlug]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.role_slug === selectedSlug) ?? null,
    [roles, selectedSlug],
  );

  const sortedRoles = useMemo(() => sortRolesForDisplay(roles), [roles]);

  useEffect(() => {
    if (selectedRole) {
      setGeneralName(selectedRole.display_name);
      setGeneralDesc(selectedRole.description || '');
    }
  }, [selectedRole?.id, selectedRole?.display_name, selectedRole?.description]);

  const grantMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const g of grants) {
      m.set(`${g.role_id}:${g.permission_id}`, g.allowed);
    }
    return m;
  }, [grants]);

  const permissionsByCategory = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    const sorted = [...permissions].sort((a, b) => {
      const ca = a.category || 'general';
      const cb = b.category || 'general';
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    const filtered = q
      ? sorted.filter(
          (p) =>
            p.perm_key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q),
        )
      : sorted;

    const map = new Map<string, PermissionRow[]>();
    for (const p of filtered) {
      const cat = p.category || 'general';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions, permSearch]);

  useEffect(() => {
    setExpandedCats((prev) => {
      const next = { ...prev };
      for (const [cat] of permissionsByCategory) {
        if (!(cat in next)) next[cat] = true;
      }
      return next;
    });
  }, [permissionsByCategory]);

  const isAllowed = (roleId: string, permId: string) => {
    return grantMap.get(`${roleId}:${permId}`) === true;
  };

  const setGrant = async (permKey: string, allowed: boolean) => {
    if (!selectedRole) return;
    const key = `${selectedRole.role_slug}:${permKey}`;
    setSavingKey(key);
    try {
      const { error } = await supabase.rpc('admin_upsert_role_grant', {
        p_role_slug: selectedRole.role_slug,
        p_perm_key: permKey,
        p_allowed: allowed,
      });
      if (error) throw error;
      setGrants((prev) => {
        const perm = permissions.find((p) => p.perm_key === permKey);
        if (!perm) return prev;
        const next = prev.filter(
          (g) => !(g.role_id === selectedRole.id && g.permission_id === perm.id),
        );
        next.push({
          role_id: selectedRole.id,
          permission_id: perm.id,
          allowed,
        });
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update grant';
      alert(msg);
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setSavingGeneral(true);
    try {
      const { error } = await supabase
        .from('role_registry')
        .update({
          display_name: generalName.trim(),
          description: generalDesc.trim(),
        })
        .eq('id', selectedRole.id);
      if (error) throw error;
      await loadAll();
    } catch (e2: unknown) {
      const msg = e2 instanceof Error ? e2.message : 'Failed to save';
      alert(msg);
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) {
      alert('Enter a role name.');
      return;
    }
    const slug = newRoleSlug.trim() ? sanitizeRoleSlug(newRoleSlug) : sanitizeRoleSlug(name);
    if (!slug) {
      alert('Enter a slug (or a role name we can turn into a slug).');
      return;
    }
    if (PROFILE_ROLES.has(slug)) {
      alert('That slug is reserved for a built-in role (developer, teacher, student, school_admin).');
      return;
    }
    setCreatingRole(true);
    try {
      const { error } = await supabase.rpc('admin_create_custom_role', {
        p_slug: slug,
        p_display_name: name,
        p_description: '',
      });
      if (error) throw error;
      setNewRoleSlug('');
      setNewRoleName('');
      setCreateRoleOpen(false);
      await loadAll();
      setSelectedSlug(slug);
      setDetailTab('permissions');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create role';
      alert(msg);
    } finally {
      setCreatingRole(false);
    }
  };

  const handleCreatePermission = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingPerm(true);
    try {
      const { error } = await supabase.rpc('admin_create_permission', {
        p_key: newPermKey,
        p_label: newPermLabel,
        p_description: newPermDesc || '',
        p_category: newPermCategory || 'general',
        p_sort_order: permissions.length * 10 + 10,
      });
      if (error) throw error;
      setNewPermKey('');
      setNewPermLabel('');
      setNewPermDesc('');
      setNewPermCategory('general');
      setAddPermOpen(false);
      await loadAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create permission';
      alert(msg);
    } finally {
      setCreatingPerm(false);
    }
  };

  const openDuplicate = (r: RoleRow) => {
    setDupSource(r);
    setDupSlug(`${r.role_slug}_copy`);
    setDupName(`Copy of ${r.display_name}`);
    setDupOpen(true);
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dupSource) return;
    setDuping(true);
    try {
      const slug = sanitizeRoleSlug(dupSlug);
      const { error: cErr } = await supabase.rpc('admin_create_custom_role', {
        p_slug: slug,
        p_display_name: dupName.trim(),
        p_description: dupSource.description || '',
      });
      if (cErr) throw cErr;

      const sourceGrants = grants.filter((g) => g.role_id === dupSource.id && g.allowed);
      for (const g of sourceGrants) {
        const perm = permissions.find((p) => p.id === g.permission_id);
        if (!perm) continue;
        const { error: uErr } = await supabase.rpc('admin_upsert_role_grant', {
          p_role_slug: slug,
          p_perm_key: perm.perm_key,
          p_allowed: true,
        });
        if (uErr) throw uErr;
      }

      setDupOpen(false);
      setDupSource(null);
      await loadAll();
      setSelectedSlug(slug);
      setDetailTab('permissions');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to duplicate role';
      alert(msg);
    } finally {
      setDuping(false);
    }
  };

  const handleDeleteRole = async (r: RoleRow) => {
    if (isPresetRole(r)) {
      alert('Built-in / preset roles cannot be deleted.');
      return;
    }
    if (!confirm(`Delete role "${r.display_name}" (${r.role_slug})? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('role_registry').delete().eq('id', r.id);
      if (error) throw error;
      const next = roles.filter((x) => x.id !== r.id);
      setSelectedSlug(next[0]?.role_slug || '');
      await loadAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete role';
      alert(msg);
    }
  };

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      setMembers((data || []) as AppUserRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load members';
      alert(msg);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detailTab === 'members' && selectedRole) {
      void loadMembers();
    }
  }, [detailTab, selectedRole?.role_slug, loadMembers]);

  const roleMembers = useMemo(() => {
    if (!selectedRole) return [];
    const q = memberQuery.trim().toLowerCase();
    return members.filter((u) => {
      if (u.role !== selectedRole.role_slug) return false;
      if (!q) return true;
      return (
        (u.email || '').toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q)
      );
    });
  }, [members, selectedRole, memberQuery]);

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const wasOpen = prev[cat] ?? true;
      return { ...prev, [cat]: !wasOpen };
    });
  };

  const modalRoot =
    typeof document !== 'undefined' ? document.body : null;

  if (loading && !roles.length) {
    return (
      <div
        className={`flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 ${
          embedded ? '' : 'rounded-xl border-zinc-200 bg-white'
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Loading roles…</p>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
        embedded ? 'bg-transparent' : 'rounded-xl border border-zinc-200 bg-white shadow-sm'
      }`}
    >
      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 ${
          embedded ? 'bg-white/90' : 'bg-zinc-50/80'
        }`}
      >
        {!embedded && (
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Roles & permissions</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Pick a role on the left, then edit info, permissions, or members.
            </p>
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-2 ${embedded ? 'ml-auto w-full justify-end md:w-auto' : ''}`}>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void runSeedManually()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            title="Inserts default roles & permissions into Supabase if tables are empty"
          >
            {seeding ? 'Initializing…' : 'Initialize defaults'}
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
          >
            Refresh
          </button>
        </div>
      </div>

      {seedBanner && (
        <div className="shrink-0 px-4 py-2.5 text-[11px] leading-snug bg-amber-50 border-b border-amber-100 text-amber-950">
          <span className="font-bold">Storage: </span>
          Roles live in <code className="font-mono text-[10px]">public.role_registry</code> (exposed as view{' '}
          <code className="font-mono text-[10px]">public.roles</code>). Permissions in{' '}
          <code className="font-mono text-[10px]">public.permission_registry</code> (view{' '}
          <code className="font-mono text-[10px]">public.permissions</code>). Grants in{' '}
          <code className="font-mono text-[10px]">public.role_permission_grant</code>.{' '}
          {seedBanner}
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Role list — replaces dropdown (no clipping inside scroll parents) */}
        <aside className="flex min-h-0 max-h-[min(40vh,320px)] w-full shrink-0 flex-col border-b border-zinc-200 bg-zinc-50/50 lg:max-h-none lg:w-[min(100%,280px)] lg:border-b-0 lg:border-r lg:border-zinc-200">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Role list
            </span>
            <button
              type="button"
              onClick={() => {
                setNewRoleSlug('');
                setNewRoleName('');
                setCreateRoleOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              <iconify-icon icon="mdi:plus" width="14" />
              Create role
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-0">
            {sortedRoles.map((r) => {
              const active = r.role_slug === selectedSlug;
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedSlug(r.role_slug);
                    setDetailTab('permissions');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedSlug(r.role_slug);
                      setDetailTab('permissions');
                    }
                  }}
                  className={`group rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-violet-500 bg-violet-50/90 shadow-sm ring-1 ring-violet-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">{r.display_name}</p>
                      <p className="text-[10px] font-mono text-slate-500 truncate">{r.role_slug}</p>
                      {isPresetRole(r) && (
                        <span className="mt-1 inline-block text-[8px] font-black uppercase tracking-wider text-violet-600/80">
                          Preset · not deletable
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        title="Duplicate role"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDuplicate(r);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <iconify-icon icon="mdi:content-copy" width="16" />
                      </button>
                      {!isPresetRole(r) && (
                        <button
                          type="button"
                          title="Delete role"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteRole(r);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <iconify-icon icon="mdi:delete-outline" width="16" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Detail */}
        <main className="flex flex-1 min-h-0 flex-col min-w-0 bg-white">
          {!selectedRole ? (
            <div className="flex flex-1 items-center justify-center p-8 text-slate-400 text-xs font-bold">
              Select a role
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-100 px-4 pt-3">
                <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
                  {(
                    [
                      ['general', 'General'],
                      ['permissions', 'Permissions'],
                      ['members', 'Manage members'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDetailTab(id)}
                      className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                        detailTab === id
                          ? 'bg-white text-violet-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
                {detailTab === 'general' && (
                  <form onSubmit={handleSaveGeneral} className="max-w-lg space-y-4">
                    <p className="text-[10px] font-bold text-slate-500">
                      Update how this role appears in the admin UI. Slug stays fixed for data safety.
                    </p>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Role name
                      </label>
                      <input
                        value={generalName}
                        onChange={(e) => setGeneralName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-violet-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Description
                      </label>
                      <textarea
                        value={generalDesc}
                        onChange={(e) => setGeneralDesc(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium outline-none focus:border-violet-500 resize-y min-h-[100px]"
                      />
                    </div>
                    <p className="text-[10px] font-mono text-slate-400">slug: {selectedRole.role_slug}</p>
                    <button
                      type="submit"
                      disabled={savingGeneral}
                      className="rounded-xl bg-violet-600 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingGeneral ? 'Saving…' : 'Save changes'}
                    </button>
                  </form>
                )}

                {detailTab === 'permissions' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                      <div className="relative flex-1 max-w-md">
                        <iconify-icon
                          icon="mdi:magnify"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          width="18"
                        />
                        <input
                          type="search"
                          value={permSearch}
                          onChange={(e) => setPermSearch(e.target.value)}
                          placeholder="Search permissions…"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs font-bold outline-none focus:border-violet-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewPermKey('');
                          setNewPermLabel('');
                          setNewPermDesc('');
                          setNewPermCategory('general');
                          setAddPermOpen(true);
                        }}
                        className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-violet-800 hover:bg-violet-100"
                      >
                        + Add permission
                      </button>
                    </div>

                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Access for <span className="text-violet-700">{selectedRole.display_name}</span>
                    </p>

                    {permissionsByCategory.length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">
                        No permissions match your search.
                      </p>
                    ) : (
                      permissionsByCategory.map(([category, perms]) => {
                        const open = expandedCats[category] ?? true;
                        return (
                          <div key={category} className="rounded-2xl border border-slate-100 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleCat(category)}
                              className="flex w-full items-center justify-between gap-2 bg-slate-50/90 px-4 py-3 text-left hover:bg-slate-100/90 transition-colors"
                            >
                              <span className="text-xs font-black text-slate-800">
                                {categoryTitle(category)}
                              </span>
                              <iconify-icon
                                icon={open ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                                className="text-slate-400"
                                width="22"
                              />
                            </button>
                            {open && (
                              <div className="divide-y divide-slate-100 bg-white">
                                {perms.map((p) => {
                                  const on = isAllowed(selectedRole.id, p.id);
                                  const busy = savingKey === `${selectedRole.role_slug}:${p.perm_key}`;
                                  const vis = permissionVisual(p);
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4"
                                    >
                                      <div
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${vis.box}`}
                                      >
                                        <iconify-icon icon={vis.icon} width="22" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900">{p.label}</p>
                                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                                          {p.description?.trim()
                                            ? p.description
                                            : 'Controls access to this part of the product.'}
                                        </p>
                                        <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                                          {p.perm_key}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                        <span
                                          className={`text-[10px] font-black uppercase tracking-widest ${
                                            on ? 'text-emerald-600' : 'text-slate-400'
                                          }`}
                                        >
                                          {on ? 'Allowed' : 'Denied'}
                                        </span>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={on}
                                          disabled={busy}
                                          onClick={() => void setGrant(p.perm_key, !on)}
                                          className={`relative h-7 w-12 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 ${
                                            on ? 'bg-emerald-500' : 'bg-slate-200'
                                          }`}
                                        >
                                          <span
                                            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                                              on ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                          />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {detailTab === 'members' && (
                  <div className="space-y-4 max-w-3xl">
                    {!PROFILE_ROLES.has(selectedRole.role_slug) ? (
                      <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-xs text-amber-900 leading-relaxed">
                        <p className="font-black uppercase tracking-widest text-[10px] mb-2 text-amber-800">
                          Custom role
                        </p>
                        Member lists here use <code className="font-mono">profiles.role</code>. Assigning
                        this custom slug to users isn&apos;t wired yet — use{' '}
                        <strong>Users</strong> for standard roles, or extend the profile model later.
                      </div>
                    ) : null}

                    <div className="relative">
                      <iconify-icon
                        icon="mdi:magnify"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        width="18"
                      />
                      <input
                        type="search"
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="Search members…"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs font-bold outline-none focus:border-violet-500"
                      />
                    </div>

                    {membersLoading ? (
                      <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-12">
                        Loading…
                      </p>
                    ) : roleMembers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                        <p className="text-sm font-bold text-slate-500">No members found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {PROFILE_ROLES.has(selectedRole.role_slug)
                            ? 'No users currently have this role.'
                            : 'Switch to a system role to see assigned users.'}
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {roleMembers.map((u) => (
                          <li
                            key={u.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 bg-slate-50/50"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">
                                {u.full_name || 'Unnamed user'}
                              </p>
                              <p className="text-xs text-slate-500 truncate">{u.email}</p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                              {new Date(u.created_at).toLocaleDateString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {modalRoot &&
        createPortal(
          <>
            {createRoleOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                  aria-label="Close"
                  onClick={() => !creatingRole && setCreateRoleOpen(false)}
                />
                <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <h3 className="text-lg font-black text-slate-900">Create role</h3>
                    <button
                      type="button"
                      onClick={() => !creatingRole && setCreateRoleOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                    >
                      <iconify-icon icon="mdi:close" width="22" />
                    </button>
                  </div>
                  <form onSubmit={handleCreateRole} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                        Role name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Role name"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                        Slug <span className="text-slate-400 font-bold normal-case">(optional)</span>
                      </label>
                      <input
                        value={newRoleSlug}
                        onChange={(e) => setNewRoleSlug(e.target.value)}
                        placeholder="Leave empty to derive from name (e.g. Content Editor → content_editor)"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCreateRoleOpen(false)}
                        disabled={creatingRole}
                        className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creatingRole}
                        className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50"
                      >
                        {creatingRole ? 'Creating…' : 'Create role'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {addPermOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                  aria-label="Close"
                  onClick={() => !creatingPerm && setAddPermOpen(false)}
                />
                <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <h3 className="text-lg font-black text-slate-900">Add permission</h3>
                    <button
                      type="button"
                      onClick={() => !creatingPerm && setAddPermOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                    >
                      <iconify-icon icon="mdi:close" width="22" />
                    </button>
                  </div>
                  <form onSubmit={handleCreatePermission} className="space-y-3">
                    <input
                      required
                      value={newPermKey}
                      onChange={(e) => setNewPermKey(e.target.value)}
                      placeholder="perm_key (e.g. admin.reports)"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-mono outline-none focus:border-violet-500"
                    />
                    <input
                      required
                      value={newPermLabel}
                      onChange={(e) => setNewPermLabel(e.target.value)}
                      placeholder="Label"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold outline-none focus:border-violet-500"
                    />
                    <input
                      value={newPermDesc}
                      onChange={(e) => setNewPermDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-violet-500"
                    />
                    <input
                      value={newPermCategory}
                      onChange={(e) => setNewPermCategory(e.target.value)}
                      placeholder="Category"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-violet-500"
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setAddPermOpen(false)}
                        disabled={creatingPerm}
                        className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creatingPerm}
                        className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50"
                      >
                        {creatingPerm ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {dupOpen && dupSource && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                  aria-label="Close"
                  onClick={() => !duping && setDupOpen(false)}
                />
                <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
                  <h3 className="text-lg font-black text-slate-900 mb-1">Duplicate role</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    From <span className="font-mono">{dupSource.role_slug}</span> — grants will be copied.
                  </p>
                  <form onSubmit={handleDuplicate} className="space-y-3">
                    <input
                      required
                      value={dupName}
                      onChange={(e) => setDupName(e.target.value)}
                      placeholder="New role name"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-violet-500"
                    />
                    <input
                      required
                      value={dupSlug}
                      onChange={(e) => setDupSlug(e.target.value)}
                      placeholder="New slug"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-violet-500"
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDupOpen(false)}
                        disabled={duping}
                        className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={duping}
                        className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50"
                      >
                        {duping ? 'Duplicating…' : 'Duplicate'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>,
          modalRoot,
        )}
    </div>
  );
};

export default RolesPermissionsManager;
