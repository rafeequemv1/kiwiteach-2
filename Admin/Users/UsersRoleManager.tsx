import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

type AppUserRole = 'developer' | 'teacher' | 'student' | 'school_admin';

interface AppUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AppUserRole;
  created_at: string;
  business_id: string | null;
}

const ROLE_OPTIONS: AppUserRole[] = ['student', 'teacher', 'school_admin', 'developer'];

interface UsersRoleManagerProps {
  /** When true, omit outer card and duplicate title (e.g. Admin section frame). */
  embedded?: boolean;
}

const UsersRoleManager: React.FC<UsersRoleManagerProps> = ({ embedded }) => {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'all' | AppUserRole>('all');
  const [query, setQuery] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      setUsers(
        ((data || []) as AppUserRow[]).map((u) => ({
          ...u,
          business_id: u.business_id ?? null,
        }))
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    void supabase
      .from('businesses')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setBusinesses(data);
      });
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const byRole = filterRole === 'all' || u.role === filterRole;
      const q = query.trim().toLowerCase();
      const byQuery =
        !q ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q);
      return byRole && byQuery;
    });
  }, [users, filterRole, query]);

  const updateRole = async (userId: string, newRole: AppUserRole) => {
    setSavingUserId(userId);
    try {
      const { error } = await supabase.rpc('admin_set_user_role', {
        target_user_id: userId,
        target_role: newRole,
      });
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e: any) {
      alert(e?.message || 'Failed to update role');
    } finally {
      setSavingUserId(null);
    }
  };

  const updateBusiness = async (userId: string, businessId: string | null) => {
    setSavingUserId(userId);
    try {
      const { error } = await supabase.rpc('admin_set_user_business', {
        target_user_id: userId,
        target_business_id: businessId,
      });
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, business_id: businessId } : u)));
    } catch (e: any) {
      alert(e?.message || 'Failed to update business');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className={embedded ? '' : 'rounded-xl border border-zinc-200 bg-white p-6 shadow-sm'}>
      <div
        className={`flex flex-col gap-3 md:flex-row md:items-center ${
          embedded ? 'mb-4 justify-end md:justify-end' : 'md:justify-between mb-5'
        }`}
      >
        {!embedded && (
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">Users</h3>
            <p className="mt-0.5 text-[12px] text-zinc-500">App users and role access</p>
          </div>
        )}
        <div className={`flex gap-2 ${embedded ? 'md:ml-auto' : ''}`}>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name..."
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as any)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-800 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
        >
          <option value="all">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs font-medium uppercase tracking-wide text-zinc-400">
          Loading users…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-1 items-center gap-3 rounded-xl border border-zinc-100 bg-white p-3 hover:border-zinc-200 md:grid-cols-[1.6fr_1fr_0.7fr_1fr]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{u.full_name || 'Unnamed user'}</p>
                <p className="truncate text-xs font-medium text-zinc-500">{u.email}</p>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {new Date(u.created_at).toLocaleDateString()}
              </div>
              <select
                value={u.role}
                disabled={savingUserId === u.id}
                onChange={(e) => void updateRole(u.id, e.target.value as AppUserRole)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[10px] font-medium uppercase tracking-wide outline-none disabled:opacity-60"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={u.business_id ?? ''}
                disabled={savingUserId === u.id}
                onChange={(e) =>
                  void updateBusiness(u.id, e.target.value ? e.target.value : null)
                }
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[10px] font-medium outline-none disabled:opacity-60"
                title="Business / org"
              >
                <option value="">No business</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs font-medium text-zinc-400">
              No users found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UsersRoleManager;
