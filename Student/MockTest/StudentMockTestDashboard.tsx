import '../../types';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';

interface StudentMockTestDashboardProps {
  onStartMock: (chapterIds: string[], difficulty: string, type: string) => void;
  isLoading: boolean;
}

const StudentMockTestDashboard: React.FC<StudentMockTestDashboardProps> = ({ onStartMock, isLoading }) => {
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  
  const [difficulty, setDifficulty] = useState('Medium');
  const [qType, setQType] = useState('neet'); // 'neet', 'mcq', 'reasoning', 'matching'
  
  const [isFetching, setIsFetching] = useState(false);

  // 1. Fetch Classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
        const { data } = await supabase.from('kb_classes').select('id, name').order('name');
        setClasses(data || []);
    };
    fetchClasses();
  }, []);

  // 2. Fetch Subjects when Class changes
  useEffect(() => {
    if (!selectedClassId) {
        setSubjects([]);
        setSelectedSubjectId('');
        return;
    }
    const fetchSubjects = async () => {
        const { data } = await supabase
            .from('subjects')
            .select('id, name')
            .eq('class_id', selectedClassId)
            .order('name');
        setSubjects(data || []);
        setSelectedSubjectId(''); // Reset subject
    };
    fetchSubjects();
  }, [selectedClassId]);

  // 3. Fetch Chapters when Subject changes
  useEffect(() => {
    if (!selectedSubjectId) {
        setChapters([]);
        setSelectedChapterIds(new Set());
        return;
    }
    const fetchChapters = async () => {
        setIsFetching(true);
        const { data } = await supabase
            .from('chapters')
            .select('id, name')
            .eq('subject_id', selectedSubjectId)
            .order('chapter_number', { ascending: true });
        
        setChapters(data || []);
        setIsFetching(false);
        setSelectedChapterIds(new Set()); // Reset selected chapters
    };
    fetchChapters();
  }, [selectedSubjectId]);

  const toggleChapter = (id: string) => {
      const newSet = new Set(selectedChapterIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedChapterIds(newSet);
  };

  const toggleAllChapters = () => {
      if (selectedChapterIds.size === chapters.length) {
          setSelectedChapterIds(new Set());
      } else {
          setSelectedChapterIds(new Set(chapters.map(c => c.id)));
      }
  };

  const handleStart = () => {
      if (selectedChapterIds.size > 0) {
          onStartMock(Array.from(selectedChapterIds), difficulty, qType);
      }
  };

  return (
    <div className={`${workspacePageClass} w-full overflow-y-auto p-6 md:p-8 custom-scrollbar`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="border-b border-zinc-200 pb-6">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900 text-white shadow-sm">
                    <iconify-icon icon="mdi:flask-outline" width="22" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Mock tests</h1>
                    <p className="mt-0.5 text-[13px] text-zinc-500">Multi-chapter practice</p>
                </div>
            </div>
        </header>

        <div className="relative flex flex-col gap-8 rounded-md border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
            <div className="relative z-10 flex flex-col gap-8">
                
                {/* 1. Class Selection */}
                <div>
                    <label className="mb-3 ml-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-[9px] text-zinc-600">1</span>
                        Class
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {classes.length > 0 ? classes.map(cls => (
                            <button
                                key={cls.id}
                                type="button"
                                onClick={() => setSelectedClassId(cls.id)}
                                className={`rounded-md border px-4 py-2.5 text-xs font-medium uppercase tracking-wide transition-all ${
                                    selectedClassId === cls.id
                                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                                }`}
                            >
                                {cls.name}
                            </button>
                        )) : (
                            <div className="pl-2 text-xs italic text-zinc-500">No classes available.</div>
                        )}
                    </div>
                </div>

                {/* 2. Subject Selection */}
                {selectedClassId && (
                    <div className="animate-slide-up">
                        <label className="mb-3 ml-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-[9px] text-zinc-600">2</span>
                            Subject
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {subjects.length > 0 ? subjects.map(sub => (
                                <button
                                    key={sub.id}
                                    type="button"
                                    onClick={() => setSelectedSubjectId(sub.id)}
                                    className={`flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium transition-all ${
                                        selectedSubjectId === sub.id
                                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm'
                                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                                    }`}
                                >
                                    <iconify-icon icon="mdi:book-variant" />
                                    {sub.name}
                                </button>
                            )) : (
                                <div className="pl-2 text-xs italic text-zinc-500">No subjects for this class.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. Chapter Selection (Multi) */}
                {selectedSubjectId && (
                    <div className="animate-slide-up">
                        <div className="flex justify-between items-end mb-3">
                            <label className="ml-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-[9px] text-zinc-600">3</span>
                                Chapters
                            </label>
                            {chapters.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleAllChapters}
                                    className="text-[10px] font-medium uppercase tracking-wider text-zinc-700 transition-colors hover:text-zinc-900"
                                >
                                    {selectedChapterIds.size === chapters.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>
                        
                        {isFetching ? (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="h-12 w-full animate-pulse rounded-md bg-zinc-100"></div>
                                <div className="h-12 w-full animate-pulse rounded-md bg-zinc-100"></div>
                            </div>
                        ) : chapters.length > 0 ? (
                            <div className="custom-scrollbar grid max-h-64 grid-cols-1 gap-2 overflow-y-auto p-1 pr-2 md:grid-cols-2 lg:grid-cols-3">
                                {chapters.map(chap => {
                                    const isSelected = selectedChapterIds.has(chap.id);
                                    return (
                                        <button
                                            key={chap.id}
                                            type="button"
                                            onClick={() => toggleChapter(chap.id)}
                                            className={`group flex items-center gap-3 rounded-md border p-3 text-left text-xs font-medium transition-all ${
                                                isSelected
                                                ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                                                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                                            }`}
                                        >
                                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${isSelected ? 'border-white bg-white text-zinc-900' : 'border-zinc-300 bg-zinc-50'}`}>
                                                {isSelected && <iconify-icon icon="mdi:check" className="text-xs font-bold" />}
                                            </div>
                                            <span className="truncate leading-tight">{chap.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                                <iconify-icon icon="mdi:alert-circle-outline" /> No chapters for this subject.
                            </div>
                        )}
                        {selectedChapterIds.size > 0 && (
                            <p className="mt-2 text-right text-[10px] font-medium text-zinc-500">{selectedChapterIds.size} selected</p>
                        )}
                    </div>
                )}

                {/* 4. Configuration & Action */}
                <div className="flex flex-col gap-8 border-t border-zinc-200 pt-8 xl:flex-row">
                    <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                            <label className="mb-3 ml-1 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Difficulty</label>
                            <div className="flex gap-2">
                                {['Easy', 'Medium', 'Hard'].map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDifficulty(d)}
                                        className={`flex-1 rounded-md border py-2.5 text-[10px] font-medium uppercase tracking-widest transition-all ${
                                            difficulty === d
                                            ? d === 'Easy' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : d === 'Medium' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-rose-500 bg-rose-50 text-rose-900'
                                            : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
                                        }`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="mb-3 ml-1 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Question pattern</label>
                            <select 
                                value={qType} 
                                onChange={e => setQType(e.target.value)}
                                className="w-full cursor-pointer appearance-none rounded-md border border-zinc-200 bg-white px-4 py-3 text-xs font-medium text-zinc-800 outline-none focus:border-zinc-400"
                            >
                                <option value="neet">NEET Standard (Mixed)</option>
                                <option value="mcq">Multiple Choice Only</option>
                                <option value="reasoning">Assertion & Reason</option>
                                <option value="matching">Matrix Matching</option>
                                <option value="statements">Statement I & II</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col justify-end xl:w-64">
                        <button 
                            type="button"
                            onClick={handleStart}
                            disabled={selectedChapterIds.size === 0 || isLoading}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 py-3.5 text-xs font-medium uppercase tracking-wide text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                                    <span>Generating…</span>
                                </>
                            ) : (
                                <>
                                    <iconify-icon icon="mdi:lightning-bolt" width="18" />
                                    <span>Start practice</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default StudentMockTestDashboard;