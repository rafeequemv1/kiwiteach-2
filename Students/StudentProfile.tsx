import '../types';
import React, { useState, useMemo, useEffect } from 'react';
import { Student, SchoolClass } from './StudentDirectory';
import { supabase } from '../supabase/client';

interface TestResult {
    id: string;
    student_id: string;
    test_name: string;
    subject: string;
    score: number;
    max_score: number;
    accuracy: number;
    date: string;
}

interface StudentProfileProps {
  student: Student;
  schoolsAndClasses: any[];
  onBack: () => void;
  onUpdate: () => void; 
}

const StudentProfile: React.FC<StudentProfileProps> = ({ student, schoolsAndClasses, onBack, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'report'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const [formData, setFormData] = useState({
      name: student.name,
      email: student.email || '',
      mobile_phone: student.mobile_phone || '',
      institute_id: student.institute_id || '',
      class_id: student.class_id || '',
      attending_exams: student.attending_exams?.join(', ') || ''
  });

  useEffect(() => {
      // Load results from local storage
      const localResults = localStorage.getItem('kt_test_results');
      if (localResults) {
          const all = JSON.parse(localResults) as TestResult[];
          setResults(all.filter(r => r.student_id === student.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
  }, [student.id]);

  const schools = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'school'), [schoolsAndClasses]);
  const classes = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'class'), [schoolsAndClasses]);

  const { schoolName, className } = useMemo(() => {
    if (student.institute_id) {
      const school = schools.find((s) => s.id === student.institute_id);
      const sClass = student.class_id ? classes.find((c) => c.id === student.class_id) : null;
      return {
        schoolName: school?.name || 'Unknown',
        className: sClass?.name || 'N/A',
      };
    }
    if (!student.class_id) return { schoolName: 'Unassigned', className: 'N/A' };
    const sClass = classes.find((c) => c.id === student.class_id);
    if (!sClass) return { schoolName: 'Unknown', className: 'Unknown' };
    const school = schools.find((s) => s.id === sClass.parent_id);
    return { schoolName: school?.name || 'Unassigned', className: sClass.name };
  }, [student, schools, classes]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'institute_id') {
        return { ...prev, institute_id: value, class_id: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        if (!formData.institute_id || !formData.class_id) {
          throw new Error('Institute and class are required for every student.');
        }
        const school = schools.find((s) => s.id === formData.institute_id);
        const business_id = (school as any)?.business_id || null;
        if (!business_id) {
          throw new Error('Selected institute is not assigned to a business.');
        }
        const exams = formData.attending_exams.split(',').map(e => e.trim()).filter(Boolean);
        const { error } = await supabase
          .from('students')
          .update({
            name: formData.name,
            email: formData.email || null,
            mobile_phone: formData.mobile_phone || null,
            business_id,
            institute_id: formData.institute_id || null,
            class_id: formData.class_id || null,
            attending_exams: exams,
          })
          .eq('id', student.id);
        if (error) throw error;
        onUpdate();
        setIsEditing(false);
    } catch (err: any) {
        alert("Update failed: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const avgAccuracy = useMemo(() => {
      if (results.length === 0) return 0;
      return Math.round(results.reduce((acc, r) => acc + r.accuracy, 0) / results.length);
  }, [results]);

  return (
    <div className="w-full h-full flex flex-col animate-fade-in overflow-hidden bg-slate-50/50">
      <div className="px-6 pt-6 shrink-0 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-800"><iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon></button>
                <div className="flex items-center gap-4">
                    <img src={student.avatar} alt={student.name} className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 shadow-sm" />
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">{student.name}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{className} • {schoolName}</p>
                    </div>
                </div>
            </div>
            {!isEditing && activeTab === 'profile' ? (
                <button onClick={() => setIsEditing(true)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all"><iconify-icon icon="mdi:pencil"></iconify-icon> Edit Profile</button>
            ) : isEditing ? (
                <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="bg-white border border-slate-200 text-slate-500 px-4 py-2 rounded-lg font-medium text-xs transition-all">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="bg-accent text-white px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95">
                        {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:check"></iconify-icon>}
                        Save Changes
                    </button>
                </div>
            ) : null}
        </div>

        <div className="flex gap-8">
            <button 
                onClick={() => {setActiveTab('profile'); setIsEditing(false);}}
                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'profile' ? 'text-accent' : 'text-slate-300 hover:text-slate-500'}`}
            >
                Overview
                {activeTab === 'profile' && <div className="absolute bottom-0 left-0 w-full h-1 bg-accent rounded-full animate-fade-in" />}
            </button>
            <button 
                onClick={() => {setActiveTab('report'); setIsEditing(false);}}
                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'report' ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}
            >
                Performance Report
                {activeTab === 'report' && <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-500 rounded-full animate-fade-in" />}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'profile' ? (
              <div className="space-y-6 animate-fade-in">
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 flex flex-col sm:flex-row items-center text-center sm:text-left gap-8">
                    <img src={student.avatar} alt={student.name} className="w-24 h-24 rounded-[2rem] border-4 border-slate-50 bg-slate-50 shadow-inner shrink-0" />
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                           <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full text-xl font-bold text-slate-800 leading-tight bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-accent shadow-inner"/>
                        </div>
                      ) : (
                        <h1 className="text-3xl font-black text-slate-800 leading-tight tracking-tight">{student.name}</h1>
                      )}
                      {isEditing ? (
                        <div className="space-y-2 mt-4">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Email</label>
                           <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-accent shadow-inner"/>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-slate-400 mt-1 flex items-center gap-2">
                            <iconify-icon icon="mdi:email-outline" /> {student.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Contact Matrix</h3>
                      <div className="space-y-5">
                        <InfoItem icon="mdi:email-outline" label="Email Address" value={isEditing ? <span className="text-slate-400 italic">Editing above...</span> : student.email} />
                        <InfoItem icon="mdi:phone-outline" label="Mobile Phone" value={isEditing ? <input type="text" name="mobile_phone" value={formData.mobile_phone} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-100 shadow-inner outline-none focus:border-accent"/> : student.mobile_phone} />
                      </div>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Academic Mapping</h3>
                      <div className="space-y-5">
                         <InfoItem icon="mdi:school-outline" label="Campus" value={isEditing ? (
                             <select name="institute_id" value={formData.institute_id} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-200 outline-none focus:border-accent appearance-none cursor-pointer">
                                 <option value="">Unassigned</option>
                                 {schools.map((sch) => (
                                   <option key={sch.id} value={sch.id}>{sch.name}</option>
                                 ))}
                             </select>
                         ) : schoolName} />
                         <InfoItem icon="mdi:google-classroom" label="Classroom" value={isEditing ? (
                             <select name="class_id" value={formData.class_id} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-200 outline-none focus:border-accent appearance-none cursor-pointer">
                                 <option value="">Unassigned</option>
                                 {(formData.institute_id
                                   ? classes.filter((c) => c.parent_id === formData.institute_id)
                                   : classes
                                 ).map((c) => (
                                   <option key={c.id} value={c.id}>{c.name}</option>
                                 ))}
                             </select>
                         ) : className} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Career Focus / Competitive Exams</h3>
                    {isEditing ? (
                         <div className="space-y-2">
                             <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1">Comma Separated List</label>
                             <input type="text" name="attending_exams" value={formData.attending_exams} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner outline-none focus:border-accent" placeholder="e.g. NEET, JEE, KVPY"/>
                         </div>
                    ) : (
                        <div className="flex flex-wrap gap-2.5">
                            {(student.attending_exams?.length || 0) > 0 ? student.attending_exams?.map((exam, i) => (
                                <span key={i} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-100/50 shadow-sm">{exam.trim()}</span>
                            )) : <span className="text-xs text-slate-300 italic font-medium">No specialized tracking configured</span>}
                        </div>
                    )}
                  </div>
              </div>
          ) : (
              <div className="animate-fade-in space-y-8">
                  {/* Report Header Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-200/50 flex flex-col justify-center items-center text-center relative overflow-hidden">
                          <iconify-icon icon="mdi:target-variant" className="absolute -top-4 -right-4 text-white/5 w-32 h-32 rotate-12" />
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Average Accuracy</span>
                          <span className="text-5xl font-black mb-1">{avgAccuracy}%</span>
                          <div className="w-full bg-white/10 h-1 rounded-full mt-4 overflow-hidden">
                              <div className="bg-emerald-400 h-full transition-all duration-1000" style={{ width: `${avgAccuracy}%` }} />
                          </div>
                      </div>

                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                              <iconify-icon icon="mdi:clipboard-check-outline" width="28" />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Assessments Cleared</span>
                          <span className="text-3xl font-black text-slate-800">{results.length}</span>
                      </div>

                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                           <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                              <iconify-icon icon="mdi:history" width="28" />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Last Evaluation</span>
                          <span className="text-sm font-black text-slate-800 uppercase">{results.length > 0 ? new Date(results[0].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'N/A'}</span>
                      </div>
                  </div>

                  {/* Test History List */}
                  <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                      <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Detailed History</h3>
                          <button className="text-[10px] font-bold text-accent uppercase tracking-widest hover:underline">Export Report</button>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                      <th className="px-8 py-4">Test Name</th>
                                      <th className="px-4 py-4">Subject</th>
                                      <th className="px-4 py-4">Score</th>
                                      <th className="px-4 py-4">Accuracy</th>
                                      <th className="px-4 py-4">Date</th>
                                      <th className="px-8 py-4 text-right">Result</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {results.map(r => (
                                      <tr key={r.id} className="hover:bg-slate-50/30 transition-colors group">
                                          <td className="px-8 py-5">
                                              <span className="text-sm font-bold text-slate-700 block leading-tight">{r.test_name}</span>
                                              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">Authorized Assessment</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg">{r.subject}</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-sm font-black text-slate-700">{r.score}</span>
                                              <span className="text-xs text-slate-400 font-medium"> / {r.max_score}</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <div className="flex items-center gap-2">
                                                  <div className="w-10 bg-slate-100 h-1 rounded-full overflow-hidden shrink-0">
                                                      <div 
                                                          className={`h-full ${r.accuracy > 70 ? 'bg-emerald-500' : r.accuracy > 40 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                                                          style={{ width: `${r.accuracy}%` }} 
                                                      />
                                                  </div>
                                                  <span className="text-xs font-bold text-slate-600">{r.accuracy}%</span>
                                              </div>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-[10px] font-medium text-slate-400">{new Date(r.date).toLocaleDateString()}</span>
                                          </td>
                                          <td className="px-8 py-5 text-right">
                                              {r.accuracy >= 50 ? (
                                                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">PASS</span>
                                              ) : (
                                                  <span className="text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100">RETREAT</span>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                                  {results.length === 0 && (
                                      <tr>
                                          <td colSpan={6} className="py-20 text-center">
                                              <iconify-icon icon="mdi:file-search-outline" width="48" className="text-slate-100 mb-2" />
                                              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No assessment data found for this student</p>
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value?: string | null | React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex gap-4">
    <div className="w-10 h-10 shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100/50 shadow-inner group-hover:text-accent transition-colors"><iconify-icon icon={icon} width="20"></iconify-icon></div>
    <div className="overflow-hidden flex-1 pt-0.5">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1.5">{label}</p>
      {typeof value === 'string' || value === null || value === undefined ? (
          <p className="text-sm font-bold text-slate-700 truncate">{value || 'Not Configured'}</p>
      ) : value}
    </div>
  </div>
);

export default StudentProfile;