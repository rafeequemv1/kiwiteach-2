import '../types';
import React, { useState, useMemo, useEffect } from 'react';
import StudentProfile from './StudentProfile';

export interface SchoolClass {
  id: string;
  name: string;
  school_id: string | null;
}

export interface Student {
  id: string;
  name: string;
  email: string | null;
  mobile_phone?: string | null;
  attending_exams?: string[] | null;
  class_id?: string | null;
  avatar: string;
}

const ITEMS_PER_PAGE = 25;

interface StudentDirectoryProps {
  schoolsList?: any[];
  classesList?: any[];
}

const StudentDirectory: React.FC<StudentDirectoryProps> = ({ schoolsList = [], classesList = [] }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [csvInput, setCsvInput] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const localStudents = localStorage.getItem('kt_students');
        if (localStudents) {
            const data: Student[] = JSON.parse(localStudents);
            const mappedStudents = data.map(s => ({
                ...s,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name.replace(/\s+/g, '')}`
            }));
            setStudents(mappedStudents);
        }
    } catch (err: any) {
        console.error("Error fetching student data:", err);
    } finally {
        setIsLoading(false);
    }
  };
  
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const searchStr = searchQuery.toLowerCase();
      const matchesSearch = s.name.toLowerCase().includes(searchStr) || (s.email || '').toLowerCase().includes(searchStr);
      
      if (selectedSchoolId === 'all') return matchesSearch;
      
      const studentClass = classesList.find(c => c.id === s.class_id);
      const matchesSchool = studentClass?.school_id === selectedSchoolId;
      
      return matchesSearch && matchesSchool;
    });
  }, [students, searchQuery, selectedSchoolId, classesList]);

  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStudents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStudents, currentPage]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllOnPage = () => {
    if (selectedIds.size === paginatedStudents.length && paginatedStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedStudents.map(s => s.id)));
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedIds.size} students?`)) {
      const updated = students.filter(s => !selectedIds.has(s.id));
      localStorage.setItem('kt_students', JSON.stringify(updated));
      setStudents(updated);
      setSelectedIds(new Set());
    }
  };

  const handleCsvUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const rows = csvInput.trim().split('\n');
    const newStudents: Student[] = rows.map((row, idx) => {
      const parts = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const [name, email, phone, exams] = parts;
      return {
        id: `st-new-${Date.now()}-${idx}`,
        name: name || 'Unknown',
        email: email || null,
        mobile_phone: phone || null,
        attending_exams: exams ? exams.split(',').map(e => e.trim()) : null,
        class_id: null,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${(name||'').replace(/\s+/g, '')}`
      };
    }).filter(s => s.name !== 'Unknown');

    if (newStudents.length > 0) {
        const updated = [...students, ...newStudents];
        localStorage.setItem('kt_students', JSON.stringify(updated));
        setStudents(updated);
        setCsvInput('');
        setIsCsvModalOpen(false);
        setCurrentPage(1);
    }
  };

  if (selectedStudent) {
    const scList = [
        ...schoolsList.map(s => ({ id: s.id, name: s.name, type: 'school', parent_id: null })),
        ...classesList.map(c => ({ id: c.id, name: c.name, type: 'class', parent_id: c.school_id }))
    ];
    return <StudentProfile student={selectedStudent} schoolsAndClasses={scList as any} onBack={() => setSelectedStudent(null)} onUpdate={fetchData} />;
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 animate-fade-in flex flex-col h-full overflow-hidden font-sans">
      {selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-50 animate-slide-up">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{selectedIds.size} Selected</span>
              <div className="h-4 w-px bg-slate-700"></div>
              <div className="flex gap-4">
                  <button onClick={handleBulkDelete} className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1.5 transition-colors"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon>Delete</button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              </div>
          </div>
      )}

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Student Directory</h1>
          <p className="text-slate-400 text-xs mt-0.5 font-medium">Zaitoon International Campus Enrollment</p>
        </div>
        <div className="flex gap-2 items-center">
            <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><iconify-icon icon="mdi:view-grid" className="w-4 h-4"></iconify-icon></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><iconify-icon icon="mdi:view-list" className="w-4 h-4"></iconify-icon></button>
            </div>
            <button onClick={() => setIsCsvModalOpen(true)} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm"><iconify-icon icon="mdi:file-import-outline" className="text-emerald-500"></iconify-icon>Bulk Import</button>
            <button onClick={() => alert("Add Student functionality")} className="px-4 py-2 rounded-lg bg-accent text-white font-medium text-xs hover:bg-indigo-700 transition-all shadow-md flex items-center gap-1.5"><iconify-icon icon="mdi:plus"></iconify-icon>Student</button>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
          <div className="relative flex-1 group">
              <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></iconify-icon>
              <input type="text" placeholder="Search by name or email..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-accent transition-all font-normal text-slate-700 shadow-sm" />
          </div>
          <select value={selectedSchoolId} onChange={e => { setSelectedSchoolId(e.target.value); setCurrentPage(1); }} className="bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-accent font-medium text-xs text-slate-600 shadow-sm appearance-none min-w-[200px]">
              <option value="all">All Campuses</option>
              {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? <div className="text-center py-20 text-slate-400">Loading Local Directory...</div> : (
              filteredStudents.length > 0 ? (
                  viewMode === 'grid' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-0.5">
                          {paginatedStudents.map(student => {
                              const sClass = classesList.find(c => c.id === student.class_id);
                              const school = schoolsList.find(s => s.id === sClass?.school_id);
                              const isSelected = selectedIds.has(student.id);
                              return (
                                  <div key={student.id} onClick={() => setSelectedStudent(student)} className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer relative group flex flex-col items-center ${isSelected ? 'border-accent ring-1 ring-accent bg-accent/5 shadow-md' : 'border-slate-100 hover:border-slate-200 shadow-sm'}`}>
                                      <div onClick={(e) => { e.stopPropagation(); handleToggleSelect(student.id); }} className={`absolute top-2 left-2 w-4 h-4 rounded border transition-colors flex items-center justify-center ${isSelected ? 'bg-accent border-accent text-white' : 'border-slate-300 bg-white opacity-0 group-hover:opacity-100'}`}>{isSelected && <iconify-icon icon="mdi:check" className="text-[10px]"></iconify-icon>}</div>
                                      <img src={student.avatar} alt={student.name} className="w-12 h-12 rounded-full bg-slate-50 mb-3 border border-slate-100" />
                                      <h3 className="font-medium text-slate-800 text-xs leading-tight text-center truncate w-full">{student.name}</h3>
                                      <p className="text-[9px] font-medium text-slate-400 tracking-wider mb-2">{sClass?.name || 'No Class'}</p>
                                      <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${school?.name.includes('Boys') ? 'bg-indigo-50 text-indigo-500' : school?.name.includes('Girls') ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>{school?.name || 'Unassigned'}</span>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <table className="w-full text-left border-collapse text-xs">
                              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                  <tr>
                                      <th className="px-4 py-3 w-10"><input type="checkbox" checked={selectedIds.size === paginatedStudents.length && paginatedStudents.length > 0} onChange={handleSelectAllOnPage} className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4 cursor-pointer"/></th>
                                      <th className="px-4 py-3">Student Name</th>
                                      <th className="px-4 py-3">Class</th>
                                      <th className="px-4 py-3">Campus</th>
                                      <th className="px-4 py-3">Focus Exams</th>
                                      <th className="px-4 py-3 text-right"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {paginatedStudents.map(student => {
                                      const isSelected = selectedIds.has(student.id);
                                      const sClass = classesList.find(c => c.id === student.class_id);
                                      const school = schoolsList.find(s => s.id === sClass?.school_id);
                                      return (
                                          <tr key={student.id} className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${isSelected ? 'bg-accent/[0.03]' : ''}`} onClick={() => setSelectedStudent(student)}>
                                              <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => handleToggleSelect(student.id)} className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4 cursor-pointer"/></td>
                                              <td className="px-4 py-2"><div className="flex items-center gap-2.5"><img src={student.avatar} className="w-7 h-7 rounded-full border border-slate-100 shadow-sm" /><span className="font-medium text-slate-700">{student.name}</span></div></td>
                                              <td className="px-4 py-2 text-slate-500 font-medium">{sClass?.name || '-'}</td>
                                              <td className="px-4 py-2 text-slate-400 font-normal">{school?.name || 'Unassigned'}</td>
                                              <td className="px-4 py-2"><span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">{student.attending_exams?.join(', ') || 'None'}</span></td>
                                              <td className="px-4 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); }} className="text-slate-300 hover:text-accent p-1 transition-colors"><iconify-icon icon="mdi:chevron-right" className="w-5 h-5"></iconify-icon></button></td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  )
              ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-30"><iconify-icon icon="mdi:account-search-outline" className="w-12 h-12 mb-3"></iconify-icon><p className="text-sm font-medium">No students found in Local Directory</p></div>
              )
          )}
      </div>

      {totalPages > 1 && (
          <footer className="mt-6 flex items-center justify-between py-2 shrink-0">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Page {currentPage} of {totalPages}</div>
              <div className="flex gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-accent disabled:opacity-30 transition-colors shadow-sm"><iconify-icon icon="mdi:chevron-left" className="w-5 h-5"></iconify-icon></button>
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-accent disabled:opacity-30 transition-colors shadow-sm"><iconify-icon icon="mdi:chevron-right" className="w-5 h-5"></iconify-icon></button>
              </div>
          </footer>
      )}
      
      {isCsvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-[2px] animate-fade-in">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 border border-white">
                  <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-semibold text-slate-800">Bulk Student Import</h2></div>
                  <div className="mb-5 p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-500 leading-relaxed"><p className="font-semibold mb-1 text-slate-700">CSV Header Order:</p><p className="font-mono text-[9px] text-emerald-600">Name, Email, Mobile Phone, Attending Exams</p></div>
                  <form onSubmit={handleCsvUpload} className="space-y-4">
                      <textarea value={csvInput} onChange={e => setCsvInput(e.target.value)} rows={10} placeholder={'John Doe,john@example.com,+1-555-0101,"NEET,JEE"'} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 font-mono text-[11px] leading-normal resize-none"/>
                      <div className="flex gap-3"><button type="button" onClick={() => setIsCsvModalOpen(false)} className="flex-1 font-medium text-xs text-slate-400">Cancel</button><button type="submit" disabled={!csvInput.trim()} className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold text-sm shadow-md">Process Import</button></div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default StudentDirectory;