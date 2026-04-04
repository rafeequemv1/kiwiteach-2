import '../types';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import StudentProfile from './StudentProfile';
import { WorkspacePageHeader, WorkspacePanel, workspacePageClass } from '../Teacher/components/WorkspaceChrome';
import { supabase } from '../supabase/client';

export interface OrgClassRow {
  id: string;
  name: string;
  institute_id: string | null;
}

/** @deprecated Use OrgClassRow */
export type SchoolClass = OrgClassRow;

export interface Student {
  id: string;
  name: string;
  email: string | null;
  mobile_phone?: string | null;
  attending_exams?: string[] | null;
  business_id?: string | null;
  /** School / campus (institute UUID). Can be set with or without class. */
  institute_id?: string | null;
  class_id?: string | null;
  avatar: string;
}

const ITEMS_PER_PAGE = 25;

/** CSV template: institute_id = school UUID, class_id = class UUID (must belong to that school). */
export const STUDENT_CSV_TEMPLATE = `name,email,mobile_phone,attending_exams,institute_id,class_id
"Jane Student",jane@school.edu,+15550101,"NEET,JEE",,
"Ravi Kumar",ravi@school.edu,+919876543210,"NEET",,`;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function looksLikeHeaderRow(firstLine: string): boolean {
  const cells = parseCsvLine(firstLine).map((c) => c.toLowerCase());
  return cells[0] === 'name' || (cells[0].includes('name') && cells.length > 1);
}

interface CsvPreviewRow {
  key: string;
  name: string;
  email: string;
  mobile_phone: string;
  attending_exams: string;
  institute_id: string;
  class_id: string;
}

type HeaderColMap = {
  name: number;
  email: number;
  mobile: number;
  exams: number;
  institute: number;
  class: number;
};

function buildColMapFromHeader(cells: string[]): HeaderColMap | null {
  const h = cells.map((c) => c.toLowerCase().replace(/^"|"$/g, '').trim());
  const find = (pred: (s: string) => boolean) => {
    const i = h.findIndex(pred);
    return i >= 0 ? i : -1;
  };
  const ni = find((s) => s === 'name' || s === 'full_name' || s === 'student_name');
  const ei = find((s) => s === 'email' || s === 'e-mail');
  const mi = find((s) => s.includes('mobile') || s.includes('phone') || s === 'tel');
  const xi = find((s) => s.includes('attending') || s.includes('exam') || s === 'exams');
  const ii = find((s) => s.includes('institute') || s === 'school_id' || s === 'school' || s === 'campus');
  const ci = find((s) => s.includes('class_id') || s === 'class');
  if (ni < 0 && ei < 0) return null;
  return {
    name: ni >= 0 ? ni : 0,
    email: ei >= 0 ? ei : 1,
    mobile: mi >= 0 ? mi : 2,
    exams: xi >= 0 ? xi : 3,
    institute: ii,
    class: ci,
  };
}

function csvTextToPreviewRows(text: string): CsvPreviewRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.length) return [];
  let start = 0;
  let col: HeaderColMap = { name: 0, email: 1, mobile: 2, exams: 3, institute: 4, class: 5 };
  const mapped = buildColMapFromHeader(parseCsvLine(lines[0]));
  if (looksLikeHeaderRow(lines[0]) && mapped) {
    col = mapped;
    if (col.class < 0) col.class = col.institute >= 0 ? 5 : 4;
    start = 1;
  } else {
    const p0 = parseCsvLine(lines[0]);
    if (p0.length <= 4) col = { name: 0, email: 1, mobile: 2, exams: 3, institute: -1, class: -1 };
    else if (p0.length === 5) col = { name: 0, email: 1, mobile: 2, exams: 3, institute: -1, class: 4 };
    else col = { name: 0, email: 1, mobile: 2, exams: 3, institute: 4, class: 5 };
  }

  const rows: CsvPreviewRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (!parts.length) continue;
    const name = (col.name >= 0 ? parts[col.name] : parts[0]) || '';
    if (!name.trim()) continue;
    const email = col.email >= 0 ? parts[col.email] || '' : parts[1] || '';
    const mobile = col.mobile >= 0 ? parts[col.mobile] || '' : parts[2] || '';
    const exams = col.exams >= 0 ? parts[col.exams] || '' : parts[3] || '';
    let institute = '';
    let klass = '';
    if (col.institute >= 0 && col.class >= 0) {
      institute = parts[col.institute] || '';
      klass = parts[col.class] || '';
    } else if (col.institute < 0 && col.class >= 0) {
      klass = parts[col.class] || '';
    } else if (parts.length >= 6) {
      institute = parts[4] || '';
      klass = parts[5] || '';
    } else if (parts.length >= 5) {
      klass = parts[4] || '';
    }
    rows.push({
      key: `csv-${Date.now()}-${i}`,
      name,
      email,
      mobile_phone: mobile,
      attending_exams: exams,
      institute_id: institute,
      class_id: klass,
    });
  }
  return rows;
}

