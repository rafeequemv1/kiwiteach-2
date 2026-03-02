import '../../types';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase/client';
// @ts-ignore
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

interface ClassItem {
  id: string;
  name: string;
  kb_name: string;
}

interface Subject {
  id: string;
  class_id: string;
  class_name: string;
  kb_id: string;
  kb_name: string;
  name: string;
}

interface Chapter {
  id: string;
  subject_id: string;
  subject_name: string;
  class_id: string;
  class_name: string;
  kb_id: string;
  kb_name: string;
  name: string;
  chapter_number?: number;
  pdf_name?: string;
  pdf_path?: string;
  doc_name?: string;
  doc_path?: string;
  raw_text?: string; 
  status: 'draft' | 'ready';
}

interface KnowledgeBaseExplorerProps {
  kbId: string;
  kbName: string;
  onBack: () => void;
}

const KnowledgeBaseExplorer: React.FC<KnowledgeBaseExplorerProps> = ({ kbId, kbName, onBack }) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [activeModal, setActiveModal] = useState<'class' | 'subject' | 'chapter' | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ type: 'class' | 'subject' | 'chapter'; item: any } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemNumber, setNewItemNumber] = useState<string>('');
  
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
  const [docViewer, setDocViewer] = useState<{ html: string; name: string } | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [kbId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name, kb_name')
        .eq('kb_id', kbId)
        .order('created_at', { ascending: true });
      if (classesError) throw classesError;
      setClasses(classesData);

      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, class_id, class_name, kb_id, kb_name, name')
        .eq('kb_id', kbId)
        .order('created_at', { ascending: true });
      if (subjectsError) throw subjectsError;
      setSubjects(subjectsData);
      
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('id, name, chapter_number, status, pdf_name, pdf_path, doc_name, doc_path, subject_id, subject_name, class_id, class_name, kb_id, kb_name')
        .eq('kb_id', kbId)
        .order('chapter_number', { ascending: true });
      if (chaptersError) throw chaptersError;
      setChapters(chaptersData);

      if (classesData.length > 0) {
        setSelectedClass(classesData[0]);
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
    } else if (activeModal === 'chapter') {
        setNewItemName('');
        setNewItemNumber('');
        setPdfFile(null);
        setDocFile(null);
    }
  }, [renamingItem, activeModal]);

  const slugify = (text: string | null | undefined) => {
    if (!text) return 'unknown';
    return text.toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
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

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      if (activeModal === 'class') {
        const { data, error } = await supabase.from('classes').insert([{ kb_id: kbId, kb_name: kbName, name: newItemName }]).select().single();
        if (error) throw error;
        setClasses([...classes, data]);
        setSelectedClass(data);
        setActiveModal(null);
      } 
      else if (activeModal === 'subject' && selectedClass) {
        const { data, error } = await supabase.from('subjects').insert([{ class_id: selectedClass.id, class_name: selectedClass.name, kb_id: kbId, kb_name: kbName, name: newItemName }]).select().single();
        if (error) throw error;
        setSubjects([...subjects, data]);
        setSelectedSubject(data);
        setActiveModal(null);
      } 
      else if (activeModal === 'chapter' && selectedSubject) {
        const num = newItemNumber ? parseInt(newItemNumber) : null;
        const { data: chapterData, error: chapterError } = await supabase.from('chapters').insert([{ 
          subject_id: selectedSubject.id, subject_name: selectedSubject.name, class_id: selectedSubject.class_id, class_name: selectedSubject.class_name, kb_id: kbId, kb_name: kbName, name: newItemName, chapter_number: num, status: 'draft' 
        }]).select().single();

        if (chapterError) throw chapterError;

        if (pdfFile || docFile) {
            setIsProcessing(true);
            setActiveModal(null);
            
            const kbDir = slugify(kbName);
            const classDir = slugify(selectedClass?.name);
            const subjectDir = slugify(selectedSubject?.name);
            const chapterDir = slugify(newItemName);
            const basePath = `${kbDir}/${classDir}/${subjectDir}/${chapterDir}`;

            let pdfPath = null;
            let rawText = '';
            let docPath = null;

            if (pdfFile) {
                setProcessingStep('Reading PDF Context...');
                rawText = await extractTextFromPdf(pdfFile);
                setProcessingStep('Uploading PDF...');
                const pdfClean = slugify(pdfFile.name.split('.')[0]) + '.pdf';
                pdfPath = `${basePath}/${pdfClean}`;
                await supabase.storage.from('chapters').upload(pdfPath, pdfFile, { upsert: true, contentType: 'application/pdf' });
            }

            if (docFile) {
                setProcessingStep('Uploading Source Doc...');
                const ext = docFile.name.split('.').pop();
                const docClean = slugify(docFile.name.split('.')[0]) + '.' + ext;
                docPath = `${basePath}/${docClean}`;
                await supabase.storage.from('chapters').upload(docPath, docFile, { upsert: true });
            }

            setProcessingStep('Finalizing...');
            const { data: updatedData, error: dbError } = await supabase
                .from('chapters')
                .update({
                    pdf_name: pdfFile?.name, pdf_path: pdfPath,
                    doc_name: docFile?.name, doc_path: docPath,
                    raw_text: rawText || undefined,
                    status: 'ready'
                })
                .eq('id', chapterData.id)
                .select()
                .single();

            if (dbError) throw dbError;
            setChapters(prev => [...prev.filter(c => c.id !== chapterData.id), updatedData].sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0)));
        } else {
            setChapters(prev => [...prev, chapterData].sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0)));
            setActiveModal(null);
        }
      }
      setNewItemName('');
      setNewItemNumber('');
      setPdfFile(null);
      setDocFile(null);
    } catch (err: any) {
      console.error(err);
      alert(`Error creating ${activeModal}: ${err.message}`);
    } finally {
        setIsProcessing(false);
        setProcessingStep('');
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
      if (type === 'class') {
        await Promise.all([
          supabase.from('classes').update({ name: newName }).eq('id', item.id),
          supabase.from('subjects').update({ class_name: newName }).eq('class_id', item.id),
          supabase.from('chapters').update({ class_name: newName }).eq('class_id', item.id)
        ]);
        await fetchData(); 
        setSelectedClass(prev => prev ? { ...prev, name: newName } : null);
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
      alert("Update failed: " + err.message);
    } finally {
      setRenamingItem(null);
      setNewItemName('');
      setNewItemNumber('');
    }
  };

  const deleteItem = async (type: 'class' | 'subject' | 'chapter', id: string, name: string) => {
    if (!confirm(`Delete ${type} "${name}"? This action cannot be undone.`)) return;
    try {
      const table = type === 'class' ? 'classes' : type === 'subject' ? 'subjects' : 'chapters';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      if (type === 'class' && selectedClass?.id === id) { setSelectedClass(null); setSelectedSubject(null); } 
      else if (type === 'subject' && selectedSubject?.id === id) { setSelectedSubject(null); }
      await fetchData(); 
    } catch (err: any) {
      console.error(err);
      alert(`Delete failed: ${err.message}`);
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

  const openDocViewer = async (chapter: Chapter) => {
    if (!chapter.doc_path) return;
    setIsProcessing(true);
    setProcessingStep('Rendering Full Document...');
    try {
      const { data: blob, error } = await supabase.storage.from('chapters').download(chapter.doc_path);
      if (error) throw error;
      
      const arrayBuffer = await blob.arrayBuffer();
      const result = await (window as any).mammoth.convertToHtml({ arrayBuffer });
      setDocViewer({ html: result.value, name: chapter.doc_name || chapter.name });
    } catch (err: any) {
      console.error("Doc viewer error", err);
      alert("Could not render document view.");
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };
  
  const isSearching = searchTerm.trim().length > 0;
  const filteredSubjects = isSearching 
    ? subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : subjects.filter(s => s.class_id === selectedClass?.id);

  const filteredChapters = isSearching
    ? chapters.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : chapters.filter(c => c.subject_id === selectedSubject?.id);

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

      <div className="shrink-0 bg-white border-b border-slate-200 shadow-sm z-10 px-4">
        <div className="flex items-center justify-between py-3 gap-6">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
            <button 
              onClick={() => setActiveModal('class')} 
              className="flex items-center justify-center w-8 h-8 bg-slate-50 rounded-lg text-slate-400 hover:text-accent hover:bg-indigo-50 transition-all border border-slate-200 shrink-0"
              title="Add Class"
            >
              <iconify-icon icon="mdi:plus" width="20" />
            </button>
            
            {classes.map(l => (
              <div key={l.id} className="relative group shrink-0">
                <button 
                  onClick={() => { setSelectedClass(l); setSelectedSubject(null); setSearchTerm(''); }} 
                  className={`text-sm font-black uppercase tracking-widest px-2 py-1 transition-all ${!isSearching && selectedClass?.id === l.id ? 'text-accent border-b-2 border-accent' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {l.name}
                </button>
                <div className="absolute -top-3 -right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ type: 'class', item: l }); }} className="w-5 h-5 bg-white text-slate-400 rounded-full shadow-md text-[10px] hover:text-indigo-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:pencil"></iconify-icon></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem('class', l.id, l.name); }} className="w-5 h-5 bg-white text-slate-400 rounded-full shadow-md text-[10px] hover:text-rose-500 border border-slate-100 flex items-center justify-center"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon></button>
                </div>
              </div>
            ))}
          </div>

          <div className="relative group min-w-[200px] lg:min-w-[300px]">
              <iconify-icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search Subjects or Chapters..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-9 pr-4 py-1.5 text-xs outline-none focus:border-accent focus:bg-white transition-all font-bold text-slate-700"
              />
              {isSearching && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                  <iconify-icon icon="mdi:close-circle" />
                </button>
              )}
          </div>
        </div>

        {!isSearching && (
          <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide py-2 border-t border-slate-50">
            <button 
              disabled={!selectedClass}
              onClick={() => setActiveModal('subject')} 
              className="flex items-center justify-center w-6 h-6 bg-slate-50 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all border border-slate-200 shrink-0 disabled:opacity-30"
              title="Add Subject"
            >
              <iconify-icon icon="mdi:plus" width="16" />
            </button>

            {selectedClass && filteredSubjects.map(s => (
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
            {!selectedClass && <span className="text-[9px] font-bold text-slate-300 uppercase italic">Select Class to view Subjects</span>}
            {selectedClass && filteredSubjects.length === 0 && <span className="text-[9px] font-bold text-slate-300 uppercase italic">No Subjects in this Class</span>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          {selectedSubject ? (
            <>
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
                  {c.chapter_number !== undefined && c.chapter_number !== null && (
                    <div className="absolute top-2 left-2 z-10">
                        <span className="bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter shadow-sm">Ch {c.chapter_number.toString().padStart(2, '0')}</span>
                    </div>
                  )}

                  <div className="flex-1 flex flex-col items-center justify-center text-center px-1 overflow-hidden">
                    <h5 className="text-[10px] font-black text-slate-800 line-clamp-2 leading-tight uppercase tracking-tight">{c.name}</h5>
                    <div className="mt-2 flex items-center gap-1">
                        {c.pdf_path && <iconify-icon icon="mdi:file-pdf-box" className="text-rose-500 text-xs" />}
                        {c.doc_path && <iconify-icon icon="mdi:file-document-outline" className="text-indigo-500 text-xs" />}
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 p-2">
                    {c.status === 'ready' && c.pdf_path && (
                        <button onClick={() => openPdfViewer(c)} className="w-full py-1.5 bg-white text-slate-900 rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-indigo-50"><iconify-icon icon="mdi:eye" width="12" /> View PDF</button>
                    )}
                    {c.status === 'ready' && c.doc_path && (
                        <button onClick={() => openDocViewer(c)} className="w-full py-1.5 bg-white text-slate-900 rounded-md text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-indigo-50"><iconify-icon icon="mdi:file-document-outline" width="12" /> View Doc</button>
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
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up border border-slate-200" onClick={e => e.stopPropagation()}>
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

              {activeModal === 'chapter' && !renamingItem && (
                 <div className="space-y-3 pt-2">
                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Context Material (PDF)</label>
                        <div 
                          onClick={() => pdfInputRef.current?.click()}
                          className={`group border-2 border-dashed rounded-xl p-3 flex items-center justify-center gap-3 cursor-pointer transition-all ${pdfFile ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 bg-slate-50 hover:border-rose-200'}`}
                        >
                           <iconify-icon icon={pdfFile ? "mdi:file-check" : "mdi:file-pdf-box"} className={`text-xl ${pdfFile ? 'text-rose-500' : 'text-slate-300'}`} />
                           <p className={`text-[10px] font-bold ${pdfFile ? 'text-rose-700' : 'text-slate-400'}`}>
                                {pdfFile ? pdfFile.name : 'Upload PDF (Required for AI)'}
                           </p>
                        </div>
                        <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                    </div>

                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Figure Source (Doc/HTML)</label>
                        <div 
                          onClick={() => docInputRef.current?.click()}
                          className={`group border-2 border-dashed rounded-xl p-3 flex items-center justify-center gap-3 cursor-pointer transition-all ${docFile ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-slate-50 hover:border-rose-200'}`}
                        >
                           <iconify-icon icon={docFile ? "mdi:file-check" : "mdi:file-document-outline"} className={`text-xl ${docFile ? 'text-indigo-500' : 'text-slate-300'}`} />
                           <p className={`text-[10px] font-bold ${docFile ? 'text-indigo-700' : 'text-slate-400'}`}>
                                {docFile ? docFile.name : 'Upload DOCX/HTML (Optional)'}
                           </p>
                        </div>
                        <input type="file" accept=".docx,.html" ref={docInputRef} className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                    </div>
                 </div>
              )}

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

      {docViewer && (
        <div className="fixed inset-0 z-[400] bg-slate-900/95 backdrop-blur-md flex flex-col p-4 animate-fade-in">
           <div className="w-full max-w-5xl mx-auto flex justify-between items-center mb-3 text-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg"><iconify-icon icon="mdi:file-document-outline" width="18"></iconify-icon></div>
                <div>
                  <h4 className="font-black text-xs truncate max-w-sm">{docViewer.name}</h4>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Source Knowledge Explorer</p>
                </div>
              </div>
              <button onClick={() => setDocViewer(null)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all"><iconify-icon icon="mdi:close" width="16"></iconify-icon></button>
           </div>
           <div className="flex-1 w-full max-w-5xl mx-auto bg-white rounded-xl overflow-y-auto shadow-2xl border border-white/10 p-12 md:p-20 custom-scrollbar">
              <div className="prose prose-slate max-w-none font-serif leading-relaxed text-lg text-slate-700" dangerouslySetInnerHTML={{ __html: docViewer.html }} />
           </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseExplorer;