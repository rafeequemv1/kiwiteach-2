
import '../../types';
import React, { useState, useMemo, useEffect } from 'react';

interface Institute {
  id: string;
  name: string;
  color?: string;
}

interface OrgClass {
  id: string;
  name: string;
  institute_id: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  class_id: string;
  avatar: string;
  attending_exams?: string[];
}

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

interface ReportsDashboardProps {
  institutesList: Institute[];
  classesList: OrgClass[];
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ institutesList, classesList }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchool, setFilterSchool] = useState('all');

  useEffect(() => {
    const localStudents = localStorage.getItem('kt_students');
    const localResults = localStorage.getItem('kt_test_results');
    if (localStudents) setStudents(JSON.parse(localStudents));
    if (localResults) setResults(JSON.parse(localResults));
  }, []);

  const studentStats = useMemo(() => {
    return students.map(student => {
      const studentResults = results.filter(r => r.student_id === student.id);
      const avgAccuracy = studentResults.length > 0 
        ? Math.round(studentResults.reduce((acc, r) => acc + r.accuracy, 0) / studentResults.length)
        : 0;
      const totalScore = studentResults.reduce((acc, r) => acc + r.score, 0);
      
      const sClass = classesList.find(c => c.id === student.class_id);
      const sSchool = institutesList.find(s => s.id === sClass?.institute_id);

      return {
        ...student,
        avgAccuracy,
        totalScore,
        testCount: studentResults.length,
        className: sClass?.name || 'Unknown',
        schoolName: sSchool?.name || 'Unassigned',
        schoolId: sSchool?.id || 'none'
      };
    });
  }, [students, results, classesList, institutesList]);

  const schoolStats = useMemo(() => {
    return institutesList.map(school => {
      const schoolStudents = studentStats.filter(s => s.schoolId === school.id);
      const avgAccuracy = schoolStudents.length > 0
        ? Math.round(schoolStudents.reduce((acc, s) => acc + s.avgAccuracy, 0) / schoolStudents.length)
        : 0;
      
      return {
        ...school,
        studentCount: schoolStudents.length,
        avgAccuracy
      };
    });
  }, [institutesList, studentStats]);

  const globalStats = useMemo(() => {
    const totalAcc = studentStats.reduce((acc, s) => acc + s.avgAccuracy, 0);
    return {
        totalStudents: students.length,
        totalTests: results.length,
        avgAccuracy: students.length > 0 ? Math.round(totalAcc / students.length) : 0
    };
  }, [students, results, studentStats]);

  const filteredMeritList = useMemo(() => {
    return studentStats
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSchool = filterSchool === 'all' || s.schoolId === filterSchool;
        return matchesSearch && matchesSchool;
      })
      .sort((a, b) => b.avgAccuracy - a.avgAccuracy);
  }, [studentStats, searchQuery, filterSchool]);

  return (
    <div className="w-full h-full p-6 md:p-10 animate-fade-in bg-slate-50/50 overflow-y-auto custom-scrollbar font-sans">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">Organization Analytics</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Zaitoon International Campus Performance</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3 border-r border-slate-100 flex flex-col items-center min-w-[100px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Students</span>
                <span className="text-xl font-black text-sky-700">{globalStats.totalStudents}</span>
            </div>
            <div className="px-5 py-3 border-r border-slate-100 flex flex-col items-center min-w-[100px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Tests</span>
                <span className="text-xl font-black text-emerald-600">{globalStats.totalTests}</span>
            </div>
            <div className="px-5 py-3 flex flex-col items-center min-w-[100px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg Accuracy</span>
                <span className="text-xl font-black text-amber-500">{globalStats.avgAccuracy}%</span>
            </div>
        </div>
      </header>

      {/* School Comparison Section */}
      <section className="mb-12">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 ml-2">Campus Comparison</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {schoolStats.map(school => (
                <div key={school.id} className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl transition-all group">
                    <div className="flex justify-between items-start mb-6">
                        {/* Fix: Added fallbacks for school.color to handle potential missing values in dynamic Tailwind classes */}
                        <div className={`w-14 h-14 bg-${school.color || 'indigo'}-50 text-${school.color || 'indigo'}-600 rounded-2xl flex items-center justify-center border border-${school.color || 'indigo'}-100 shadow-sm transition-transform group-hover:scale-110`}>
                            <iconify-icon icon="mdi:school" width="32" />
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Avg Accuracy</span>
                            <span className={`text-3xl font-black text-${school.color || 'indigo'}-600`}>{school.avgAccuracy}%</span>
                        </div>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2 truncate">{school.name}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{school.studentCount} Students Enrolled</p>
                    
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                            className={`h-full bg-${school.color || 'indigo'}-500 transition-all duration-1000`} 
                            style={{ width: `${school.avgAccuracy}%` }} 
                        />
                    </div>
                </div>
            ))}
        </div>
      </section>

      {/* Student Merit List Section */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden pb-10">
        <div className="px-8 py-8 border-b border-slate-50 flex flex-col lg:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                    <iconify-icon icon="mdi:trophy-outline" width="24" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Student Leaderboard</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cross-Campus Merit Ranking</p>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <div className="relative group">
                    <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search students..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none focus:border-sky-400 w-full sm:w-64 transition-all"
                    />
                </div>
                <select 
                    value={filterSchool}
                    onChange={e => setFilterSchool(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-sky-400 appearance-none cursor-pointer pr-10 relative"
                >
                    <option value="all">All Campuses</option>
                    {institutesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-8 py-4 w-16">Rank</th>
                        <th className="px-4 py-4">Student</th>
                        <th className="px-4 py-4">Class / Campus</th>
                        <th className="px-4 py-4 text-center">Tests</th>
                        <th className="px-4 py-4">Efficiency</th>
                        <th className="px-8 py-4 text-right">Merit Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredMeritList.map((s, idx) => (
                        <tr key={s.id} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-8 py-5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                                    idx === 0 ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200' :
                                    idx === 1 ? 'bg-slate-200 text-slate-700' :
                                    idx === 2 ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-50 text-slate-400'
                                }`}>
                                    {idx + 1}
                                </div>
                            </td>
                            <td className="px-4 py-5">
                                <div className="flex items-center gap-3">
                                    <img src={s.avatar} className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 shadow-inner" />
                                    <div>
                                        <span className="text-sm font-black text-slate-700 block leading-tight">{s.name}</span>
                                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{s.email}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-5">
                                <span className="text-[10px] font-black uppercase text-sky-600 bg-sky-50 px-2 py-1 rounded-lg block w-fit mb-1">{s.className}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{s.schoolName}</span>
                            </td>
                            <td className="px-4 py-5 text-center">
                                <span className="text-sm font-black text-slate-700">{s.testCount}</span>
                            </td>
                            <td className="px-4 py-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${
                                                s.avgAccuracy > 75 ? 'bg-emerald-500' : 
                                                s.avgAccuracy > 50 ? 'bg-amber-500' : 
                                                'bg-rose-500'
                                            }`} 
                                            style={{ width: `${s.avgAccuracy}%` }} 
                                        />
                                    </div>
                                    <span className="text-xs font-black text-slate-600">{s.avgAccuracy}%</span>
                                </div>
                            </td>
                            <td className="px-8 py-5 text-right">
                                {s.avgAccuracy >= 80 ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm">Distinction</span>
                                ) : s.avgAccuracy >= 60 ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-sky-700 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-100 shadow-sm">Proficient</span>
                                ) : (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">Foundational</span>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredMeritList.length === 0 && (
                        <tr>
                            <td colSpan={6} className="py-24 text-center">
                                <iconify-icon icon="mdi:account-search-outline" width="64" className="text-slate-100 mb-4" />
                                <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No performance records matched</p>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </section>
    </div>
  );
};

export default ReportsDashboard;
