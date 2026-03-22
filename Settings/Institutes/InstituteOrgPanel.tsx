import '../../types';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase/client';

export interface InstituteRow {
  id: string;
  name: string;
  color?: string;
}

export interface OrgClassRow {
  id: string;
  name: string;
  institute_id: string;
}

interface InstituteOrgPanelProps {
  userId: string;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
}

const COLORS = ['indigo', 'rose', 'emerald', 'amber', 'violet'] as const;

/**
 * CRUD for `institutes` + org `classes` (coaching centres / campuses and their batches).
 */
const InstituteOrgPanel: React.FC<InstituteOrgPanelProps> = ({
  userId,
  onRefresh,
  title = 'Institutes & classes',
  subtitle = 'Schools, coaching centres, and classroom groups',
}) => {
  const [institutes, setInstitutes] = useState<InstituteRow[]>([]);
  const [classes, setClasses] = useState<OrgClassRow[]>([]);
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [activeInstituteId, setActiveInstituteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ir, cr] = await Promise.all([
        supabase.from('institutes').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('classes').select('id, name, institute_id').eq('user_id', userId).order('name'),
      ]);
      if (!ir.error && ir.data) {
        setInstitutes(
          ir.data.map((row, i) => ({
            ...row,
            color: COLORS[i % COLORS.length],
          }))
        );
      }
      if (!cr.error && cr.data) setClasses(cr.data as OrgClassRow[]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstituteName.trim()) return;
    const { data, error } = await supabase
      .from('institutes')
      .insert({ name: newInstituteName.trim(), user_id: userId })
      .select('id, name')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setNewInstituteName('');
    await load();
    onRefresh?.();
  };

  const handleAddClass = async (e: React.FormEvent, instituteId: string) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const { error } = await supabase.from('classes').insert({
      name: newClassName.trim(),
      institute_id: instituteId,
      user_id: userId,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setNewClassName('');
    await load();
    onRefresh?.();
  };

  const handleDeleteInstitute = async (id: string) => {
    if (!confirm('Delete this institute and all linked classes?')) return;
    const { error } = await supabase.from('institutes').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
    onRefresh?.();
  };

  const handleDeleteClass = async (id: string) => {
    const { error } = await supabase.from('classes').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
    onRefresh?.();
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-inner">
          <iconify-icon icon="mdi:domain" width="28"></iconify-icon>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">{title}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 mb-4 font-bold uppercase tracking-widest">Loading…</p>
      )}

      <form onSubmit={handleAddInstitute} className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
        <input
          type="text"
          placeholder="Institute or coaching centre name…"
          value={newInstituteName}
          onChange={(e) => setNewInstituteName(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-xs transition-all shadow-sm"
        />
        <button
          type="submit"
          className="bg-indigo-600 text-white px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-2"
        >
          <iconify-icon icon="mdi:plus-circle" /> Add institute
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {institutes.length === 0 ? (
          <div className="col-span-full text-center py-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center gap-4">
            <iconify-icon icon="mdi:domain-off" width="48" className="text-slate-200" />
            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No institutes yet.</p>
          </div>
        ) : (
          institutes.map((inst) => (
            <div
              key={inst.id}
              className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden transition-all hover:border-indigo-100 group shadow-sm hover:shadow-md"
            >
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm transition-transform group-hover:scale-105">
                    <iconify-icon icon="mdi:domain" width="24" />
                  </div>
                  <div>
                    <span className="font-black text-slate-800 text-sm uppercase tracking-wide">{inst.name}</span>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      {classes.filter((c) => c.institute_id === inst.id).length} classes
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveInstituteId(activeInstituteId === inst.id ? null : inst.id)}
                    className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${
                      activeInstituteId === inst.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white hover:text-indigo-600'
                    }`}
                  >
                    <iconify-icon icon={activeInstituteId === inst.id ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="20" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteInstitute(inst.id)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  >
                    <iconify-icon icon="mdi:trash-can-outline" width="20" />
                  </button>
                </div>
              </div>

              {activeInstituteId === inst.id && (
                <div className="px-6 pb-6 bg-slate-50/50 border-t border-slate-100 animate-slide-up">
                  <div className="pt-4 mb-4">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {classes
                        .filter((c) => c.institute_id === inst.id)
                        .map((cls) => (
                          <div
                            key={cls.id}
                            className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-1.5 rounded-xl group/class shadow-sm hover:border-indigo-200 transition-all"
                          >
                            <span className="text-[10px] font-black text-slate-600 uppercase">{cls.name}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteClass(cls.id)}
                              className="text-slate-300 hover:text-rose-500 transition-colors flex items-center"
                            >
                              <iconify-icon icon="mdi:close-circle" width="16" />
                            </button>
                          </div>
                        ))}
                      {classes.filter((c) => c.institute_id === inst.id).length === 0 && (
                        <span className="text-[10px] text-slate-300 italic font-medium uppercase tracking-widest py-2">
                          No classes yet
                        </span>
                      )}
                    </div>

                    <form onSubmit={(e) => handleAddClass(e, inst.id)} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Class / batch (e.g. 10-A NEET)"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 font-bold text-[10px] shadow-inner"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="bg-slate-800 text-white px-4 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-700 transition-all shadow-md active:scale-95"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InstituteOrgPanel;
