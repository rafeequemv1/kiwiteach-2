
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
import AuthUI from '../supabase/AuthUI';
import LeftPanel from '../Panel/LeftPanel';
import TestDashboard from '../Teacher/Test/TestDashboard';
import StudentDirectory from '../Students/StudentDirectory';
import SettingsView from '../Settings/SettingsView';
import AdminView from '../Admin/AdminView';
import OMRAccuracyTester from './components/OMR/OMRAccuracyTester';
import TestCreatorView from './components/TestCreatorView';
import QuestionListScreen from './components/ResultScreen';
import { BrandingConfig, Question, QuestionType, SelectedChapter, LayoutConfig, TypeDistribution } from './types';
import { generateQuizQuestions, generateCompositeFigures, generateCompositeStyleVariants, ensureApiKey } from '../services/geminiService';

interface School {
  id: string;
  name: string;
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
  tests: any[];
}

const Quiz: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [activeView, setActiveView] = useState('test');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTest, setIsLoadingTest] = useState(false); // New state for lazy loading
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
  const [creatorFolderId, setCreatorFolderId] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [forgeStep, setForgeStep] = useState('');
  // forgedResult now tracks layout configuration too
  const [forgedResult, setForgedResult] = useState<{ topic: string, questions: Question[], layoutConfig?: LayoutConfig } | null>(null);
  
  // Track the ID of the test being edited to perform updates instead of inserts
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editInitialChapters, setEditInitialChapters] = useState<SelectedChapter[] | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchWorkspace(session.user);
      else setIsLoadingWorkspace(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchWorkspace(session.user);
      else {
          setSchools([]); setSchoolClasses([]); setFolders([]); setAllTests([]);
          setIsLoadingWorkspace(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchWorkspace = async (currentUser?: any) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
        let user = currentUser || session?.user;
        if (!user) {
            const { data } = await supabase.auth.getUser();
            user = data.user;
        }
        if (!user) return;

        // OPTIMIZATION: Do NOT fetch 'questions' or 'question_ids' (huge blobs) for the dashboard list.
        // Only fetch metadata.
        const [schoolsRes, classesRes, foldersRes, testsRes] = await Promise.all([
            supabase.from('schools').select('*').eq('user_id', user.id).order('name'),
            supabase.from('school_classes').select('*').eq('user_id', user.id).order('name'),
            supabase.from('folders').select('*').eq('user_id', user.id).order('created_at'),
            supabase.from('tests')
                .select('id, name, question_count, created_at, scheduled_at, status, folder_id, class_ids, layout_config') 
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50)
        ]);
        
        setSchools(schoolsRes.data || []);
        setSchoolClasses(classesRes.data || []);
        
        const processedTests = (testsRes.data || []).map((t: any) => ({
            ...t, 
            questionCount: t.question_count || 0,
            generatedAt: t.created_at,
            scheduledAt: t.scheduled_at,
            layoutConfig: t.layout_config // Load saved layout config
        }));
        setAllTests(processedTests);

        const folderMap = new Map();
        (foldersRes.data || []).forEach((f: any) => {
            folderMap.set(f.id, { ...f, children: [], tests: [] });
        });

        processedTests.forEach((t: any) => {
            if (t.folder_id && folderMap.has(t.folder_id)) {
                folderMap.get(t.folder_id).tests.push(t);
            }
        });

        const rootFolders: Folder[] = [];
        folderMap.forEach(f => {
            if (f.parent_id && folderMap.has(f.parent_id)) {
                folderMap.get(f.parent_id).children.push(f);
            } else rootFolders.push(f);
        });
        setFolders(rootFolders);
        
    } finally {
        setIsLoadingWorkspace(false);
        fetchingRef.current = false;
    }
  };

  const handleAddFolder = async (folder: { name: string, parent_id: string | null }) => {
      const { error } = await supabase.from('folders').insert([{
          name: folder.name,
          parent_id: folder.parent_id,
          user_id: session?.user?.id
      }]);
      if (!error) fetchWorkspace();
  };

  const handleDeleteItem = async (type: 'folder' | 'test', id: string, name: string) => {
      try {
          if (type === 'folder') await supabase.from('folders').delete().eq('id', id);
          else await supabase.from('tests').delete().eq('id', id);
          await fetchWorkspace();
      } catch (err: any) {
          alert(`Failed to delete ${type}: ${err.message}`);
      }
  };

  const handleDuplicateTest = async (test: any) => {
      setIsLoadingTest(true);
      try {
          const { data: { user } } = await supabase.auth.getUser();
          
          // Lazy fetch questions if missing
          let sourceQuestions = test.questions;
          if (!sourceQuestions) {
              const { data, error } = await supabase.from('tests').select('questions').eq('id', test.id).single();
              if (error) throw error;
              sourceQuestions = data.questions;
          }

          let qCount = test.question_count || sourceQuestions?.length || 0;
          
          await supabase.from('tests').insert({
              name: `${test.name} (Copy)`,
              folder_id: test.folder_id,
              user_id: user?.id,
              questions: sourceQuestions || [],
              question_ids: test.question_ids || [],
              config: test.config || {},
              layout_config: test.layout_config || {}, // Duplicate layout config
              question_count: qCount,
              status: 'draft',
              scheduled_at: null,
              class_ids: []
          });
          await fetchWorkspace();
      } catch (e: any) { 
          alert("Duplicate failed: " + e.message); 
      } finally {
          setIsLoadingTest(false);
      }
  };

  const handleRenameTest = async (testId: string, newName: string) => {
    try {
      await supabase.from('tests').update({ name: newName }).eq('id', testId);
      await fetchWorkspace();
    } catch (err: any) { alert("Rename failed: " + err.message); }
  };

  const handleScheduleTest = async (testId: string, dateStr: string | null) => {
      try {
          const updates = dateStr 
            ? { scheduled_at: new Date(dateStr).toISOString(), status: 'scheduled' }
            : { scheduled_at: null, status: 'generated' };
          await supabase.from('tests').update(updates).eq('id', testId);
          await fetchWorkspace();
      } catch (e) { console.error("Scheduling Error:", e); }
  };

  const handleAssignClasses = async (testId: string, classIds: string[]) => {
      try {
          await supabase.from('tests').update({ class_ids: classIds }).eq('id', testId);
          await fetchWorkspace();
      } catch (e) { console.error("Assign Error:", e); }
  };

  const handleStartTestCreator = (folderId: string | null) => {
      setEditInitialChapters(undefined);
      setEditingTestId(null);
      setCreatorFolderId(folderId);
      setIsCreatorOpen(true);
  };

  const handleEditBlueprint = (questions: Question[]) => {
      const chaptersMap = new Map<string, SelectedChapter>();
      questions.forEach(q => {
          if (!q.sourceChapterId) return;
          if (chaptersMap.has(q.sourceChapterId)) {
              const existing = chaptersMap.get(q.sourceChapterId)!;
              existing.count += 1;
          } else {
              chaptersMap.set(q.sourceChapterId, {
                  id: q.sourceChapterId,
                  name: q.sourceChapterName || 'Unknown Chapter',
                  subjectName: q.sourceSubjectName || 'Unknown Subject',
                  className: 'Unknown', 
                  count: 1,
                  figureCount: 0,
                  difficulty: 'Global',
                  source: 'db' 
              });
          }
      });
      setEditInitialChapters(Array.from(chaptersMap.values()));
      setIsCreatorOpen(true);
  };

  // --- Helper to extract images from HTML content ---
  const processUploadContent = (content: string) => {
      const images: { data: string; mimeType: string }[] = [];
      let text = content;
      
      // Strict Regex: Matches <img src="data:image/...;base64,..." />
      // Added support for whitespace around comma and different quotes
      const imgRegex = /<img[^>]+src=["'](data:image\/([^;]+);base64,\s*([^"']+))["'][^>]*>/gi;
      
      // We limit extracted images to prevent payload issues, usually first 20 are enough for context
      let count = 0;
      text = text.replace(imgRegex, (match, fullSrc, mimeType, base64Data) => {
          if (count < 20) {
              images.push({ data: base64Data.trim(), mimeType });
              count++;
              return ` [FIGURE_REFERENCE_${count}] `; // Replace image with text marker
          }
          return ''; // Remove excess images to clean up text
      });
      
      return { text, images };
  };

  const handleCreateTest = async (options: any) => {
      setIsForging(true);
      setForgeStep('Initializing Intelligence...');
      try {
          await ensureApiKey();
          let finalQuestions: Question[] = [];

          const existingQuestions = forgedResult?.questions || [];
          
          for (const chap of options.chapters) {
              const targetCount = chap.count || 0;
              if (targetCount === 0) continue;
              
              const existingForChap = existingQuestions.filter(q => q.sourceChapterId === chap.id);
              
              if (existingForChap.length > 0 && existingForChap.length >= targetCount) {
                  finalQuestions = [...finalQuestions, ...existingForChap.slice(0, targetCount)];
              } else {
                  finalQuestions = [...finalQuestions, ...existingForChap];
                  const additionalNeeded = targetCount - existingForChap.length;
                  
                  setForgeStep(`Forging ${additionalNeeded} new questions for ${chap.name}...`);
                  
                  let newBatch: Question[] = [];
                  
                  if (chap.source === 'ai' || chap.source === 'upload') {
                      let diffConfig = options.useGlobalDifficulty ? options.globalDifficultyMix : chap.difficulty;
                      if (diffConfig === 'Global') diffConfig = options.globalDifficultyMix;
                      
                      let sourceContext = undefined;
                      // Prioritize file content if available
                      if (chap.content) {
                          // Extract images if HTML
                          const processed = processUploadContent(chap.content);
                          sourceContext = { text: processed.text, images: processed.images };
                      } else if (chap.id) {
                          const { data: chData } = await supabase.from('chapters').select('raw_text').eq('id', chap.id).maybeSingle();
                          if (chData?.raw_text) sourceContext = { text: chData.raw_text };
                      }

                      // Distribution Logic
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
                              // ENFORCE 6-FIGURE INCREMENTS
                              if (batchFigureTarget > 0) {
                                  batchFigureTarget = Math.ceil(batchFigureTarget / 6) * 6;
                              }
                              // Adjust typeCount to ensure we have enough slots for the figures
                              typeCount = Math.max(typeCount, batchFigureTarget);
                          }
                          
                          if (typeCount <= 0) continue;

                          setForgeStep(`Forging ${typeCount} ${typeKey.toUpperCase()}...`);
                          const apiType = typeKey; 

                          const generated = await generateQuizQuestions(
                              chap.name, 
                              diffConfig, 
                              typeCount, 
                              sourceContext, 
                              apiType as any, 
                              (s) => setForgeStep(s), 
                              batchFigureTarget, 
                              options.useSmiles
                          );

                          // --- FIGURE GENERATION STRATEGY ---
                          if (batchFigureTarget > 0) {
                              setForgeStep(`Synthesizing diagrams...`);
                              
                              // BATCH ALIGNMENT: 
                              // Enforce 6-question batches to share the same source image index
                              const figureQs = generated.filter(q => q.figurePrompt);
                              if (figureQs.length > 0 && sourceContext?.images && sourceContext.images.length > 0) {
                                  for (let i = 0; i < figureQs.length; i += 6) {
                                      const batch = figureQs.slice(i, i + 6);
                                      // Default to 0 or round-robin if undefined
                                      let batchImageIndex = batch[0].sourceImageIndex;
                                      if (batchImageIndex === undefined || batchImageIndex < 0 || batchImageIndex >= sourceContext.images.length) {
                                          const batchNum = Math.floor(i / 6);
                                          batchImageIndex = batchNum % sourceContext.images.length;
                                      }
                                      // Force same index for the whole batch
                                      batch.forEach(q => { q.sourceImageIndex = batchImageIndex; });
                                  }
                              }
                              
                              // Split questions into two buckets:
                              // 1. Questions that reference a source image (EDIT MODE) - Grouped by Source Image
                              // 2. Questions that just have a text description (BATCH GRID MODE)
                              
                              const sourceEditGroups: Record<number, Question[]> = {};
                              const textGenCandidates: Question[] = [];

                              generated.forEach(q => {
                                  if (q.figurePrompt) {
                                      if (q.sourceImageIndex !== undefined && q.sourceImageIndex !== -1) {
                                          if (!sourceEditGroups[q.sourceImageIndex]) sourceEditGroups[q.sourceImageIndex] = [];
                                          sourceEditGroups[q.sourceImageIndex].push(q);
                                      } else {
                                          textGenCandidates.push(q);
                                      }
                                  }
                              });

                              // 1. Process Edit Candidates in Batches of 6 (Image-to-Image Grid)
                              for (const [imgIdx, groupQs] of Object.entries(sourceEditGroups)) {
                                  const idx = parseInt(imgIdx);
                                  const sourceImg = sourceContext?.images?.[idx];
                                  if (!sourceImg) continue;

                                  // Process in chunks of 6
                                  for (let i = 0; i < groupQs.length; i += 6) {
                                      const chunk = groupQs.slice(i, i + 6);
                                      const prompts = chunk.map(q => q.figurePrompt!);
                                      setForgeStep(`Editing batch for Image #${idx}...`);
                                      
                                      // Call composite generator with source image
                                      const images = await generateCompositeStyleVariants(sourceImg.data, prompts);
                                      chunk.forEach((q, cIdx) => {
                                          if (images[cIdx]) {
                                              q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`;
                                              figuresGeneratedSoFar++;
                                          }
                                      });
                                  }
                              }

                              // 2. Process Text Candidates in Batches of 6 (Composite Grid)
                              for (let i = 0; i < textGenCandidates.length; i += 6) {
                                  const chunk = textGenCandidates.slice(i, i + 6);
                                  const prompts = chunk.map(q => q.figurePrompt!);
                                  setForgeStep(`Generating diagram batch...`);
                                  
                                  const images = await generateCompositeFigures(prompts);
                                  chunk.forEach((q, cIdx) => {
                                      if (images[cIdx]) {
                                          q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`;
                                          figuresGeneratedSoFar++;
                                      }
                                  });
                              }
                          }
                          newBatch = [...newBatch, ...generated];
                      }
                      
                      if (newBatch.length === 0 && additionalNeeded > 0) {
                           newBatch = await generateQuizQuestions(chap.name, diffConfig, additionalNeeded, sourceContext, 'mcq', (s) => setForgeStep(s), chapterTotalFigures, options.useSmiles);
                      }

                  } else {
                      // Database fetch (unchanged)
                      const currentIds = finalQuestions.map(q => q.originalId || q.id).filter(id => !!id);
                      let query = supabase.from('question_bank_neet').select('*').eq('chapter_id', chap.id);
                      if (currentIds.length > 0) query = query.not('id', 'in', `(${currentIds.join(',')})`);
                      const { data: dbData } = await query.limit(additionalNeeded);

                      if (dbData) {
                          newBatch = dbData.map(bq => ({ 
                              id: bq.id, 
                              originalId: bq.id, 
                              text: bq.question_text, 
                              type: bq.question_type, 
                              difficulty: bq.difficulty, 
                              options: bq.options, 
                              correctIndex: bq.correct_index, 
                              explanation: bq.explanation, 
                              figureDataUrl: bq.figure_url, 
                              columnA: bq.column_a, 
                              columnB: bq.column_b, 
                              correctMatches: bq.correct_matches,
                              sourceChapterId: bq.chapter_id,
                              sourceSubjectName: bq.subject_name,
                              sourceChapterName: bq.chapter_name || chap.name,
                              pageNumber: bq.page_number
                          }));
                      }
                  }

                  const enrichedBatch = newBatch.map(q => ({
                      ...q,
                      sourceChapterId: q.sourceChapterId || chap.id,
                      sourceChapterName: q.sourceChapterName || chap.name,
                      sourceSubjectName: q.sourceSubjectName || chap.subjectName
                  }));
                  
                  if (enrichedBatch.length > additionalNeeded) {
                      finalQuestions = [...finalQuestions, ...enrichedBatch.slice(0, additionalNeeded)];
                  } else {
                      finalQuestions = [...finalQuestions, ...enrichedBatch];
                  }
              }
          }
          
          if (finalQuestions.length === 0) throw new Error("No questions generated.");
          setForgedResult({ topic: options.topic, questions: finalQuestions });
          setIsCreatorOpen(false);
          setEditInitialChapters(undefined);
      } catch (err: any) { alert("Forge Failed: " + err.message); } finally { setIsForging(false); setForgeStep(''); }
  };

  const handleSaveTestToSupabase = async (questions: Question[], layoutConfig: LayoutConfig) => {
      if (!forgedResult) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const payload = {
          name: forgedResult.topic || 'New Test',
          folder_id: creatorFolderId,
          user_id: user.id,
          questions: questions.map(q => JSON.parse(JSON.stringify(q))),
          question_ids: questions.map(q => q.id || '').filter(id => id !== ''),
          config: { totalQuestions: questions.length },
          layout_config: layoutConfig, 
          status: 'generated',
          question_count: questions.length,
          scheduled_at: null,
          class_ids: []
      };

      try {
          if (editingTestId) {
              await supabase.from('tests').update(payload).eq('id', editingTestId);
          } else {
              await supabase.from('tests').insert([payload]);
          }
          await fetchWorkspace(); 
          setForgedResult(null); 
          setEditingTestId(null);
      } catch (error: any) { alert("Failed to save: " + error.message); }
  };

  const handleTestClick = async (test: any) => {
    setIsLoadingTest(true);
    try {
        let fullQuestions = test.questions;
        
        // Lazy load heavy questions data if not present in the list view
        if (!fullQuestions) {
            const { data, error } = await supabase
                .from('tests')
                .select('questions')
                .eq('id', test.id)
                .single();
            
            if (error) throw error;
            fullQuestions = data.questions || [];
        }

        setEditingTestId(test.id);
        setForgedResult({ 
            topic: test.name, 
            questions: fullQuestions, 
            layoutConfig: test.layout_config 
        });
    } catch (e) {
        console.error("Error opening test:", e);
        alert("Failed to load test content. Please try again.");
    } finally {
        setIsLoadingTest(false);
    }
  };

  if (isLoadingWorkspace) return <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-slate-400">Loading Workspace...</div>;
  if (!session) return <AuthUI />;

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
        {isLoadingTest && (
            <div className="absolute inset-0 z-[100] bg-white/50 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span className="text-xs font-black uppercase tracking-widest text-indigo-900">Loading Assessment...</span>
                </div>
            </div>
        )}
        <LeftPanel activeView={activeView} setActiveView={setActiveView} isOpen={true} onClose={() => {}} brandConfig={brandConfig} />
        <main className="flex-1 h-full overflow-y-auto relative custom-scrollbar">
            {activeView === 'test' && !forgedResult && (
                <TestDashboard 
                    username={session.user.email} schoolsList={schools} classesList={schoolClasses} folders={folders} allTests={allTests}
                    onAddFolder={handleAddFolder} onStartNewTest={handleStartTestCreator} onTestClick={handleTestClick}
                    onDeleteItem={handleDeleteItem} onDuplicateTest={handleDuplicateTest} onRenameTest={handleRenameTest} onScheduleTest={handleScheduleTest} onAssignClasses={handleAssignClasses}
                    viewMode={viewMode} setViewMode={setViewMode} calendarType={calendarType} setCalendarType={setCalendarType}
                />
            )}
            {activeView === 'students' && <StudentDirectory />}
            {activeView === 'settings' && <SettingsView brandConfig={brandConfig} onUpdateBranding={setBrandConfig} onSignOut={() => supabase.auth.signOut()} />}
            {activeView === 'admin' && <AdminView schools={schools} schoolClasses={schoolClasses} onRefresh={() => fetchWorkspace(session.user)} />}
            {activeView === 'omr-lab' && <OMRAccuracyTester />}
            {forgedResult && (
                <div className="absolute inset-0 z-40 bg-white">
                    <QuestionListScreen 
                        topic={forgedResult.topic} 
                        questions={forgedResult.questions} 
                        initialLayoutConfig={forgedResult.layoutConfig}
                        onRestart={() => { setForgedResult(null); setEditingTestId(null); }} 
                        onSave={handleSaveTestToSupabase} 
                        onEditBlueprint={handleEditBlueprint}
                        brandConfig={brandConfig} 
                    />
                </div>
            )}
        </main>
        {isCreatorOpen && (
            <div className="fixed inset-0 z-50 bg-white">
                <TestCreatorView 
                    onClose={() => setIsCreatorOpen(false)} 
                    onStart={handleCreateTest} 
                    isLoading={isForging} 
                    loadingStep={forgeStep} 
                    initialChapters={editInitialChapters}
                    initialTopic={forgedResult?.topic}
                />
            </div>
        )}
    </div>
  );
};

export default Quiz;
