import '../../types';
import React, { useState, useMemo, useEffect } from 'react';

type ViewMode = 'grid' | 'calendar' | 'kanban';
type CalendarType = 'month' | 'week' | 'year';
type TestStatus = 'draft' | 'generated' | 'scheduled' | 'over';

interface Test {
  id: string;
  name: string;
  questionCount: number;
  generatedAt: string;
  scheduledAt?: string | null;
  status: 'draft' | 'scheduled' | 'generated';
  class_ids?: string[];
  config?: any;
  layout_config?: any; 
  question_ids?: string[];
  questions?: any[];
  folder_id?: string | null;
}

interface School {
  id: string;
  name: string;
  color?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_id: string | null;
}

interface Folder {
  id: string;
  name: string;
  parent_id?: string | null;
  tests: Test[];
}

interface TestDashboardProps {
  username?: string;
  schoolsList: School[];
  classesList: SchoolClass[];
  folders: Folder[];
  allTests: Test[];
  onAddFolder: (folder: { name: string; parent_id: string | null }) => void;
  onStartNewTest: (folderId: string | null, initialDate?: string) => void;
  onTestClick: (test: Test) => void;
  onDeleteItem: (type: 'folder' | 'test', id: string, name: string) => void;
  onDuplicateTest: (test: Test) => void;
  onRenameTest: (testId: string, newName: string) => void;
  onScheduleTest: (testId: string, date: string | null) => void;
  onAssignClasses: (testId: string, classIds: string[]) => Promise<void>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  calendarType: CalendarType;
  setCalendarType: (type: CalendarType) => void;
  title?: string;
  subtitle?: string;
}

