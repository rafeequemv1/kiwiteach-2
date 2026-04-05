/**
 * App roles stored in `public.profiles.role`.
 *
 * Authorization for data and server routes must use Postgres (`public.is_developer()`, RLS, RPCs),
 * not the client-only allowlist below.
 */
export type AppRole = 'developer' | 'teacher' | 'student' | 'school_admin';

export const APP_ROLES: AppRole[] = ['developer', 'teacher', 'student', 'school_admin'];

/**
 * Optional convenience for dashboard routing / showing dev-only nav chrome.
 * Does NOT grant database or API access — assign `profiles.role = 'developer'` via admin tools or SQL.
 */
export const DEVELOPER_EMAIL_ALLOWLIST = ['rafeequemavoor@gmail.com'] as const;

export function normalizeDbRole(raw: string | null | undefined): AppRole | null {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (APP_ROLES.includes(r as AppRole)) return r as AppRole;
  return null;
}

/**
 * Role for UI (tabs, default view): allowlisted email shows as developer in the shell even if DB is still teacher.
 * For permission-sensitive flows, use `profiles.role` from Supabase or RPCs (e.g. `is_developer()`), not this alone.
 */
export function resolveAppRole(email: string | null | undefined, dbRole: string | null | undefined): AppRole {
  const e = (email || '').trim().toLowerCase();
  if (e && DEVELOPER_EMAIL_ALLOWLIST.some((x) => x.toLowerCase() === e)) {
    return 'developer';
  }
  return normalizeDbRole(dbRole) ?? 'student';
}

/** First-time profile row from the client: never `developer` / `school_admin` (those are DB/admin-only). */
export function persistedRoleForNewProfile(userMetaRole: string | null | undefined): 'student' | 'teacher' {
  const r = (userMetaRole || '').trim().toLowerCase();
  if (r === 'teacher') return 'teacher';
  return 'student';
}

export type DashboardView =
  | 'overview'
  | 'test'
  | 'online-exam'
  | 'students'
  | 'reports'
  | 'settings'
  | 'admin'
  | 'student-online-test'
  | 'student-mock-test';

const TEACHER_VIEWS: DashboardView[] = [
  'overview',
  'test',
  'online-exam',
  'students',
  'reports',
  'settings',
  'admin',
];

const STUDENT_VIEWS: DashboardView[] = ['student-online-test', 'student-mock-test'];

const SCHOOL_ADMIN_VIEWS: DashboardView[] = [...TEACHER_VIEWS];

export function viewsAllowedForRole(role: AppRole): DashboardView[] {
  if (role === 'developer') {
    return Array.from(new Set<DashboardView>([...TEACHER_VIEWS, ...STUDENT_VIEWS]));
  }
  if (role === 'teacher') return [...TEACHER_VIEWS];
  if (role === 'student') return [...STUDENT_VIEWS];
  if (role === 'school_admin') return [...SCHOOL_ADMIN_VIEWS];
  return STUDENT_VIEWS;
}

export function canAccessView(role: AppRole, view: string): boolean {
  return viewsAllowedForRole(role).includes(view as DashboardView);
}

export function defaultViewForRole(role: AppRole): DashboardView {
  if (role === 'student') return 'student-online-test';
  if (role === 'school_admin' || role === 'developer' || role === 'teacher') return 'overview';
  return 'student-online-test';
}
