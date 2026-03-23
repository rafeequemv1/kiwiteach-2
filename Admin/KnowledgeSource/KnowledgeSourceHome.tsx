
import '../../types';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  created_at: string;
  /** Shared platform KB (e.g. IIT-JEE); not tied to one user */
  is_catalog?: boolean;
}

interface KnowledgeSourceHomeProps {
  onSelectKb: (kb: { id: string; name: string }) => void;
}

const KnowledgeSourceHome: React.FC<KnowledgeSourceHomeProps> = ({ onSelectKb }) => {
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKbName, setNewKbName] = useState('');

  const fetchKBs = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('knowledge_bases')
        .select('*')
        .or(`user_id.eq.${user.id},is_catalog.eq.true`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKbList(data || []);
    } catch (e) {
      console.error("Supabase fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKBs();
  }, []);

  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKbName.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('knowledge_bases')
        .insert([{ 
            name: newKbName, 
            description: 'Cloud Curriculum Base',
            user_id: user.id // Assign to User
        }])
        .select()
        .single();

      if (error) throw error;
      
      setKbList([data, ...kbList]);
      setNewKbName('');
      setIsModalOpen(false);
      onSelectKb(data);
    } catch (err: any) {
      alert("Creation failed: " + err.message);
    }
  };

  const deleteKb = async (e: React.MouseEvent, id: string, name: string, isCatalog?: boolean) => {
    e.stopPropagation();
    if (isCatalog) {
      alert('Catalog knowledge bases (e.g. IIT-JEE) cannot be deleted from here.');
      return;
    }
    if (!confirm(`DANGER: This will permanently delete the Knowledge Base "${name}" and ALL classes, subjects, and chapters inside it. Proceed?`)) return;
    
    try {
      const { error } = await supabase
        .from('knowledge_bases')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setKbList(kbList.filter(k => k.id !== id));
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const themes = [
    { color: 'border-indigo-500', icon: 'mdi:book-open-page-variant', bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { color: 'border-emerald-500', icon: 'mdi:brain', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { color: 'border-amber-500', icon: 'mdi:school', bg: 'bg-amber-50', text: 'text-amber-600' },
    { color: 'border-rose-500', icon: 'mdi:library', bg: 'bg-rose-50', text: 'text-rose-600' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2">
        <div className="flex gap-4">
          <Metric label="Cloud Bases" value={isLoading ? "..." : kbList.length.toString()} />
          <Metric label="Storage" value="Supabase" />
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
          <iconify-icon icon="mdi:plus-circle" width="14"></iconify-icon>
          Create New Base
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kbList.map((kb, idx) => {
          const theme = themes[idx % themes.length];
          return (
            <div 
              key={kb.id}
              onClick={() => onSelectKb(kb)}
              className={`group relative flex min-h-[110px] cursor-pointer flex-col justify-between rounded-xl border border-zinc-200 border-l-4 ${theme.color} bg-white p-4 shadow-sm transition-all hover:shadow-md`}
            >
              <div className="flex justify-between items-start">
                <div className={`w-8 h-8 ${theme.bg} ${theme.text} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <iconify-icon icon={theme.icon} width="18"></iconify-icon>
                </div>
                {!kb.is_catalog ? (
                  <button 
                    onClick={(e) => deleteKb(e, kb.id, kb.name, kb.is_catalog)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-50 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    title="Delete Knowledge Base"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" width="14"></iconify-icon>
                  </button>
                ) : (
                  <span className="text-[7px] font-black uppercase tracking-widest text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                    Catalog
                  </span>
                )}
              </div>
              
              <div className="mt-3">
                <h3 className="mb-0.5 truncate text-xs font-semibold leading-tight text-zinc-900">{kb.name}</h3>
                <p className="truncate text-[8px] font-medium uppercase tracking-wide text-zinc-500">
                  {kb.is_catalog ? 'Platform curriculum' : 'Synced & Secured'}
                </p>
              </div>
            </div>
          );
        })}

        {kbList.length === 0 && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 py-20">
            <iconify-icon icon="mdi:database-off" width="48" className="mb-2 text-zinc-200"></iconify-icon>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">No knowledge bases yet</p>
            <button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 text-xs font-medium text-zinc-700 underline decoration-zinc-300 hover:text-zinc-900">Create one</button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-slide-up rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
            <h3 className="mb-6 text-lg font-semibold tracking-tight text-zinc-900">New knowledge base</h3>
            <form onSubmit={handleCreateKb}>
              <div className="mb-8">
                <label className="mb-2 ml-1 block text-[11px] font-medium text-zinc-600">Name</label>
                <input 
                  type="text"
                  required
                  value={newKbName}
                  onChange={(e) => setNewKbName(e.target.value)}
                  placeholder="e.g. Cambridge Physics"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                  autoFocus
                />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-xl py-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-zinc-900 py-3 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col">
    <span className="mb-0.5 text-[8px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
    <span className="text-xs font-semibold leading-none text-zinc-900">{value}</span>
  </div>
);

export default KnowledgeSourceHome;
