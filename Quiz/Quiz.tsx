
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
import AuthUI from '../supabase/AuthUI';
import LeftPanel from '../Panel/LeftPanel';
import TestDashboard from '../Teacher/Test/TestDashboard';
import OnlineExamDashboard from '../Teacher/OnlineExam/OnlineExamDashboard';
import OnlineExamScheduler from '../Teacher/OnlineExam/OnlineExamScheduler';
import StudentDirectory from '../Students/StudentDirectory';
import ReportsDashboard from '../Teacher/Reports/ReportsDashboard';
import SettingsView from '../Settings/SettingsView';
import AdminView from '../Admin/AdminView';
import OMRAccuracyTester from './components/OMR/OMRAccuracyTester';
import TestCreatorView from './components/TestCreatorView';
import QuestionListScreen from './components/ResultScreen';
import InteractiveQuizSession from './components/InteractiveQuizSession';
import StudentOnlineTestDashboard from '../Student/OnlineTest/StudentOnlineTestDashboard';
import StudentMockTestDashboard from '../Student/MockTest/StudentMockTestDashboard';
import SolutionViewer from '../Student/OnlineTest/SolutionViewer';
import { BrandingConfig, Question, QuestionType, SelectedChapter, LayoutConfig, TypeDistribution } from './types';
import { generateQuizQuestions, generateCompositeFigures, generateCompositeStyleVariants, ensureApiKey } from '../services/geminiService';

interface School {
  id: string;
  name: string;
  color?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_id: string;
}

interface Folder {
  id: string;
  name: string;
  parent_id?: string | null;
  tests: any[];
}