const TestDashboard: React.FC<TestDashboardProps> = ({ 
    username,
    schoolsList,
    classesList,
    folders,
    allTests,
    onAddFolder,
    onStartNewTest, 
    onTestClick, 
    onDeleteItem,
    onDuplicateTest,
    onRenameTest,
    onScheduleTest,
    onAssignClasses,
    viewMode,
    setViewMode,
    calendarType,
    setCalendarType,
    title = "Test Repository",
    subtitle
}) => {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, string | null>>({});
  const [schedulingTest, setSchedulingTest] = useState<Test | null>(null);
  const [assigningTest, setAssigningTest] = useState<Test | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [isAssigningSaving, setIsAssigningSaving] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{type: 'folder' | 'test', id: string, name: string} | null>(null);
  const [tempScheduleDate, setTempScheduleDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
      if (schedulingTest) {
          const d = schedulingTest.scheduledAt ? new Date(schedulingTest.scheduledAt) : new Date();
          if (!isNaN(d.getTime())) setTempScheduleDate(d.toISOString().split('T')[0]);
          else setTempScheduleDate(new Date().toISOString().split('T')[0]);
      }
  }, [schedulingTest]);

  useEffect(() => {
      if (assigningTest) setSelectedAssignmentIds(assigningTest.class_ids || []);
  }, [assigningTest]);

  const displayedClasses = useMemo(() => {
      if (selectedSchoolId === 'all') return [];
      return classesList.filter(c => c.school_id === selectedSchoolId);
  }, [classesList, selectedSchoolId]);

  const testsToDisplay = useMemo(() => {
      let filtered = allTests;

      if (selectedSchoolId !== 'all') {
          const schoolClassIds = new Set(classesList.filter(c => c.school_id === selectedSchoolId).map(c => c.id));
          filtered = filtered.filter(t => t.class_ids && t.class_ids.some(id => schoolClassIds.has(id)));
      }

      if (selectedClassId) {
          filtered = filtered.filter(t => t.class_ids?.includes(selectedClassId));
      }

      if (currentFolderId) {
          filtered = filtered.filter(t => t.folder_id === currentFolderId);
      } else if (!selectedClassId && selectedSchoolId === 'all') {
          filtered = filtered.filter(t => !t.folder_id);
      }

      return filtered.map(t => optimisticOverrides[t.id] !== undefined ? { ...t, scheduledAt: optimisticOverrides[t.id] } : t)
          .sort((a, b) => new Date(b.scheduledAt || b.generatedAt || 0).getTime() - new Date(a.scheduledAt || a.generatedAt || 0).getTime());
  }, [allTests, selectedSchoolId, selectedClassId, currentFolderId, classesList, optimisticOverrides]);

  const visibleFolders = useMemo(() => {
      if (currentFolderId) {
          return folders.filter(f => f.parent_id === currentFolderId);
      }
      if (selectedSchoolId === 'all' && !selectedClassId) {
          return folders.filter(f => !f.parent_id);
      }
      return [];
  }, [folders, currentFolderId, selectedSchoolId, selectedClassId]);

  const handleSchoolTabClick = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setSelectedClassId(null);
    setCurrentFolderId(null);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onAddFolder({ name: newFolderName, parent_id: currentFolderId });
    setNewFolderName('');
    setIsCreateModalOpen(false);
  };

  const confirmAssignment = async () => {
      if (!assigningTest) return;
      setIsAssigningSaving(true);
      await onAssignClasses(assigningTest.id, selectedAssignmentIds);
      setIsAssigningSaving(false);
      setAssigningTest(null);
  };

  const getTestStatus = (t: Test): TestStatus => {
      if (t.status === 'draft') return 'draft';
      if (t.status === 'generated') return 'generated';
      if (!t.scheduledAt) return 'generated'; // Fallback for old data
      
      const scheduleDate = new Date(t.scheduledAt);
      const today = new Date();
      today.setHours(0,0,0,0);
      return scheduleDate < today ? 'over' : 'scheduled';
  };

  const TestCard: React.FC<{test: Test, compact?: boolean, variant?: 'default' | 'kanban'}> = ({test, compact, variant = 'default'}) => {
    const status = getTestStatus(test);
    const [isRenaming, setIsRenaming] = useState(false);
    const [tempName, setTempName] = useState(test.name);

    const handleRenameSubmit = () => {
        if(tempName.trim() !== test.name && tempName.trim() !== "") onRenameTest(test.id, tempName);
        else setTempName(test.name);
        setIsRenaming(false);
    };

    if (variant === 'kanban') {
        return (
            <div draggable onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'test', id: test.id })); }} onClick={() => onTestClick(test)} className="group cursor-pointer bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-3 relative overflow-hidden mb-2">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${status === 'scheduled' ? 'bg-amber-400' : status === 'over' ? 'bg-emerald-400' : 'bg-slate-300'}`}></div>
                <div className="pl-1 min-w-0 flex-1 text-left">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase truncate">{test.name}</h4>
                    <span className="text-[8px] font-bold text-slate-400">{test.questionCount} Qs</span>
                </div>
            </div>
        );
    }

    const styles = {
        draft: { bg: 'bg-white', border: 'border-slate-300 border-dashed', icon: 'mdi:pencil-ruler', text: 'text-slate-500', accent: 'bg-slate-400' },
        generated: { bg: 'bg-white', border: 'border-slate-200', icon: 'mdi:file-document-outline', text: 'text-indigo-900', accent: 'bg-indigo-600' },
        scheduled: { bg: 'bg-white', border: 'border-amber-200', icon: 'mdi:calendar-clock', text: 'text-amber-900', accent: 'bg-amber-500' },
        over: { bg: 'bg-emerald-50/30', border: 'border-emerald-100', icon: 'mdi:check-circle-outline', text: 'text-emerald-800', accent: 'bg-emerald-500' }
    }[status];

    return (
        <div 
            draggable 
            onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'test', id: test.id })); }} 
            onClick={() => { if(!isRenaming) onTestClick(test); }} 
            className={`group cursor-pointer rounded-2xl border ${compact ? 'p-3 h-[140px]' : 'p-4 h-[190px]'} flex flex-col items-center text-center hover:shadow-xl transition-all relative overflow-hidden ${styles.bg} ${styles.border}`}
        >
            <div className={`absolute top-0 left-0 w-full h-1 ${styles.accent} opacity-20`}></div>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10" onClick={e => e.stopPropagation()}>
                <button onClick={(e) => { e.stopPropagation(); onDuplicateTest(test); }} className="w-6 h-6 bg-white text-slate-400 rounded-md hover:text-accent shadow-sm flex items-center justify-center" title="Duplicate"><iconify-icon icon="mdi:content-copy" width="12" /></button>
                {status !== 'draft' && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); setSchedulingTest(test); }} className="w-6 h-6 bg-white text-slate-400 rounded-md hover:text-amber-500 shadow-sm flex items-center justify-center" title="Schedule"><iconify-icon icon="mdi:calendar-clock" width="12" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setAssigningTest(test); }} className="w-6 h-6 bg-white text-slate-400 rounded-md hover:text-emerald-500 shadow-sm flex items-center justify-center" title="Assign Class"><iconify-icon icon="mdi:folder-move" width="12" /></button>
                    </>
                )}
                <button onClick={(e) => { e.stopPropagation(); setDeletingItem({ type: 'test', id: test.id, name: test.name }); }} className="w-6 h-6 bg-white text-slate-400 rounded-md hover:text-red-500 shadow-sm flex items-center justify-center" title="Delete"><iconify-icon icon="mdi:trash-can-outline" width="12" /></button>
            </div>
            
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 shadow-sm bg-slate-50 ${status === 'draft' ? 'text-slate-400' : 'text-indigo-500'}`}>
                <iconify-icon icon={styles.icon} width="20" />
            </div>
            
            <div className="w-full relative px-1 mb-1">
                {isRenaming ? (
                    <input 
                        autoFocus 
                        type="text" 
                        value={tempName} 
                        onChange={e => setTempName(e.target.value)} 
                        onBlur={handleRenameSubmit} 
                        onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()} 
                        onClick={e => { e.stopPropagation(); e.preventDefault(); }} 
                        className="text-[11px] font-black text-center bg-white border-2 border-accent rounded-lg px-2 py-1 w-full outline-none shadow-lg z-20 relative" 
                    />
                ) : (
                    <div className="group/title w-full relative flex justify-center items-center gap-1">
                        <h3 className={`text-[11px] font-black leading-tight uppercase tracking-wide truncate ${styles.text}`} title={test.name}>{test.name}</h3>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }} 
                            className="text-slate-300 hover:text-accent opacity-0 group-hover/title:opacity-100 transition-opacity p-1"
                        >
                            <iconify-icon icon="mdi:pencil" width="12" />
                        </button>
                    </div>
                )}
            </div>
            
            {status === 'draft' ? (
                <span className="text-[8px] font-bold text-slate-400 mt-auto bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-widest">Blueprint</span>
            ) : (
                <span className="text-[8px] font-bold text-slate-400 mt-auto">{test.questionCount} Questions</span>
            )}
        </div>
    );
  };

  const FolderCard: React.FC<{ folder: Folder }> = ({ folder }) => (
      <div onClick={() => setCurrentFolderId(folder.id)} className="group cursor-pointer bg-amber-50 rounded-3xl border border-amber-100 p-4 flex flex-col items-center justify-center text-center transition-all hover:shadow-lg h-[160px] relative">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); setDeletingItem({ type: 'folder', id: folder.id, name: folder.name }); }} className="w-6 h-6 bg-white text-rose-400 rounded-lg hover:text-white hover:bg-rose-500 flex items-center justify-center"><iconify-icon icon="mdi:trash-can-outline" width="12" /></button>
          </div>
          <iconify-icon icon="mdi:folder" width="40" className="text-amber-300 mb-2 group-hover:scale-110 transition-transform" />
          <h3 className="text-[11px] font-black uppercase tracking-wide text-amber-900">{folder.name}</h3>
      </div>
  );

  return (
    <div className="w-full h-full flex flex-col p-6 animate-fade-in font-sans relative">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">{title}</h1>
          <p className="text-xs text-slate-400 font-semibold mt-1">{subtitle ? subtitle : (username ? `Cloud Hub: ${username.split('@')[0]}` : 'Manage and deploy assessments')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['grid', 'kanban', 'calendar'].map(m => (
                <button key={m} onClick={() => setViewMode(m as any)} className={`p-2 rounded-lg transition-all ${viewMode === m ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}>
                    <iconify-icon icon={`mdi:${m}`} width="18" />
                </button>
            ))}
          </div>
          <button onClick={() => setIsCreateModalOpen(true)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-50 flex items-center gap-2">
            <iconify-icon icon="mdi:folder-plus-outline" width="18" />Folder
          </button>
          <button onClick={() => onStartNewTest(currentFolderId)} className="bg-accent text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-accent/20 hover:bg-indigo-700 active:scale-95">
            <iconify-icon icon="mdi:plus" width="18" />Generate New
          </button>
        </div>
      </div>
      
      <div className="flex border-b border-slate-200 mb-6 shrink-0 gap-6 overflow-x-auto">
          <button onClick={() => handleSchoolTabClick('all')} className={`pb-3 text-xs font-black uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${selectedSchoolId === 'all' ? 'text-accent' : 'text-slate-300 hover:text-slate-500'}`}>
              All Repository
              {selectedSchoolId === 'all' && <div className="absolute bottom-0 left-0 w-full h-1 bg-accent rounded-full" />}
          </button>
          {schoolsList.map(school => (
              <button key={school.id} onClick={() => handleSchoolTabClick(school.id)} className={`pb-3 text-xs font-black uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${selectedSchoolId === school.id ? 'text-accent' : 'text-slate-300 hover:text-slate-500'}`}>
                  {school.name}
                  {selectedSchoolId === school.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-accent rounded-full" />}
              </button>
          ))}
      </div>
      
      <div className="flex-1 flex gap-6 overflow-hidden pb-4">
        {selectedSchoolId !== 'all' && (
            <aside className="w-64 bg-white/40 backdrop-blur-sm rounded-[2rem] border border-slate-100 shadow-sm flex flex-col p-4 shrink-0">
                <h3 className="px-2 mb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class Filter</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                    <button onClick={() => setSelectedClassId(null)} className={`w-full text-left p-3 rounded-xl text-xs font-black uppercase tracking-tight transition-all flex items-center justify-between ${selectedClassId === null ? 'bg-indigo-500 text-white shadow-lg' : 'hover:bg-white/50 text-slate-500'}`}>
                        All Classes
                    </button>
                    {displayedClasses.map(cls => (
                        <button key={cls.id} onClick={() => setSelectedClassId(cls.id)} className={`w-full text-left p-3 rounded-xl text-xs font-black uppercase tracking-tight transition-all flex items-center justify-between ${selectedClassId === cls.id ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'hover:bg-white/50 text-slate-500'}`}>
                            <span className="truncate">{cls.name}</span>
                            {selectedClassId === cls.id && <iconify-icon icon="mdi:check" />}
                        </button>
                    ))}
                    {displayedClasses.length === 0 && <p className="text-[10px] text-slate-300 italic px-2 mt-4">No classes found</p>}
                </div>
            </aside>
        )}

        <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-100/30 rounded-[2rem] border border-slate-100 p-4">
            {currentFolderId && (
                <button onClick={() => setCurrentFolderId(null)} className="mb-4 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-accent bg-white px-3 py-1.5 rounded-lg border border-slate-200 w-fit">
                    <iconify-icon icon="mdi:arrow-left" /> Back
                </button>
            )}

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {visibleFolders.map(f => <FolderCard key={f.id} folder={f} />)}
                    {testsToDisplay.map(t => <TestCard key={t.id} test={t} />)}
                    {visibleFolders.length === 0 && testsToDisplay.length === 0 && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
                            <iconify-icon icon="mdi:folder-open-outline" width="64" className="mb-4 opacity-20" />
                            <p className="text-sm font-black uppercase tracking-widest opacity-40">Empty</p>
                            {selectedSchoolId !== 'all' && (
                                <p className="text-[10px] text-slate-400 mt-2">Tests assigned to classes in this school appear here.</p>
                            )}
                        </div>
                    )}
                </div>
            ) : viewMode === 'kanban' ? (
                <KanbanBoard tests={testsToDisplay} onTestClick={onTestClick} getTestStatus={getTestStatus} TestCard={TestCard} />
            ) : (
                <div className="bg-white rounded-[2rem] p-6 h-full shadow-sm">
                    <p className="text-center text-slate-400">Calendar View Implemented (Placeholder)</p>
                </div>
            )}
        </main>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border border-white">
            <h2 className="text-2xl font-black text-slate-800 mb-6">New Folder</h2>
            <form onSubmit={handleCreateFolder} className="space-y-6">
              <input autoFocus required type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-accent font-bold text-sm" placeholder="Folder Name" />
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {deletingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-slide-up">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4 text-center">Confirm Deletion</h3>
            <p className="text-center text-slate-500 mb-8">Are you sure you want to permanently delete <b className="text-slate-700">"{deletingItem.name}"</b>? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeletingItem(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button 
                onClick={() => {
                  onDeleteItem(deletingItem.type, deletingItem.id, deletingItem.name);
                  setDeletingItem(null);
                }} 
                className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl flex flex-col max-h-[80vh]">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6 text-center">Assign to Classes</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                {schoolsList.map(school => {
                    const schoolClasses = classesList.filter(c => c.school_id === school.id);
                    if (schoolClasses.length === 0) return null;
                    return (
                        <div key={school.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <iconify-icon icon="mdi:school" /> {school.name}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                {schoolClasses.map(cls => (
                                    <button key={cls.id} onClick={() => setSelectedAssignmentIds(prev => prev.includes(cls.id) ? prev.filter(id => id !== cls.id) : [...prev, cls.id])} className={`p-3 rounded-xl border transition-all flex items-center justify-between group ${selectedAssignmentIds.includes(cls.id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white border-slate-200 text-slate-600'}`}>
                                        <span className="text-xs font-bold uppercase tracking-wide truncate">{cls.name}</span>
                                        {selectedAssignmentIds.includes(cls.id) ? <iconify-icon icon="mdi:check-circle" className="text-white" /> : <div className="w-3 h-3 rounded-full border-2 border-slate-200" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {schoolsList.length === 0 && <p className="text-center text-slate-400 text-xs">No schools defined. Go to Settings to add schools.</p>}
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                <button onClick={() => setAssigningTest(null)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button onClick={confirmAssignment} disabled={isAssigningSaving} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2">
                    {isAssigningSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:check" />} Confirm
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KanbanBoard: React.FC<any> = ({ tests, getTestStatus, TestCard }) => {
    const columns = useMemo(() => {
        const cols: any = { draft: [], generated: [], scheduled: [], over: [] };
        tests.forEach((t: any) => {
            const status = getTestStatus(t);
            if(cols[status]) cols[status].push(t);
        });
        return cols;
    }, [tests, getTestStatus]);
    return (
        <div className="flex gap-6 h-full overflow-x-auto pb-4 snap-x">
            {Object.entries(columns).map(([status, items]: [string, any]) => (
                <div key={status} className="flex-1 flex flex-col min-w-[300px] h-full rounded-[2.5rem] border border-slate-100 bg-white/50 backdrop-blur-sm shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/80">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{status}</h3>
                        <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">{items.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                        {items.map((t: any) => <TestCard key={t.id} test={t} compact={true} variant="kanban" />)}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default TestDashboard;