function downloadStudentCsvTemplate() {
  const blob = new Blob([STUDENT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kiwiteach_students_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface StudentDirectoryProps {
  institutesList?: { id: string; name: string; business_id?: string | null }[];
  classesList?: OrgClassRow[];
}

const StudentDirectory: React.FC<StudentDirectoryProps> = ({ institutesList = [], classesList = [] }) => {
  const [actorRole, setActorRole] = useState<string>('student');
  const [actorBusinessId, setActorBusinessId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [csvPasteText, setCsvPasteText] = useState('');
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [defaultSchoolBulk, setDefaultSchoolBulk] = useState<string>('');
  const [defaultClassBulk, setDefaultClassBulk] = useState<string>('');
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    exams: '',
    instituteId: '' as string,
    classId: '' as string,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) {
          setStudents([]);
          return;
        }
        const { data: actorProf } = await supabase
          .from('profiles')
          .select('role, business_id')
          .eq('id', uid)
          .maybeSingle();
        const roleLower = String(actorProf?.role || 'student').toLowerCase();
        const bizId = (actorProf?.business_id as string | null) || null;
        setActorRole(roleLower);
        setActorBusinessId(bizId);

        let listQuery = supabase
          .from('students')
          .select('id, name, email, mobile_phone, attending_exams, business_id, institute_id, class_id')
          .order('created_at', { ascending: false });

        // Teachers, school admins, developers: let RLS return every visible row (avoid client filters that
        // hide demo rows when business_id on profile ≠ rows in DB).
        const rosterViaRls = ['teacher', 'school_admin', 'developer'].includes(roleLower);
        if (!rosterViaRls) {
          listQuery = listQuery.eq('user_id', uid);
        }

        const { data, error } = await listQuery;
        if (error) throw error;
        const mappedStudents = ((data || []) as Omit<Student, 'avatar'>[]).map((s) => ({
          ...s,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${(s.name || '').replace(/\s+/g, '')}`,
        }));
        setStudents(mappedStudents);
    } catch (err: any) {
        console.error("Error fetching student data:", err);
        alert(err?.message || 'Failed to load students');
    } finally {
        setIsLoading(false);
    }
  };
  
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const searchStr = searchQuery.toLowerCase();
      const matchesSearch = s.name.toLowerCase().includes(searchStr) || (s.email || '').toLowerCase().includes(searchStr);

      const studentClass = classesList.find(c => c.id === s.class_id);
      const matchesSchool =
        selectedSchoolId === 'all'
          ? true
          : (s.institute_id === selectedSchoolId || studentClass?.institute_id === selectedSchoolId);

      const matchesClass = selectedClassId === 'all' ? true : s.class_id === selectedClassId;

      return matchesSearch && matchesSchool && matchesClass;
    });
  }, [students, searchQuery, selectedSchoolId, selectedClassId, classesList]);

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
      void (async () => {
        const ids = Array.from(selectedIds);
        const { error } = await supabase.from('students').delete().in('id', ids);
        if (error) {
          alert(error.message);
          return;
        }
        await fetchData();
        setSelectedIds(new Set());
      })();
    }
  };

  const openCsvModal = () => {
    setCsvPasteText('');
    setCsvPreviewRows([]);
    setDefaultSchoolBulk('');
    setDefaultClassBulk('');
    setIsCsvModalOpen(true);
  };

  const classesForRow = (instituteId: string) =>
    classesList.filter((c) => !instituteId || c.institute_id === instituteId);

  const businessForInstitute = (instituteId: string | null | undefined) =>
    institutesList.find((i) => i.id === instituteId)?.business_id || null;

  const resolveBusinessForStudent = (instituteId: string | null | undefined) => {
    const role = (actorRole || '').toLowerCase();
    if (role === 'teacher' || role === 'school_admin') return actorBusinessId;
    return businessForInstitute(instituteId);
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setCsvPreviewRows(csvTextToPreviewRows(text));
    } catch (err) {
      console.error(err);
      alert('Could not read CSV file.');
    }
    e.target.value = '';
  };

  const handleParsePastedCsv = () => {
    setCsvPreviewRows(csvTextToPreviewRows(csvPasteText));
  };

  const applyDefaultSchoolToAll = () => {
    if (!defaultSchoolBulk) return;
    setCsvPreviewRows((rows) =>
      rows.map((r) => {
        if (r.institute_id.trim()) return r;
        let class_id = r.class_id;
        if (class_id) {
          const cl = classesList.find((c) => c.id === class_id);
          if (cl && cl.institute_id !== defaultSchoolBulk) class_id = '';
        }
        return { ...r, institute_id: defaultSchoolBulk, class_id };
      })
    );
  };

  const applyDefaultClassToAll = () => {
    if (!defaultClassBulk) return;
    setCsvPreviewRows((rows) =>
      rows.map((r) => {
        if (r.class_id.trim()) return r;
        const cl = classesList.find((c) => c.id === defaultClassBulk);
        const institute_id =
          r.institute_id.trim() ||
          (cl?.institute_id ? String(cl.institute_id) : defaultSchoolBulk);
        return { ...r, class_id: defaultClassBulk, institute_id };
      })
    );
  };

  const updatePreviewRow = (key: string, field: keyof CsvPreviewRow, value: string) => {
    setCsvPreviewRows((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        if (field === 'institute_id') {
          let class_id = r.class_id;
          if (class_id) {
            const cl = classesList.find((c) => c.id === class_id);
            if (cl && cl.institute_id !== value) class_id = '';
          }
          return { ...r, institute_id: value, class_id };
        }
        return { ...r, [field]: value };
      })
    );
  };

  const removePreviewRow = (key: string) => {
    setCsvPreviewRows((rows) => rows.filter((r) => r.key !== key));
  };

  const handleConfirmCsvImport = () => {
    const valid = csvPreviewRows.filter((r) => r.name.trim());
    if (valid.length === 0) {
      alert('Add at least one row with a name.');
      return;
    }
    let newStudents: Omit<Student, 'avatar' | 'id'>[] = [];
    try {
      newStudents = valid.map((r) => {
        const name = r.name.trim();
        const examsRaw = r.attending_exams.trim();
        const attending = examsRaw
          ? examsRaw.split(',').map((x) => x.trim()).filter(Boolean)
          : null;
        let class_id = r.class_id.trim() || defaultClassBulk || null;
        let institute_id = r.institute_id.trim() || defaultSchoolBulk || null;
        if (class_id) {
          const cl = classesList.find((c) => c.id === class_id);
          if (cl?.institute_id) institute_id = String(cl.institute_id);
        }
        const business_id = resolveBusinessForStudent(institute_id);
        if (!institute_id || !class_id || !business_id) {
          throw new Error(`Student "${name}" must have business, institute, and class.`);
        }
        return {
          name,
          email: r.email.trim() || null,
          mobile_phone: r.mobile_phone.trim() || null,
          attending_exams: attending,
          business_id,
          institute_id,
          class_id,
        };
      });
    } catch (err: any) {
      alert(err?.message || 'Every student must have business, institute, and class.');
      return;
    }
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error('Not authenticated');
        const payload = newStudents.map((s) => ({ ...s, user_id: uid }));
        const { error } = await supabase.from('students').insert(payload);
        if (error) throw error;
        await fetchData();
        setIsCsvModalOpen(false);
        setCsvPreviewRows([]);
        setCsvPasteText('');
        setCurrentPage(1);
      } catch (err: any) {
        alert(err?.message || 'Import failed');
      }
    })();
  };

  const resetAddForm = () =>
    setAddForm({ name: '', email: '', phone: '', exams: '', instituteId: '', classId: '' });

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = addForm.name.trim();
    if (!name) return;

    const attending = addForm.exams.trim()
      ? addForm.exams.split(',').map((x) => x.trim()).filter(Boolean)
      : null;

    const selClass = classesList.find((c) => c.id === addForm.classId);
    const institute_id =
      addForm.instituteId ||
      (selClass?.institute_id ? String(selClass.institute_id) : null);
    const business_id = resolveBusinessForStudent(institute_id);

    if (!institute_id || !addForm.classId || !business_id) {
      alert('Assign business, institute, and class for every student.');
      return;
    }

    const newStudent = {
      name,
      email: addForm.email.trim() || null,
      mobile_phone: addForm.phone.trim() || null,
      attending_exams: attending,
      business_id,
      institute_id: institute_id || null,
      class_id: addForm.classId || null,
    };
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error('Not authenticated');
        const { error } = await supabase.from('students').insert({ ...newStudent, user_id: uid });
        if (error) throw error;
        await fetchData();
        resetAddForm();
        setIsAddModalOpen(false);
        setCurrentPage(1);
      } catch (err: any) {
        alert(err?.message || 'Failed to save student');
      }
    })();
  };

  if (selectedStudent) {
    const scList = [
        ...institutesList.map(s => ({ id: s.id, name: s.name, type: 'school', parent_id: null, business_id: s.business_id || null })),
        ...classesList.map(c => ({ id: c.id, name: c.name, type: 'class', parent_id: c.institute_id }))
    ];
    return <StudentProfile student={selectedStudent} schoolsAndClasses={scList as any} onBack={() => setSelectedStudent(null)} onUpdate={fetchData} />;
  }

  return (
    <div className={`${workspacePageClass} min-h-0 flex-1 overflow-hidden`}>
      {selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 animate-slide-up items-center gap-6 rounded-md border border-zinc-700 bg-zinc-900 px-6 py-3 text-white shadow-lg">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{selectedIds.size} selected</span>
              <div className="h-4 w-px bg-zinc-700"></div>
              <div className="flex gap-4">
                  <button type="button" onClick={handleBulkDelete} className="flex items-center gap-1.5 text-xs font-medium text-red-400 transition-colors hover:text-red-300"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon>Delete</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-medium text-zinc-400 transition-colors hover:text-white">Cancel</button>
              </div>
          </div>
      )}

      <WorkspacePageHeader
        title="Student directory"
        subtitle="Enrollment, profiles, and import"
        toolbar={null}
        actions={
          <>
            <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-sm p-1.5 ${viewMode === 'grid' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                title="Grid"
              >
                <iconify-icon icon="mdi:view-grid" className="h-4 w-4"></iconify-icon>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-sm p-1.5 ${viewMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                title="Details"
              >
                <iconify-icon icon="mdi:view-list" className="h-4 w-4"></iconify-icon>
              </button>
            </div>
            <button
              type="button"
              onClick={openCsvModal}
              className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <iconify-icon icon="mdi:file-import-outline" className="mr-1.5 text-emerald-600"></iconify-icon>
              Bulk import
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white shadow hover:bg-zinc-800"
            >
              <iconify-icon icon="mdi:plus" className="mr-1"></iconify-icon>
              Add student
            </button>
          </>
        }
      />

      <div className="kiwi-students-shell flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="kiwi-students-filters w-full shrink-0 border-b border-zinc-200 bg-white px-4 py-3 md:w-80 md:border-b-0 md:border-r overflow-y-auto">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Filters</p>
              <div className="relative">
                <iconify-icon
                  icon="mdi:magnify"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"
                ></iconify-icon>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-400">Campus</label>
              <select
                value={selectedSchoolId}
                onChange={(e) => {
                  setSelectedSchoolId(e.target.value);
                  setSelectedClassId('all');
                  setCurrentPage(1);
                }}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm outline-none focus:border-zinc-400"
              >
                <option value="all">All campuses</option>
                {institutesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-400">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm outline-none focus:border-zinc-400"
              >
                <option value="all">All classes</option>
                {classesList
                  .filter((c) => selectedSchoolId === 'all' || c.institute_id === selectedSchoolId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        <WorkspacePanel title="Students">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-zinc-500">Loading directory…</div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
              <iconify-icon icon="mdi:account-search-outline" className="mb-3 h-12 w-12 opacity-40"></iconify-icon>
              <p className="text-sm font-medium">No students match this filter</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {paginatedStudents.map((student) => {
                const sClass = classesList.find((c) => c.id === student.class_id);
                const school = institutesList.find((s) => s.id === (student.institute_id || sClass?.institute_id || undefined));
                const isSelected = selectedIds.has(student.id);
                return (
                  <div
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className={`group relative flex cursor-pointer flex-col items-center rounded-md border bg-white p-4 transition-all ${
                      isSelected ? 'border-zinc-900 ring-1 ring-zinc-900/20 shadow-md' : 'border-zinc-200 hover:border-zinc-300 shadow-sm'
                    }`}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(student.id);
                      }}
                      className={`absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        isSelected ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isSelected && <iconify-icon icon="mdi:check" className="text-[10px]"></iconify-icon>}
                    </div>
                    <img src={student.avatar} alt={student.name} className="mb-3 h-12 w-12 rounded-full border border-zinc-100 bg-zinc-50" />
                    <h3 className="w-full truncate text-center text-xs font-medium leading-tight text-zinc-800">{student.name}</h3>
                    <p className="mb-2 text-[9px] font-medium tracking-wider text-zinc-500">{sClass?.name || 'No class'}</p>
                    <span
                      className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[8px] font-semibold ${
                        school?.name?.includes('Boys')
                          ? 'bg-indigo-50 text-indigo-600'
                          : school?.name?.includes('Girls')
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {school?.name || 'Unassigned'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-medium text-zinc-500">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === paginatedStudents.length && paginatedStudents.length > 0}
                        onChange={handleSelectAllOnPage}
                        className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                      />
                    </th>
                    <th className="px-4 py-3">Student name</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Campus</th>
                    <th className="px-4 py-3">Focus exams</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {paginatedStudents.map((student) => {
                    const isSelected = selectedIds.has(student.id);
                    const sClass = classesList.find((c) => c.id === student.class_id);
                    const school = institutesList.find((s) => s.id === (student.institute_id || sClass?.institute_id || undefined));
                    return (
                      <tr
                        key={student.id}
                        className={`cursor-pointer transition-colors hover:bg-zinc-50/80 ${isSelected ? 'bg-zinc-50' : ''}`}
                        onClick={() => setSelectedStudent(student)}
                      >
                        <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(student.id)}
                            className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5">
                            <img src={student.avatar} className="h-7 w-7 rounded-full border border-zinc-100 shadow-sm" />
                            <span className="font-medium text-zinc-800">{student.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 font-medium text-zinc-600">{sClass?.name || '—'}</td>
                        <td className="px-4 py-2 text-zinc-500">{school?.name || 'Unassigned'}</td>
                        <td className="px-4 py-2">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                            {student.attending_exams?.join(', ') || 'None'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(student);
                            }}
                            className="p-1 text-zinc-400 transition-colors hover:text-zinc-700"
                          >
                            <iconify-icon icon="mdi:chevron-right" className="h-5 w-5"></iconify-icon>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WorkspacePanel>

      {totalPages > 1 && (
          <footer className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50/80 px-4 py-3">
              <div className="text-[11px] font-medium text-zinc-500">Page {currentPage} of {totalPages}</div>
              <div className="flex gap-1">
                  <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-30"><iconify-icon icon="mdi:chevron-left" className="h-5 w-5"></iconify-icon></button>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-30"><iconify-icon icon="mdi:chevron-right" className="h-5 w-5"></iconify-icon></button>
              </div>
          </footer>
      )}
      </div>
      </div>
      
      {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-[2px] animate-fade-in">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 border border-white max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-semibold text-slate-800">Add Student</h2>
                    <button type="button" onClick={() => { setIsAddModalOpen(false); resetAddForm(); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                      <iconify-icon icon="mdi:close" className="w-5 h-5" />
                    </button>
                  </div>
                  <form onSubmit={handleAddStudent} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Name <span className="text-rose-500">*</span></label>
                      <input required value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent" placeholder="Full name" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                      <input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent" placeholder="student@school.edu" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mobile phone</label>
                      <input value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent" placeholder="+1-555-0101" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">School / campus</label>
                      <select
                        value={addForm.instituteId}
                        onChange={(e) => setAddForm((f) => ({ ...f, instituteId: e.target.value, classId: '' }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent"
                        required
                      >
                        <option value="">Select school</option>
                        {institutesList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Class</label>
                      <select required value={addForm.classId} onChange={(e) => setAddForm((f) => ({ ...f, classId: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent">
                        <option value="">Select class</option>
                        {classesList
                          .filter((c) => !addForm.instituteId || c.institute_id === addForm.instituteId)
                          .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Focus exams</label>
                      <input value={addForm.exams} onChange={(e) => setAddForm((f) => ({ ...f, exams: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent" placeholder="NEET, JEE (comma-separated)" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => { setIsAddModalOpen(false); resetAddForm(); }} className="flex-1 font-medium text-xs text-slate-500 py-3 rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                      <button type="submit" disabled={!addForm.name.trim()} className="flex-1 bg-accent text-white py-3 rounded-lg font-bold text-sm shadow-md disabled:opacity-40">Save student</button>
                    </div>
                  </form>
              </div>
          </div>
      )}

      {isCsvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl p-4 sm:p-6 border border-white my-4 max-h-[min(95vh,900px)] flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 shrink-0">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800">Bulk student import</h2>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
                        Download the template, fill it in Excel or Sheets, then upload. Review and edit rows below, then import. Match student emails to their login for online exams.
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                        {(actorRole || '').toLowerCase() === 'developer'
                          ? 'Developer mode: business is resolved from selected institute/class.'
                          : 'Business is auto-set to your default business for imported students.'}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setIsCsvModalOpen(false); setCsvPreviewRows([]); }} className="text-slate-400 hover:text-slate-700 text-sm self-end sm:self-start">✕</button>
                  </div>

                  {csvPreviewRows.length === 0 ? (
                    <div className="space-y-4 flex-1 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={downloadStudentCsvTemplate}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-sm hover:bg-emerald-700"
                        >
                          <iconify-icon icon="mdi:download" className="text-base" />
                          Download CSV template
                        </button>
                        <button
                          type="button"
                          onClick={() => csvFileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
                        >
                          <iconify-icon icon="mdi:upload" className="text-base" />
                          Upload CSV
                        </button>
                        <input
                          ref={csvFileInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={handleCsvFileSelected}
                        />
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-600">
                        <p className="font-bold text-slate-700 mb-1">Columns (header row optional)</p>
                        <code className="block font-mono text-[9px] text-emerald-700 break-all">
                          name, email, mobile_phone, attending_exams, institute_id, class_id
                        </code>
                        <p className="mt-2 text-slate-500">
                          Use quotes for exams. <span className="font-mono">institute_id</span> = school UUID; <span className="font-mono">class_id</span> must belong to that school. Legacy 5-column CSV (no school) still works.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Or paste CSV</label>
                        <textarea
                          value={csvPasteText}
                          onChange={(e) => setCsvPasteText(e.target.value)}
                          rows={8}
                          placeholder="Paste including header or data rows only..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 font-mono text-[11px] leading-normal resize-y min-h-[120px]"
                        />
                        <button
                          type="button"
                          onClick={handleParsePastedCsv}
                          disabled={!csvPasteText.trim()}
                          className="mt-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-40"
                        >
                          Preview rows
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col flex-1 min-h-0 gap-3">
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-end">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default school (empty cells)</label>
                          <select
                            value={defaultSchoolBulk}
                            onChange={(e) => setDefaultSchoolBulk(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500"
                          >
                            <option value="">None</option>
                            {institutesList.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default class (empty cells)</label>
                          <select
                            value={defaultClassBulk}
                            onChange={(e) => setDefaultClassBulk(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500"
                          >
                            <option value="">None</option>
                            {classesList
                              .filter((c) => !defaultSchoolBulk || c.institute_id === defaultSchoolBulk)
                              .map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={applyDefaultSchoolToAll}
                          disabled={!defaultSchoolBulk}
                          className="px-4 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 text-xs font-bold disabled:opacity-40"
                        >
                          Apply school
                        </button>
                        <button
                          type="button"
                          onClick={applyDefaultClassToAll}
                          disabled={!defaultClassBulk}
                          className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold disabled:opacity-40"
                        >
                          Apply class
                        </button>
                        <button
                          type="button"
                          onClick={() => { setCsvPreviewRows([]); setCsvPasteText(''); }}
                          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
                        >
                          Start over
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">{csvPreviewRows.length} row(s) — edit before importing.</p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-[200px] overflow-auto">
                        <table className="w-full text-left border-collapse text-[11px] min-w-[880px]">
                          <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-2 border-b border-slate-100 w-10"> </th>
                              <th className="px-2 py-2 border-b border-slate-100">Name *</th>
                              <th className="px-2 py-2 border-b border-slate-100">Email</th>
                              <th className="px-2 py-2 border-b border-slate-100">Phone</th>
                              <th className="px-2 py-2 border-b border-slate-100">Exams</th>
                              <th className="px-2 py-2 border-b border-slate-100">School</th>
                              <th className="px-2 py-2 border-b border-slate-100">Class</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {csvPreviewRows.map((row) => (
                              <tr key={row.key}>
                                <td className="px-1 py-1 align-top">
                                  <button
                                    type="button"
                                    onClick={() => removePreviewRow(row.key)}
                                    className="p-1 text-slate-400 hover:text-rose-600"
                                    aria-label="Remove row"
                                  >
                                    <iconify-icon icon="mdi:close" className="w-4 h-4" />
                                  </button>
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <input
                                    value={row.name}
                                    onChange={(e) => updatePreviewRow(row.key, 'name', e.target.value)}
                                    className="w-full min-w-[120px] max-w-[200px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  />
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <input
                                    value={row.email}
                                    onChange={(e) => updatePreviewRow(row.key, 'email', e.target.value)}
                                    className="w-full min-w-[120px] max-w-[220px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  />
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <input
                                    value={row.mobile_phone}
                                    onChange={(e) => updatePreviewRow(row.key, 'mobile_phone', e.target.value)}
                                    className="w-full min-w-[100px] max-w-[140px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  />
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <input
                                    value={row.attending_exams}
                                    onChange={(e) => updatePreviewRow(row.key, 'attending_exams', e.target.value)}
                                    placeholder="NEET, JEE"
                                    className="w-full min-w-[100px] max-w-[180px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  />
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <select
                                    value={row.institute_id}
                                    onChange={(e) => updatePreviewRow(row.key, 'institute_id', e.target.value)}
                                    className="w-full min-w-[120px] max-w-[200px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  >
                                    <option value="">—</option>
                                    {institutesList.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-1 py-1 align-top">
                                  <select
                                    value={row.class_id}
                                    onChange={(e) => updatePreviewRow(row.key, 'class_id', e.target.value)}
                                    className="w-full min-w-[120px] max-w-[200px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                                  >
                                    <option value="">—</option>
                                    {classesForRow(row.institute_id).map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end shrink-0 pt-2">
                        <button
                          type="button"
                          onClick={() => { setIsCsvModalOpen(false); setCsvPreviewRows([]); }}
                          className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmCsvImport}
                          className="px-6 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-md hover:bg-emerald-700"
                        >
                          Import {csvPreviewRows.filter((r) => r.name.trim()).length} students
                        </button>
                      </div>
                    </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default StudentDirectory;