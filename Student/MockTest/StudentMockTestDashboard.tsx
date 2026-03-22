import '../../types';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';

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
    <div className="w-full h-full p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-50 font-sans">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        
        {/* Header Section */}
        <header>
            <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 transform -rotate-3">
                    <iconify-icon icon="mdi:flask-outline" width="24" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Mock Tests</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Multi-Chapter Practice Engine</p>
                </div>
            </div>
        </header>

        {/* Main Generator Card */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-50 via-purple-50 to-transparent rounded-bl-[100%] -z-0 opacity-60 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col gap-8">
                
                {/* 1. Class Selection */}
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1 flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded flex items-center justify-center text-[9px]">1</span> 
                        Select Class
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {classes.length > 0 ? classes.map(cls => (
                            <button
                                key={cls.id}
                                onClick={() => setSelectedClassId(cls.id)}
                                className={`px-6 py-3 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-wide ${
                                    selectedClassId === cls.id 
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md' 
                                    : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-indigo-200 hover:bg-white hover:text-slate-600'
                                }`}
                            >
                                {cls.name}
                            </button>
                        )) : (
                            <div className="text-xs text-slate-400 font-medium italic pl-2">No classes available.</div>
                        )}
                    </div>
                </div>

                {/* 2. Subject Selection */}
                {selectedClassId && (
                    <div className="animate-slide-up">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1 flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded flex items-center justify-center text-[9px]">2</span>
                            Select Subject
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {subjects.length > 0 ? subjects.map(sub => (
                                <button
                                    key={sub.id}
                                    onClick={() => setSelectedSubjectId(sub.id)}
                                    className={`px-5 py-2.5 rounded-xl border transition-all font-bold text-xs flex items-center gap-2 ${
                                        selectedSubjectId === sub.id 
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md' 
                                        : 'border-slate-100 bg-white text-slate-500 hover:border-emerald-200 hover:text-slate-700'
                                    }`}
                                >
                                    <iconify-icon icon="mdi:book-variant" />
                                    {sub.name}
                                </button>
                            )) : (
                                <div className="text-xs text-slate-400 font-medium italic pl-2">No subjects found for this class.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. Chapter Selection (Multi) */}
                {selectedSubjectId && (
                    <div className="animate-slide-up">
                        <div className="flex justify-between items-end mb-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded flex items-center justify-center text-[9px]">3</span>
                                Select Chapters
                            </label>
                            {chapters.length > 0 && (
                                <button 
                                    onClick={toggleAllChapters}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wider"
                                >
                                    {selectedChapterIds.size === chapters.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>
                        
                        {isFetching ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="h-12 w-full bg-slate-50 rounded-xl animate-pulse"></div>
                                <div className="h-12 w-full bg-slate-50 rounded-xl animate-pulse"></div>
                            </div>
                        ) : chapters.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-2 p-1">
                                {chapters.map(chap => {
                                    const isSelected = selectedChapterIds.has(chap.id);
                                    return (
                                        <button
                                            key={chap.id}
                                            onClick={() => toggleChapter(chap.id)}
                                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all group ${
                                                isSelected
                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/30'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-white bg-white text-indigo-600' : 'border-slate-300 bg-slate-50 group-hover:border-indigo-300'}`}>
                                                {isSelected && <iconify-icon icon="mdi:check" className="text-xs font-bold" />}
                                            </div>
                                            <span className="text-xs font-bold truncate leading-tight">{chap.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-4 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 flex items-center gap-2">
                                <iconify-icon icon="mdi:alert-circle-outline" /> No chapters found for this subject.
                            </div>
                        )}
                        {selectedChapterIds.size > 0 && (
                            <p className="text-[10px] font-bold text-slate-400 text-right mt-2">{selectedChapterIds.size} Chapters Selected</p>
                        )}
                    </div>
                )}

                {/* 4. Configuration & Action */}
                <div className="flex flex-col xl:flex-row gap-8 border-t border-slate-100 pt-8">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Difficulty */}
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1">Challenge Level</label>
                            <div className="flex gap-2">
                                {['Easy', 'Medium', 'Hard'].map(d => (
                                    <button 
                                        key={d}
                                        onClick={() => setDifficulty(d)}
                                        className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all border ${
                                            difficulty === d 
                                            ? d === 'Easy' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : d === 'Medium' ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-rose-50 border-rose-500 text-rose-600'
                                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                                        }`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Question Type */}
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1">Question Pattern</label>
                            <select 
                                value={qType} 
                                onChange={e => setQType(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-4 py-3 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                                <option value="neet">NEET Standard (Mixed)</option>
                                <option value="mcq">Multiple Choice Only</option>
                                <option value="reasoning">Assertion & Reason</option>
                                <option value="matching">Matrix Matching</option>
                                <option value="statements">Statement I & II</option>
                            </select>
                        </div>
                    </div>

                    <div className="xl:w-64 flex flex-col justify-end">
                        <button 
                            onClick={handleStart}
                            disabled={selectedChapterIds.size === 0 || isLoading}
                            className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs shadow-lg shadow-slate-900/20 hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Generating...</span>
                                </>
                            ) : (
                                <>
                                    <iconify-icon icon="mdi:lightning-bolt" width="18" />
                                    <span>Start Practice</span>
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