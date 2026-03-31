import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../supabase/client';
import { fetchClassesForUser, fetchInstitutesForUser } from '../supabase/orgScope';
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
import NewTestChapterPickerModal, { type NewTestPickerConfirmPayload } from './components/NewTestChapterPickerModal';
import QuestionListScreen from './components/ResultScreen';
import InteractiveQuizSession from './components/InteractiveQuizSession';
import StudentOnlineTestDashboard from '../Student/OnlineTest/StudentOnlineTestDashboard';
import StudentMockTestDashboard from '../Student/MockTest/StudentMockTestDashboard';
import SolutionViewer from '../Student/OnlineTest/SolutionViewer';
import LandingPage from '../Landing/LandingPage';
import { appShellTheme, landingTheme } from '../Landing/theme';
import {
  resolveAppRole,
  canAccessView,
  defaultViewForRole,
  type AppRole,
  type DashboardView,
} from '../auth/roles';
import {
  BrandingConfig,
  Question,
  QuestionType,
  SelectedChapter,
  LayoutConfig,
  TypeDistribution,
  CreateTestOptions,
} from './types';
import { generateQuizQuestions, generateCompositeFigures, generateCompositeStyleVariants, ensureApiKey, extractImagesFromDoc } from '../services/geminiService';
import {
  fetchEligibleQuestions,
  isUuid,
  recordQuestionUsageForTest,
} from './services/questionUsageService';
import { fetchUserExcludedTopicLabels } from '../services/syllabusService';
import { isOnlineExamAssignment, sanitizeQuestionsForStudentExam } from './services/studentTestService';
import { resolvePlatformBranding } from '../branding/defaults';
import {
  fetchPlatformBrandingRow,
  PLATFORM_BRANDING_UPDATED_EVENT,
} from '../branding/platformBrandingService';
import { PlatformBrandingProvider } from '../branding/PlatformBrandingContext';
import { Menu } from 'lucide-react';

interface Institute {
  id: string;
  name: string;
  color?: string;
  business_id?: string | null;
}
interface OrgClass {
  id: string;
  name: string;
  institute_id: string;
}
interface Folder { id: string; name: string; parent_id?: string | null; tests: any[]; }

/** Narrow columns for workspace lists — avoids huge JSON blobs. */
const TESTS_LIST_COLUMNS =
  'id, name, question_count, created_at, scheduled_at, status, folder_id, class_ids, config';

const DASHBOARD_BASE = '/dashboard';

const VIEW_TO_SLUG: Record<DashboardView, string> = {
  test: 'paper-tests',
  'online-exam': 'online-exams',
  students: 'students',
  reports: 'reports',
  settings: 'settings',
  admin: 'admin',
  'student-online-test': 'online-tests',
  'student-mock-test': 'mock-tests',
};

const SLUG_TO_VIEW: Record<string, DashboardView> = Object.entries(VIEW_TO_SLUG).reduce(
  (acc, [view, slug]) => {
    acc[slug] = view as DashboardView;
    return acc;
  },
  {} as Record<string, DashboardView>
);

const VIEW_SEO: Record<DashboardView, { title: string; description: string }> = {
  test: {
    title: 'Class Tests',
    description: 'Create, schedule, and manage class tests.',
  },
  'online-exam': {
    title: 'Online Tests',
    description: 'Schedule and manage online tests.',
  },
  students: {
    title: 'Students',
    description: 'Manage student records and classes.',
  },
  reports: {
    title: 'Reports',
    description: 'View performance reports and insights.',
  },
  settings: {
    title: 'Settings',
    description: 'Configure account, branding, and workspace settings.',
  },
  admin: {
    title: 'Admin',
    description: 'Admin controls for knowledge, question DB, prompts, and users.',
  },
  'student-online-test': {
    title: 'Student Online Tests',
    description: 'Take and review assigned online tests from your class.',
  },
  'student-mock-test': {
    title: 'Student Mock Tests',
    description: 'Practice with mock tests by chapter and difficulty.',
  },
};

function viewFromPathname(pathname: string): DashboardView | null {
  const clean = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  if (segments[0] !== DASHBOARD_BASE.replace('/', '')) return null;
  return SLUG_TO_VIEW[segments[1]] || null;
}

function pathForView(view: DashboardView): string {
  return `${DASHBOARD_BASE}/${VIEW_TO_SLUG[view]}`;
}

function isMissingDbColumnError(err: { message?: string; code?: string } | null) {
  if (!err) return false;
  const m = (err.message || '').toLowerCase();
  if (err.code === '42703') return true;
  return m.includes('evaluation_pending') || m.includes('does not exist');
}

/**
 * Utility to strip Null characters (\u0000) which are illegal in Postgres text types.
 */
const sanitizeForPostgres = (obj: any): any => {
    if (typeof obj === 'string') {
        return obj.replace(/\u0000/g, '').replace(/\0/g, '');
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForPostgres);
    }
    if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
            cleaned[key] = sanitizeForPostgres(obj[key]);
        }
        return cleaned;
    }
    return obj;
};

