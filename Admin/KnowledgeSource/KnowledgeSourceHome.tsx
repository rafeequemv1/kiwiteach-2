
import '../../types';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  created_at: string;
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
        .eq('user_id', user.id) // Filter by user
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

  const deleteKb = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
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
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
        <div className="flex gap-4">
          <Metric label="Cloud Bases" value={isLoading ? "..." : kbList.length.toString()} />
          <Metric label="Storage" value="Supabase" />
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-accent text-white px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest shadow-md shadow-accent/10 hover:bg-indigo-700 transition-all flex items-center gap-1.5"
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
              className={`group cursor-pointer relative bg-white rounded-xl p-4 border-l-4 ${theme.color} border-t border-r border-b border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[110px]`}
            >
              <div className="flex justify-between items-start">
                <div className={`w-8 h-8 ${theme.bg} ${theme.text} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <iconify-icon icon={theme.icon} width="18"></iconify-icon>
                </div>
                <button 
                  onClick={(e) => deleteKb(e, kb.id, kb.name)}
                  className="w-6 h-6 flex items-center justify-center text-slate-200 hover:text-rose-500 transition-colors bg-slate-50 rounded-full hover:bg-rose-50"
                  title="Delete Knowledge Base"
                >
                  <iconify-icon icon="mdi:trash-can-outline" width="14"></iconify-icon>
                </button>
              </div>
              
              <div className="mt-3">
                <h3 className="text-xs font-black text-slate-800 leading-tight mb-0.5 truncate">{kb.name}</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">Synced & Secured</p>
              </div>
            </div>
          );
        })}

        {kbList.length === 0 && !isLoading && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/30">
            <iconify-icon icon="mdi:database-off" width="48" className="text-slate-200 mb-2"></iconify-icon>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No Cloud Bases Found</p>
            <button onClick={() => setIsModalOpen(true)} className="mt-4 text-accent font-bold text-xs hover:underline">Start by creating one</button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 border border-slate-200 animate-slide-up">
            <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-widest">Initialize Base</h3>
            <form onSubmit={handleCreateKb}>
              <div className="mb-8">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Unique Title</label>
                <input 
                  type="text"
                  required
                  value={newKbName}
                  onChange={(e) => setNewKbName(e.target.value)}
                  placeholder="e.g. Cambridge Physics"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-accent font-bold text-sm"
                  autoFocus
                />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent/20">Create Base</button>
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
    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tight leading-none mb-0.5">{label}</span>
    <span className="text-xs font-black text-slate-800 leading-none">{value}</span>
  </div>
);

export default KnowledgeSourceHome;
