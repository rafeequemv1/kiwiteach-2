import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

type TeamRole = 'teacher' | 'school_admin';

interface TeamUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  business_id: string | null;
}

interface BusinessOption {
  id: string;
  name: string;
}

interface TeamManagerProps {
  userId: string;
}

const ASSIGNABLE_ROLES: TeamRole[] = ['teacher', 'school_admin'];

const TeamManager: React.FC<TeamManagerProps> = ({ userId }) => {
  const [actorBusinessId, setActorBusinessId] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [emailInput, setEmailInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState<TeamUser | null>(null);
  const [assignRole, setAssignRole] = useState<TeamRole>('teacher');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('business_id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const biz = (data as { business_id?: string | null } | null)?.business_id ?? null;
        setActorBusinessId(biz);
      });
  }, [userId]);

  useEffect(() => {
    void supabase
      .from('businesses')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setBusinesses(data as BusinessOption[]);
      });
  }, []);

  useEffect(() => {
    if (selectedBusinessId) return;
    if (actorBusinessId) {
      setSelectedBusinessId(actorBusinessId);
      return;
    }
    if (businesses.length > 0) setSelectedBusinessId(businesses[0].id);
  }, [actorBusinessId, businesses, selectedBusinessId]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      setMembers(((data || []) as TeamUser[]).map((u) => ({ ...u, business_id: u.business_id ?? null })));
    } catch (e: any) {
      alert(e?.message || 'Failed to load team users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((u) => {
      const inBusiness = selectedBusinessId ? u.business_id === selectedBusinessId : true;
      const isEligibleRole = u.role === 'teacher' || u.role === 'school_admin';
      const byQuery =
        !q || (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q);
      return inBusiness && isEligibleRole && byQuery;
    });
  }, [members, selectedBusinessId, query]);

  const updateRole = async (userIdToUpdate: string, nextRole: TeamRole) => {
    setSavingUserId(userIdToUpdate);
    try {
      const { error } = await supabase.rpc('admin_set_user_role', {
        target_user_id: userIdToUpdate,
        target_role: nextRole,
      });
      if (error) throw error;
      setMembers((prev) => prev.map((u) => (u.id === userIdToUpdate ? { ...u, role: nextRole } : u)));
    } catch (e: any) {
      alert(e?.message || 'Failed to update role');
    } finally {
      setSavingUserId(null);
    }
  };

  const removeFromTeam = async (userIdToUpdate: string) => {
    if (!confirm('Remove this user from the business team?')) return;
    setSavingUserId(userIdToUpdate);
    try {
      const { error } = await supabase.rpc('admin_set_user_business', {
        target_user_id: userIdToUpdate,
        target_business_id: null,
      });
      if (error) throw error;
      setMembers((prev) => prev.map((u) => (u.id === userIdToUpdate ? { ...u, business_id: null } : u)));
    } catch (e: any) {
      alert(e?.message || 'Failed to remove from team');
    } finally {
      setSavingUserId(null);
    }
  };

  const searchByEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setSearching(true);
    setSearchedUser(null);
    try {
      const { data, error } = await supabase.rpc('admin_find_user_by_email', { target_email: email });
      if (error) throw error;
      const row = ((data || []) as TeamUser[])[0] || null;
      if (!row) {
        alert('No user found for this email.');
        return;
      }
      if (row.role === 'student') {
        alert('Student users are not managed in Team. Use teacher or school admin accounts only.');
        return;
      }
      setSearchedUser(row);
    } catch (e: any) {
      alert(e?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const assignToTeam = async () => {
    if (!searchedUser || !selectedBusinessId) return;
    setSavingUserId(searchedUser.id);
    try {
      const { error: bizErr } = await supabase.rpc('admin_set_user_business', {
        target_user_id: searchedUser.id,
        target_business_id: selectedBusinessId,
      });
      if (bizErr) throw bizErr;

      const { error: roleErr } = await supabase.rpc('admin_set_user_role', {
        target_user_id: searchedUser.id,
        target_role: assignRole,
      });
      if (roleErr) throw roleErr;

      setSearchedUser(null);
      setEmailInput('');
      await loadUsers();
    } catch (e: any) {
      alert(e?.message || 'Failed to assign team member');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
          <input
            type="email"
            placeholder="Search user by email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-zinc-400"
          />
          <button
            type="button"
            onClick={() => void searchByEmail()}
            disabled={searching}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchedUser && (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-zinc-900">{searchedUser.full_name || 'Unnamed user'}</p>
              <p className="truncate text-[11px] text-zinc-500">{searchedUser.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value as TeamRole)}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium uppercase text-zinc-700"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void assignToTeam()}
                disabled={savingUserId === searchedUser.id || !selectedBusinessId}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium uppercase text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                Add to team
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter users by email or name"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-zinc-400 sm:w-72"
          />
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
        <select
          value={selectedBusinessId}
          onChange={(e) => setSelectedBusinessId(e.target.value)}
          disabled={!!actorBusinessId}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-400 disabled:opacity-60"
          title={actorBusinessId ? 'School admin is locked to their own business' : 'Business'}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-md border border-zinc-200 bg-white py-12 text-center text-xs font-medium uppercase tracking-wider text-zinc-400">
          Loading team...
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white py-12 text-center text-xs font-medium text-zinc-400">
          No teacher or school admin users found in this business.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMembers.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_150px_110px]"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-900">{u.full_name || 'Unnamed user'}</p>
                <p className="truncate text-[11px] text-zinc-500">{u.email}</p>
              </div>
              <select
                value={(u.role as TeamRole) || 'teacher'}
                disabled={savingUserId === u.id}
                onChange={(e) => void updateRole(u.id, e.target.value as TeamRole)}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium uppercase text-zinc-700 outline-none disabled:opacity-60"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={savingUserId === u.id}
                onClick={() => void removeFromTeam(u.id)}
                className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamManager;