const Quiz: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const initialAuthMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const searchType = sp.get('type');

      const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hp = new URLSearchParams(hash);
      const hashType = hp.get('type');

      if (searchType === 'recovery' || hashType === 'recovery') return 'reset-password';
      if (hp.get('error_code') === 'otp_expired') return 'forgot-password';
      return undefined;
    } catch {
      return undefined;
    }
  }, []);

  const initialRecoveryAccessToken = useMemo(() => {
    try {
      const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hp = new URLSearchParams(hash);
      return hp.get('access_token');
    } catch {
      return null;
    }
  }, []);

  const initialRecoveryRefreshToken = useMemo(() => {
    try {
      const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hp = new URLSearchParams(hash);
      return hp.get('refresh_token');
    } catch {
      return null;
    }
  }, []);

  const initialAuthError = useMemo(() => {
    try {
      const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hp = new URLSearchParams(hash);
      const code = hp.get('error_code');
      const desc = hp.get('error_description');
      if (!code) return null;
      if (code === 'otp_expired') {
        return 'This reset link is invalid or expired. Please request a new password reset email.';
      }
      return desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : `Authentication error: ${code}`;
    } catch {
      return null;
    }
  }, []);

  const [showAuth, setShowAuth] = useState(() => initialAuthMode === 'reset-password' || !!initialAuthError);
  const [activeView, setActiveView] = useState('test');
  const [appRole, setAppRole] = useState<AppRole>('student');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(''); // New state for loading text
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fetchingRef = useRef(false);
  const lastFetchTime = useRef<number>(0);
  const didInitRouteRef = useRef(false);
  
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [orgClasses, setOrgClasses] = useState<OrgClass[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allTests, setAllTests] = useState<any[]>([]);
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'icons' | 'list' | 'calendar' | 'kanban'>('icons');
  const [calendarType, setCalendarType] = useState<'month' | 'week' | 'year'>('month');

  const [brandConfig, setBrandConfig] = useState<BrandingConfig>({ name: 'KiwiTeach', logo: null, showOnTest: true, showOnOmr: true });
  const [platformTheme, setPlatformTheme] = useState(() => resolvePlatformBranding(null));

  const loadPlatformBranding = useCallback(async () => {
    const row = await fetchPlatformBrandingRow();
    setPlatformTheme(resolvePlatformBranding(row));
  }, []);
  const [showLanding, setShowLanding] = useState(false);

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isOnlineExamCreatorOpen, setIsOnlineExamCreatorOpen] = useState(false);
  const [onlineExamResult, setOnlineExamResult] = useState<{ topic: string, questions: Question[], config?: any } | null>(null);

  const [activeStudentExam, setActiveStudentExam] = useState<{
    topic: string;
    questions: Question[];
    testId?: string;
    examDurationSeconds?: number;
  } | null>(null);
  const [activeStudentSolution, setActiveStudentSolution] = useState<{ topic: string, questions: Question[], showAnswers?: boolean } | null>(null);

  const [creatorFolderId, setCreatorFolderId] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [forgeStep, setForgeStep] = useState('');
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [forgedResult, setForgedResult] = useState<{ topic: string, questions: Question[], layoutConfig?: LayoutConfig, sourceOptions: CreateTestOptions } | null>(null);
  
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editInitialChapters, setEditInitialChapters] = useState<SelectedChapter[] | undefined>(undefined);
  const [editInitialTopic, setEditInitialTopic] = useState<string | undefined>(undefined);
  const [editInitialSettings, setEditInitialSettings] = useState<any>(undefined);
  const [editInitialManualQuestions, setEditInitialManualQuestions] = useState<Question[] | undefined>(undefined);
  const [editInitialKnowledgeBaseId, setEditInitialKnowledgeBaseId] = useState<string | null | undefined>(undefined);
  const [editInitialTotalTarget, setEditInitialTotalTarget] = useState<number | undefined>(undefined);
  const [editInitialDistributionMode, setEditInitialDistributionMode] = useState<'count' | 'percent' | undefined>(
    undefined
  );
  const [editInitialGlobalTypes, setEditInitialGlobalTypes] = useState<TypeDistribution | undefined>(undefined);
  const [editInitialGlobalFigureCount, setEditInitialGlobalFigureCount] = useState<number | undefined>(undefined);
  const [newTestChapterPickerOpen, setNewTestChapterPickerOpen] = useState(false);
  const [pendingNewTestKind, setPendingNewTestKind] = useState<'paper' | 'online' | null>(null);

  const loadProfileAndOrg = async (user: { id: string; email?: string | null }) => {
    const email = user.email ?? '';
    type ProfileRow = { role?: string | null; class_id?: string | null; business_id?: string | null };
    let prof: ProfileRow | null = null;
    let profErr: { message?: string; code?: string } | null = null;
    {
      const r = await supabase
        .from('profiles')
        .select('role, class_id, business_id')
        .eq('id', user.id)
        .maybeSingle();
      prof = r.data as ProfileRow | null;
      profErr = r.error;
    }
    if (
      profErr &&
      /42703|business_id/i.test(`${profErr.code || ''} ${profErr.message || ''}`)
    ) {
      const fb = await supabase.from('profiles').select('role, class_id').eq('id', user.id).maybeSingle();
      prof = fb.data ? { ...fb.data, business_id: null } : null;
      profErr = fb.error;
    }
    if (profErr) console.warn('profiles:', profErr.message);
    if (!prof) {
      const initialRole = resolveAppRole(email, null);
      await supabase.from('profiles').upsert(
        {
          id: user.id,
          role: initialRole,
          full_name: email.split('@')[0] || 'User',
        },
        { onConflict: 'id' }
      );
      const refetch = await supabase.from('profiles').select('role, class_id, business_id').eq('id', user.id).maybeSingle();
      prof = refetch.data as ProfileRow | null;
      if (
        refetch.error &&
        /42703|business_id/i.test(`${refetch.error.code || ''} ${refetch.error.message || ''}`)
      ) {
        const fb2 = await supabase.from('profiles').select('role, class_id').eq('id', user.id).maybeSingle();
        prof = fb2.data ? { ...fb2.data, business_id: null } : null;
      }
    }
    const role = resolveAppRole(email, prof?.role ?? null);
    setAppRole(role);
    setStudentClassId(prof?.class_id ? String(prof.class_id) : null);
    if (role === 'developer' && prof?.role !== 'developer') {
      await supabase.from('profiles').update({ role: 'developer' }).eq('id', user.id);
    }

    const ir = await fetchInstitutesForUser(user.id);
    let instRows = ir.data as { id: string; name: string }[] | null;
    if (ir.error && /business_id|does not exist|42703/i.test(`${ir.error.message} ${ir.error.code || ''}`)) {
      const fb = await supabase.from('institutes').select('id, name').eq('user_id', user.id).order('name');
      instRows = fb.data as { id: string; name: string }[] | null;
    }
    const instIds = (instRows || []).map((r) => r.id);
    const cr = await fetchClassesForUser(user.id, instIds);
    const classRows = cr.data;
    const colors = ['indigo', 'rose', 'emerald', 'amber', 'violet'] as const;
    if (instRows?.length) {
      setInstitutes(
        instRows.map((row, i) => ({
          ...row,
          color: colors[i % colors.length],
        }))
      );
    } else {
      setInstitutes([]);
    }
    setOrgClasses((classRows as OrgClass[]) || []);
  };

  const refreshOrgData = () => {
    if (session?.user) void loadProfileAndOrg(session.user);
  };

  useEffect(() => {
    if (!canAccessView(appRole, activeView)) {
      setActiveView(defaultViewForRole(appRole));
    }
  }, [appRole, activeView]);

  // Initialize dashboard view from URL slug on reload; fallback to role default.
  useEffect(() => {
    if (!session?.user || didInitRouteRef.current) return;
    const fromPath = viewFromPathname(window.location.pathname);
    const fallback = defaultViewForRole(appRole);
    const nextView =
      fromPath && canAccessView(appRole, fromPath) ? fromPath : fallback;
    setActiveView(nextView);
    didInitRouteRef.current = true;
  }, [session?.user, appRole]);

  // Keep URL slug + basic SEO tags in sync with active dashboard view.
  useEffect(() => {
    if (!session?.user) return;
    const view = activeView as DashboardView;
    if (!VIEW_TO_SLUG[view]) return;
    const targetPath = pathForView(view);
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
    const seo = VIEW_SEO[view];
    document.title = `${seo.title} | KiwiTeach`;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = seo.description;
  }, [session?.user, activeView]);

  // Handle browser back/forward between dashboard slugs.
  useEffect(() => {
    const onPopState = () => {
      const v = viewFromPathname(window.location.pathname);
      if (v && canAccessView(appRole, v)) setActiveView(v);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [appRole]);

  // Test repositories should open in icon card view by default.
  useEffect(() => {
    if (activeView === 'test' || activeView === 'online-exam') setViewMode('icons');
  }, [activeView]);

  useEffect(() => {
    if (!session?.user) {
      setPlatformTheme(resolvePlatformBranding(null));
      return;
    }
    void loadPlatformBranding();
  }, [session?.user?.id, loadPlatformBranding]);

  useEffect(() => {
    const fn = () => {
      if (!session?.user) return;
      void loadPlatformBranding();
    };
    window.addEventListener(PLATFORM_BRANDING_UPDATED_EVENT, fn);
    return () => window.removeEventListener(PLATFORM_BRANDING_UPDATED_EVENT, fn);
  }, [session?.user?.id, loadPlatformBranding]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchWorkspace(session.user);
        fetchBranding(session.user.id);
        void loadProfileAndOrg(session.user);
      } else {
        setIsLoadingWorkspace(false); 
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        fetchWorkspace(session.user);
        fetchBranding(session.user.id);
        void loadProfileAndOrg(session.user);
      } else if (event === 'SIGNED_OUT') {
        setFolders([]); 
        setAllTests([]); 
        setIsLoadingWorkspace(false); 
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchBranding = async (userId: string) => {
      const { data, error } = await supabase.from('branding_settings').select('brand_name, logo_url, show_on_test, show_on_omr').eq('user_id', userId).single();
      if (!error && data) {
          setBrandConfig({ 
            name: data.brand_name || 'KiwiTeach', 
            logo: data.logo_url || null, 
            showOnTest: data.show_on_test ?? true, 
            showOnOmr: data.show_on_omr ?? true 
          });
      }
  };

  const handleUpdateBranding = async (newConfig: BrandingConfig) => {
      setBrandConfig(newConfig);
      if (session?.user) {
          await supabase.from('branding_settings').upsert({ user_id: session.user.id, brand_name: newConfig.name, logo_url: newConfig.logo, show_on_test: newConfig.showOnTest, show_on_omr: newConfig.showOnOmr, updated_at: new Date().toISOString() });
      }
  };

  const fetchWorkspace = async (currentUser?: any) => {
    const now = Date.now();
    if (fetchingRef.current || (now - lastFetchTime.current < 2000)) return;
    
    fetchingRef.current = true;
    lastFetchTime.current = now;
    
    try {
        let user = currentUser || session?.user;
        if (!user) { const { data } = await supabase.auth.getUser(); user = data.user; }
        if (!user) return;

        const { data: profileRow } = await supabase
          .from('profiles')
          .select('role, class_id')
          .eq('id', user.id)
          .maybeSingle();
        const email = user.email ?? '';
        const resolvedRole = resolveAppRole(email, profileRow?.role ?? null);
        if (profileRow?.class_id) setStudentClassId(String(profileRow.class_id));
        else setStudentClassId(null);

        if (resolvedRole === 'student') {
          setFolders([]);
          const cid = profileRow?.class_id ? String(profileRow.class_id) : null;
          if (!cid) {
            setAllTests([]);
            return;
          }
          const stPrimary = await supabase
            .from('tests')
            .select(`${TESTS_LIST_COLUMNS}, evaluation_pending`)
            .contains('class_ids', [cid])
            .order('created_at', { ascending: false })
            .limit(80);
          let stRows = stPrimary.data as any[] | null;
          let stErr = stPrimary.error;
          if (stErr && isMissingDbColumnError(stErr)) {
            const stFb = await supabase
              .from('tests')
              .select(TESTS_LIST_COLUMNS)
              .contains('class_ids', [cid])
              .order('created_at', { ascending: false })
              .limit(80);
            stRows = stFb.data as any[] | null;
            stErr = stFb.error;
          }
          if (stErr) {
            console.warn('Student tests fetch:', stErr.message);
            setAllTests([]);
            return;
          }
          const filtered = (stRows || []).filter((t: any) => isOnlineExamAssignment(t));
          const processedTests = filtered.map((t: any) => ({
            ...t,
            questionCount: t.question_count || 0,
            generatedAt: t.created_at,
            scheduledAt: t.scheduled_at,
            class_ids: t.class_ids || [],
            evaluationPending: !!(t as { evaluation_pending?: boolean }).evaluation_pending,
          }));
          setAllTests(processedTests);
          return;
        }

        const [foldersRes, testsRes] = await Promise.all([
          supabase.from('folders').select('id, name, parent_id').eq('user_id', user.id).order('created_at'),
          supabase
            .from('tests')
            .select(`${TESTS_LIST_COLUMNS}, evaluation_pending`)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(120),
        ]);

        let testsRows = testsRes.data as any[] | null;
        if (testsRes.error && isMissingDbColumnError(testsRes.error)) {
          const fb = await supabase
            .from('tests')
            .select(TESTS_LIST_COLUMNS)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(120);
          if (fb.error) {
            console.warn('[fetchWorkspace] tests query failed:', fb.error.message);
            testsRows = [];
          } else {
            testsRows = fb.data as any[] | null;
          }
        } else if (testsRes.error) {
          console.warn('[fetchWorkspace] tests query failed:', testsRes.error.message);
          testsRows = [];
        }

        const processedTests = (testsRows || []).map((t: any) => ({
          ...t,
          questionCount: t.question_count || 0,
          generatedAt: t.created_at,
          scheduledAt: t.scheduled_at,
          class_ids: Array.isArray(t.class_ids) ? t.class_ids : [],
          config: t.config ?? {},
          evaluationPending: !!t.evaluation_pending,
        }));
        setAllTests(processedTests);
        
        const folderMap = new Map();
        (foldersRes.data || []).forEach((f: any) => { folderMap.set(f.id, { ...f, children: [], tests: [] }); });
        processedTests.forEach((t: any) => { if (t.folder_id && folderMap.has(t.folder_id)) { folderMap.get(t.folder_id).tests.push(t); } });
        
        const rootFolders: Folder[] = [];
        folderMap.forEach(f => { if (f.parent_id && folderMap.has(f.parent_id)) { folderMap.get(f.parent_id).children.push(f); } else rootFolders.push(f); });
        setFolders(rootFolders);
    } finally { 
        setIsLoadingWorkspace(false); 
        fetchingRef.current = false; 
    }
  };

  /** Refresh assigned online tests when opening student zone (teacher-created tests sync via Supabase). */
  useEffect(() => {
    if (!session?.user || activeView !== 'student-online-test') return;
    lastFetchTime.current = 0;
    void fetchWorkspace(session.user);
  }, [activeView, session?.user?.id]);

  /** Student online tests must only list online rows (developers load all tests for teacher UI). */
  const studentOnlineExamsOnly = useMemo(() => allTests.filter((t) => isOnlineExamAssignment(t)), [allTests]);

  const handleAddFolder = async (folder: { name: string, parent_id: string | null }) => {
      const { error } = await supabase.from('folders').insert([{ name: folder.name, parent_id: folder.parent_id, user_id: session?.user?.id }]);
      if (!error) fetchWorkspace();
  };

  const handleDeleteItem = async (type: 'folder' | 'test', id: string, name: string) => {
      try { 
        if (type === 'folder') await supabase.from('folders').delete().eq('id', id); 
        else await supabase.from('tests').delete().eq('id', id); 
        fetchWorkspace(); 
      } catch (err: any) { alert(`Failed to delete ${type}: ${err.message}`); }
  };

  const handleDuplicateTest = async (test: any) => {
      setLoadingMessage('Cloning Assessment...');
      setIsLoadingTest(true);
      try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: fullData } = await supabase.from('tests').select('*').eq('id', test.id).single();
          await supabase.from('tests').insert({ name: `${test.name} (Copy)`, folder_id: test.folder_id, user_id: user?.id, questions: fullData?.questions || [], question_ids: fullData?.question_ids || [], config: fullData?.config || {}, layout_config: fullData?.layout_config || {}, question_count: fullData?.question_count || 0, status: 'draft', scheduled_at: null, class_ids: [] });
          await fetchWorkspace();
      } catch (e: any) { alert("Duplicate failed: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleRenameTest = async (testId: string, newName: string) => { try { await supabase.from('tests').update({ name: newName }).eq('id', testId); await fetchWorkspace(); } catch (err: any) { alert("Rename failed: " + err.message); } };
  const handleScheduleTest = async (testId: string, dateStr: string | null) => {
    try {
      const updates = dateStr
        ? { scheduled_at: new Date(dateStr).toISOString(), status: 'scheduled' }
        : { scheduled_at: null, status: 'generated' };
      const { error } = await supabase.from('tests').update(updates).eq('id', testId);
      if (error) throw error;
      void fetchWorkspace();
    } catch (e) {
      console.error('Scheduling Error:', e);
    }
  };

  const handleRevertTestToDraft = async (testId: string) => {
    try {
      let error;
      ({ error } = await supabase
        .from('tests')
        .update({ scheduled_at: null, status: 'draft', evaluation_pending: false })
        .eq('id', testId));
      if (error && isMissingDbColumnError(error)) {
        ({ error } = await supabase.from('tests').update({ scheduled_at: null, status: 'draft' }).eq('id', testId));
      }
      if (error) throw error;
      lastFetchTime.current = 0;
      void fetchWorkspace(session?.user ?? undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not move test to draft';
      alert(msg);
    }
  };
  const handleAssignClasses = async (testId: string, classIds: string[]) => { try { await supabase.from('tests').update({ class_ids: classIds }).eq('id', testId); await fetchWorkspace(); } catch (e) { console.error("Assign Error:", e); } };

  const handleMoveTestToFolder = async (testId: string, folderId: string | null) => {
    try {
      const { error } = await supabase.from('tests').update({ folder_id: folderId }).eq('id', testId);
      if (error) throw error;
      lastFetchTime.current = 0;
      void fetchWorkspace(session?.user ?? undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not move test';
      alert(msg);
    }
  };

  const handleSetEvaluationPending = async (testId: string, pending: boolean) => {
    try {
      const { error } = await supabase.from('tests').update({ evaluation_pending: pending }).eq('id', testId);
      if (error) {
        if (isMissingDbColumnError(error)) {
          alert(
            'The database is missing column evaluation_pending. Apply the latest Supabase migration (tests_evaluation_pending.sql) and reload.'
          );
          return;
        }
        throw error;
      }
      lastFetchTime.current = 0;
      void fetchWorkspace(session?.user ?? undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not update test';
      alert(msg);
    }
  };

  const handleStartTestCreator = (folderId: string | null) => {
      setEditInitialChapters(undefined);
      setEditInitialTopic(undefined); setEditInitialSettings(undefined); setEditInitialManualQuestions(undefined);
      setEditInitialKnowledgeBaseId(undefined);
      setEditInitialTotalTarget(undefined);
      setEditInitialDistributionMode(undefined);
      setEditInitialGlobalTypes(undefined);
      setEditInitialGlobalFigureCount(undefined);
      setEditingTestId(null); setCreatorFolderId(folderId);
      setIsForging(false); setForgeStep(''); setForgeError(null);
      setForgedResult(null); setOnlineExamResult(null);
      setPendingNewTestKind('paper');
      setNewTestChapterPickerOpen(true);
  };
  const handleStartOnlineExamCreator = (folderId: string | null) => {
      setEditInitialChapters(undefined);
      setEditInitialTopic(undefined); setEditInitialSettings(undefined); setEditInitialManualQuestions(undefined);
      setEditInitialKnowledgeBaseId(undefined);
      setEditInitialTotalTarget(undefined);
      setEditInitialDistributionMode(undefined);
      setEditInitialGlobalTypes(undefined);
      setEditInitialGlobalFigureCount(undefined);
      setEditingTestId(null); setCreatorFolderId(folderId);
      setIsForging(false); setForgeStep(''); setForgeError(null);
      setForgedResult(null); setOnlineExamResult(null);
      setPendingNewTestKind('online');
      setNewTestChapterPickerOpen(true);
  };

  const handleNewTestChaptersConfirm = (payload: NewTestPickerConfirmPayload) => {
      setNewTestChapterPickerOpen(false);
      const kind = pendingNewTestKind;
      setPendingNewTestKind(null);
      setEditInitialChapters(payload.chapters);
      setEditInitialKnowledgeBaseId(payload.knowledgeBaseId);
      setEditInitialTopic(payload.initialTopic);
      setEditInitialTotalTarget(payload.initialTotalTarget);
      setEditInitialDistributionMode(payload.initialDistributionMode);
      setEditInitialGlobalTypes(payload.initialGlobalTypes);
      setEditInitialGlobalFigureCount(payload.initialGlobalFigureCount);
      if (kind === 'paper') setIsCreatorOpen(true);
      else if (kind === 'online') setIsOnlineExamCreatorOpen(true);
  };

  const handleEditBlueprint = (questions: Question[]) => {
    if (forgedResult?.sourceOptions) {
        const options = forgedResult.sourceOptions;
        setEditInitialKnowledgeBaseId(options.knowledgeBaseId ?? undefined);
        setEditInitialChapters(options.chapters);
        setEditInitialTopic(options.topic);
        setEditInitialManualQuestions(questions);
        setEditInitialSettings({
            totalQuestions: questions.length, globalDiff: options.globalDifficultyMix, globalTypes: options.globalTypeMix,
            useGlobalDifficulty: options.useGlobalDifficulty, globalFigureCount: options.globalFigureCount,
            selectionMode: options.selectionMode || (options.manualQuestions && options.manualQuestions.length > 0 ? 'manual' : 'auto')
        });
    } else {
        setEditInitialKnowledgeBaseId(undefined);
        const chaptersMap = new Map<string, SelectedChapter>();
        questions.forEach(q => {
            if (!q.sourceChapterId) return;
            if (chaptersMap.has(q.sourceChapterId)) { chaptersMap.get(q.sourceChapterId)!.count += 1; } 
            else { chaptersMap.set(q.sourceChapterId, { id: q.sourceChapterId, name: q.sourceChapterName || 'Unknown', subjectName: q.sourceSubjectName || 'Unknown', className: 'Unknown', count: 1, figureCount: 0, difficulty: 'Global', source: 'db', styleCounts: { mcq: 1 }, selectionMode: 'count', visualMode: 'image' }); }
        });
        setEditInitialChapters(Array.from(chaptersMap.values()));
        setEditInitialTopic(forgedResult?.topic || 'Untitled');
        setEditInitialSettings({ totalQuestions: questions.length, selectionMode: 'manual' });
        setEditInitialManualQuestions(questions);
    }
    setForgeError(null);
    setIsCreatorOpen(true);
    setForgedResult(null); 
  };

  const handleSaveDraft = async (options: CreateTestOptions) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Auth required.");
      const manualQs = options.manualQuestions || [];
      
      const safeOptions = sanitizeForPostgres(options);
      const safeManualQs = sanitizeForPostgres(manualQs);

      const draftMode = isOnlineExamCreatorOpen ? 'online-exam' : 'paper';
      const payload = { 
          name: safeOptions.topic || 'New Assessment Draft', 
          folder_id: creatorFolderId, 
          user_id: user.id, 
          questions: safeManualQs, 
          question_ids: safeManualQs.map((q: any) => q.id || '').filter(Boolean), 
          config: { sourceOptions: safeOptions, mode: draftMode }, 
          layout_config: {}, 
          status: 'draft', 
          question_count: safeOptions.selectionMode === 'manual' ? safeManualQs.length : safeOptions.totalQuestions, 
          scheduled_at: null, 
          class_ids: [] 
      };

      if (editingTestId) { 
        // This is the correct path for an existing draft. It should update.
        await supabase.from('tests').update(payload).eq('id', editingTestId); 
      } else { 
        // This path runs for a new draft. It inserts.
        const { data, error } = await supabase.from('tests').insert([payload]).select('id').single(); 
        if (error) throw error;
        // After inserting, capture the new ID. This prevents subsequent saves in the same session from creating duplicates.
        if (data?.id) {
            setEditingTestId(data.id);
        }
      }
      // Refresh the dashboard to show the changes.
      await fetchWorkspace();
  };

  const processUploadContent = (content: string) => {
      const images: { data: string; mimeType: string }[] = [];
      let text = content;
      const imgRegex = /<img[^>]+src=["'](data:image\/([^;]+);base64,\s*([^"']+))["'][^>]*>/gi;
      let count = 0;
      text = text.replace(imgRegex, (match, fullSrc, mimeType, base64Data) => { if (count < 20) { images.push({ data: base64Data.trim(), mimeType }); count++; return ` [FIGURE_REFERENCE_${count}] `; } return ''; });
      return { text, images };
  };

  const generateQuestionsLogic = async (options: CreateTestOptions, setStatus: (s: string) => void) => {
      await ensureApiKey();

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      let excludedTopicLabelsNormalized: string[] = [];
      if (uid) {
          try {
              excludedTopicLabelsNormalized = await fetchUserExcludedTopicLabels(
                  supabase,
                  uid,
                  options.knowledgeBaseId ?? null
              );
          } catch (e) {
              console.warn('Topic exclusions fetch failed', e);
          }
      }
      
      const manualQs = options.manualQuestions || [];
      let finalQuestions: Question[] = [...manualQs]; 
      
      const styleTransferCache: Record<string, string> = {};

      for (const chap of options.chapters) {
          const manualForThisChap = manualQs.filter(q => q.sourceChapterId === chap.id);
          const targetCount = chap.count || 0;
          
          const neededFromAi = Math.max(0, targetCount - manualForThisChap.length);
          if (neededFromAi <= 0) continue;
          
          setStatus(`Forging ${neededFromAi} remainder questions for ${chap.name}...`);
          let newBatch: Question[] = [];
          let effectiveSource = chap.source;
          
          let allPossibleImgs: { data: string, mimeType: string }[] = [];
          let rawText = "";

          if (chap.content) { 
              const p = processUploadContent(chap.content); 
              rawText = p.text;
              allPossibleImgs = p.images;
          } else if (chap.id) { 
              const { data } = await supabase.from('chapters').select('raw_text, doc_path').eq('id', chap.id).maybeSingle(); 
              if (data?.raw_text) rawText = data.raw_text;
              if (data?.doc_path && chap.figureCount > 0 && chap.visualMode === 'image') {
                  setStatus(`Scanning source material for ${chap.name}...`);
                  allPossibleImgs = await extractImagesFromDoc(data.doc_path);
              }
          }

          const selectedIndices = Object.keys(chap.selectedFigures || {}).map(Number);
          const filteredImgs = selectedIndices.length > 0 
              ? selectedIndices.map(idx => allPossibleImgs[idx]).filter(Boolean)
              : allPossibleImgs.slice(0, 20);

          const sourceContext = { text: rawText, images: filteredImgs };

          if (effectiveSource === 'db') {
              const currentIds = finalQuestions
                .map((q) => q.originalId || q.id)
                .filter((id): id is string => isUuid(id));

              const styleKeys = ['mcq', 'reasoning', 'matching', 'statements'] as const;
              const normalizeStylePlan = (counts: Record<string, number> | undefined, total: number): Record<(typeof styleKeys)[number], number> => {
                if (!counts || total <= 0) return { mcq: total, reasoning: 0, matching: 0, statements: 0 };
                const raw = styleKeys.map((k) => Math.max(0, Math.round(Number(counts[k]) || 0)));
                let sum = raw.reduce((a, b) => a + b, 0);
                if (sum <= 0) return { mcq: total, reasoning: 0, matching: 0, statements: 0 };
                const scaled = raw.map((v) => Math.round((v / sum) * total));
                let s = scaled.reduce((a, b) => a + b, 0);
                let diff = total - s;
                let i = 0;
                while (diff !== 0 && i < 200) {
                  const j = i % styleKeys.length;
                  if (diff > 0) {
                    scaled[j] += 1;
                    diff -= 1;
                  } else if (scaled[j] > 0) {
                    scaled[j] -= 1;
                    diff += 1;
                  }
                  i += 1;
                }
                return Object.fromEntries(styleKeys.map((k, idx) => [k, scaled[idx]])) as Record<
                  (typeof styleKeys)[number],
                  number
                >;
              };

              const usePerStyle = !!(chap.useStyleMix && chap.styleCounts);
              if (usePerStyle) {
                const plan = normalizeStylePlan(chap.styleCounts, neededFromAi);
                const collected: Question[] = [];
                for (const qt of styleKeys) {
                  const want = plan[qt];
                  if (want <= 0) continue;
                  const exclude = [...currentIds, ...collected.map((q) => q.originalId || q.id).filter(isUuid)];
                  const part = await fetchEligibleQuestions({
                    classId: options.targetClassId || null,
                    chapterId: chap.id,
                    difficulty: chap.difficulty === 'Global' ? null : chap.difficulty,
                    questionType: qt,
                    excludeIds: exclude,
                    limit: want,
                    allowRepeats: !!options.allowPastQuestions,
                    includeUsedQuestionIds: options.includeUsedQuestionIds || [],
                    excludedTopicLabelsNormalized: excludedTopicLabelsNormalized,
                  });
                  collected.push(
                    ...part.map((bq) => ({
                      ...bq,
                      sourceChapterName: bq.sourceChapterName || chap.name,
                    }))
                  );
                }
                let still = neededFromAi - collected.length;
                if (still > 0) {
                  const exclude = [...currentIds, ...collected.map((q) => q.originalId || q.id).filter(isUuid)];
                  const filler = await fetchEligibleQuestions({
                    classId: options.targetClassId || null,
                    chapterId: chap.id,
                    difficulty: chap.difficulty === 'Global' ? null : chap.difficulty,
                    excludeIds: exclude,
                    limit: still,
                    allowRepeats: !!options.allowPastQuestions,
                    includeUsedQuestionIds: options.includeUsedQuestionIds || [],
                    excludedTopicLabelsNormalized: excludedTopicLabelsNormalized,
                  });
                  collected.push(
                    ...filler.map((bq) => ({
                      ...bq,
                      sourceChapterName: bq.sourceChapterName || chap.name,
                    }))
                  );
                }
                newBatch = collected.slice(0, neededFromAi);
              } else {
                const eligible = await fetchEligibleQuestions({
                  classId: options.targetClassId || null,
                  chapterId: chap.id,
                  difficulty: chap.difficulty === 'Global' ? null : chap.difficulty,
                  excludeIds: currentIds,
                  limit: neededFromAi,
                  allowRepeats: !!options.allowPastQuestions,
                  includeUsedQuestionIds: options.includeUsedQuestionIds || [],
                  excludedTopicLabelsNormalized: excludedTopicLabelsNormalized,
                });
                newBatch = eligible.map((bq) => ({
                  ...bq,
                  sourceChapterName: bq.sourceChapterName || chap.name,
                }));
              }

              if (newBatch.length > 0) {
                /* keep db */
              } else {
                effectiveSource = 'ai';
              }
          }
          
          if (effectiveSource === 'ai') {
              let diffConfig = options.useGlobalDifficulty ? options.globalDifficultyMix : chap.difficulty;
              const breakdownJson = JSON.stringify(chap.selectedFigures || {});
              
              const gen = await generateQuizQuestions(
                  chap.name, diffConfig, neededFromAi, sourceContext, options.questionType || 'mcq', 
                  setStatus, chap.figureCount, options.useSmiles, breakdownJson, 'gemini-3-pro-preview', chap.visualMode,
                  undefined, undefined, undefined, undefined, excludedTopicLabelsNormalized
              );
              
              const figureQs = gen.filter(q => q.figurePrompt);
              if (figureQs.length > 0 && chap.figureCount > 0) {
                  setStatus(`Synthesizing Visuals for ${chap.name}...`);
                  const useAsIs = options.useAsIsFigures;
                  
                  if (chap.visualMode === 'image') {
                      figureQs.forEach(q => {
                          const sIdx = q.sourceImageIndex !== undefined ? Number(q.sourceImageIndex) : 0;
                          const sourceImg = filteredImgs[sIdx] || filteredImgs[0];
                          if (sourceImg) {
                              q.sourceFigureDataUrl = `data:${sourceImg.mimeType};base64,${sourceImg.data}`;
                          }
                      });

                      if (useAsIs) {
                          for (const q of figureQs) {
                              const sIdx = q.sourceImageIndex !== undefined ? Number(q.sourceImageIndex) : 0;
                              const sourceImg = filteredImgs[sIdx] || filteredImgs[0];
                              
                              if (sourceImg) {
                                  const cacheKey = sourceImg.data.substring(0, 100) + sourceImg.data.length;
                                  if (!styleTransferCache[cacheKey]) {
                                      setStatus(`Converting unique visual to Line Art...`);
                                      const results = await generateCompositeStyleVariants(sourceImg.data, sourceImg.mimeType, [q.figurePrompt || ""], true);
                                      if (results[0]) {
                                          styleTransferCache[cacheKey] = results[0];
                                      }
                                  }
                                  if (styleTransferCache[cacheKey]) {
                                      q.figureDataUrl = `data:image/png;base64,${styleTransferCache[cacheKey]}`;
                                  }
                              }
                          }
                      } else {
                          const sourceEditGroups: Record<number, Question[]> = {};
                          const purelySynthetic: Question[] = [];
                          figureQs.forEach(q => {
                              const sIdx = q.sourceImageIndex !== undefined ? Number(q.sourceImageIndex) : -1;
                              if (sIdx !== -1 && filteredImgs[sIdx]) {
                                  if (!sourceEditGroups[sIdx]) sourceEditGroups[sIdx] = [];
                                  sourceEditGroups[sIdx].push(q);
                              } else { purelySynthetic.push(q); }
                          });
                          for (const [imgIdx, groupQs] of Object.entries(sourceEditGroups)) {
                              const sourceImg = filteredImgs[parseInt(imgIdx)];
                              for (let i = 0; i < groupQs.length; i += 6) {
                                  const chunk = groupQs.slice(i, i + 6);
                                  const images = await generateCompositeStyleVariants(sourceImg.data, sourceImg.mimeType, chunk.map(q => q.figurePrompt!), false);
                                  chunk.forEach((q, cIdx) => { 
                                      if (images[cIdx]) { 
                                          q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; 
                                      } 
                                  });
                              }
                          }
                          for (let i = 0; i < purelySynthetic.length; i += 6) {
                              const chunk = purelySynthetic.slice(i, i + 6);
                              const images = await generateCompositeFigures(chunk.map(q => q.figurePrompt!));
                              chunk.forEach((q, cIdx) => { 
                                  if (images[cIdx]) { 
                                      q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; 
                                  } 
                              });
                          }
                      }
                  } else {
                      for (let i = 0; i < figureQs.length; i += 6) {
                          const chunk = figureQs.slice(i, i + 6);
                          const images = await generateCompositeFigures(chunk.map(q => q.figurePrompt!));
                          chunk.forEach((q, cIdx) => { 
                              if (images[cIdx]) { 
                                  q.figureDataUrl = `data:image/png;base64,${images[cIdx]}`; 
                              } 
                          });
                      }
                  }
              }
              newBatch = gen;
          }
          
          const enriched = newBatch.map(q => ({ ...q, sourceChapterId: q.sourceChapterId || chap.id, sourceChapterName: q.sourceChapterName || chap.name, sourceSubjectName: q.sourceSubjectName || chap.subjectName }));
          finalQuestions = [...finalQuestions, ...enriched];
      }
      return finalQuestions;
  };

  const commitTestToHub = async (topicName: string, questions: Question[], mode: 'paper' | 'online', extraConfig: any = {}) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Auth required.");

      // Critical: Sanitize all strings before inserting into Postgres
      const safeQuestions = sanitizeForPostgres(questions);
      const safeConfig = sanitizeForPostgres(extraConfig);
      const safeTopicName = sanitizeForPostgres(topicName);

      const payload = { 
          name: safeTopicName || 'New Assessment', folder_id: creatorFolderId, user_id: user.id, 
          questions: safeQuestions.map((q: any) => JSON.parse(JSON.stringify(q))), 
          question_ids: safeQuestions.map((q: any) => q.id || '').filter((id: string) => id !== ''), 
          config: { ...safeConfig, totalQuestions: safeQuestions.length, mode: mode }, 
          layout_config: safeConfig.layout_config || {}, 
          status: mode === 'online' ? 'scheduled' : 'generated', 
          question_count: safeQuestions.length, 
          scheduled_at: safeConfig.scheduledAt || null, 
          class_ids: safeConfig.classIds || [] 
      };
      let savedTestId = editingTestId || null;
      if (editingTestId) {
        await supabase.from('tests').update(payload).eq('id', editingTestId);
      } else {
        const { data, error } = await supabase.from('tests').insert([payload]).select('id').single();
        if (error) throw error;
        savedTestId = data?.id || null;
      }

      await recordQuestionUsageForTest({
        testId: savedTestId,
        classIds: payload.class_ids || [],
        questionIds: payload.question_ids || [],
      });
      await fetchWorkspace();
  };

  const handleCreateTest = async (options: CreateTestOptions) => {
      setForgeError(null);
      setIsForging(true); setForgeStep('Synthesizing Assessment...');
      try {
          const questions = await generateQuestionsLogic(options, setForgeStep);
          setForgedResult({ topic: options.topic, questions, sourceOptions: options });
          setIsCreatorOpen(false); 
      } catch (err: any) {
          const msg = err?.message ? String(err.message) : 'Unknown error';
          setForgeError(`Forge failed: ${msg}`);
      } finally { setIsForging(false); setForgeStep(''); }
  };

  const handleSaveTestToSupabase = async (questions: Question[], layoutConfig?: LayoutConfig, updatedTitle?: string) => {
      if (!forgedResult) return;
      setLoadingMessage('Syncing to Cloud...');
      setIsLoadingTest(true);
      try { 
          await commitTestToHub(updatedTitle || forgedResult.topic, questions, 'paper', { layout_config: layoutConfig, sourceOptions: forgedResult.sourceOptions });
          setForgedResult(null); setEditingTestId(null); 
      } catch (error: any) { alert("Failed to save: " + error.message); } finally { setIsLoadingTest(false); }
  };

  const handleTestClick = async (testSummary: any) => {
      setLoadingMessage('Opening Assessment...');
      setIsLoadingTest(true);
      try {
          const { data: test, error } = await supabase.from('tests').select('*').eq('id', testSummary.id).single();
          if (error) throw error;

          if (test.status === 'draft') {
              setIsForging(false); setForgeStep(''); setForgeError(null);
              setIsCreatorOpen(false); setEditingTestId(test.id); setCreatorFolderId(test.folder_id); setEditInitialTopic(test.name);
              const options = test.config?.sourceOptions || test.config;
              if (options) {
                  setEditInitialKnowledgeBaseId(options.knowledgeBaseId ?? undefined);
                  setEditInitialChapters(options.chapters);
                  setEditInitialManualQuestions(test.questions || options.manualQuestions);
                  setEditInitialSettings({ totalQuestions: options.totalQuestions, globalDiff: options.globalDifficultyMix || options.globalDiff, globalTypes: options.globalTypeMix || options.globalTypes, useGlobalDifficulty: options.useGlobalDifficulty, globalFigureCount: options.globalFigureCount, selectionMode: options.selectionMode || (options.manualQuestions ? 'manual' : 'auto') });
                  if (options.mode === 'online-exam' || test.config.mode === 'online-exam') setIsOnlineExamCreatorOpen(true); else setIsCreatorOpen(true);
              }
              return;
          }
          
          const isOnline = test.config?.mode === 'online';
          if (isOnline) setOnlineExamResult({ topic: test.name, questions: test.questions, config: test.config });
          else setForgedResult({ topic: test.name, questions: test.questions, layoutConfig: test.layout_config, sourceOptions: test.config?.sourceOptions });
          setEditingTestId(test.id);
      } catch (e: any) { alert("Failed to load: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleStudentMockStart = async (chapterIds: string[], difficulty: string, type: string) => {
      setIsForging(true);
      setForgeStep('Generating Mock Exam...');
      try {
          const { data: chaptersData } = await supabase.from('chapters').select('id, name, subject_name, class_name, kb_id').in('id', chapterIds);
          if (!chaptersData) throw new Error("Chapters not found");
          const mockKbId = chaptersData[0]?.kb_id ?? null;
          
          const selectedChapters: SelectedChapter[] = chaptersData.map(c => ({
              id: c.id, name: c.name, subjectName: c.subject_name || 'General', className: c.class_name || 'General',
              count: 10, figureCount: 0, difficulty: difficulty as any, source: 'ai', styleCounts: { mcq: 10 },
              visualMode: 'image'
          }));
          
          const totalQ = selectedChapters.length * 10;
          
          const options: CreateTestOptions = {
              mode: 'multi-ai',
              topic: `Mock Test - ${new Date().toLocaleDateString()}`,
              chapters: selectedChapters,
              useGlobalDifficulty: true,
              globalDifficultyMix: { easy: 30, medium: 50, hard: 20 },
              globalTypeMix: { mcq: 100, reasoning: 0, matching: 0, statements: 0 },
              totalQuestions: totalQ,
              selectionMode: 'auto',
              questionType: type as any,
              knowledgeBaseId: mockKbId,
          };
          
          if (difficulty === 'Easy') options.globalDifficultyMix = { easy: 80, medium: 20, hard: 0 };
          else if (difficulty === 'Hard') options.globalDifficultyMix = { easy: 10, medium: 30, hard: 60 };
          
          if (type === 'neet') options.globalTypeMix = { mcq: 70, reasoning: 15, matching: 10, statements: 5 };
          else if (type === 'mcq') options.globalTypeMix = { mcq: 100, reasoning: 0, matching: 0, statements: 0 };
          else if (type === 'reasoning') options.globalTypeMix = { mcq: 0, reasoning: 100, matching: 0, statements: 0 };
          
          const questions = await generateQuestionsLogic(options, setForgeStep);
          setActiveStudentExam({ topic: options.topic, questions });
          
      } catch(e: any) {
          alert("Mock gen failed: " + e.message);
      } finally {
          setIsForging(false);
          setForgeStep('');
      }
  };

  const handleStudentTakeExam = async (test: any) => {
      if (!isOnlineExamAssignment(test)) {
        alert('This assessment is not an online test.');
        return;
      }
      setLoadingMessage('Loading test…');
      setIsLoadingTest(true);
      try {
          const { data, error } = await supabase.from('tests').select('name, questions, config, status').eq('id', test.id).single();
          if (error) throw error;
          if (!isOnlineExamAssignment({ config: data.config, status: data.status })) {
            alert('This assessment is not available as an online test.');
            return;
          }
          const rawQs = Array.isArray(data.questions) ? data.questions : [];
          const safeQs = sanitizeQuestionsForStudentExam(rawQs as Question[]);
          const durationMin = typeof data.config?.duration === 'number' ? data.config.duration : 60;
          setActiveStudentExam({
            testId: test.id,
            topic: data.name,
            questions: safeQs,
            examDurationSeconds: Math.max(300, Math.round(durationMin * 60)),
          });
      } catch (e: any) { alert("Failed to load test: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleStudentViewSolutions = async (test: any) => {
      if (!isOnlineExamAssignment(test)) {
        alert('Solutions for this class test are not shown here.');
        return;
      }
      setLoadingMessage('Fetching Solution Key...');
      setIsLoadingTest(true);
      try {
          const { data, error } = await supabase.from('tests').select('name, questions, config, status').eq('id', test.id).single();
          if (error) throw error;
          if (!isOnlineExamAssignment({ config: data.config, status: data.status })) return;
          setActiveStudentSolution({ topic: data.name, questions: data.questions, showAnswers: data.config?.releaseAnswers });
      } catch (e: any) { alert("Failed to load solutions: " + e.message); } finally { setIsLoadingTest(false); }
  };

  if (!session || showLanding) {
    if (showAuth) {
      return (
        <AuthUI
          onBackHome={() => setShowAuth(false)}
          onDemoLogin={() => supabase.auth.signInWithPassword({ email: 'demo@kiwiteach.com', password: 'password123' })}
          initialMode={initialAuthMode}
          recoveryAccessToken={initialRecoveryAccessToken}
          recoveryRefreshToken={initialRecoveryRefreshToken}
          initialError={initialAuthError}
        />
      );
    }
    return (
      <LandingPage 
        onLoginClick={() => setShowAuth(true)} 
        isLoggedIn={!!session} 
        onDashboardClick={() => setShowLanding(false)} 
      />
    );
  }

  return (
    <PlatformBrandingProvider value={platformTheme}>
    <div className="flex h-screen overflow-hidden font-sans" style={{ backgroundColor: platformTheme.page_background }}>
      <LeftPanel 
        activeView={activeView} 
        setActiveView={setActiveView} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        brandConfig={brandConfig} 
        appRole={appRole}
        onHomeClick={() => setShowLanding(true)}
        onSignOut={() => supabase.auth.signOut()}
      />
      {isSidebarOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-slate-900/45 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <main className="flex-1 h-full overflow-hidden relative">
        <div className="lg:hidden px-4 py-3 border-b border-slate-200 bg-white/90 backdrop-blur-sm flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 grid place-items-center"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-black text-slate-700 truncate">{brandConfig.name}</span>
        </div>
        {isLoadingWorkspace && <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col items-center justify-center"><div className="w-12 h-12 border-4 border-slate-100 rounded-full animate-spin mb-4" style={{ borderTopColor: platformTheme.primary_color }}></div><h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Syncing Hub</h3></div>}
        
        {isLoadingTest && (
            <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 flex flex-col items-center gap-5 transform scale-100 animate-slide-up" style={{ boxShadow: landingTheme.shadow.card }}>
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-50"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{ borderTopColor: platformTheme.primary_color }}></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <iconify-icon icon="mdi:lightning-bolt" className="text-xl animate-pulse" style={{ color: platformTheme.primary_color }} />
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{loadingMessage || 'Processing...'}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Please Wait</p>
                    </div>
                </div>
            </div>
        )}

        {activeView === 'test' && (
          <TestDashboard
            username={session.user.email}
            title="Class tests"
            subtitle="Generate PDFs and OMR layouts"
            institutesList={institutes}
            classesList={orgClasses}
            folders={folders}
            allTests={allTests.filter(
              (t: any) => t.config?.mode !== 'online' && t.config?.mode !== 'online-exam'
            )}
            onAddFolder={handleAddFolder}
            onStartNewTest={handleStartTestCreator}
            onTestClick={handleTestClick}
            onDeleteItem={handleDeleteItem}
            onDuplicateTest={handleDuplicateTest}
            onRenameTest={handleRenameTest}
            onScheduleTest={handleScheduleTest}
            onAssignClasses={handleAssignClasses}
            onMoveTestToFolder={handleMoveTestToFolder}
            onSetEvaluationPending={handleSetEvaluationPending}
            onRevertTestToDraft={handleRevertTestToDraft}
            viewMode={viewMode}
            setViewMode={setViewMode}
            calendarType={calendarType}
            setCalendarType={setCalendarType}
          />
        )}
        {activeView === 'online-exam' && <OnlineExamDashboard username={session.user.email} institutesList={institutes} classesList={orgClasses} folders={folders} allTests={allTests} onAddFolder={handleAddFolder} onStartNewExam={handleStartOnlineExamCreator} onTestClick={handleTestClick} onDeleteItem={handleDeleteItem} onDuplicateTest={handleDuplicateTest} onRenameTest={handleRenameTest} onScheduleTest={handleScheduleTest} onAssignClasses={handleAssignClasses} onMoveTestToFolder={handleMoveTestToFolder} onSetEvaluationPending={handleSetEvaluationPending} onRevertTestToDraft={handleRevertTestToDraft} viewMode={viewMode} setViewMode={setViewMode} calendarType={calendarType} setCalendarType={setCalendarType} />}
        {activeView === 'students' && <StudentDirectory institutesList={institutes} classesList={orgClasses} />}
        {activeView === 'reports' && <ReportsDashboard institutesList={institutes} classesList={orgClasses} />}
        {activeView === 'settings' && <SettingsView brandConfig={brandConfig} onUpdateBranding={handleUpdateBranding} onSignOut={() => supabase.auth.signOut()} userId={session.user.id} onRefresh={refreshOrgData} />}
        {activeView === 'admin' && <AdminView appRole={appRole} userId={session.user.id} onRefreshOrg={refreshOrgData} />}
        {activeView === 'student-online-test' && (
          <StudentOnlineTestDashboard
            availableTests={studentOnlineExamsOnly}
            hasAssignedClass={!!studentClassId}
            onTakeExam={handleStudentTakeExam}
            onViewSolutions={handleStudentViewSolutions}
          />
        )}
        {activeView === 'student-mock-test' && <StudentMockTestDashboard onStartMock={handleStudentMockStart} isLoading={isForging} />}
      </main>
      
      {activeStudentExam && (
          <InteractiveQuizSession 
              questions={activeStudentExam.questions} 
              topic={activeStudentExam.topic}
              testId={activeStudentExam.testId ?? null}
              examDurationSeconds={activeStudentExam.examDurationSeconds}
              onExit={() => setActiveStudentExam(null)} 
          />
      )}

      {activeStudentSolution && (
          <SolutionViewer 
              topic={activeStudentSolution.topic} 
              questions={activeStudentSolution.questions} 
              showAnswers={activeStudentSolution.showAnswers} 
              onClose={() => setActiveStudentSolution(null)} 
          />
      )}

      <NewTestChapterPickerModal
          open={newTestChapterPickerOpen}
          onClose={() => {
              setNewTestChapterPickerOpen(false);
              setPendingNewTestKind(null);
          }}
          onConfirm={handleNewTestChaptersConfirm}
      />

      {isCreatorOpen && (
          <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
              {forgeError && (
                  <div className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] font-medium text-amber-950 shadow-sm" role="alert">
                      <span className="text-center">{forgeError}</span>
                      <button type="button" onClick={() => setForgeError(null)} className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100">Dismiss</button>
                  </div>
              )}
              <div className="min-h-0 flex-1">
                  <TestCreatorView
                      onClose={() => {
                          setIsForging(false);
                          setForgeStep('');
                          setForgeError(null);
                          setIsCreatorOpen(false);
                          setEditInitialKnowledgeBaseId(undefined);
                          setEditInitialTotalTarget(undefined);
                          setEditInitialDistributionMode(undefined);
                          setEditInitialGlobalTypes(undefined);
                          setEditInitialGlobalFigureCount(undefined);
                      }}
                      onStart={handleCreateTest}
                      onSaveDraft={handleSaveDraft}
                      isLoading={isForging}
                      loadingStep={forgeStep}
                      initialChapters={editInitialChapters}
                      initialKnowledgeBaseId={editInitialKnowledgeBaseId ?? null}
                      initialTopic={editInitialTopic}
                      initialManualQuestions={editInitialManualQuestions}
                      initialTotalTarget={editInitialTotalTarget}
                      initialDistributionMode={editInitialDistributionMode}
                      initialGlobalTypes={editInitialGlobalTypes}
                      initialGlobalFigureCount={editInitialGlobalFigureCount}
                  />
              </div>
          </div>
      )}
      {forgedResult && <div className="fixed inset-0 z-[210] bg-white"><QuestionListScreen topic={forgedResult.topic} questions={forgedResult.questions} onRestart={() => setForgedResult(null)} onSave={handleSaveTestToSupabase} onEditBlueprint={handleEditBlueprint} brandConfig={brandConfig} initialLayoutConfig={forgedResult.layoutConfig} sourceOptions={forgedResult.sourceOptions} /></div>}
      {isOnlineExamCreatorOpen && (
          <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
              {forgeError && (
                  <div className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] font-medium text-amber-950 shadow-sm" role="alert">
                      <span className="text-center">{forgeError}</span>
                      <button type="button" onClick={() => setForgeError(null)} className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100">Dismiss</button>
                  </div>
              )}
              <div className="min-h-0 flex-1">
                  <TestCreatorView
                      onClose={() => {
                          setIsForging(false);
                          setForgeStep('');
                          setForgeError(null);
                          setIsOnlineExamCreatorOpen(false);
                          setEditInitialKnowledgeBaseId(undefined);
                          setEditInitialTotalTarget(undefined);
                          setEditInitialDistributionMode(undefined);
                          setEditInitialGlobalTypes(undefined);
                          setEditInitialGlobalFigureCount(undefined);
                      }}
                      onSaveDraft={handleSaveDraft}
                      onStart={async (opts) => {
                          setForgeError(null);
                          setIsForging(true); setForgeStep('Forging test…');
                          try {
                              const qs = await generateQuestionsLogic(opts, setForgeStep);
                              setOnlineExamResult({ topic: opts.topic, questions: qs, config: opts });
                              setIsOnlineExamCreatorOpen(false);
                          } catch (e: any) {
                              const msg = e?.message ? String(e.message) : 'Unknown error';
                              setForgeError(`Forge failed: ${msg}`);
                          } finally { setIsForging(false); setForgeStep(''); }
                      }}
                      isLoading={isForging}
                      loadingStep={forgeStep}
                      initialChapters={editInitialChapters}
                      initialKnowledgeBaseId={editInitialKnowledgeBaseId ?? null}
                      initialTopic={editInitialTopic}
                      initialManualQuestions={editInitialManualQuestions}
                      initialTotalTarget={editInitialTotalTarget}
                      initialDistributionMode={editInitialDistributionMode}
                      initialGlobalTypes={editInitialGlobalTypes}
                      initialGlobalFigureCount={editInitialGlobalFigureCount}
                  />
              </div>
          </div>
      )}
      {onlineExamResult && (
          <div className="fixed inset-0 z-[210] bg-white">
              <OnlineExamScheduler 
                  topic={onlineExamResult.topic} 
                  questions={onlineExamResult.questions} 
                  initialConfig={onlineExamResult.config}
                  onBack={() => setOnlineExamResult(null)} 
                  onSave={async (examData) => {
                      await commitTestToHub(examData.title, examData.questions, 'online', { ...examData, mode: 'online', sourceOptions: onlineExamResult.config?.sourceOptions || onlineExamResult.config });
                      setOnlineExamResult(null); setEditingTestId(null);
                  }} 
                  institutesList={institutes}
                  classesList={orgClasses}
              />
          </div>
      )}
    </div>
    </PlatformBrandingProvider>
  );
};

export default Quiz;