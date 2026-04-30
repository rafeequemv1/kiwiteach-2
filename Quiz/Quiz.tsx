import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../supabase/client';
import { fetchClassesForUser, fetchInstitutesForUser } from '../supabase/orgScope';
import AuthUI from '../supabase/AuthUI';
import LeftPanel from '../Panel/LeftPanel';
import TeacherOverview from '../Teacher/Overview/TeacherOverview';
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
import QuestionBankReviewWorkspace from '../Review/QuestionBankReviewWorkspace';
import LandingPage from '../Landing/LandingPage';
import { appShellTheme, landingTheme } from '../Landing/theme';
import {
  resolveAppRole,
  persistedRoleForNewProfile,
  canAccessView,
  canAccessAdminConsole,
  canAccessQuestionBankReview,
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
  DEFAULT_USER_BRAND_NAME,
  defaultUserBrandingConfig,
} from './types';
import {
  fetchEligibleQuestions,
  isUuid,
  recordQuestionUsageForTest,
} from './services/questionUsageService';
import { mergePaperLayout } from './utils/paperLayoutMerge';
import {
  allocateFigureSlotsByChapter,
  eligibleOversampleLimit,
  figureEligibleOversampleLimit,
  questionHasFigure,
  remainingStylePlanAfterFigures,
  selectQuestionsMaxTopicSpread,
  spreadFigureQuestionsAcrossPaper,
  type BankStyleKey,
} from './services/topicSpreadPick';
import { fetchUserExcludedTopicLabels } from '../services/syllabusService';
import { isOnlineExamAssignment, sanitizeQuestionsForStudentExam } from './services/studentTestService';
import { resolvePlatformBranding } from '../branding/defaults';
import {
  fetchPlatformBrandingRow,
  PLATFORM_BRANDING_UPDATED_EVENT,
} from '../branding/platformBrandingService';
import { PlatformBrandingProvider } from '../branding/PlatformBrandingContext';

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

/** Remember last teacher dashboard section for refresh / return from marketing while logged in. */
const LAST_DASH_SLUG_KEY = 'kiwi_dash_slug_v1';

/** Tailwind lg — sidebar in flow; below this width the nav is a slide-out drawer (closed by default). */
const DASHBOARD_SIDEBAR_LG_MQ = '(min-width: 1024px)';

const VIEW_TO_SLUG: Record<DashboardView, string> = {
  overview: 'overview',
  test: 'paper-tests',
  'online-exam': 'online-exams',
  students: 'students',
  reports: 'reports',
  settings: 'settings',
  admin: 'admin',
  'question-bank-review': 'question-bank-review',
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
  overview: {
    title: 'Overview',
    description: 'Workspace summary, organizations, classes, and tests.',
  },
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
  'question-bank-review': {
    title: 'Question bank review',
    description: 'Review hub questions, flag issues, and save notes.',
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

const NEET_ORGANIC_CHAPTER_HINT_RE =
  /(organic|goc|aromatic|ring|benzene|hydrocarbon|haloalkane|haloarene|alcohol|phenol|ether|aldehyde|ketone|carboxylic|amine|diazonium|reaction)/i;

function isNeetOrganicChemChapter(chapter: SelectedChapter): boolean {
  const subject = (chapter.subjectName || '').trim().toLowerCase();
  if (subject !== 'chemistry') return false;
  return NEET_ORGANIC_CHAPTER_HINT_RE.test((chapter.name || '').trim());
}

function enforceMinimumFigureSlotsForChapters(
  slots: Map<string, number>,
  chapterCounts: Map<string, number>,
  preferredChapterIds: string[],
  minPerPreferred = 1
): Map<string, number> {
  if (preferredChapterIds.length === 0 || minPerPreferred <= 0) return slots;
  const out = new Map(slots);
  const preferredSet = new Set(preferredChapterIds);

  const pickDonor = (receiverId: string): string | null => {
    let bestId: string | null = null;
    let bestSlots = -1;
    for (const [id, assigned] of out.entries()) {
      if (id === receiverId || assigned <= 0) continue;
      // Prefer taking from non-priority chapters; keep preferred chapters at minimum.
      if (preferredSet.has(id) && assigned <= minPerPreferred) continue;
      if (assigned > bestSlots) {
        bestSlots = assigned;
        bestId = id;
      }
    }
    return bestId;
  };

  for (const chapterId of preferredChapterIds) {
    const cap = Math.max(0, chapterCounts.get(chapterId) ?? 0);
    if (cap <= 0) continue;
    const target = Math.min(minPerPreferred, cap);
    while ((out.get(chapterId) ?? 0) < target) {
      const donorId = pickDonor(chapterId);
      if (!donorId) break;
      out.set(donorId, Math.max(0, (out.get(donorId) ?? 0) - 1));
      out.set(chapterId, (out.get(chapterId) ?? 0) + 1);
    }
  }

  return out;
}

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
  const [authIntent, setAuthIntent] = useState<'login' | 'signup'>('login');
  const [activeView, setActiveView] = useState('overview');
  const [appRole, setAppRole] = useState<AppRole>('student');
  const [orgScopeReady, setOrgScopeReady] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(''); // New state for loading text
  const fetchingRef = useRef(false);
  /** If true, run another forced workspace fetch right after the in-flight one finishes (avoids skipping refresh after save). */
  const workspaceForceAfterCurrentRef = useRef(false);
  /** Org class id → bank question UUIDs already used this tab session (enforces no-repeat before/without sync). */
  const classScopedSessionUsedRef = useRef<Map<string, Set<string>>>(new Map());
  const lastFetchTime = useRef<number>(0);
  const didInitRouteRef = useRef(false);
  
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [orgClasses, setOrgClasses] = useState<OrgClass[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allTests, setAllTests] = useState<any[]>([]);
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'icons' | 'list' | 'calendar' | 'kanban'>('icons');
  const [calendarType, setCalendarType] = useState<'month' | 'week' | 'year'>('month');

  const [brandConfig, setBrandConfig] = useState<BrandingConfig>(() => defaultUserBrandingConfig());
  const [platformTheme, setPlatformTheme] = useState(() => resolvePlatformBranding(null));

  const loadPlatformBranding = useCallback(async () => {
    const row = await fetchPlatformBrandingRow();
    setPlatformTheme(resolvePlatformBranding(row));
  }, []);
  const [showLanding, setShowLanding] = useState(false);

  const [dashSidebarLg, setDashSidebarLg] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DASHBOARD_SIDEBAR_LG_MQ).matches
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
  /** Org class id from Class tests dashboard when a class pill is selected — tags synced papers so the class filter shows them. */
  const [creatorHubClassId, setCreatorHubClassId] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [forgeStep, setForgeStep] = useState('');
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [forgedResult, setForgedResult] = useState<{ topic: string, questions: Question[], layoutConfig?: LayoutConfig, sourceOptions: CreateTestOptions } | null>(null);
  /** Paper preview opened from an existing hub row (not a fresh forge) — ResultScreen shows Sync as Saved until edited. */
  const [paperPreviewAlreadySynced, setPaperPreviewAlreadySynced] = useState(false);

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

  const loadProfileAndOrg = async (user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  }) => {
    try {
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
      const metaRole = (user.user_metadata?.role as string | undefined) ?? null;
      const initialRole = persistedRoleForNewProfile(metaRole);
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
    } finally {
      setOrgScopeReady(true);
    }
  };

  const refreshOrgData = () => {
    if (session?.user) void loadProfileAndOrg(session.user);
  };

  // Initialize dashboard view from URL slug, then sessionStorage, then role default (after profile/org load).
  useEffect(() => {
    if (!session?.user || !orgScopeReady || didInitRouteRef.current) return;
    let fromPath = viewFromPathname(window.location.pathname);
    if (!fromPath) {
      try {
        const slug = sessionStorage.getItem(LAST_DASH_SLUG_KEY);
        if (slug && SLUG_TO_VIEW[slug] && canAccessView(appRole, SLUG_TO_VIEW[slug])) {
          fromPath = SLUG_TO_VIEW[slug];
        }
      } catch {
        /* ignore storage errors */
      }
    }
    const fallback = defaultViewForRole(appRole);
    const nextView = fromPath && canAccessView(appRole, fromPath) ? fromPath : fallback;
    setActiveView(nextView);
    didInitRouteRef.current = true;
  }, [session?.user, appRole, orgScopeReady]);

  useEffect(() => {
    if (!canAccessView(appRole, activeView)) {
      setActiveView(defaultViewForRole(appRole));
    }
  }, [appRole, activeView]);

  // Logged-out users should not keep /dashboard/* in the address bar while the marketing shell is shown.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (session) return;
    const path = window.location.pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    const dash = DASHBOARD_BASE.replace(/\/+$/, '');
    if (path === dash || path.startsWith(`${dash}/`)) {
      window.history.replaceState(null, '', '/');
    }
  }, [session]);

  // Keep URL slug + basic SEO tags in sync with active dashboard view.
  useEffect(() => {
    if (!session?.user || showLanding) return;
    const view = activeView as DashboardView;
    if (!VIEW_TO_SLUG[view]) return;
    try {
      sessionStorage.setItem(LAST_DASH_SLUG_KEY, VIEW_TO_SLUG[view]);
    } catch {
      /* ignore */
    }
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
  }, [session?.user, activeView, showLanding]);

  // Handle browser back/forward between dashboard slugs.
  useEffect(() => {
    const onPopState = () => {
      const v = viewFromPathname(window.location.pathname);
      if (v && canAccessView(appRole, v)) setActiveView(v);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [appRole]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(DASHBOARD_SIDEBAR_LG_MQ);
    const sync = () => {
      setDashSidebarLg(mq.matches);
      setMobileDrawerOpen(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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
        setOrgScopeReady(false);
        didInitRouteRef.current = false;
        classScopedSessionUsedRef.current.clear();
        setBrandConfig(defaultUserBrandingConfig());
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchBranding = async (userId: string) => {
    const { data, error } = await supabase
      .from('branding_settings')
      .select('brand_name, logo_url, show_on_test, show_on_omr')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('branding_settings:', error.message);
      setBrandConfig(defaultUserBrandingConfig());
      return;
    }
    if (!data) {
      setBrandConfig(defaultUserBrandingConfig());
      return;
    }
    const name = (data.brand_name && String(data.brand_name).trim()) || DEFAULT_USER_BRAND_NAME;
    setBrandConfig({
      name,
      logo: data.logo_url || null,
      showOnTest: data.show_on_test ?? true,
      showOnOmr: data.show_on_omr ?? true,
    });
  };

  const handleUpdateBranding = async (newConfig: BrandingConfig) => {
    const name = (newConfig.name || '').trim() || DEFAULT_USER_BRAND_NAME;
    const normalized: BrandingConfig = { ...newConfig, name };
    setBrandConfig(normalized);
    if (session?.user) {
      await supabase.from('branding_settings').upsert({
        user_id: session.user.id,
        brand_name: name,
        logo_url: normalized.logo,
        show_on_test: normalized.showOnTest,
        show_on_omr: normalized.showOnOmr,
        updated_at: new Date().toISOString(),
      });
    }
  };

  const fetchWorkspace = async (currentUser?: any, force?: boolean) => {
    const now = Date.now();
    if (fetchingRef.current) {
      if (force) workspaceForceAfterCurrentRef.current = true;
      return;
    }
    if (!force && now - lastFetchTime.current < 2000) return;

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
      if (workspaceForceAfterCurrentRef.current) {
        workspaceForceAfterCurrentRef.current = false;
        void fetchWorkspace(currentUser ?? session?.user, true);
      }
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

  const parseStartNewTestOptions = (
    options?: string | { initialScheduleDate?: string; hubClassId?: string | null }
  ): { hubClassId: string | null } => {
    if (options == null) return { hubClassId: null };
    if (typeof options === 'string') return { hubClassId: null };
    return { hubClassId: options.hubClassId ?? null };
  };

  const handleStartTestCreator = (
    folderId: string | null,
    options?: string | { initialScheduleDate?: string; hubClassId?: string | null }
  ) => {
      const { hubClassId } = parseStartNewTestOptions(options);
      setEditInitialChapters(undefined);
      setEditInitialTopic(undefined); setEditInitialSettings(undefined); setEditInitialManualQuestions(undefined);
      setEditInitialKnowledgeBaseId(undefined);
      setEditInitialTotalTarget(undefined);
      setEditInitialDistributionMode(undefined);
      setEditInitialGlobalTypes(undefined);
      setEditInitialGlobalFigureCount(undefined);
      setEditingTestId(null); setCreatorFolderId(folderId);
      setCreatorHubClassId(hubClassId && isUuid(hubClassId) ? hubClassId : null);
      setIsForging(false); setForgeStep(''); setForgeError(null);
      setForgedResult(null); setOnlineExamResult(null);
      setPaperPreviewAlreadySynced(false);
      setPendingNewTestKind('paper');
      setNewTestChapterPickerOpen(true);
  };
  const handleStartOnlineExamCreator = (
    folderId: string | null,
    options?: string | { initialScheduleDate?: string; hubClassId?: string | null }
  ) => {
      const { hubClassId } = parseStartNewTestOptions(options);
      setEditInitialChapters(undefined);
      setEditInitialTopic(undefined); setEditInitialSettings(undefined); setEditInitialManualQuestions(undefined);
      setEditInitialKnowledgeBaseId(undefined);
      setEditInitialTotalTarget(undefined);
      setEditInitialDistributionMode(undefined);
      setEditInitialGlobalTypes(undefined);
      setEditInitialGlobalFigureCount(undefined);
      setEditingTestId(null); setCreatorFolderId(folderId);
      setCreatorHubClassId(hubClassId && isUuid(hubClassId) ? hubClassId : null);
      setIsForging(false); setForgeStep(''); setForgeError(null);
      setForgedResult(null); setOnlineExamResult(null);
      setPaperPreviewAlreadySynced(false);
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
        setEditInitialTotalTarget(
            typeof options.totalQuestions === 'number' ? options.totalQuestions : questions.length
        );
        setEditInitialDistributionMode(
            Array.isArray(options.chapters) && options.chapters[0]?.selectionMode === 'percent' ? 'percent' : 'count'
        );
        setEditInitialGlobalTypes(options.globalTypeMix);
        setEditInitialGlobalFigureCount(
            typeof options.globalFigureCount === 'number' ? options.globalFigureCount : 0
        );
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
            else {
              chaptersMap.set(q.sourceChapterId, {
                id: q.sourceChapterId,
                name: q.sourceChapterName || 'Unknown',
                subjectName: q.sourceSubjectName || 'Unknown',
                biology_branch:
                  q.sourceBiologyBranch === 'botany' || q.sourceBiologyBranch === 'zoology'
                    ? q.sourceBiologyBranch
                    : null,
                className: 'Unknown',
                count: 1,
                figureCount: 0,
                difficulty: 'Global',
                source: 'db',
                styleCounts: { mcq: 1 },
                selectionMode: 'count',
                visualMode: 'image',
              });
            }
        });
        setEditInitialChapters(Array.from(chaptersMap.values()));
        setEditInitialTopic(forgedResult?.topic || 'Untitled');
        setEditInitialSettings({ totalQuestions: questions.length, selectionMode: 'manual' });
        setEditInitialManualQuestions(questions);
    }
    setForgeError(null);
    setIsCreatorOpen(true);
    setForgedResult(null);
    setPaperPreviewAlreadySynced(false);
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

  const generateQuestionsLogic = async (options: CreateTestOptions, setStatus: (s: string) => void) => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      let excludedTopicLabelsNormalized: string[] = [];
      let flaggedQuestionIdsForUser: string[] = [];
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
          try {
            const { data: flaggedRows, error: flaggedErr } = await supabase
              .from('out_of_syllabus_question_flags')
              .select('question_id')
              .eq('flagged_by', uid)
              .eq('exam_tag', 'neet');
            if (flaggedErr) {
              console.warn('Flag exclusion preload failed', flaggedErr.message);
            } else {
              flaggedQuestionIdsForUser = ((flaggedRows || []) as { question_id: string | null }[])
                .map((r) => r.question_id || '')
                .filter((id): id is string => isUuid(id));
            }
          } catch (e) {
            console.warn('Flag exclusion preload threw', e);
          }
      }
      
      const manualQs = options.manualQuestions || [];
      let finalQuestions: Question[] = [...manualQs];

      const effectiveClassIdForBank: string | null =
        options.targetClassId && isUuid(String(options.targetClassId))
          ? String(options.targetClassId)
          : creatorHubClassId && isUuid(creatorHubClassId)
            ? creatorHubClassId
            : null;

      const sessionUsedExclude: string[] = effectiveClassIdForBank
        ? Array.from(classScopedSessionUsedRef.current.get(effectiveClassIdForBank) ?? [])
        : [];

      const chaptersForBank = options.chapters.map((c) => ({ ...c, source: 'db' as const }));
      // Spread figure quota across chapters (one per chapter before seconds) when template asks for many figures.
      const initialFigureSlotsByChapter = allocateFigureSlotsByChapter(
        chaptersForBank.map((c) => ({ id: c.id, count: c.count || 0 })),
        options.globalFigureCount ?? 0
      );
      const organicChapterIds =
        options.isNeet && (options.globalFigureCount ?? 0) > 0
          ? chaptersForBank.filter(isNeetOrganicChemChapter).map((c) => c.id)
          : [];
      const chapterCountMap = new Map(chaptersForBank.map((c) => [c.id, Math.max(0, c.count || 0)]));
      const figureSlotsByChapter = enforceMinimumFigureSlotsForChapters(
        initialFigureSlotsByChapter,
        chapterCountMap,
        organicChapterIds,
        1
      );

      for (const chap of chaptersForBank) {
          const manualForThisChap = manualQs.filter(q => q.sourceChapterId === chap.id);
          const targetCount = chap.count || 0;
          
          const neededFromBank = Math.max(0, targetCount - manualForThisChap.length);
          if (neededFromBank <= 0) continue;

          setStatus(`Loading ${neededFromBank} question(s) from the bank for ${chap.name}…`);
          let newBatch: Question[] = [];

          {
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
              const baseEligibleArgs = {
                classId: effectiveClassIdForBank,
                chapterId: chap.id,
                difficulty: chap.difficulty === 'Global' ? null : chap.difficulty,
                allowRepeats: !!options.allowPastQuestions,
                includeUsedQuestionIds: options.includeUsedQuestionIds || [],
                excludedTopicLabelsNormalized: excludedTopicLabelsNormalized,
              } as const;

              const attachChap = (bq: Question) => ({
                ...bq,
                sourceChapterName: bq.sourceChapterName || chap.name,
              });

              const figureSlotRaw = figureSlotsByChapter.get(chap.id) ?? 0;
              const manualFigN = manualForThisChap.filter(questionHasFigure).length;
              const figCap = Math.max(0, Math.min(neededFromBank, figureSlotRaw - manualFigN));

              const excludeBase = [...sessionUsedExclude, ...currentIds, ...flaggedQuestionIdsForUser];

              const pickFigureSlice = async (): Promise<Question[]> => {
                if (figCap <= 0) return [];
                const pool = await fetchEligibleQuestions({
                  ...baseEligibleArgs,
                  excludeIds: excludeBase,
                  limit: figureEligibleOversampleLimit(figCap),
                  requireFigure: true,
                  questionType: null,
                });
                const picked = selectQuestionsMaxTopicSpread(pool, figCap);
                // Shortfall is filled with non-figure questions here; a later pass swaps in figures from chapters that have them in the bank.
                return picked.map(attachChap);
              };

              const figSlice = await pickFigureSlice();

              if (usePerStyle) {
                const planFull = normalizeStylePlan(chap.styleCounts, neededFromBank) as Record<BankStyleKey, number>;
                const rem = neededFromBank - figSlice.length;
                const planRem = remainingStylePlanAfterFigures(planFull, figSlice, rem);
                const collected: Question[] = [...figSlice];

                for (const qt of styleKeys) {
                  const want = planRem[qt];
                  if (want <= 0) continue;
                  const exclude = [...excludeBase, ...collected.map((q) => q.originalId || q.id).filter(isUuid)];
                  const pool = await fetchEligibleQuestions({
                    ...baseEligibleArgs,
                    questionType: qt,
                    excludeIds: exclude,
                    limit: eligibleOversampleLimit(want),
                  });
                  const nonFig = pool.filter((q) => !questionHasFigure(q));
                  const picked = selectQuestionsMaxTopicSpread(nonFig, want);
                  collected.push(...picked.map(attachChap));
                }

                let still = neededFromBank - collected.length;
                if (still > 0) {
                  const exclude = [...excludeBase, ...collected.map((q) => q.originalId || q.id).filter(isUuid)];
                  const fillerPool = await fetchEligibleQuestions({
                    ...baseEligibleArgs,
                    excludeIds: exclude,
                    limit: eligibleOversampleLimit(still),
                  });
                  const fillerPick = selectQuestionsMaxTopicSpread(
                    fillerPool.filter((q) => !questionHasFigure(q)),
                    still
                  );
                  collected.push(...fillerPick.map(attachChap));
                }
                newBatch = collected.slice(0, neededFromBank);
              } else {
                const rem = neededFromBank - figSlice.length;
                let rest: Question[] = [];
                if (rem > 0) {
                  const exclude = [...excludeBase, ...figSlice.map((q) => q.originalId || q.id).filter(isUuid)];
                  const pool = await fetchEligibleQuestions({
                    ...baseEligibleArgs,
                    excludeIds: exclude,
                    limit: eligibleOversampleLimit(rem),
                  });
                  const nonFig = pool.filter((q) => !questionHasFigure(q));
                  rest = selectQuestionsMaxTopicSpread(nonFig, rem).map(attachChap);
                }
                newBatch = [...figSlice, ...rest];
              }

          }

          if (newBatch.length < neededFromBank) {
              const found = newBatch.length;
              const need = neededFromBank;
              if (found === 0) {
                  throw new Error(
                      `No questions found in the question bank for “${chap.name}” with the current filters (difficulty, question types, repeat rules, or topic exclusions). Try different settings or another chapter, or ask your admin to add questions to the bank.`
                  );
              }
              throw new Error(
                  `Only ${found} of ${need} questions are available in the bank for “${chap.name}”. Reduce the count for this chapter, adjust filters, allow past questions, or ask your admin to add more questions.`
              );
          }

          const enriched = newBatch.map((q) => ({
            ...q,
            sourceChapterId: q.sourceChapterId || chap.id,
            sourceChapterName: q.sourceChapterName || chap.name,
            sourceSubjectName: q.sourceSubjectName || chap.subjectName,
            sourceBiologyBranch:
              q.sourceBiologyBranch === 'botany' || q.sourceBiologyBranch === 'zoology'
                ? q.sourceBiologyBranch
                : chap.biology_branch === 'botany' || chap.biology_branch === 'zoology'
                  ? chap.biology_branch
                  : q.sourceBiologyBranch ?? null,
          }));
          finalQuestions = [...finalQuestions, ...enriched];
      }

      const totalQuestionSlots = chaptersForBank.reduce((s, c) => s + (c.count || 0), 0);
      const rawGlobalFig = options.globalFigureCount ?? 0;
      const targetGlobalFig =
        totalQuestionSlots <= 0
          ? 0
          : Math.max(0, Math.min(Math.floor(Number(rawGlobalFig)) || 0, totalQuestionSlots));
      let needMoreFig =
        targetGlobalFig - finalQuestions.filter(questionHasFigure).length;
      const shuffleChaptersLocal = <T,>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const maxFigRedistIters = Math.min(
        400,
        Math.max(needMoreFig * Math.max(chaptersForBank.length, 1) * 4, 48)
      );
      let figRedistIter = 0;
      while (needMoreFig > 0 && figRedistIter < maxFigRedistIters) {
        figRedistIter += 1;
        let progressed = false;
        for (const chap of shuffleChaptersLocal(chaptersForBank)) {
          if (needMoreFig <= 0) break;
          const swapIdx = finalQuestions.findIndex(
            (q, i) =>
              i >= manualQs.length &&
              (q.sourceChapterId || '') === chap.id &&
              !questionHasFigure(q)
          );
          if (swapIdx < 0) continue;

          const currentIds = finalQuestions
            .map((q) => q.originalId || q.id)
            .filter((id): id is string => isUuid(id));

          const baseArgs = {
            classId: effectiveClassIdForBank,
            chapterId: chap.id,
            difficulty: chap.difficulty === 'Global' ? null : chap.difficulty,
            allowRepeats: !!options.allowPastQuestions,
            includeUsedQuestionIds: options.includeUsedQuestionIds || [],
            excludedTopicLabelsNormalized,
          } as const;

          const excludeBase = [...sessionUsedExclude, ...currentIds, ...flaggedQuestionIdsForUser];
          const pool = await fetchEligibleQuestions({
            ...baseArgs,
            excludeIds: excludeBase,
            limit: figureEligibleOversampleLimit(1),
            requireFigure: true,
            questionType: null,
          });
          const picked = selectQuestionsMaxTopicSpread(pool, 1);
          if (picked.length < 1) continue;

          const rawReplacement = {
            ...picked[0],
            sourceChapterName: picked[0].sourceChapterName || chap.name,
          };
          const replacement = {
            ...rawReplacement,
            sourceChapterId: rawReplacement.sourceChapterId || chap.id,
            sourceChapterName: rawReplacement.sourceChapterName || chap.name,
            sourceSubjectName: rawReplacement.sourceSubjectName || chap.subjectName,
            sourceBiologyBranch:
              rawReplacement.sourceBiologyBranch === 'botany' || rawReplacement.sourceBiologyBranch === 'zoology'
                ? rawReplacement.sourceBiologyBranch
                : chap.biology_branch === 'botany' || chap.biology_branch === 'zoology'
                  ? chap.biology_branch
                  : rawReplacement.sourceBiologyBranch ?? null,
          };

          finalQuestions = [
            ...finalQuestions.slice(0, swapIdx),
            replacement,
            ...finalQuestions.slice(swapIdx + 1),
          ];
          needMoreFig -= 1;
          progressed = true;
          setStatus(`Meeting figure target: swapped in a figure from “${chap.name}”…`);
          break;
        }
        if (!progressed) break;
      }

      const manualPrefixLen = manualQs.length;
      finalQuestions = [
        ...finalQuestions.slice(0, manualPrefixLen),
        ...spreadFigureQuestionsAcrossPaper(finalQuestions.slice(manualPrefixLen)),
      ];

      if (effectiveClassIdForBank) {
        const acc =
          classScopedSessionUsedRef.current.get(effectiveClassIdForBank) ?? new Set<string>();
        for (const q of finalQuestions) {
          const id = q.originalId || q.id;
          if (isUuid(id)) acc.add(id);
        }
        classScopedSessionUsedRef.current.set(effectiveClassIdForBank, acc);
      }

      return finalQuestions;
  };

  /** Class list on the row + usage RPC: explicit classIds, else merge creator target + dashboard org class, else [] on insert only. */
  const resolveClassIdsForCommit = (
    safeConfig: Record<string, unknown>,
    isUpdate: boolean
  ): string[] | undefined => {
    const explicit = safeConfig.classIds;
    if (Array.isArray(explicit) && explicit.length > 0) {
      return [...new Set(explicit.map(String).filter((id) => isUuid(id)))];
    }
    const so = safeConfig.sourceOptions as CreateTestOptions | undefined;
    const merged = new Set<string>();
    if (so?.targetClassId && isUuid(String(so.targetClassId))) {
      merged.add(String(so.targetClassId));
    }
    if (so?.assignedOrgClassId && isUuid(String(so.assignedOrgClassId))) {
      merged.add(String(so.assignedOrgClassId));
    }
    if (merged.size > 0) {
      return [...merged];
    }
    if (!isUpdate) return [];
    return undefined;
  };

  const commitTestToHub = async (topicName: string, questions: Question[], mode: 'paper' | 'online', extraConfig: any = {}) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Auth required.");

      // Critical: Sanitize all strings before inserting into Postgres
      const safeQuestions = sanitizeForPostgres(questions);
      const safeConfig = sanitizeForPostgres(extraConfig);
      const safeTopicName = sanitizeForPostgres(topicName);

      const isUpdate = !!editingTestId;
      let resolvedClassIds = resolveClassIdsForCommit(safeConfig, isUpdate);
      if (!isUpdate && creatorHubClassId && isUuid(creatorHubClassId)) {
        resolvedClassIds = [...new Set([...(resolvedClassIds ?? []), creatorHubClassId])].filter(isUuid);
      }

      const payload: Record<string, unknown> = { 
          name: safeTopicName || 'New Assessment', folder_id: creatorFolderId, user_id: user.id, 
          questions: safeQuestions.map((q: any) => JSON.parse(JSON.stringify(q))), 
          question_ids: safeQuestions.map((q: any) => q.id || '').filter((id: string) => id !== ''), 
          config: { ...safeConfig, totalQuestions: safeQuestions.length, mode: mode }, 
          layout_config: safeConfig.layout_config || {}, 
          status: mode === 'online' ? 'scheduled' : 'generated', 
          question_count: safeQuestions.length, 
          scheduled_at: safeConfig.scheduledAt || null, 
      };
      if (resolvedClassIds !== undefined) {
        payload.class_ids = resolvedClassIds;
      }

      let savedTestId = editingTestId || null;
      if (editingTestId) {
        const { error } = await supabase.from('tests').update(payload).eq('id', editingTestId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('tests').insert([payload]).select('id').single();
        if (error) throw error;
        savedTestId = data?.id || null;
      }

      let usageClassIds: string[] =
        resolvedClassIds !== undefined ? resolvedClassIds : [];
      if (resolvedClassIds === undefined && savedTestId) {
        const { data: row } = await supabase.from('tests').select('class_ids').eq('id', savedTestId).maybeSingle();
        usageClassIds = Array.isArray(row?.class_ids) ? row.class_ids.filter((id: unknown) => isUuid(String(id))).map(String) : [];
      }

      await recordQuestionUsageForTest({
        testId: savedTestId,
        classIds: usageClassIds,
        questionIds: (payload.question_ids as string[]) || [],
      });
      await fetchWorkspace(session?.user ?? undefined, true);
  };

  const handleCreateTest = async (options: CreateTestOptions) => {
      setForgeError(null);
      setIsForging(true); setForgeStep('Synthesizing Assessment...');
      try {
          const questions = await generateQuestionsLogic(options, setForgeStep);
          setPaperPreviewAlreadySynced(false);
          setForgedResult({
            topic: options.topic,
            questions,
            sourceOptions: {
              ...options,
              assignedOrgClassId:
                creatorHubClassId && isUuid(creatorHubClassId) ? creatorHubClassId : null,
            },
            layoutConfig: mergePaperLayout(undefined),
          });
          setIsCreatorOpen(false); 
      } catch (err: any) {
          const msg = err?.message ? String(err.message) : 'Unknown error';
          setForgeError(`Forge failed: ${msg}`);
      } finally { setIsForging(false); setForgeStep(''); }
  };

  const handleSaveTestToSupabase = async (questions: Question[], layoutConfig?: LayoutConfig, updatedTitle?: string) => {
      if (!forgedResult) {
        alert('Nothing to sync — close this screen and generate the test again.');
        return;
      }
      setLoadingMessage('Syncing to Cloud...');
      setIsLoadingTest(true);
      try { 
          await commitTestToHub(updatedTitle || forgedResult.topic, questions, 'paper', { layout_config: layoutConfig, sourceOptions: forgedResult.sourceOptions });
          setForgedResult(null); setEditingTestId(null);
          setPaperPreviewAlreadySynced(false);
          setCreatorHubClassId(null);
      } catch (error: any) { alert("Failed to save: " + error.message); } finally { setIsLoadingTest(false); }
  };

  const handleTestClick = async (testSummary: any) => {
      setLoadingMessage('Opening Assessment...');
      setIsLoadingTest(true);
      try {
          const { data: test, error } = await supabase.from('tests').select('*').eq('id', testSummary.id).single();
          if (error) throw error;

          if (test.status === 'draft') {
              setPaperPreviewAlreadySynced(false);
              setIsForging(false); setForgeStep(''); setForgeError(null);
              setIsCreatorOpen(false); setEditingTestId(test.id); setCreatorFolderId(test.folder_id); setEditInitialTopic(test.name);
              const options = test.config?.sourceOptions || test.config;
              if (options) {
                  setEditInitialKnowledgeBaseId(options.knowledgeBaseId ?? undefined);
                  setEditInitialChapters(options.chapters);
                  setEditInitialManualQuestions(test.questions || options.manualQuestions);
                  setEditInitialTotalTarget(
                      typeof options.totalQuestions === 'number' ? options.totalQuestions : undefined
                  );
                  setEditInitialDistributionMode(
                      Array.isArray(options.chapters) && options.chapters[0]?.selectionMode === 'percent'
                          ? 'percent'
                          : 'count'
                  );
                  setEditInitialGlobalTypes(options.globalTypeMix || options.globalTypes);
                  setEditInitialGlobalFigureCount(
                      typeof options.globalFigureCount === 'number' ? options.globalFigureCount : 0
                  );
                  setEditInitialSettings({ totalQuestions: options.totalQuestions, globalDiff: options.globalDifficultyMix || options.globalDiff, globalTypes: options.globalTypeMix || options.globalTypes, useGlobalDifficulty: options.useGlobalDifficulty, globalFigureCount: options.globalFigureCount, selectionMode: options.selectionMode || (options.manualQuestions ? 'manual' : 'auto') });
                  if (options.mode === 'online-exam' || test.config.mode === 'online-exam') setIsOnlineExamCreatorOpen(true); else setIsCreatorOpen(true);
              }
              return;
          }
          
          const isOnline = test.config?.mode === 'online';
          if (isOnline) {
            setPaperPreviewAlreadySynced(false);
            setOnlineExamResult({ topic: test.name, questions: test.questions, config: test.config });
          } else {
            setPaperPreviewAlreadySynced(true);
            setForgedResult({
              topic: test.name,
              questions: test.questions,
              layoutConfig: mergePaperLayout(test.layout_config),
              sourceOptions: test.config?.sourceOptions,
            });
          }
          setEditingTestId(test.id);
      } catch (e: any) { alert("Failed to load: " + e.message); } finally { setIsLoadingTest(false); }
  };

  const handleStudentMockStart = async (chapterIds: string[], difficulty: string, type: string) => {
      setIsForging(true);
      setForgeStep('Generating Mock Exam...');
      try {
          const { data: chaptersData } = await supabase
              .from('chapters')
              .select('id, name, subject_name, class_name, kb_id, biology_branch')
              .in('id', chapterIds);
          if (!chaptersData) throw new Error("Chapters not found");
          const mockKbId = chaptersData[0]?.kb_id ?? null;
          const perChapter = 10;

          const options: CreateTestOptions = {
              mode: 'multi-ai',
              topic: `Mock Test - ${new Date().toLocaleDateString()}`,
              chapters: [],
              useGlobalDifficulty: true,
              globalDifficultyMix: { easy: 30, medium: 50, hard: 20 },
              globalTypeMix: { mcq: 100, reasoning: 0, matching: 0, statements: 0 },
              totalQuestions: chaptersData.length * perChapter,
              selectionMode: 'auto',
              questionType: type as any,
              knowledgeBaseId: mockKbId,
          };

          if (difficulty === 'Easy') options.globalDifficultyMix = { easy: 80, medium: 20, hard: 0 };
          else if (difficulty === 'Hard') options.globalDifficultyMix = { easy: 10, medium: 30, hard: 60 };

          if (type === 'neet') options.globalTypeMix = { mcq: 70, reasoning: 15, matching: 10, statements: 5 };
          else if (type === 'mcq') options.globalTypeMix = { mcq: 100, reasoning: 0, matching: 0, statements: 0 };
          else if (type === 'reasoning') options.globalTypeMix = { mcq: 0, reasoning: 100, matching: 0, statements: 0 };

          const mix = options.globalTypeMix;
          const mockStyleKeys = ['mcq', 'reasoning', 'matching', 'statements'] as const;
          const scaled = mockStyleKeys.map((k) => Math.max(0, Math.round((mix[k] / 100) * perChapter)));
          let mixSum = scaled.reduce((a, b) => a + b, 0);
          let mixDiff = perChapter - mixSum;
          let mi = 0;
          while (mixDiff !== 0 && mi < 200) {
              const j = mi % mockStyleKeys.length;
              if (mixDiff > 0) {
                  scaled[j] += 1;
                  mixDiff -= 1;
              } else if (scaled[j] > 0) {
                  scaled[j] -= 1;
                  mixDiff += 1;
              }
              mi += 1;
          }
          const mockStyleCounts = Object.fromEntries(mockStyleKeys.map((k, idx) => [k, scaled[idx]])) as Record<
              string,
              number
          >;

          options.chapters = chaptersData.map((c: any) => ({
              id: c.id,
              name: c.name,
              subjectName: c.subject_name || 'General',
              biology_branch:
                c.biology_branch === 'botany' || c.biology_branch === 'zoology' ? c.biology_branch : null,
              className: c.class_name || 'General',
              count: perChapter,
              figureCount: 0,
              difficulty: difficulty as SelectedChapter['difficulty'],
              source: 'db',
              useStyleMix: true,
              styleCounts: { ...mockStyleCounts },
              visualMode: 'text',
          }));

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
      const authUIInitialMode =
        initialAuthMode === 'reset-password' || initialAuthMode === 'forgot-password'
          ? initialAuthMode
          : authIntent;
      return (
        <AuthUI
          key={authUIInitialMode}
          onBackHome={() => setShowAuth(false)}
          onDemoLogin={() => supabase.auth.signInWithPassword({ email: 'demo@kiwiteach.com', password: 'password123' })}
          initialMode={authUIInitialMode}
          recoveryAccessToken={initialRecoveryAccessToken}
          recoveryRefreshToken={initialRecoveryRefreshToken}
          initialError={initialAuthError}
        />
      );
    }
    return (
      <LandingPage
        onLoginClick={() => {
          setAuthIntent('login');
          setShowAuth(true);
        }}
        onSignUpClick={() => {
          setAuthIntent('signup');
          setShowAuth(true);
        }}
        isLoggedIn={!!session}
        onDashboardClick={() => setShowLanding(false)}
      />
    );
  }

  return (
    <PlatformBrandingProvider value={platformTheme}>
    <div className="relative flex h-screen min-w-0 overflow-hidden font-sans" style={{ backgroundColor: platformTheme.page_background }}>
      {!dashSidebarLg && mobileDrawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[44] bg-black/45 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      <div
        className={[
          'flex h-full min-h-0 shrink-0 transition-transform duration-200 ease-out',
          dashSidebarLg
            ? 'relative'
            : 'fixed left-0 top-0 z-[45] shadow-xl max-lg:pointer-events-auto',
          !dashSidebarLg && !mobileDrawerOpen ? 'max-lg:-translate-x-full max-lg:pointer-events-none' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LeftPanel
          activeView={activeView}
          setActiveView={setActiveView}
          brandConfig={brandConfig}
          appRole={appRole}
          onHomeClick={() => {
            setShowLanding(true);
            window.history.pushState(null, '', '/');
            if (!dashSidebarLg) setMobileDrawerOpen(false);
          }}
          onSignOut={() => supabase.auth.signOut()}
          onAfterNavClick={() => {
            if (!dashSidebarLg) setMobileDrawerOpen(false);
          }}
        />
      </div>

      <main
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${!dashSidebarLg ? 'max-lg:pt-14' : ''}`}
      >
        {!dashSidebarLg && (
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((o) => !o)}
            className="fixed left-3 top-3 z-[46] flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200/90 bg-white/95 text-zinc-800 shadow-sm backdrop-blur-sm lg:hidden"
            aria-expanded={mobileDrawerOpen}
            aria-label={mobileDrawerOpen ? 'Close menu' : 'Open menu'}
          >
            <iconify-icon
              icon={mobileDrawerOpen ? 'mdi:close' : 'mdi:menu'}
              className="h-6 w-6"
            />
          </button>
        )}
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

        {activeView === 'overview' && (
          <TeacherOverview
            email={session.user.email}
            institutes={institutes}
            classes={orgClasses}
            allTests={allTests}
            onNavigate={(v) => setActiveView(v)}
          />
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
        {activeView === 'admin' && canAccessAdminConsole(appRole) && (
          <AdminView appRole={appRole} userId={session.user.id} onRefreshOrg={refreshOrgData} />
        )}
        {activeView === 'question-bank-review' && canAccessQuestionBankReview(appRole) && (
          <QuestionBankReviewWorkspace />
        )}
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
      {forgedResult && (
        <div className="fixed inset-0 z-[210] bg-white">
          <QuestionListScreen
            topic={forgedResult.topic}
            questions={forgedResult.questions}
            onRestart={() => {
              setForgedResult(null);
              setPaperPreviewAlreadySynced(false);
            }}
            onSave={handleSaveTestToSupabase}
            onEditBlueprint={handleEditBlueprint}
            brandConfig={brandConfig}
            initialLayoutConfig={mergePaperLayout(forgedResult.layoutConfig)}
            sourceOptions={forgedResult.sourceOptions}
            initialSaveSynced={paperPreviewAlreadySynced}
          />
        </div>
      )}
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
                              setOnlineExamResult({
                                topic: opts.topic,
                                questions: qs,
                                config: {
                                  ...opts,
                                  assignedOrgClassId:
                                    creatorHubClassId && isUuid(creatorHubClassId)
                                      ? creatorHubClassId
                                      : null,
                                },
                              });
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
                      setCreatorHubClassId(null);
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