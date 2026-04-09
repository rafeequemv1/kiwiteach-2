import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
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

type BiologyBranch = 'botany' | 'zoology';

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
  /** Set for Biology chapters: botany vs zoology; null when not applicable or unset. */
  biology_branch?: BiologyBranch | null;
}

function isBiologySubjectName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n === 'biology' || n.includes('biology');
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
  /** Biology-only: botany / zoology; empty string = unset (null in DB). */
  const [biologyBranchDraft, setBiologyBranchDraft] = useState<'' | BiologyBranch>('');
  /** Edit chapter: reassign class / subject (same KB). */
  const [editChapterClassId, setEditChapterClassId] = useState('');
  const [editChapterSubjectId, setEditChapterSubjectId] = useState('');

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
        .from('kb_classes')
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
        .select('id, name, chapter_number, status, pdf_name, pdf_path, doc_name, doc_path, subject_id, subject_name, class_id, class_name, kb_id, kb_name, biology_branch')
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
        if (renamingItem.type === 'chapter') {
          const b = renamingItem.item.biology_branch;
          setBiologyBranchDraft(b === 'botany' || b === 'zoology' ? b : '');
          setEditChapterClassId(renamingItem.item.class_id || '');
          setEditChapterSubjectId(renamingItem.item.subject_id || '');
          setPdfFile(null);
          setDocFile(null);
        } else {
          setBiologyBranchDraft('');
          setEditChapterClassId('');
          setEditChapterSubjectId('');
        }
    } else if (activeModal === 'chapter') {
        setNewItemName('');
        setNewItemNumber('');
        setBiologyBranchDraft('');
        setEditChapterClassId('');
        setEditChapterSubjectId('');
        setPdfFile(null);
        setDocFile(null);
    } else {
        setEditChapterClassId('');
        setEditChapterSubjectId('');
    }
  }, [renamingItem, activeModal]);

  const editChapterSubjectsFiltered = useMemo(
    () => subjects.filter((s) => s.class_id === editChapterClassId),
    [subjects, editChapterClassId]
  );

  const editChapterResolvedSubjectName =
    renamingItem?.type === 'chapter'
      ? subjects.find((s) => s.id === editChapterSubjectId)?.name ?? renamingItem.item.subject_name
      : '';

  const slugify = (text: string | null | undefined) => {
    if (!text) return 'unknown';
    return text.toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };

  const escapeCsvCell = (value: string | number | null | undefined) => {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const handleExportCatalogCsv = () => {
    const headers = [
      'knowledge_base',
      'class',
      'subject',
      'chapter_number',
      'chapter_name',
      'biology_branch',
      'chapter_status',
      'entry_type',
    ] as const;

    const lines: string[] = [];
    lines.push(headers.map((h) => escapeCsvCell(h)).join(','));

    const sortedChapters = [...chapters].sort((a, b) => {
      const byClass = (a.class_name || '').localeCompare(b.class_name || '');
      if (byClass !== 0) return byClass;
      const bySub = (a.subject_name || '').localeCompare(b.subject_name || '');
      if (bySub !== 0) return bySub;
      const an = a.chapter_number ?? 9999;
      const bn = b.chapter_number ?? 9999;
      if (an !== bn) return an - bn;
      return (a.name || '').localeCompare(b.name || '');
    });

    for (const c of sortedChapters) {
      lines.push(
        [
          escapeCsvCell(kbName),
          escapeCsvCell(c.class_name),
          escapeCsvCell(c.subject_name),
          escapeCsvCell(c.chapter_number ?? ''),
          escapeCsvCell(c.name),
          escapeCsvCell(c.biology_branch ?? ''),
          escapeCsvCell(c.status),
          escapeCsvCell('chapter'),
        ].join(',')
      );
    }

    const subjectIdsWithChapter = new Set(chapters.map((ch) => ch.subject_id));
    const subjectsWithoutChapters = subjects.filter((s) => !subjectIdsWithChapter.has(s.id));
    const sortedOrphans = [...subjectsWithoutChapters].sort((a, b) => {
      const byClass = (a.class_name || '').localeCompare(b.class_name || '');
      if (byClass !== 0) return byClass;
      return (a.name || '').localeCompare(b.name || '');
    });
    for (const s of sortedOrphans) {
      lines.push(
        [
          escapeCsvCell(kbName),
          escapeCsvCell(s.class_name),
          escapeCsvCell(s.name),
          escapeCsvCell(''),
          escapeCsvCell(''),
          escapeCsvCell(''),
          escapeCsvCell(''),
          escapeCsvCell('subject_only'),
        ].join(',')
      );
    }

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(kbName)}_chapters_subjects_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        const { data, error } = await supabase.from('kb_classes').insert([{ kb_id: kbId, kb_name: kbName, name: newItemName }]).select().single();
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
        const chapterRow: Record<string, unknown> = {
          subject_id: selectedSubject.id,
          subject_name: selectedSubject.name,
          class_id: selectedSubject.class_id,
          class_name: selectedSubject.class_name,
          kb_id: kbId,
          kb_name: kbName,
          name: newItemName,
          chapter_number: num,
          status: 'draft',
        };
        if (isBiologySubjectName(selectedSubject.name)) {
          chapterRow.biology_branch = biologyBranchDraft || null;
        }
        const { data: chapterData, error: chapterError } = await supabase.from('chapters').insert([chapterRow]).select().single();

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
      setBiologyBranchDraft('');
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

    let chapterEditCls: ClassItem | undefined;
    let chapterEditSub: Subject | undefined;
    if (type === 'chapter') {
      chapterEditCls = classes.find((x) => x.id === editChapterClassId);
      chapterEditSub = subjects.find((x) => x.id === editChapterSubjectId);
      if (!chapterEditCls || !chapterEditSub) {
        alert('Select a class and a subject.');
        return;
      }
      if (chapterEditSub.class_id !== chapterEditCls.id) {
        alert('Selected subject does not belong to that class.');
        return;
      }
    }

    try {
      if (type === 'class') {
        await Promise.all([
          supabase.from('kb_classes').update({ name: newName }).eq('id', item.id),
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
      } else if (type === 'chapter' && chapterEditCls && chapterEditSub) {
        const cls = chapterEditCls;
        const sub = chapterEditSub;
        const payload: Record<string, unknown> = {
          name: newName,
          chapter_number: newNum,
          class_id: cls.id,
          class_name: cls.name,
          subject_id: sub.id,
          subject_name: sub.name,
          kb_name: kbName,
        };
        if (isBiologySubjectName(sub.name)) {
          payload.biology_branch = biologyBranchDraft || null;
        } else {
          payload.biology_branch = null;
        }
        await supabase.from('chapters').update(payload).eq('id', item.id);

        const basePath = `${slugify(kbName)}/${slugify(cls.name)}/${slugify(sub.name)}/${slugify(newName)}`;
        const fileUpdates: Record<string, unknown> = {};

        if (pdfFile) {
          setIsProcessing(true);
          setProcessingStep('Reading PDF…');
          const rawText = await extractTextFromPdf(pdfFile);
          setProcessingStep('Uploading PDF…');
          const pdfClean = slugify(pdfFile.name.split('.')[0]) + '.pdf';
          const pdfPath = `${basePath}/${pdfClean}`;
          await supabase.storage.from('chapters').upload(pdfPath, pdfFile, {
            upsert: true,
            contentType: 'application/pdf',
          });
          const prevPath = (item as Chapter).pdf_path;
          if (prevPath && prevPath !== pdfPath) {
            await supabase.storage.from('chapters').remove([prevPath]).catch(() => undefined);
          }
          fileUpdates.pdf_path = pdfPath;
          fileUpdates.pdf_name = pdfFile.name;
          fileUpdates.raw_text = rawText;
          fileUpdates.status = 'ready';
        }

        if (docFile) {
          setProcessingStep('Uploading source doc…');
          const ext = docFile.name.split('.').pop() || 'docx';
          const docClean = slugify(docFile.name.split('.')[0]) + '.' + ext;
          const docPath = `${basePath}/${docClean}`;
          await supabase.storage.from('chapters').upload(docPath, docFile, { upsert: true });
          const prevDoc = (item as Chapter).doc_path;
          if (prevDoc && prevDoc !== docPath) {
            await supabase.storage.from('chapters').remove([prevDoc]).catch(() => undefined);
          }
          fileUpdates.doc_path = docPath;
          fileUpdates.doc_name = docFile.name;
          fileUpdates.status = 'ready';
        }

        if (Object.keys(fileUpdates).length > 0) {
          const { error: fileErr } = await supabase.from('chapters').update(fileUpdates).eq('id', item.id);
          if (fileErr) throw fileErr;
        }

        setIsProcessing(false);
        setProcessingStep('');

        await fetchData();
      }
    } catch (err: any) {
      alert("Update failed: " + err.message);
    } finally {
      setRenamingItem(null);
      setNewItemName('');
      setNewItemNumber('');
      setBiologyBranchDraft('');
      setPdfFile(null);
      setDocFile(null);
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const refreshChapterInRenameModal = async (chapterId: string) => {
    const { data, error } = await supabase
      .from('chapters')
      .select(
        'id, name, chapter_number, status, pdf_name, pdf_path, doc_name, doc_path, subject_id, subject_name, class_id, class_name, kb_id, kb_name, biology_branch'
      )
      .eq('id', chapterId)
      .single();
    if (error || !data) return;
    setRenamingItem((prev) =>
      prev?.type === 'chapter' && prev.item.id === chapterId ? { ...prev, item: data as Chapter } : prev
    );
    setChapters((prev) =>
      prev.map((c) => (c.id === chapterId ? (data as Chapter) : c)).sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0))
    );
  };

  const removeChapterPdf = async (chapter: Chapter) => {
    if (!chapter.pdf_path) return;
    if (
      !confirm(
        'Remove the PDF from this chapter? Extracted text used for AI will be cleared. You can upload a new PDF afterward.'
      )
    ) {
      return;
    }
    setIsProcessing(true);
    setProcessingStep('Removing PDF…');
    try {
      await supabase.storage.from('chapters').remove([chapter.pdf_path]);
      const nextStatus: Chapter['status'] = chapter.doc_path ? 'ready' : 'draft';
      const { error } = await supabase
        .from('chapters')
        .update({
          pdf_path: null,
          pdf_name: null,
          raw_text: '',
          status: nextStatus,
        })
        .eq('id', chapter.id);
      if (error) throw error;
      await refreshChapterInRenameModal(chapter.id);
    } catch (err: any) {
      alert(err?.message || 'Could not remove PDF');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const removeChapterDoc = async (chapter: Chapter) => {
    if (!chapter.doc_path) return;
    if (!confirm('Remove the source document (DOCX/HTML) from this chapter?')) return;
    setIsProcessing(true);
    setProcessingStep('Removing document…');
    try {
      await supabase.storage.from('chapters').remove([chapter.doc_path]);
      const nextStatus: Chapter['status'] = chapter.pdf_path ? 'ready' : 'draft';
      const { error } = await supabase
        .from('chapters')
        .update({
          doc_path: null,
          doc_name: null,
          status: nextStatus,
        })
        .eq('id', chapter.id);
      if (error) throw error;
      await refreshChapterInRenameModal(chapter.id);
    } catch (err: any) {
      alert(err?.message || 'Could not remove document');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const updateChapterBiologyBranch = async (chapter: Chapter, branch: BiologyBranch | null) => {
    try {
      const { error } = await supabase.from('chapters').update({ biology_branch: branch }).eq('id', chapter.id);
      if (error) throw error;
      setChapters((prev) => prev.map((c) => (c.id === chapter.id ? { ...c, biology_branch: branch } : c)));
    } catch (err: any) {
      alert(err?.message || 'Could not update biology branch');
    }
  };

  const deleteItem = async (type: 'class' | 'subject' | 'chapter', id: string, name: string) => {
    if (!confirm(`Delete ${type} "${name}"? This action cannot be undone.`)) return;
    try {
      const table = type === 'class' ? 'kb_classes' : type === 'subject' ? 'subjects' : 'chapters';
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

  /** Save a storage object to disk (Supabase `chapters` bucket). */
  const downloadChapterBlob = async (storagePath: string, downloadName: string) => {
    try {
      const { data, error } = await supabase.storage.from('chapters').download(storagePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName || storagePath.split('/').pop() || 'chapter-file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Chapter file download', err);
      alert(err?.message || 'Download failed.');
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

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleExportCatalogCsv}
              disabled={subjects.length === 0 && chapters.length === 0}
              title="Download all classes, subjects, and chapters as CSV"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm transition-all hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <iconify-icon icon="mdi:tray-arrow-down" width="16" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <div className="relative group min-w-[160px] flex-1 lg:min-w-[280px] lg:max-w-[360px]">
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
          {selectedSubject ? (
            <>
              <button 
                type="button"
                onClick={() => setActiveModal('chapter')}
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-all hover:border-accent hover:bg-indigo-50/40 group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm transition-all group-hover:text-accent group-hover:shadow-md">
                  <iconify-icon icon="mdi:plus" width="28" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-accent">New chapter</span>
              </button>

              {filteredChapters.map(c => (
                <div 
                  key={c.id} 
                  className={`group relative flex min-h-[220px] flex-col rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-lg ${c.status === 'ready' ? 'border-amber-200/80' : 'border-slate-200 grayscale-[0.35]'}`}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {c.chapter_number !== undefined && c.chapter_number !== null && (
                      <span className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
                        Ch {c.chapter_number.toString().padStart(2, '0')}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.status === 'ready' ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-200/80' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.status === 'ready' ? 'Ready' : 'Draft'}
                    </span>
                    {isBiologySubjectName(c.subject_name) && c.biology_branch && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/80">
                        {c.biology_branch}
                      </span>
                    )}
                  </div>

                  <h3 className="text-[15px] font-bold leading-snug text-slate-900 break-words">
                    {c.name}
                  </h3>

                  <dl className="mt-3 flex flex-1 flex-col gap-1.5 border-t border-slate-100 pt-3 text-[12px] text-slate-600">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 font-semibold text-slate-400">Subject</dt>
                      <dd className="min-w-0 font-medium text-slate-700">{c.subject_name}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 font-semibold text-slate-400">Class</dt>
                      <dd className="min-w-0 font-medium text-slate-700">{c.class_name}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.pdf_path ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-100">
                          <iconify-icon icon="mdi:file-pdf-box" className="text-base" />
                          PDF
                        </span>
                      ) : null}
                      {c.doc_path ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 ring-1 ring-indigo-100">
                          <iconify-icon icon="mdi:file-document-outline" className="text-base" />
                          Source doc
                        </span>
                      ) : null}
                      {!c.pdf_path && !c.doc_path && (
                        <span className="text-[11px] font-medium text-slate-400">No files uploaded</span>
                      )}
                    </div>
                  </dl>

                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-stretch justify-end gap-2 rounded-2xl bg-slate-900/0 p-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:bg-slate-900/90 group-hover:opacity-100 group-hover:backdrop-blur-sm">
                    <div className="mt-auto flex flex-col gap-2">
                    {c.status === 'ready' && c.pdf_path && (
                        <>
                        <button type="button" onClick={() => openPdfViewer(c)} className="w-full rounded-lg bg-white py-2 text-[11px] font-black uppercase tracking-wide text-slate-900 shadow-sm hover:bg-indigo-50 flex items-center justify-center gap-2"><iconify-icon icon="mdi:eye" width="14" /> View PDF</button>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadChapterBlob(c.pdf_path!, c.pdf_name || `${slugify(c.name)}.pdf`)
                          }
                          className="w-full rounded-lg bg-white/90 py-2 text-[11px] font-black uppercase tracking-wide text-slate-900 shadow-sm ring-1 ring-white/30 hover:bg-emerald-50 flex items-center justify-center gap-2"
                        >
                          <iconify-icon icon="mdi:download" width="14" /> Download PDF
                        </button>
                        </>
                    )}
                    {c.status === 'ready' && c.doc_path && (
                        <>
                        <button type="button" onClick={() => openDocViewer(c)} className="w-full rounded-lg bg-white py-2 text-[11px] font-black uppercase tracking-wide text-slate-900 shadow-sm hover:bg-indigo-50 flex items-center justify-center gap-2"><iconify-icon icon="mdi:file-document-outline" width="14" /> View Doc</button>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadChapterBlob(
                              c.doc_path!,
                              c.doc_name || `${slugify(c.name)}.docx`
                            )
                          }
                          className="w-full rounded-lg bg-white/90 py-2 text-[11px] font-black uppercase tracking-wide text-slate-900 shadow-sm ring-1 ring-white/30 hover:bg-emerald-50 flex items-center justify-center gap-2"
                        >
                          <iconify-icon icon="mdi:download" width="14" /> Download Doc
                        </button>
                        </>
                    )}

                    {isBiologySubjectName(c.subject_name) && (
                      <select
                        aria-label="Biology stream: botany or zoology"
                        value={c.biology_branch ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          void updateChapterBiologyBranch(c, v === '' ? null : (v as BiologyBranch));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-lg border border-white/25 bg-white px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-900 outline-none"
                      >
                        <option value="">Bio stream: not set</option>
                        <option value="botany">Botany</option>
                        <option value="zoology">Zoology</option>
                      </select>
                    )}
                    
                    <div className="flex justify-center gap-4 pt-1">
                      <button type="button" onClick={() => setRenamingItem({ type: 'chapter', item: c })} className="text-white/70 hover:text-white transition-colors" title="Edit"><iconify-icon icon="mdi:pencil" width="18" /></button>
                      <button type="button" onClick={() => deleteItem('chapter', c.id, c.name)} className="text-white/70 hover:text-rose-400 transition-colors" title="Delete"><iconify-icon icon="mdi:trash-can-outline" width="18" /></button>
                    </div>
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
        <div
          className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setActiveModal(null);
            setRenamingItem(null);
            setPdfFile(null);
            setDocFile(null);
          }}
        >
          <div
            className={`bg-white w-full ${renamingItem?.type === 'chapter' ? 'max-w-lg' : 'max-w-sm'} rounded-2xl p-6 shadow-2xl animate-slide-up border border-slate-200`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-slate-800 mb-4 uppercase tracking-widest">
              {renamingItem
                ? renamingItem.type === 'chapter'
                  ? 'Edit chapter'
                  : `Edit ${renamingItem.type}`
                : `New ${activeModal}`}
            </h3>
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
              {renamingItem?.type === 'chapter' && (
                <>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Class</label>
                    <select
                      value={editChapterClassId}
                      onChange={(e) => {
                        setEditChapterClassId(e.target.value);
                        setEditChapterSubjectId('');
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-accent font-bold text-sm text-slate-800"
                    >
                      <option value="">Select class…</option>
                      {classes.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Subject</label>
                    <select
                      value={editChapterSubjectId}
                      onChange={(e) => setEditChapterSubjectId(e.target.value)}
                      disabled={!editChapterClassId || editChapterSubjectsFiltered.length === 0}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-accent font-bold text-sm text-slate-800 disabled:opacity-50"
                    >
                      <option value="">
                        {!editChapterClassId
                          ? 'Select a class first…'
                          : editChapterSubjectsFiltered.length === 0
                            ? 'No subjects under this class'
                            : 'Select subject…'}
                      </option>
                      {editChapterSubjectsFiltered.map((su) => (
                        <option key={su.id} value={su.id}>
                          {su.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {((activeModal === 'chapter' && selectedSubject && isBiologySubjectName(selectedSubject.name)) ||
                (renamingItem?.type === 'chapter' && isBiologySubjectName(editChapterResolvedSubjectName))) && (
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Biology stream</label>
                  <select
                    value={biologyBranchDraft}
                    onChange={(e) => setBiologyBranchDraft(e.target.value as '' | BiologyBranch)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-accent font-bold text-sm text-slate-800"
                  >
                    <option value="">Not set</option>
                    <option value="botany">Botany</option>
                    <option value="zoology">Zoology</option>
                  </select>
                  <p className="mt-1 text-[8px] font-bold text-slate-400 uppercase tracking-tight">Tag NEET Biology chapters as plant vs animal focus.</p>
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

              {renamingItem?.type === 'chapter' && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                  <input
                    type="file"
                    accept=".pdf"
                    ref={pdfInputRef}
                    className="hidden"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                  <input
                    type="file"
                    accept=".docx,.html"
                    ref={docInputRef}
                    className="hidden"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Source files</p>
                  <p className="text-[8px] font-semibold leading-snug text-slate-500">
                    <span className="font-black text-slate-600">Replace</span> — pick a file below, then Save.{' '}
                    <span className="font-black text-slate-600">Remove</span> — deletes storage immediately (no Save).
                  </p>

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider text-rose-700">PDF (AI context)</span>
                    </div>
                    {(renamingItem.item as Chapter).pdf_path ? (
                      <p className="mb-2 truncate text-[11px] font-medium text-slate-700" title={(renamingItem.item as Chapter).pdf_name}>
                        Current: {(renamingItem.item as Chapter).pdf_name || 'PDF'}
                      </p>
                    ) : (
                      <p className="mb-2 text-[11px] text-slate-500">No PDF uploaded.</p>
                    )}
                    {pdfFile ? (
                      <p className="mb-2 text-[11px] font-bold text-emerald-700">New file: {pdfFile.name}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => pdfInputRef.current?.click()}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm hover:bg-rose-700"
                      >
                        {(renamingItem.item as Chapter).pdf_path ? 'Replace PDF' : 'Upload PDF'}
                      </button>
                      {(renamingItem.item as Chapter).pdf_path ? (
                        <button
                          type="button"
                          onClick={() => void removeChapterPdf(renamingItem.item as Chapter)}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-rose-800 hover:bg-rose-50"
                        >
                          Remove PDF
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700">Source doc</span>
                    </div>
                    {(renamingItem.item as Chapter).doc_path ? (
                      <p className="mb-2 truncate text-[11px] font-medium text-slate-700" title={(renamingItem.item as Chapter).doc_name}>
                        Current: {(renamingItem.item as Chapter).doc_name || 'Document'}
                      </p>
                    ) : (
                      <p className="mb-2 text-[11px] text-slate-500">No DOCX/HTML uploaded.</p>
                    )}
                    {docFile ? (
                      <p className="mb-2 text-[11px] font-bold text-emerald-700">New file: {docFile.name}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm hover:bg-indigo-700"
                      >
                        {(renamingItem.item as Chapter).doc_path ? 'Replace Doc' : 'Upload Doc'}
                      </button>
                      {(renamingItem.item as Chapter).doc_path ? (
                        <button
                          type="button"
                          onClick={() => void removeChapterDoc(renamingItem.item as Chapter)}
                          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-900 hover:bg-indigo-50"
                        >
                          Remove Doc
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

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
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setRenamingItem(null);
                    setPdfFile(null);
                    setDocFile(null);
                  }}
                  className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
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