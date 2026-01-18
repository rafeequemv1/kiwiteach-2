
import '../../types';
import React, { useState } from 'react';
import { supabase } from '../../supabase/client';

interface School {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_id: string | null;
}

interface SchoolManagerProps {
  schools?: School[]; // passed from Quiz.tsx
  schoolClasses?: SchoolClass[]; // passed from Quiz.tsx
  onRefresh?: () => void;
  // Deprecated props kept for compatibility if needed, but ignored
  folders?: any[]; 
  onAdd?: any;
  onDelete?: any;
}

const SchoolManager: React.FC<SchoolManagerProps> = ({ schools = [], schoolClasses = [], onRefresh }) => {
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) return;
    setIsProcessing(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from('schools').insert([{ 
            name: newSchoolName,
            user_id: user.id 
        }]);
        
        if (error) throw error;
        setNewSchoolName('');
        if (onRefresh) onRefresh();
    } catch (err: any) {
        alert("Error adding school: " + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent, schoolId: string) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setIsProcessing(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Write to the `school_classes` table
        const { error } = await supabase.from('school_classes').insert([{ 
            name: newClassName, 
            school_id: schoolId,
            user_id: user.id
        }]);

        if (error) throw error;
        setNewClassName('');
        if (onRefresh) onRefresh();
    } catch (err: any) {
        alert("Error adding class: " + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDeleteSchool = async (id: string, name: string) => {
      if(!confirm(`Delete school "${name}"? This will delete all associated classes.`)) return;
      try {
          const { error } = await supabase.from('schools').delete().eq('id', id);
          if (error) throw error;
          if (onRefresh) onRefresh();
      } catch (e: any) {
          alert("Delete failed: " + e.message);
      }
  };

  const handleDeleteClass = async (id: string) => {
      if(!confirm("Delete this class?")) return;
      try {
          // Delete from `school_classes`
          const { error } = await supabase.from('school_classes').delete().eq('id', id);
          if (error) throw error;
          if (onRefresh) onRefresh();
      } catch (e: any) {
          alert("Delete failed: " + e.message);
      }
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
          <iconify-icon icon="mdi:school-outline" width="24"></iconify-icon>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Campus Structure</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage Schools & Classrooms</p>
        </div>
      </div>

      {/* Add School Form */}
      <form onSubmit={handleAddSchool} className="flex gap-3 mb-8">
        <input 
          type="text" 
          placeholder="New School Name..." 
          value={newSchoolName}
          onChange={e => setNewSchoolName(e.target.value)}
          disabled={isProcessing}
          className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-xs transition-all"
        />
        <button type="submit" disabled={isProcessing} className="bg-indigo-600 text-white px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50">
          {isProcessing ? 'Saving...' : 'Add School'}
        </button>
      </form>

      {/* Schools List */}
      <div className="space-y-4">
        {schools.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl">
            <p className="text-xs font-bold text-slate-400">No schools defined yet.</p>
          </div>
        ) : (
          schools.map(school => (
            <div key={school.id} className="border border-slate-100 rounded-2xl overflow-hidden transition-all hover:border-slate-200">
              <div className="bg-slate-50/50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-indigo-500 border border-slate-100 shadow-sm">
                      <iconify-icon icon="mdi:domain" width="18" />
                   </div>
                   <span className="font-black text-slate-700 text-sm uppercase tracking-wide">{school.name}</span>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => setActiveSchoolId(activeSchoolId === school.id ? null : school.id)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase text-slate-500 hover:text-indigo-600 transition-colors"
                   >
                     {activeSchoolId === school.id ? 'Close' : 'Manage Classes'}
                   </button>
                   <button 
                    onClick={() => handleDeleteSchool(school.id, school.name)}
                    className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                   >
                     <iconify-icon icon="mdi:trash-can-outline" width="16" />
                   </button>
                </div>
              </div>

              {activeSchoolId === school.id && (
                <div className="p-4 bg-white border-t border-slate-100 animate-slide-up">
                   <div className="mb-4 pl-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Classrooms</p>
                      <div className="flex flex-wrap gap-2">
                        {schoolClasses.filter(c => c.school_id === school.id).map(cls => (
                          <div key={cls.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg group">
                             <span className="text-xs font-bold text-slate-600">{cls.name}</span>
                             <button onClick={() => handleDeleteClass(cls.id)} className="text-slate-300 hover:text-rose-500 transition-colors flex items-center">
                               <iconify-icon icon="mdi:close-circle" width="14" />
                             </button>
                          </div>
                        ))}
                        {schoolClasses.filter(c => c.school_id === school.id).length === 0 && (
                          <span className="text-[10px] text-slate-300 italic py-1">No classes added.</span>
                        )}
                      </div>
                   </div>
                   
                   <form onSubmit={(e) => handleAddClass(e, school.id)} className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Add Class (e.g. 10-A)" 
                        value={newClassName}
                        onChange={e => setNewClassName(e.target.value)}
                        disabled={isProcessing}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 font-bold text-xs"
                        autoFocus
                      />
                      <button type="submit" disabled={isProcessing} className="bg-slate-800 text-white px-4 rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50">
                        Add
                      </button>
                   </form>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SchoolManager;
