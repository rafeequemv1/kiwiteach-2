import '../../types';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
// @ts-ignore
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

interface Level {
  id: string;
  name: string;
  kb_name: string;
}

interface Subject {
  id: string;
  level_id: string;
  level_name: string;
  kb_id: string;
  kb_name: string;
  name: string;
}

interface Chapter {
  id: string;
  subject_id: string;
  subject_name: string;
  level_id: string;
  level_name: string;
  kb_id: string;
  kb_name: string;
  name: string;
  chapter_number?: number;
  pdf_name?: string;
  pdf_path?: string;
  raw_text?: string;
  status: 'draft' | 'ready';
}

interface KnowledgeBaseExplorerProps {
  kbId: string;
  kbName: string;
  onBack: () => void;
}

const KnowledgeBaseExplorer: React.FC<KnowledgeBaseExplorerProps> = ({ kbId, kbName, onBack }) => {
  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  const [activeModal, setActiveModal] = useState<'level' | 'subject' | 'chapter' | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ type: 'level' | 'subject' | 'chapter'; item: any } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemNumber, setNewItemNumber] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [uploadingChapter, setUploadingChapter] = useState<Chapter | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [kbId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: levelsData, error: levelsError } = await supabase
        .from('curriculum_levels').select('*').eq('kb_id', kbId).order('created_at', { ascending: true });
      if (levelsError) throw levelsError;
      setLevels(levelsData);

      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects').select('*').eq('kb_id', kbId).order('created_at', { ascending: true });
      if (subjectsError) throw subjectsError;
      setSubjects(subjectsData);
      
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('*')
        .eq('kb_id', kbId)
        .order('chapter_number', { ascending: true });
      if (chaptersError) throw chaptersError;
      setChapters(chaptersData);

      if (levelsData.length > 0) {
        setSelectedLevel(levelsData[0]);
      }

    } catch (err: any) {
      console.error("Failed to fetch curriculum data:", err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    if (renamingItem) {
        setNewItemName(renamingItem.item.name);
        setNewItemNumber(renamingItem.item.chapter_number?.toString() || '');
    } else {
        setNewItemName('');
        setNewItemNumber('');
    }
  }, [renamingItem, activeModal]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      if (activeModal === 'level') {
        const { data, error } = await supabase.from('curriculum_levels').insert([{ 
          kb_id: kbId, 
          kb_name: kbName,
          name: newItemName 
        }]).select().single();
        if (error) throw error;
        setLevels([...levels, data]);
        setSelectedLevel(data);
      } 
      else if (activeModal === 'subject' && selectedLevel) {
        const { data, error } = await supabase.from('subjects').insert([{ 
          level_id: selectedLevel.id, 
          level_name: selectedLevel.name,
          kb_id: kbId,
          kb_name: kbName,
          name: newItemName 
        }]).select().single();
        if (error) throw error;
        setSubjects([...subjects, data]);
        setSelectedSubject(data);
      } 
      else if (activeModal === 'chapter' && selectedSubject) {
        const num = newItemNumber ? parseInt(newItemNumber) : null;
        const { data, error } = await supabase.from('chapters').insert([{ 
          subject_id: selectedSubject.id, 
          subject_name: selectedSubject.name,
          level_id: selectedSubject.level_id,
          level_name: selectedSubject.level_name,
          kb_id: kbId,
          kb_name: kbName,
          name: newItemName,
          chapter_number: num,
          status: 'draft' 
        }]).select().single();
        if (error) throw error;
        setChapters(prev => [...prev, data].sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0)));
      }
      setNewItemName('');
      setNewItemNumber('');
      setActiveModal(null);
    } catch (err: any) {
      console.error(err);
      alert(`Error creating ${activeModal}: ${err.message}`);
    }
  };
  
  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !newItemName.trim()) {
      setRenamingItem(null);
      setNewItemName('');
      setNewItemNumber('');
      return;
    }

    const { type, item } = renamingItem;
    const newName = newItemName.trim();
    const newNum = newItemNumber ? parseInt(newItemNumber) : null;

    try {
      if (type === 'level') {
        await Promise.all([
          supabase.from('curriculum_levels').update({ name: newName }).eq('id', item.id),
          supabase.from('subjects').update({ level_name: newName }).eq('level_id', item.id),
          supabase.from('chapters').update({ level_name: newName }).eq('level_id', item.id)
        ]);
        await fetchData(); 
        setSelectedLevel(prev => prev ? { ...prev, name: newName } : null);
      } else if (type === 'subject') {
        await Promise.all([
          supabase.from('subjects').update({ name: newName }).eq('id', item.id),
          supabase.from('chapters').update({ subject_name: newName }).eq('subject_id', item.id)
        ]);
        await fetchData();
        setSelectedSubject(prev => prev ? { ...prev, name: newName } : null);
      } else if (type === 'chapter') {
        await supabase.from('chapters').update({ name: newName, chapter_number: newNum }).eq('id', item.id);
        setChapters(prev => prev.map(c => c.id === item.id ? { ...c, name: newName, chapter_number: newNum ?? undefined } : c).sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0)));
      }
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setRenamingItem(null);
      setNewItemName('');
      setNewItemNumber('');
    }
  };

  const deleteItem = async (type: 'level' | 'subject' | 'chapter', id: string, name: string) => {
    if (!confirm(`Delete ${type} "${name}"? This action cannot be undone.`)) return;
    
    try {
      const table = type === 'level' ? 'curriculum_levels' : type === 'subject' ? 'subjects' : 'chapters';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      
      if (type === 'level' && selectedLevel?.id === id) { 
          setSelectedLevel(null); 
          setSelectedSubject(null); 
      } else if (type === 'subject' && selectedSubject?.id === id) {
          setSelectedSubject(null);
      }
      await fetchData(); 
    } catch (err: any) {
      console.error(err);
      alert(`Delete failed: ${err.message}`);
    }
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return fullText;
  };

  const slugify = (text: string | null | undefined) => {
    if (!text) return 'unknown';
    return text.toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingChapter) return;
    
    setIsProcessing(true);
    setProcessingStep('Extracting Knowledge...');

    try {
      const text = await extractTextFromPdf(file);
      setProcessingStep('Uploading to Organized Folders...');
      
      const kbDir = slugify(uploadingChapter.kb_name || kbName);
      const levelDir = slugify(uploadingChapter.level_name || selectedLevel?.name);
      const subjectDir = slugify(uploadingChapter.subject_name || selectedSubject?.name);
      const chapterDir = slugify(uploadingChapter.name);
      const fileClean = slugify(file.name.split('.')[0]) + '.pdf';
      
      const filePath = `${kbDir}/${levelDir}/${subjectDir}/${chapterDir}/${fileClean}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chapters')
        .upload(filePath, file, { upsert: true, contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      setProcessingStep('Finalizing Sync...');
      const { error: dbError } = await supabase
        .from('chapters')
        .update({
          pdf_name: file.name, pdf_path: filePath, raw_text: text, status: 'ready',
          kb_name: uploadingChapter.kb_name || kbName,
          level_name: uploadingChapter.level_name || selectedLevel?.name,
          subject_name: uploadingChapter.subject_name || selectedSubject?.name
        })
        .eq('id', uploadingChapter.id);

      if (dbError) throw dbError;

      setChapters(prev => prev.map(c => 
        c.id === uploadingChapter.id 
          ? { ...c, pdf_name: file.name, pdf_path: filePath, raw_text: text, status: 'ready' } 
          : c
      ));
      
      alert(`Successfully synced to cloud.`);
    } catch (err: any) {
      console.error("Critical Upload/Sync Error:", err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
      setUploadingChapter(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openPdfViewer = async (chapter: Chapter) => {
    if (!chapter.pdf_path) return;
    try {
      const { data, error } = await supabase.storage.from('chapters').createSignedUrl(chapter.pdf_path, 3600);
      if (error) throw error;
      if (data?.signedUrl) {
        setPdfViewer({ url: data.signedUrl, name: chapter.pdf_name || chapter.name });
      }
    } catch (err: any) {
      console.error("Signed URL error", err);
      alert("Could not load PDF view.");
    }
  };

  const downloadChapterPdf = async (chapter: Chapter) => {
    if (!chapter.pdf_path) return;
    try {
      const { data, error } = await supabase.storage.from('chapters').download(chapter.pdf_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = chapter.pdf_name || `${slugify(chapter.name)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('PDF download', err);
      alert(err?.message || 'Download failed.');
    }
  };
  
  const filteredSubjects = subjects.filter(s => s.level_id === selectedLevel?.id);
  const filteredChapters = chapters.filter(c => c.subject_id === selectedSubject?.id);

  if (isLoading) return (
    <div className="h-full flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-100 border-t-accent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="h-full flex flex-col font-sans animate-fade-in w-full bg-slate-50/30 overflow-hidden">
      {isProcessing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white px-6 py-4 rounded-lg shadow-2xl flex flex-col items-center gap-3 border border-slate-100 max-w-sm w-full">
              <div className="w-6 h-6 border-3 border-slate-100 border-t-accent rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-[9px] font-black text-slate-800 uppercase tracking-widest mb-1">{processingStep}</p>
                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Do not close window</p>
              </div>
           </div>
        </div>
      )}

      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" />

      {/* Navigation Bars */}
      <div className="shrink-0 bg-white border-b border-slate-200 shadow-sm z-10 px-4">
        {/* Levels Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide py-3">
          <button 
            onClick={() => setActiveModal('level')} 
            className="flex items-center justify-center w-8 h-8 bg-slate-50 rounded-lg text-slate-400 hover:text-accent hover:bg-indigo-50 transition-all border border-slate-200 shrink-0"
            title="Add Level"
          >
            <iconify-icon icon="mdi:plus" width="20" />
          </button>
          
          {levels.map(l => (
            <div key={l.id} className="relative group shrink-0">
              <button 
                onClick={() => { setSelectedLevel(l); setSelectedSubject(null); }} 
                className={`text-sm font-black uppercase tracking-widest px-2 py-1 transition-all ${selectedLevel?.id === l.id ? 'text-accent border-b-2 border-accent' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {l.name}
              </button>
              <div className="absolute -top-3 -right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ type: 'level', item: l }); }} className="w-5 h-5 bg-white text-slate-400 rounded-full shadow-md text-[10px] hover:text-indigo-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:pencil"></iconify-icon></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteItem('level', l.id, l.name); }} className="w-5 h-5 bg-white text-slate-400 rounded-full shadow-md text-[10px] hover:text-rose-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon></button>
              </div>
            </div>
          ))}
          {levels.length === 0 && <span className="text-[10px] font-bold text-slate-300 uppercase italic">No Levels</span>}
        </div>

        {/* Subject Tabs */}
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide py-2 border-t border-slate-50">
          <button 
            disabled={!selectedLevel}
            onClick={() => setActiveModal('subject')} 
            className="flex items-center justify-center w-6 h-6 bg-slate-50 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all border border-slate-200 shrink-0 disabled:opacity-30"
            title="Add Subject"
          >
            <iconify-icon icon="mdi:plus" width="16" />
          </button>

          {selectedLevel && filteredSubjects.map(s => (
            <div key={s.id} className="relative group shrink-0">
              <button 
                onClick={() => setSelectedSubject(s)} 
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition-all border ${selectedSubject?.id === s.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' : 'bg-white text-slate-400 border-slate-200 hover:border-emerald-300 hover:text-emerald-500'}`}
              >
                {s.name}
              </button>
              <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ type: 'subject', item: s }); }} className="w-4 h-4 bg-white text-slate-400 rounded-full shadow-md text-[8px] hover:text-indigo-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:pencil"></iconify-icon></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteItem('subject', s.id, s.name); }} className="w-4 h-4 bg-white text-slate-400 rounded-full shadow-md text-[8px] hover:text-rose-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon></button>
              </div>
            </div>
          ))}
          {!selectedLevel && <span className="text-[9px] font-bold text-slate-300 uppercase italic">Select Level to view Subjects</span>}
          {selectedLevel && filteredSubjects.length === 0 && <span className="text-[9px] font-bold text-slate-300 uppercase italic">No Subjects in this Level</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {/* Chapters Grid - Squarish cards, At least 8 in a row on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          {selectedSubject ? (
            <>
              {/* Add Chapter Button as a Card */}
              <button 
                onClick={() => setActiveModal('chapter')}
                className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-indigo-50/30 transition-all group"
              >
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-accent group-hover:bg-white transition-all shadow-sm">
                  <iconify-icon icon="mdi:plus" width="24" />
                </div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">New Chapter</span>
              </button>

              {filteredChapters.map(c => (
                <div 
                  key={c.id} 
                  className={`relative aspect-square bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col ${c.status === 'ready' ? 'border-amber-200' : 'grayscale'}`}
                >
                  {/* Chapter Number Badge */}
                  {c.chapter_number !== undefined && c.chapter_number !== null && (
                    <div className="absolute top-2 left-2 z-10">
                        <span className="bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter shadow-sm">Ch {c.chapter_number.toString().padStart(2, '0')}</span>
                    </div>
                  )}

                  <div className="flex-1 flex flex-col items-center justify-center text-center px-1 overflow-hidden">
                    <h5 className="text-[10px] font-black text-slate-800 line-clamp-3 leading-tight uppercase tracking-tight">{c.name}</h5>
                    {c.status === 'ready' && (
                        <div className="mt-2 text-[8px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 uppercase tracking-tighter">Ready</div>
                    )}
                  </div>

                  {/* Hover Controls */}
                  <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 p-2">
                    {c.status === 'ready' ? (
                      <>
                        <button onClick={() => openPdfViewer(c)} className="w-full py-1.5 bg-white text-slate-900 rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-indigo-50"><iconify-icon icon="mdi:eye" width="12" /> View</button>
                        <button onClick={() => void downloadChapterPdf(c)} className="w-full py-1.5 bg-white/90 text-slate-900 rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 ring-1 ring-white/40 hover:bg-emerald-50"><iconify-icon icon="mdi:download" width="12" /> Download</button>
                        <button onClick={() => { setUploadingChapter(c); fileInputRef.current?.click(); }} className="w-full py-1.5 bg-white/20 text-white rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-white/30"><iconify-icon icon="mdi:refresh" width="12" /> Update</button>
                      </>
                    ) : (
                      <button onClick={() => { setUploadingChapter(c); fileInputRef.current?.click(); }} className="w-full py-1.5 bg-emerald-500 text-white rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"><iconify-icon icon="mdi:upload" width="12" /> Knowledge</button>
                    )}
                    
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setRenamingItem({ type: 'chapter', item: c })} className="text-white/40 hover:text-white transition-colors"><iconify-icon icon="mdi:pencil" width="14" /></button>
                      <button onClick={() => deleteItem('chapter', c.id, c.name)} className="text-white/40 hover:text-rose-500 transition-colors"><iconify-icon icon="mdi:trash-can-outline" width="14" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
               <iconify-icon icon="mdi:arrow-up-thin-circle-outline" width="64" className="mb-4 opacity-20" />
               <p className="text-xs font-black uppercase tracking-widest opacity-40">Select a Subject to manage Chapters</p>
            </div>
          )}
        </div>
      </div>

      {(activeModal || renamingItem) && (
        <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setActiveModal(null); setRenamingItem(null); }}>
          <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl animate-slide-up border border-slate-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-slate-800 mb-4 uppercase tracking-widest">{renamingItem ? `Edit ${renamingItem.type}` : `New ${activeModal}`}</h3>
            <form onSubmit={renamingItem ? handleUpdateName : handleAddItem} className="space-y-4">
              {(activeModal === 'chapter' || renamingItem?.type === 'chapter') && (
                <div>
                   <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Chapter No.</label>
                   <input 
                      type="number" 
                      placeholder="e.g. 1" 
                      value={newItemNumber} 
                      onChange={e => setNewItemNumber(e.target.value)} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 outline-none focus:border-accent font-bold text-sm" 
                   />
                </div>
              )}
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Display Name</label>
                <input 
                  autoFocus 
                  type="text" 
                  required 
                  placeholder="Enter name..." 
                  value={newItemName} 
                  onChange={e => setNewItemName(e.target.value)} 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-accent font-bold text-sm" 
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setActiveModal(null); setRenamingItem(null); }} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded-lg">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/10">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pdfViewer && (
        <div className="fixed inset-0 z-[400] bg-slate-900/95 backdrop-blur-md flex flex-col p-4 animate-fade-in">
           <div className="w-full max-w-6xl mx-auto flex justify-between items-center mb-3 text-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center shadow-lg"><iconify-icon icon="mdi:file-pdf-box" width="18"></iconify-icon></div>
                <div>
                  <h4 className="font-black text-xs truncate max-w-sm">{pdfViewer.name}</h4>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Knowledge Base Asset</p>
                </div>
              </div>
              <button onClick={() => setPdfViewer(null)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all"><iconify-icon icon="mdi:close" width="16"></iconify-icon></button>
           </div>
           <div className="flex-1 w-full max-w-6xl mx-auto bg-white rounded-xl overflow-hidden shadow-2xl border border-white/10">
              <iframe src={pdfViewer.url} className="w-full h-full border-none" />
           </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseExplorer;