
import '../../types';
import React, { useState, useMemo, useRef } from 'react';
import { Question } from '../../Quiz/types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';
import InteractiveQuizSession from '../../Quiz/components/InteractiveQuizSession';
import { fetchEligibleQuestions, isUuid } from '../../Quiz/services/questionUsageService';
import { eligibleOversampleLimit, selectQuestionsMaxTopicSpread } from '../../Quiz/services/topicSpreadPick';

interface OnlineExamSchedulerProps {
  topic: string;
  questions: Question[];
  initialConfig?: any;
  onBack: () => void;
  onSave: (examData: any) => Promise<void>;
  institutesList: any[];
  classesList: any[];
}

const OnlineExamScheduler: React.FC<OnlineExamSchedulerProps> = ({ topic, questions, initialConfig, onBack, onSave, institutesList, classesList }) => {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [examTitle, setExamTitle] = useState(topic);
  
  const initialDate = initialConfig?.scheduledAt ? new Date(initialConfig.scheduledAt) : new Date();
  const [examDate, setExamDate] = useState(initialDate.toISOString().split('T')[0]);
  const [examTime, setExamTime] = useState(initialDate.toTimeString().slice(0,5));
  const [duration, setDuration] = useState(initialConfig?.duration || 60);
  const [releaseAnswers, setReleaseAnswers] = useState(initialConfig?.releaseAnswers || false);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(initialConfig?.classIds || []);

  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showClassSelector, setShowClassSelector] = useState(false);
  
  // Preview Localization
  const [previewSchoolId, setPreviewSchoolId] = useState<string>('default');
  const [previewClassId, setPreviewClassId] = useState<string>('default');

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [allowPastReplacements, setAllowPastReplacements] = useState(false);

  const stats = useMemo(() => {
      const breakdown = { total: localQuestions.length, easy: 0, medium: 0, hard: 0, types: {} as Record<string, number> };
      localQuestions.forEach(q => {
          if (q.difficulty === 'Easy') breakdown.easy++;
          else if (q.difficulty === 'Medium') breakdown.medium++;
          else if (q.difficulty === 'Hard') breakdown.hard++;
          const t = q.type === 'mcq' ? 'MCQ' : q.type === 'reasoning' ? 'ASR' : 'OTH';
          breakdown.types[t] = (breakdown.types[t] || 0) + 1;
      });
      return breakdown;
  }, [localQuestions]);

  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === dropIndex) return;
      const newQuestions = [...localQuestions];
      const [draggedItem] = newQuestions.splice(draggedIndex, 1);
      newQuestions.splice(dropIndex, 0, draggedItem);
      setLocalQuestions(newQuestions);
      setDraggedIndex(null);
  };

  const handleDelete = (id: string) => {
      if (localQuestions.length <= 1) return alert("Test must have at least one question.");
      setLocalQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleReplace = async (q: Question) => {
      if (!q.sourceChapterId) return alert("Cannot replace: Source chapter unknown.");
      setReplacingId(q.id);
      try {
          const currentIds = localQuestions
            .map(item => item.originalId || item.id)
            .filter((id): id is string => isUuid(id));
          const classContext =
            previewClassId !== 'default'
              ? previewClassId
              : selectedClassIds[0] || initialConfig?.classIds?.[0] || null;
          const candidates = await fetchEligibleQuestions({
            classId: classContext,
            chapterId: q.sourceChapterId,
            difficulty: q.difficulty,
            excludeIds: currentIds,
            limit: eligibleOversampleLimit(1),
            allowRepeats: allowPastReplacements,
          });
          if (!candidates.length) return alert("No alternative questions found in this chapter.");
          const newQ = selectQuestionsMaxTopicSpread(candidates, 1)[0];
          if (!newQ) return alert("No alternative questions found in this chapter.");
          setLocalQuestions(prev => prev.map(item => item.id === q.id ? newQ : item));
      } catch (err: any) { 
          console.error("Replace Error", err);
          alert("Replacement failed: " + err.message); 
      } finally { 
          setReplacingId(null); 
      }
  };

  const handleSave = async () => {
    if (selectedClassIds.length === 0) return alert("Please assign at least one class.");
    setIsSaving(true);
    try {
        const scheduledAt = new Date(`${examDate}T${examTime}`).toISOString();
        await onSave({ title: examTitle, scheduledAt, duration, releaseAnswers, questions: localQuestions, classIds: selectedClassIds });
    } catch (e: any) { alert("Failed to schedule test: " + e.message); } finally { setIsSaving(false); }
  };

  const selectedPreviewSchool = useMemo(() => institutesList.find(s => s.id === previewSchoolId), [institutesList, previewSchoolId]);

  if (isPreviewing) return <InteractiveQuizSession questions={localQuestions} topic={selectedPreviewSchool ? selectedPreviewSchool.name : examTitle} onExit={() => setIsPreviewing(false)} />;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans relative">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between z-20 shadow-sm">
         <div className="flex items-center gap-4">
             <button onClick={onBack} className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-700 transition-all border border-slate-100">
                 <iconify-icon icon="mdi:arrow-left" width="20" />
             </button>
             <div>
                 <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Deploy Online Test</h1>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{localQuestions.length} Questions • {selectedClassIds.length} Classes Assigned</p>
             </div>
         </div>
         <div className="flex items-center gap-3">
             <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner mr-2">
                  <select 
                    value={previewSchoolId} 
                    onChange={e => { setPreviewSchoolId(e.target.value); setPreviewClassId('default'); }}
                    className="bg-transparent text-[9px] font-black uppercase tracking-wider text-slate-600 px-3 py-1 outline-none border-r border-slate-200"
                  >
                    <option value="default">Preview School</option>
                    {institutesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select 
                    value={previewClassId} 
                    onChange={e => setPreviewClassId(e.target.value)}
                    disabled={previewSchoolId === 'default'}
                    className="bg-transparent text-[9px] font-black uppercase tracking-wider text-slate-600 px-3 py-1 outline-none disabled:opacity-30"
                  >
                    <option value="default">Preview Class</option>
                    {classesList.filter(c => c.institute_id === previewSchoolId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
             </div>

             <button onClick={() => setIsPreviewing(true)} className="bg-white text-sky-800 border border-sky-200 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-sky-50 transition-all flex items-center gap-2 shadow-sm">
                <iconify-icon icon="mdi:eye-outline" width="18" /> Preview
             </button>
             <button onClick={handleSave} disabled={isSaving} className="bg-sky-300 hover:bg-sky-200 text-sky-950 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:cloud-upload-outline" width="18" />}
                Publish test
             </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {localQuestions.map((q, idx) => (
                      <div key={q.id || idx} draggable onDragStart={(e) => handleDragStart(e, idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={(e) => handleDrop(e, idx)} className={`bg-white p-5 rounded-3xl border transition-all flex flex-col gap-3 group relative hover:shadow-xl ${replacingId === q.id ? 'opacity-50 border-sky-200 animate-pulse' : 'border-slate-100 hover:border-sky-200'}`}>
                          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/90 backdrop-blur-sm rounded-xl p-1 shadow-md border border-slate-100">
                              <button onClick={() => handleReplace(q)} disabled={!!replacingId} className="w-7 h-7 flex items-center justify-center text-sky-600 hover:bg-sky-50 rounded-lg hover:scale-110 transition-transform"><iconify-icon icon="mdi:refresh" width="16" /></button>
                              <button onClick={() => handleDelete(q.id)} className="w-7 h-7 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg hover:scale-110 transition-transform"><iconify-icon icon="mdi:trash-can-outline" width="16" /></button>
                              <div className="w-px h-4 bg-slate-200 mx-1"></div>
                              <div className="w-7 h-7 flex items-center justify-center text-slate-400 cursor-grab active:cursor-grabbing"><iconify-icon icon="mdi:drag" width="18" /></div>
                          </div>
                          <div className="flex justify-between items-start">
                              <span className="bg-slate-100 text-slate-500 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider">Phase {idx + 1}</span>
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600' : q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>{q.difficulty}</span>
                          </div>
                          <div className="flex-1">
                              {q.figureDataUrl && <div className="mb-3 rounded-2xl overflow-hidden border border-slate-50 max-h-32 bg-slate-50/50 flex items-center justify-center"><img src={q.figureDataUrl} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" /></div>}
                              <div className="text-xs font-bold text-slate-700 line-clamp-2 leading-relaxed mb-3">{renderWithSmiles(parsePseudoLatexAndMath(q.text), 100)}</div>
                              <div className="space-y-1.5 opacity-60">
                                  {q.options.map((opt, i) => (
                                      <div key={i} className={`text-[9px] flex gap-2 ${i === q.correctIndex ? 'text-emerald-600 font-black' : 'text-slate-500 font-bold'}`}><span className="opacity-40">{String.fromCharCode(65 + i)}.</span><span className="line-clamp-1">{renderWithSmiles(parsePseudoLatexAndMath(opt), 80)}</span></div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          <div className="w-80 bg-white border-l border-slate-200 shrink-0 flex flex-col z-10 shadow-2xl relative">
              <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Forge Parameters</h3>
                  <div className="space-y-6">
                      <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Test title</label>
                          <input type="text" value={examTitle} onChange={e => setExamTitle(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 outline-none focus:border-sky-400 transition-all shadow-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Launch Date</label>
                              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black text-slate-700 outline-none" />
                          </div>
                          <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Time (Local)</label>
                              <input type="time" value={examTime} onChange={e => setExamTime(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black text-slate-700 outline-none" />
                          </div>
                      </div>
                      <div>
                          <div className="flex justify-between items-center mb-2 px-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Window (Mins)</label>
                              <span className="text-[10px] font-black text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">{duration}m</span>
                          </div>
                          <input type="range" min="10" max="300" step="5" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-sky-500" />
                      </div>
                      
                      {/* ASSIGN CLASSES */}
                      <div className="pt-2">
                         <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Assigned Audience</label>
                         <button onClick={() => setShowClassSelector(true)} className="w-full p-4 bg-emerald-50 border-2 border-emerald-100/50 text-emerald-700 rounded-[1.5rem] flex flex-col items-center justify-center gap-1 hover:bg-emerald-100 transition-all group">
                            <iconify-icon icon="mdi:account-group" className="text-xl transition-transform group-hover:scale-110" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{selectedClassIds.length === 0 ? 'Select Classes' : `${selectedClassIds.length} Classes Selected`}</span>
                         </button>
                      </div>

                      <div className="bg-slate-900 p-4 rounded-2xl flex items-center justify-between shadow-xl">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Auto-Key</label>
                          <button onClick={() => setReleaseAnswers(!releaseAnswers)} className={`w-10 h-5 rounded-full transition-all relative ${releaseAnswers ? 'bg-emerald-500' : 'bg-slate-700'}`}><div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${releaseAnswers ? 'left-6' : 'left-1'}`}></div></button>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                          <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Allow past replace</label>
                          <button onClick={() => setAllowPastReplacements(!allowPastReplacements)} className={`w-10 h-5 rounded-full transition-all relative ${allowPastReplacements ? 'bg-amber-500' : 'bg-amber-200'}`}><div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${allowPastReplacements ? 'left-6' : 'left-1'}`}></div></button>
                      </div>
                  </div>
              </div>

              <div className="p-6 flex-1 bg-slate-50/30 overflow-y-auto">
                  <div className="bg-white rounded-[2rem] p-5 border border-slate-200 shadow-sm space-y-5">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Structure</span>
                          <span className="text-xl font-black text-sky-700">{stats.total} Qs</span>
                      </div>
                      <div className="space-y-4">
                          <div className="flex flex-wrap gap-1.5">
                              {stats.easy > 0 && <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase">E:{stats.easy}</span>}
                              {stats.medium > 0 && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 uppercase">M:{stats.medium}</span>}
                              {stats.hard > 0 && <span className="text-[8px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100 uppercase">H:{stats.hard}</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                              {Object.entries(stats.types).map(([type, count]) => (
                                  <span key={type} className="text-[8px] font-black text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 uppercase">{type}: {count}</span>
                              ))}
                          </div>
                      </div>
                      <div className="pt-2 border-t border-slate-50">
                          <div className="flex justify-between items-center text-[10px] font-black text-slate-500 bg-slate-50 p-3 rounded-xl uppercase tracking-widest">
                              <span>Total Score</span>
                              <span className="text-slate-900 text-sm">{stats.total * 4}</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Class Selector Modal Overlay */}
      {showClassSelector && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100"><iconify-icon icon="mdi:account-multiple-plus" width="24" /></div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Assign Target</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deploy to Classrooms</p>
                        </div>
                     </div>
                     <button onClick={() => setShowClassSelector(false)} className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors flex items-center justify-center"><iconify-icon icon="mdi:close" width="20" /></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                      {institutesList.map(school => {
                          const schoolClasses = classesList.filter(c => c.institute_id === school.id);
                          if (schoolClasses.length === 0) return null;
                          return (
                              <div key={school.id} className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 shadow-inner">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                      <iconify-icon icon="mdi:domain" /> {school.name}
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3">
                                      {schoolClasses.map(cls => (
                                          <button 
                                            key={cls.id} 
                                            onClick={() => setSelectedClassIds(prev => prev.includes(cls.id) ? prev.filter(id => id !== cls.id) : [...prev, cls.id])} 
                                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 group ${selectedClassIds.includes(cls.id) ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/20' : 'bg-white border-slate-100 text-slate-500 hover:border-emerald-300'}`}
                                          >
                                              <span className="text-xs font-black uppercase tracking-tight">{cls.name}</span>
                                              {selectedClassIds.includes(cls.id) ? <iconify-icon icon="mdi:check-circle" className="text-white" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-100" />}
                                          </button>
                                      ))}
                                  </div>
                              </div>
                          );
                      })}
                      {institutesList.length === 0 && (
                          <div className="text-center py-10">
                              <iconify-icon icon="mdi:alert-circle-outline" width="48" className="text-slate-200 mb-4" />
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No organizations found. Configure them in Settings.</p>
                          </div>
                      )}
                  </div>
                  
                  <div className="mt-8 pt-6 border-t border-slate-100 flex gap-3">
                      <button onClick={() => setSelectedClassIds([])} className="px-6 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-rose-500 transition-colors">Clear All</button>
                      <button onClick={() => setShowClassSelector(false)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
                          Confirm Selection
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default OnlineExamScheduler;
