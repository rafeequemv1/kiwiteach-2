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
}

const ROLE_OPTIONS: AppUserRole[] = ['student', 'teacher', 'school_admin', 'developer'];

const UsersRoleManager: React.FC = () => {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'all' | AppUserRole>('all');
  const [query, setQuery] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      setUsers((data || []) as AppUserRow[]);
    } catch (e: any) {
      alert(e?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
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

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-5">
        <div>
          <h3 className="text-lg font-black text-slate-800 tracking-tight">Users</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            App users and role access control
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 bg-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-sky-500"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as any)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider outline-none focus:border-sky-500"
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
        <div className="py-16 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
          Loading users...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_0.7fr] gap-3 items-center p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 truncate">{u.full_name || 'Unnamed user'}</p>
                <p className="text-xs font-bold text-slate-500 truncate">{u.email}</p>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {new Date(u.created_at).toLocaleDateString()}
              </div>
              <select
                value={u.role}
                disabled={savingUserId === u.id}
                onChange={(e) => void updateRole(u.id, e.target.value as AppUserRole)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-[10px] font-black uppercase tracking-wider outline-none disabled:opacity-60"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
              No users found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UsersRoleManager;
