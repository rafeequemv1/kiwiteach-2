
import '../types';
import React, { useState, useMemo } from 'react';
import { Student, SchoolClass } from './StudentDirectory';
import { supabase } from '../supabase/client';

interface StudentProfileProps {
  student: Student;
  schoolsAndClasses: SchoolClass[];
  onBack: () => void;
  onUpdate: () => void; // Callback to refresh the directory
}

const StudentProfile: React.FC<StudentProfileProps> = ({ student, schoolsAndClasses, onBack, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
      name: student.name,
      email: student.email || '',
      mobile_phone: student.mobile_phone || '',
      class_id: student.class_id || '',
      attending_exams: student.attending_exams?.join(', ') || ''
  });

  const schools = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'school'), [schoolsAndClasses]);
  const classes = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'class'), [schoolsAndClasses]);

  const { schoolName, className } = useMemo(() => {
    if (!student.class_id) return { schoolName: 'Unassigned', className: 'N/A' };
    const sClass = classes.find(c => c.id === student.class_id);
    if (!sClass) return { schoolName: 'Unknown', className: 'Unknown' };
    const school = schools.find(s => s.id === sClass.parent_id);
    return { schoolName: school?.name || 'Unassigned', className: sClass.name };
  }, [student, schools, classes]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        const { error } = await supabase
            .from('students')
            .update({
                name: formData.name,
                email: formData.email,
                mobile_phone: formData.mobile_phone,
                class_id: formData.class_id || null,
                attending_exams: formData.attending_exams.split(',').map(e => e.trim()).filter(Boolean)
            })
            .eq('id', student.id);
        
        if (error) throw error;

        onUpdate(); // Re-fetch data in parent
        setIsEditing(false);

    } catch (err: any) {
        alert("Update failed: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-800"><iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon></button>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Student Profile</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Database Record • {student.id}</p>
            </div>
        </div>
        {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"><iconify-icon icon="mdi:pencil"></iconify-icon> Edit</button>
        ) : (
            <div className="flex gap-2">
                <button onClick={() => setIsEditing(false)} className="bg-white border border-slate-200 text-slate-500 px-4 py-2 rounded-lg font-medium text-xs">Cancel</button>
                <button onClick={handleSave} disabled={isSaving} className="bg-accent text-white px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-md">
                    {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:check"></iconify-icon>}
                    Save
                </button>
            </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row items-center text-center sm:text-left gap-6">
            <img src={student.avatar} alt={student.name} className="w-24 h-24 rounded-full border-4 border-slate-50 bg-slate-50 shadow-inner shrink-0" />
            <div className="flex-1">
              {isEditing ? (
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full text-2xl font-bold text-slate-800 leading-tight bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-accent"/>
              ) : (
                <h1 className="text-2xl font-bold text-slate-800 leading-tight">{student.name}</h1>
              )}
              {isEditing ? (
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full text-sm font-medium text-slate-400 mt-1 bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-accent"/>
              ) : (
                <p className="text-sm font-medium text-slate-400 mt-1">{student.email}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4">Contact Information</h3>
              <div className="space-y-4">
                <InfoItem icon="mdi:email-outline" label="Email Address" value={isEditing ? <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded p-1"/> : student.email} />
                <InfoItem icon="mdi:phone-outline" label="Mobile Phone" value={isEditing ? <input type="text" name="mobile_phone" value={formData.mobile_phone} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded p-1"/> : student.mobile_phone} />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4">Academic Details</h3>
              <div className="space-y-4">
                 <InfoItem icon="mdi:school-outline" label="School" value={schoolName} />
                 <InfoItem icon="mdi:google-classroom" label="Class" value={isEditing ? (
                     <select name="class_id" value={formData.class_id} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded p-1 border border-slate-200 outline-none focus:border-accent">
                         <option value="">Unassigned</option>
                         {schools.map(school => (
                             <optgroup key={school.id} label={school.name}>
                                 {classes.filter(c => c.parent_id === school.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                             </optgroup>
                         ))}
                     </select>
                 ) : className} />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4">Attending Exams</h3>
            {isEditing ? (
                 <InfoItem icon="mdi:book-edit-outline" label="Exams (comma-separated)" value={<input type="text" name="attending_exams" value={formData.attending_exams} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded p-1"/>} />
            ) : (
                <div className="flex flex-wrap gap-2">
                    {(student.attending_exams?.length || 0) > 0 ? student.attending_exams?.map((exam, i) => (
                        <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-100/50">{exam.trim()}</span>
                    )) : <span className="text-xs text-slate-400">None specified</span>}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value?: string | null | React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex gap-3">
    <div className="w-9 h-9 shrink-0 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"><iconify-icon icon={icon} width="18"></iconify-icon></div>
    <div className="overflow-hidden flex-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-none mb-1">{label}</p>
      {typeof value === 'string' || value === null || value === undefined ? (
          <p className="text-xs font-semibold text-slate-700 truncate">{value || 'N/A'}</p>
      ) : value}
    </div>
  </div>
);

export default StudentProfile;
