import '../../types';
import React, { useState, useEffect } from 'react';

interface School {
  id: string;
  name: string;
  color?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_id: string;
}

interface SchoolManagerProps {
  schools?: School[];
  schoolClasses?: SchoolClass[];
  onRefresh?: () => void;
}

const SchoolManager: React.FC<SchoolManagerProps> = ({ onRefresh }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);

  useEffect(() => {
    const localSchools = localStorage.getItem('kt_schools');
    const localClasses = localStorage.getItem('kt_classes');
    if (localSchools) setSchools(JSON.parse(localSchools));
    if (localClasses) setClasses(JSON.parse(localClasses));
  }, []);

  const saveToLocal = (updatedSchools: School[], updatedClasses: SchoolClass[]) => {
    localStorage.setItem('kt_schools', JSON.stringify(updatedSchools));
    localStorage.setItem('kt_classes', JSON.stringify(updatedClasses));
    if (onRefresh) onRefresh();
  };

  const handleAddSchool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) return;
    const newSchool: School = {
      id: `school-${Date.now()}`,
      name: newSchoolName,
      color: ['indigo', 'rose', 'emerald', 'amber', 'violet'][schools.length % 5]
    };
    const updated = [...schools, newSchool];
    setSchools(updated);
    setNewSchoolName('');
    saveToLocal(updated, classes);
  };

  const handleAddClass = (e: React.FormEvent, schoolId: string) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const newClass: SchoolClass = {
      id: `class-${Date.now()}`,
      name: newClassName,
      school_id: schoolId
    };
    const updated = [...classes, newClass];
    setClasses(updated);
    setNewClassName('');
    saveToLocal(schools, updated);
  };

  const handleDeleteSchool = (id: string) => {
    if(!confirm("Delete school and all its classes?")) return;
    const updatedSchools = schools.filter(s => s.id !== id);
    const updatedClasses = classes.filter(c => c.school_id !== id);
    setSchools(updatedSchools);
    setClasses(updatedClasses);
    saveToLocal(updatedSchools, updatedClasses);
  };

  const handleDeleteClass = (id: string) => {
    const updated = classes.filter(c => c.id !== id);
    setClasses(updated);
    saveToLocal(schools, updated);
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-inner">
          <iconify-icon icon="mdi:school-outline" width="28"></iconify-icon>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Organization Explorer</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage Campuses & Classrooms</p>
        </div>
      </div>

      <form onSubmit={handleAddSchool} className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
        <input 
          type="text" 
          placeholder="Enter Campus Name..." 
          value={newSchoolName}
          onChange={e => setNewSchoolName(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-xs transition-all shadow-sm"
        />
        <button type="submit" className="bg-indigo-600 text-white px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-2">
          <iconify-icon icon="mdi:plus-circle" /> Add School
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {schools.length === 0 ? (
          <div className="col-span-full text-center py-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center gap-4">
            <iconify-icon icon="mdi:domain-off" width="48" className="text-slate-200" />
            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No schools defined yet.</p>
          </div>
        ) : (
          schools.map(school => (
            <div key={school.id} className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden transition-all hover:border-indigo-100 group shadow-sm hover:shadow-md">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className={`w-12 h-12 bg-${school.color}-50 text-${school.color}-600 rounded-2xl flex items-center justify-center border border-${school.color}-100 shadow-sm transition-transform group-hover:scale-105`}>
                      <iconify-icon icon="mdi:domain" width="24" />
                   </div>
                   <div>
                      <span className="font-black text-slate-800 text-sm uppercase tracking-wide">{school.name}</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{classes.filter(c => c.school_id === school.id).length} Classes</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => setActiveSchoolId(activeSchoolId === school.id ? null : school.id)}
                    className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${activeSchoolId === school.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white hover:text-indigo-600'}`}
                   >
                     <iconify-icon icon={activeSchoolId === school.id ? "mdi:chevron-up" : "mdi:chevron-down"} width="20" />
                   </button>
                   <button 
                    onClick={() => handleDeleteSchool(school.id)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                   >
                     <iconify-icon icon="mdi:trash-can-outline" width="20" />
                   </button>
                </div>
              </div>

              {activeSchoolId === school.id && (
                <div className="px-6 pb-6 bg-slate-50/50 border-t border-slate-100 animate-slide-up">
                   <div className="pt-4 mb-4">
                      <div className="flex flex-wrap gap-2 mb-4">
                        {classes.filter(c => c.school_id === school.id).map(cls => (
                          <div key={cls.id} className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-1.5 rounded-xl group/class shadow-sm hover:border-indigo-200 transition-all">
                             <span className="text-[10px] font-black text-slate-600 uppercase">{cls.name}</span>
                             <button onClick={() => handleDeleteClass(cls.id)} className="text-slate-300 hover:text-rose-500 transition-colors flex items-center">
                               <iconify-icon icon="mdi:close-circle" width="16" />
                             </button>
                          </div>
                        ))}
                        {classes.filter(c => c.school_id === school.id).length === 0 && (
                          <span className="text-[10px] text-slate-300 italic font-medium uppercase tracking-widest py-2">No classrooms added</span>
                        )}
                      </div>
                      
                      <form onSubmit={(e) => handleAddClass(e, school.id)} className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Class ID (e.g. 10-A)" 
                          value={newClassName}
                          onChange={e => setNewClassName(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 font-bold text-[10px] shadow-inner"
                          autoFocus
                        />
                        <button type="submit" className="bg-slate-800 text-white px-4 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-700 transition-all shadow-md active:scale-95">
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

export default SchoolManager;