const Quiz: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [activeView, setActiveView] = useState('test');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const fetchingRef = useRef(false);
  
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allTests, setAllTests] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar' | 'kanban'>('grid');
  const [calendarType, setCalendarType] = useState<'month' | 'week' | 'year'>('month');

  const [brandConfig, setBrandConfig] = useState<BrandingConfig>({
    name: 'KiwiTeach',
    logo: null,
    showOnTest: true,
    showOnOmr: true
  });

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isOnlineExamCreatorOpen, setIsOnlineExamCreatorOpen] = useState(false);
  const [onlineExamResult, setOnlineExamResult] = useState<{ topic: string, questions: Question[], config?: any } | null>(null);

  const [activeStudentExam, setActiveStudentExam] = useState<{ topic: string, questions: Question[] } | null>(null);
  const [activeStudentSolution, setActiveStudentSolution] = useState<{ topic: string, questions: Question[], showAnswers?: boolean } | null>(null);

  const [creatorFolderId, setCreatorFolderId] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [forgeStep, setForgeStep] = useState('');
  const [forgedResult, setForgedResult] = useState<{ topic: string, questions: Question[], layoutConfig?: LayoutConfig } | null>(null);
  
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editInitialChapters, setEditInitialChapters] = useState<SelectedChapter[] | undefined>(undefined);

  useEffect(() => {
    let localSchools = localStorage.getItem('kt_schools');
    let localClasses = localStorage.getItem('kt_classes');
    let localStudents = localStorage.getItem('kt_students');
    let localResults = localStorage.getItem('kt_test_results');

    if (!localSchools || JSON.parse(localSchools).length === 0) {
        const seedSchools: School[] = [
            { id: 'sc-boys', name: 'Zaitoon International Boys', color: 'indigo' },
            { id: 'sc-girls', name: 'Zaitoon International Girls', color: 'rose' },
            { id: 'sc-kannur', name: 'Zaitoon International Kannur', color: 'emerald' }
        ];
        const seedClasses: SchoolClass[] = [
            { id: 'cl-b-10', name: '10th Standard', school_id: 'sc-boys' },
            { id: 'cl-b-11', name: '11th Standard', school_id: 'sc-boys' },
            { id: 'cl-b-12', name: '12th Standard', school_id: 'sc-boys' },
            { id: 'cl-g-10', name: '10th Standard', school_id: 'sc-girls' },
            { id: 'cl-g-11', name: '11th Standard', school_id: 'sc-girls' },
            { id: 'cl-g-12', name: '12th Standard', school_id: 'sc-girls' },
            { id: 'cl-k-10', name: '10th Standard', school_id: 'sc-kannur' },
            { id: 'cl-k-11', name: '11th Standard', school_id: 'sc-kannur' },
            { id: 'cl-k-12', name: '12th Standard', school_id: 'sc-kannur' }
        ];
        const seedStudents = [
            { id: 'st-1', name: 'Ahmad Faisal', email: 'ahmad@zaitoon.com', class_id: 'cl-b-11', attending_exams: ['NEET'] },
            { id: 'st-2', name: 'Omar Khalid', email: 'omar@zaitoon.com', class_id: 'cl-b-12', attending_exams: ['JEE'] },
            { id: 'st-3', name: 'Zaid Mansoor', email: 'zaid@zaitoon.com', class_id: 'cl-b-10', attending_exams: ['Foundation'] }
        ];
        localStorage.setItem('kt_schools', JSON.stringify(seedSchools));
        localStorage.setItem('kt_classes', JSON.stringify(seedClasses));
        localStorage.setItem('kt_students', JSON.stringify(seedStudents));
        setSchools(seedSchools);
        setSchoolClasses(seedClasses);
    } else {
        setSchools(JSON.parse(localSchools));
        setSchoolClasses(JSON.parse(localClasses));
    }
  }, []);

  const refreshOrgData = () => {
    const localSchools = localStorage.getItem('kt_schools');
    const localClasses = localStorage.getItem('kt_classes');
    if (localSchools) setSchools(JSON.parse(localSchools));
    if (localClasses) setSchoolClasses(JSON.parse(localClasses));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchWorkspace(session.user);
      else setIsLoadingWorkspace(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchWorkspace(session.user);
      else { setFolders([]); setAllTests([]); setIsLoadingWorkspace(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchWorkspace = async (currentUser?: any) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
        let user = currentUser || session?.user;
        if (!user) { const { data } = await supabase.auth.getUser(); user = data.user; }
        if (!user) return;
        const [foldersRes, testsRes] = await Promise.all([
            supabase.from('folders').select('*').eq('user_id', user.id).order('created_at'),
            supabase.from('tests').select('id, name, question_count, created_at, scheduled_at, status, folder_id, class_ids, layout_config, config').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100)
        ]);
        const processedTests = (testsRes.data || []).map((t: any) => ({ ...t, questionCount: t.question_count || 0, generatedAt: t.created_at, scheduledAt: t.scheduled_at, layoutConfig: t.layout_config, class_ids: t.class_ids || [] }));
        setAllTests(processedTests);
        const folderMap = new Map();
        (foldersRes.data || []).forEach((f: any) => { folderMap.set(f.id, { ...f, children: [], tests: [] }); });
        processedTests.forEach((t: any) => { if (t.folder_id && folderMap.has(t.folder_id)) { folderMap.get(t.folder_id).tests.push(t); } });
        const rootFolders: Folder[] = [];
        folderMap.forEach(f => { if (f.parent_id && folderMap.has(f.parent_id)) { folderMap.get(f.parent_id).children.push(f); } else rootFolders.push(f); });
        setFolders(rootFolders);
    } finally { setIsLoadingWorkspace(false); fetchingRef.current = false; }
  };

  const handleAddFolder = async (folder: { name: string, parent_id: string | null }) => {
      const { error } = await supabase.from('folders').insert([{ name: folder.name, parent_id: folder.parent_id, user_id: session?.user?.id }]);
      if (!error) fetchWorkspace();
  };

  const handleDeleteItem = async (type: 'folder' | 'test', id: string, name: string) => {
      try { if (type === 'folder') await supabase.from('folders').delete().eq('id', id); else await supabase.from('tests').delete().eq('id', id); await fetchWorkspace(); } catch (err: any) { alert(`Failed to delete ${type}: ${err.message}`); }
  };

  const handleDuplicateTest = async (test: any) => {
      setIsLoadingTest(true);
      try {
          const { data: { user } } = await supabase.auth.getUser();
          let sourceQuestions = test.questions;
          if (!sourceQuestions) { const { data, error } = await supabase.from('tests').select('questions').eq('id', test.id).single(); if (error) throw error; sourceQuestions = data.questions; }
          let qCount = test.question_count || sourceQuestions?.length || 0;
          await supabase.from('tests').insert({ name: `${test.name} (Copy)`, folder_id: test.folder_id, user_id: user?.id, questions: sourceQuestions || [], question_ids: test.question_ids || [], config: test.config || {}, layout_config: test.layout_config || {}, question_count: qCount, status: 'draft', scheduled_at: null, class_ids: [] });
          await fetchWorkspace();
      } catch (e: any) { alert("Duplicate failed: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleRenameTest = async (testId: string, newName: string) => { try { await supabase.from('tests').update({ name: newName }).eq('id', testId); await fetchWorkspace(); } catch (err: any) { alert("Rename failed: " + err.message); } };

  const handleScheduleTest = async (testId: string, dateStr: string | null) => {
      try { const updates = dateStr ? { scheduled_at: new Date(dateStr).toISOString(), status: 'scheduled' } : { scheduled_at: null, status: 'generated' }; await supabase.from('tests').update(updates).eq('id', testId); await fetchWorkspace(); } catch (e) { console.error("Scheduling Error:", e); }
  };

  const handleAssignClasses = async (testId: string, classIds: string[]) => { try { await supabase.from('tests').update({ class_ids: classIds }).eq('id', testId); await fetchWorkspace(); } catch (e) { console.error("Assign Error:", e); } };

  const handleStartTestCreator = (folderId: string | null) => { setEditInitialChapters(undefined); setEditingTestId(null); setCreatorFolderId(folderId); setIsCreatorOpen(true); };
  const handleStartOnlineExamCreator = (folderId: string | null) => { setEditInitialChapters(undefined); setEditingTestId(null); setCreatorFolderId(folderId); setIsOnlineExamCreatorOpen(true); };

  const handleEditBlueprint = (questions: Question[]) => {
      const chaptersMap = new Map<string, SelectedChapter>();
      questions.forEach(q => {
          if (!q.sourceChapterId) return;
          if (chaptersMap.has(q.sourceChapterId)) { chaptersMap.get(q.sourceChapterId)!.count += 1; } else {
              chaptersMap.set(q.sourceChapterId, { id: q.sourceChapterId, name: q.sourceChapterName || 'Unknown Chapter', subjectName: q.sourceSubjectName || 'Unknown Subject', className: 'Unknown', count: 1, figureCount: 0, difficulty: 'Global', source: 'db', styleCounts: { mcq: 1 }, selectionMode: 'count' });
          }
      });
      setEditInitialChapters(Array.from(chaptersMap.values()));
      setIsCreatorOpen(true);
  };

  const processUploadContent = (content: string) => {
      const images: { data: string; mimeType: string }[] = [];
      let text = content;
      const imgRegex = /<img[^>]+src=["'](data:image\/([^;]+);base64,\s*([^"']+))["'][^>]*>/gi;
      let count = 0;
      text = text.replace(imgRegex, (match, fullSrc, mimeType, base64Data) => { if (count < 20) { images.push({ data: base64Data.trim(), mimeType }); count++; return ` [FIGURE_REFERENCE_${count}] `; } return ''; });
      return { text, images };
  };

  const generateQuestionsLogic = async (options: any, setStatus: (s: string) => void) => {
      await ensureApiKey();
      let finalQuestions: Question[] = [];
      const existingQuestions = (options.mode === 'online-exam' ? onlineExamResult?.questions : forgedResult?.questions) || [];
      
      for (const chap of options.chapters) {
          const targetCount = chap.count || 0;
          if (targetCount === 0) continue;
          const existingForChap = existingQuestions.filter(q => q.sourceChapterId === chap.id);
          
          if (existingForChap.length > 0 && existingForChap.length >= targetCount) {
              finalQuestions = [...finalQuestions, ...existingForChap.slice(0, targetCount)];
          } else {
              finalQuestions = [...finalQuestions, ...existingForChap];
              const additionalNeeded = targetCount - existingForChap.length;
              setStatus(`Forging ${additionalNeeded} new questions for ${chap.name}...`);
              let newBatch: Question[] = [];
              
              if (chap.source === 'ai' || chap.source === 'upload') {
                  let diffConfig = options.useGlobalDifficulty ? options.globalDifficultyMix : chap.difficulty;
                  if (diffConfig === 'Global') diffConfig = options.globalDifficultyMix;
                  
                  let sourceContext = undefined;
                  if (chap.content) { const processed = processUploadContent(chap.content); sourceContext = { text: processed.text, images: processed.images }; } 
                  else if (chap.id) { const { data: chData } = await supabase.from('chapters').select('raw_text').eq('id', chap.id).maybeSingle(); if (chData?.raw_text) sourceContext = { text: chData.raw_text }; }

                  const typeMix: TypeDistribution = options.globalTypeMix || { mcq: 100, reasoning: 0, matching: 0, statements: 0 };
                  const typeKeys: (keyof TypeDistribution)[] = ['mcq', 'reasoning', 'matching', 'statements'];
                  let figuresGeneratedSoFar = 0;
                  const chapterTotalFigures = chap.figureCount || 0;

                  for (const typeKey of typeKeys) {
                      let percentage = typeMix[typeKey] || 0;
                      if (percentage <= 0) continue;
                      let typeCount = Math.round((percentage / 100) * additionalNeeded);
                      let batchFigureTarget = 0;
                      if (typeKey === 'mcq') {
                          batchFigureTarget = Math.max(0, chapterTotalFigures - figuresGeneratedSoFar);
                          if (batchFigureTarget > 0) batchFigureTarget = Math.ceil(batchFigureTarget / 6) * 6;
                          typeCount = Math.max(typeCount, batchFigureTarget);
                      }
                      if (typeCount <= 0) continue;
                      setStatus(`Forging ${typeCount} ${typeKey.toUpperCase()}...`);
                      const apiType = typeKey; 
                      const generated = await generateQuizQuestions(chap.name, diffConfig, typeCount, sourceContext, apiType as any, (s) => setStatus(s), batchFigureTarget, options.useSmiles);

                      if (batchFigureTarget > 0) {
                          setStatus(`Synthesizing diagrams...`);
                          const figureQs = generated.filter(q => q.figurePrompt);
                          if (figureQs.length > 0 && sourceContext?.images && sourceContext.images.length > 0) {
                              for (let i = 0; i < figureQs.length; i += 6) {
                                  const batch = figureQs.slice(i, i + 6);
                                  let batchImageIndex = batch[0].sourceImageIndex;
                                  if (batchImageIndex === undefined || batchImageIndex < 0 || batchImageIndex >= sourceContext.images.length) {
                                      const batchNum = Math.floor(i / 6);
                                      batchImageIndex = batchNum % sourceContext.images.length;
                                  }
                                  batch.forEach(q => { q.sourceImageIndex = batchImageIndex; });
                              }
                          }
                          const sourceEditGroups: Record<number, Question[]> = {};
                          const textGenCandidates: Question[] = [];
                          generated.forEach(q => {
                              if (q.figurePrompt) {
                                  if (q.sourceImageIndex !== undefined && q.sourceImageIndex !== -1) {
                                      if (!sourceEditGroups[q.sourceImageIndex]) sourceEditGroups[q.sourceImageIndex] = [];
                                      sourceEditGroups[q.sourceImageIndex].push(q);
                                  } else { textGenCandidates.push(q); }
                              }
                          });
                          for (const [imgIdx, groupQs] of Object.entries(sourceEditGroups)) {
                              const idx = parseInt(imgIdx);
                              const sourceImg = sourceContext?.images?.[idx];
                              if (!sourceImg) continue;
                              for (let i = 0; i < groupQs.length; i += 6) {
                                  const chunk = groupQs.slice(i, i + 6);
                                  const prompts = chunk.map(q => q.figurePrompt!);
                                  setStatus(`Editing batch for Image #${idx}...`);
                                  const images = await generateCompositeStyleVariants(sourceImg.data, prompts);
                                  chunk.forEach((q, cIdx) => { if (images[cIdx]) { q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; figuresGeneratedSoFar++; } });
                              }
                          }
                          for (let i = 0; i < textGenCandidates.length; i += 6) {
                              const chunk = textGenCandidates.slice(i, i + 6);
                              const prompts = chunk.map(q => q.figurePrompt!);
                              setStatus(`Generating diagram batch...`);
                              const images = await generateCompositeFigures(prompts);
                              chunk.forEach((q, cIdx) => { if (images[cIdx]) { q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; figuresGeneratedSoFar++; } });
                          }
                      }
                      newBatch = [...newBatch, ...generated];
                  }
                  if (newBatch.length === 0 && additionalNeeded > 0) { newBatch = await generateQuizQuestions(chap.name, diffConfig, additionalNeeded, sourceContext, 'mcq', (s) => setStatus(s), chapterTotalFigures, options.useSmiles); }
              } else {
                  const currentIds = finalQuestions.map(q => q.originalId || q.id).filter(id => !!id);
                  let query = supabase.from('question_bank_neet').select('*').eq('chapter_id', chap.id);
                  if (currentIds.length > 0) query = query.not('id', 'in', `(${currentIds.join(',')})`);
                  const { data: dbData } = await query.limit(additionalNeeded);
                  if (dbData) {
                      newBatch = dbData.map(bq => ({ 
                          id: bq.id, originalId: bq.id, text: bq.question_text, type: bq.question_type, difficulty: bq.difficulty, options: bq.options, 
                          correctIndex: bq.correct_index, explanation: bq.explanation, figureDataUrl: bq.figure_url, columnA: bq.column_a, 
                          columnB: bq.column_b, correctMatches: bq.correct_matches, sourceChapterId: bq.chapter_id, sourceSubjectName: bq.subject_name,
                          sourceChapterName: bq.chapter_name || chap.name, pageNumber: bq.page_number
                      }));
                  }
              }
              const enrichedBatch = newBatch.map(q => ({ ...q, sourceChapterId: q.sourceChapterId || chap.id, sourceChapterName: q.sourceChapterName || chap.name, sourceSubjectName: q.sourceSubjectName || chap.subjectName }));
              if (enrichedBatch.length > additionalNeeded) finalQuestions = [...finalQuestions, ...enrichedBatch.slice(0, additionalNeeded)];
              else finalQuestions = [...finalQuestions, ...enrichedBatch];
          }
      }
      if (finalQuestions.length === 0) throw new Error("No questions generated.");
      return finalQuestions;
  };

  const handleCreateTest = async (options: any) => {
      setIsForging(true); setForgeStep('Initializing Intelligence...');
      try {
          const questions = await generateQuestionsLogic(options, setForgeStep);
          setForgedResult({ topic: options.topic, questions: questions });
          setIsCreatorOpen(false); setEditInitialChapters(undefined);
      } catch (err: any) { alert("Forge Failed: " + err.message); } finally { setIsForging(false); setForgeStep(''); }
  };

  const handleCreateOnlineExam = async (options: any) => {
      setIsForging(true); setForgeStep('Initializing Online Exam Module...');
      try {
          const questions = await generateQuestionsLogic({ ...options, mode: 'online-exam' }, setForgeStep);
          setOnlineExamResult({ topic: options.topic, questions: questions });
          setIsOnlineExamCreatorOpen(false); setEditInitialChapters(undefined);
      } catch (err: any) { alert("Exam Creation Failed: " + err.message); } finally { setIsForging(false); setForgeStep(''); }
  };

  const handleStudentGenerateMock = async (chapterIds: string[], difficulty: string, type: string) => {
      setIsLoadingTest(true);
      try {
          const TOTAL_QUESTIONS = 20; let dbQuestions: Question[] = []; let topicTitle = 'Mock Practice';
          if (chapterIds.length === 1) { const { data } = await supabase.from('chapters').select('name').eq('id', chapterIds[0]).single(); if (data) topicTitle = data.name; } 
          else if (chapterIds.length > 1) topicTitle = `Combined Mock (${chapterIds.length} Chapters)`;
          let query = supabase.from('question_bank_neet').select('*').in('chapter_id', chapterIds).eq('difficulty', difficulty);
          if (type !== 'neet') query = query.eq('question_type', type);
          const { data: dbData } = await query.limit(50);
          if (dbData && dbData.length > 0) { const shuffled = dbData.sort(() => 0.5 - Math.random()).slice(0, TOTAL_QUESTIONS); dbQuestions = shuffled.map((q: any) => ({ id: q.id, type: q.question_type || 'mcq', text: q.question_text, options: q.options, correctIndex: q.correct_index, explanation: q.explanation, difficulty: q.difficulty, figureDataUrl: q.figure_url, columnA: q.column_a, columnB: q.column_b, correctMatches: q.correct_matches, sourceChapterId: q.chapter_id })); }
          if (dbQuestions.length === 0) { alert(`No questions found for the selected criteria in the database.`); setIsLoadingTest(false); return; }
          setActiveStudentExam({ topic: `${topicTitle} (${difficulty})`, questions: dbQuestions });
      } catch (e: any) { alert("Mock Generation Failed: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleSaveTestToSupabase = async (questions: Question[], layoutConfig?: LayoutConfig) => {
      if (!forgedResult) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { name: forgedResult.topic || 'New Test', folder_id: creatorFolderId, user_id: user.id, questions: questions.map(q => JSON.parse(JSON.stringify(q))), question_ids: questions.map(q => q.id || '').filter(id => id !== ''), config: { totalQuestions: questions.length, mode: 'paper' }, layout_config: layoutConfig, status: 'generated', question_count: questions.length, scheduled_at: null, class_ids: [] };
      try { if (editingTestId) await supabase.from('tests').update(payload).eq('id', editingTestId); else await supabase.from('tests').insert([payload]); await fetchWorkspace(); setForgedResult(null); setEditingTestId(null); } catch (error: any) { alert("Failed to save: " + error.message); }
  };

  const handleSaveOnlineExam = async (examData: any) => {
      if (!onlineExamResult) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const questions = examData.questions;
      const payload = { name: examData.title || onlineExamResult.topic || 'New Online Exam', folder_id: creatorFolderId, user_id: user.id, questions: questions.map((q: any) => JSON.parse(JSON.stringify(q))), question_ids: questions.map((q: any) => q.id || '').filter((id: string) => id !== ''), config: { totalQuestions: questions.length, mode: 'online', duration: examData.duration, releaseAnswers: examData.releaseAnswers }, layout_config: {}, status: 'scheduled', question_count: questions.length, scheduled_at: examData.scheduledAt, class_ids: examData.classIds || [] };
      try { if (editingTestId) await supabase.from('tests').update(payload).eq('id', editingTestId); else await supabase.from('tests').insert([payload]); await fetchWorkspace(); setOnlineExamResult(null); setEditingTestId(null); } catch (error: any) { alert("Failed to save exam: " + error.message); }
  };

  const handleTestClick = async (test: any) => {
    setIsLoadingTest(true);
    try {
        let fullQuestions = test.questions;
        if (!fullQuestions) { const { data, error } = await supabase.from('tests').select('questions').eq('id', test.id).single(); if (error) throw error; fullQuestions = data.questions || []; }
        setEditingTestId(test.id);
        if (test.config?.mode === 'online') { setOnlineExamResult({ topic: test.name, questions: fullQuestions, config: { ...test.config, scheduledAt: test.scheduled_at, classIds: test.class_ids } }); setActiveView('online-exam'); } 
        else { setForgedResult({ topic: test.name, questions: fullQuestions, layoutConfig: test.layout_config }); setActiveView('test'); }
    } catch (e) { alert("Failed to load test content."); } finally { setIsLoadingTest(false); }
  };

  const handleStudentTakeExam = async (test: any) => {
      setIsLoadingTest(true);
      try { let fullQuestions = test.questions; if (!fullQuestions) { const { data, error } = await supabase.from('tests').select('questions').eq('id', test.id).single(); if (error) throw error; fullQuestions = data.questions || []; } setActiveStudentExam({ topic: test.name, questions: fullQuestions }); } catch(e) { alert("Could not load exam data."); } finally { setIsLoadingTest(false); }
  };

  const handleViewSolutions = async (test: any) => {
      setIsLoadingTest(true);
      try { let fullQuestions = test.questions; if (!fullQuestions) { const { data, error } = await supabase.from('tests').select('questions').eq('id', test.id).single(); if (error) throw error; fullQuestions = data.questions || []; } setActiveStudentSolution({ topic: test.name, questions: fullQuestions, showAnswers: test.config?.releaseAnswers || false }); } catch (e) { alert("Could not load solutions."); } finally { setIsLoadingTest(false); }
  };

  const handleDemoLogin = () => { const mockSession = { user: { id: '00000000-0000-0000-0000-000000000000', email: 'demo@kiwiteach.com', user_metadata: { full_name: 'Demo Teacher' } } }; setSession(mockSession); fetchWorkspace(mockSession.user); };

  if (isLoadingWorkspace) return <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-slate-400">Loading Workspace...</div>;
  if (!session) return <AuthUI onDemoLogin={handleDemoLogin} />;

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
        {isLoadingTest && <div className="absolute inset-0 z-[100] bg-white/50 backdrop-blur-sm flex items-center justify-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><span className="text-xs font-black uppercase tracking-widest text-indigo-900">Loading Content...</span></div></div>}
        <LeftPanel activeView={activeView} setActiveView={setActiveView} isOpen={true} onClose={() => {}} brandConfig={brandConfig} />
        <main className="flex-1 h-full overflow-y-auto relative custom-scrollbar">
            {activeView === 'test' && !forgedResult && (
                <TestDashboard username={session.user.email} schoolsList={schools} classesList={schoolClasses} folders={folders} allTests={allTests.filter(t => t.config?.mode !== 'online')} title="Paper Tests" onAddFolder={handleAddFolder} onStartNewTest={handleStartTestCreator} onTestClick={handleTestClick} onDeleteItem={handleDeleteItem} onDuplicateTest={handleDuplicateTest} onRenameTest={handleRenameTest} onScheduleTest={handleScheduleTest} onAssignClasses={handleAssignClasses} viewMode={viewMode} setViewMode={setViewMode} calendarType={calendarType} setCalendarType={setCalendarType} />
            )}
            {activeView === 'online-exam' && !onlineExamResult && (
                <OnlineExamDashboard username={session.user.email} schoolsList={schools} classesList={schoolClasses} folders={folders} allTests={allTests} onAddFolder={handleAddFolder} onStartNewExam={handleStartOnlineExamCreator} onTestClick={handleTestClick} onDeleteItem={handleDeleteItem} onDuplicateTest={handleDuplicateTest} onRenameTest={handleRenameTest} onScheduleTest={handleScheduleTest} onAssignClasses={handleAssignClasses} viewMode={viewMode} setViewMode={setViewMode} calendarType={calendarType} setCalendarType={setCalendarType} />
            )}
            {activeView === 'student-online-test' && !activeStudentExam && !activeStudentSolution && ( <StudentOnlineTestDashboard availableTests={allTests.filter(t => t.config?.mode === 'online' && t.status === 'scheduled')} onTakeExam={handleStudentTakeExam} onViewSolutions={handleViewSolutions} /> )}
            {activeView === 'student-mock-test' && !activeStudentExam && ( <StudentMockTestDashboard onStartMock={handleStudentGenerateMock} isLoading={isLoadingTest} /> )}
            {activeView === 'students' && <StudentDirectory schoolsList={schools} classesList={schoolClasses} />}
            {activeView === 'reports' && <ReportsDashboard schoolsList={schools} classesList={schoolClasses} />}
            {activeView === 'settings' && <SettingsView brandConfig={brandConfig} onUpdateBranding={setBrandConfig} onSignOut={() => supabase.auth.signOut()} schools={schools} schoolClasses={schoolClasses} onRefresh={refreshOrgData} />}
            {activeView === 'admin' && <AdminView />}
            {activeView === 'omr-lab' && <OMRAccuracyTester />}
            {forgedResult && ( <div className="absolute inset-0 z-40 bg-white"> <QuestionListScreen topic={forgedResult.topic} questions={forgedResult.questions} initialLayoutConfig={forgedResult.layoutConfig} onRestart={() => { setForgedResult(null); setEditingTestId(null); }} onSave={handleSaveTestToSupabase} onEditBlueprint={handleEditBlueprint} brandConfig={brandConfig} /> </div> )}
            {onlineExamResult && ( <div className="absolute inset-0 z-40 bg-white"> <OnlineExamScheduler topic={onlineExamResult.topic} questions={onlineExamResult.questions} initialConfig={onlineExamResult.config} onBack={() => { setOnlineExamResult(null); setEditingTestId(null); }} onSave={handleSaveOnlineExam} schoolsList={schools} classesList={schoolClasses} /> </div> )}
            {activeStudentExam && ( <div className="absolute inset-0 z-50 bg-white"> <InteractiveQuizSession questions={activeStudentExam.questions} topic={activeStudentExam.topic} onExit={() => setActiveStudentExam(null)} /> </div> )}
            {activeStudentSolution && ( <div className="absolute inset-0 z-50 bg-white"> <SolutionViewer topic={activeStudentSolution.topic} questions={activeStudentSolution.questions} onClose={() => setActiveStudentSolution(null)} showAnswers={activeStudentSolution.showAnswers} /> </div> )}
        </main>
        {isCreatorOpen && <div className="fixed inset-0 z-50 bg-white"> <TestCreatorView onClose={() => setIsCreatorOpen(false)} onStart={handleCreateTest} isLoading={isForging} loadingStep={forgeStep} initialChapters={editInitialChapters} initialTopic={forgedResult?.topic} /> </div>}
        {isOnlineExamCreatorOpen && <div className="fixed inset-0 z-50 bg-white"> <TestCreatorView onClose={() => setIsOnlineExamCreatorOpen(false)} onStart={handleCreateOnlineExam} isLoading={isForging} loadingStep={forgeStep} initialChapters={editInitialChapters} initialTopic={onlineExamResult?.topic} /> </div>}
    </div>
  );
};

export default Quiz;
