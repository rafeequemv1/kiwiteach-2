
import '../../types';
import React, { useState, useMemo, useEffect } from 'react';
import { WorkspacePageHeader, WorkspacePanel, workspacePageClass } from '../components/WorkspaceChrome';

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
    <div className={`${workspacePageClass} min-h-0 flex-1 overflow-hidden`}>
      <WorkspacePageHeader
        title="Reports"
        subtitle="Organization analytics and merit ranking"
        actions={
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 shadow-sm">
            <div className="flex min-w-[88px] flex-col items-center border-r border-zinc-100 px-4 py-2">
              <span className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Students</span>
              <span className="text-lg font-semibold text-sky-700">{globalStats.totalStudents}</span>
            </div>
            <div className="flex min-w-[88px] flex-col items-center border-r border-zinc-100 px-4 py-2">
              <span className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Tests</span>
              <span className="text-lg font-semibold text-emerald-700">{globalStats.totalTests}</span>
            </div>
            <div className="flex min-w-[88px] flex-col items-center px-4 py-2">
              <span className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Avg</span>
              <span className="text-lg font-semibold text-amber-600">{globalStats.avgAccuracy}%</span>
            </div>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 custom-scrollbar">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <WorkspacePanel title="Campus comparison">
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
              {schoolStats.map((school) => (
                <div
                  key={school.id}
                  className="group rounded-md border border-zinc-200 bg-zinc-50/40 p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-transform group-hover:scale-[1.02]">
                      <iconify-icon icon="mdi:school" width="26" />
                    </div>
                    <div className="text-right">
                      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Avg accuracy</span>
                      <span className="text-2xl font-semibold text-zinc-900">{school.avgAccuracy}%</span>
                    </div>
                  </div>
                  <h3 className="mb-1 truncate text-sm font-semibold text-zinc-900">{school.name}</h3>
                  <p className="mb-4 text-[11px] text-zinc-500">{school.studentCount} students</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full bg-zinc-800 transition-all duration-1000"
                      style={{ width: `${Math.min(100, school.avgAccuracy)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Student leaderboard">
            <div className="flex flex-col gap-4 border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-[13px] text-zinc-500">Cross-campus merit ranking (local demo data)</p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <div className="relative flex-1">
                  <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search students…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-10 pr-4 text-xs font-medium text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 sm:w-64"
                  />
                </div>
                <select
                  value={filterSchool}
                  onChange={(e) => setFilterSchool(e.target.value)}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm outline-none focus:border-zinc-400"
                >
                  <option value="all">All campuses</option>
                  {institutesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        <th className="px-8 py-4 w-16">Rank</th>
                        <th className="px-4 py-4">Student</th>
                        <th className="px-4 py-4">Class / Campus</th>
                        <th className="px-4 py-4 text-center">Tests</th>
                        <th className="px-4 py-4">Efficiency</th>
                        <th className="px-8 py-4 text-right">Merit Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
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
          </WorkspacePanel>
        </div>
      </div>
    </div>
  );
};

export default ReportsDashboard;
