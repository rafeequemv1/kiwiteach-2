import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

interface KBRow {
  id: string;
  name: string;
}

interface TeamRow {
  id: string;
  full_name: string | null;
  role: string | null;
}

interface AccessRow {
  user_id: string;
  knowledge_base_id: string;
}

const KnowledgeBaseAccessManager: React.FC = () => {
  const [kbs, setKbs] = useState<KBRow[]>([]);
  const [users, setUsers] = useState<TeamRow[]>([]);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, usersRes, accessRes] = await Promise.all([
        supabase.from('knowledge_bases').select('id, name').order('name', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('role', ['developer', 'school_admin', 'teacher'])
          .order('full_name', { ascending: true }),
        supabase.from('user_knowledge_base_access').select('user_id, knowledge_base_id'),
      ]);

      if (kbRes.error) throw kbRes.error;
      if (usersRes.error) throw usersRes.error;
      if (accessRes.error) throw accessRes.error;

      setKbs((kbRes.data || []) as KBRow[]);
      const team = (usersRes.data || []) as TeamRow[];
      setUsers(team);
      setAccessRows((accessRes.data || []) as AccessRow[]);
      if (!selectedUserId && team.length) setSelectedUserId(team[0].id);
    } catch (e) {
      console.error('Failed to load knowledge access', e);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const label = `${u.full_name || ''} ${u.role || ''} ${u.id}`.toLowerCase();
      return label.includes(term);
    });
  }, [users, query]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const hasAccess = (kbId: string) => accessRows.some((r) => r.user_id === selectedUserId && r.knowledge_base_id === kbId);

  const toggleKb = async (kbId: string, nextChecked: boolean) => {
    if (!selectedUserId) return;
    setSavingId(kbId);
    try {
      if (nextChecked) {
        const { error } = await supabase.from('user_knowledge_base_access').insert({
          user_id: selectedUserId,
          knowledge_base_id: kbId,
        });
        if (error) throw error;
        setAccessRows((prev) => [...prev, { user_id: selectedUserId, knowledge_base_id: kbId }]);
      } else {
        const { error } = await supabase
          .from('user_knowledge_base_access')
          .delete()
          .eq('user_id', selectedUserId)
          .eq('knowledge_base_id', kbId);
        if (error) throw error;
        setAccessRows((prev) => prev.filter((r) => !(r.user_id === selectedUserId && r.knowledge_base_id === kbId)));
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to update access');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-900">Knowledge base access</h3>
        <p className="text-[11px] text-zinc-500">Assign which users can view each knowledge base.</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white py-10 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Loading access...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <input
              type="text"
              placeholder="Search team member"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-2 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
              {filteredUsers.map((u) => {
                const active = selectedUserId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left ${
                      active ? 'border-indigo-200 bg-indigo-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                    }`}
                  >
                    <p className="truncate text-xs font-semibold text-zinc-900">{u.full_name || u.id.slice(0, 8)}</p>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">{u.role || 'unknown'}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Selected user</p>
              <p className="mt-1 text-xs font-semibold text-zinc-900">{selectedUser?.full_name || 'No user selected'}</p>
            </div>
            <div className="space-y-2">
              {kbs.map((kb) => {
                const checked = hasAccess(kb.id);
                const disabled = !selectedUserId || savingId === kb.id;
                return (
                  <label key={kb.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2">
                    <span className="text-xs font-medium text-zinc-800">{kb.name}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => void toggleKb(kb.id, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseAccessManager;
