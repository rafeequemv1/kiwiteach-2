/**
 * App roles (stored in public.profiles.role; developer also forced by email allowlist).
 */
export type AppRole = 'developer' | 'teacher' | 'student' | 'school_admin';

export const APP_ROLES: AppRole[] = ['developer', 'teacher', 'student', 'school_admin'];

/** Full access — UI + optional DB checks */
export const DEVELOPER_EMAIL_ALLOWLIST = ['rafeequemavoor@gmail.com'] as const;

export function normalizeDbRole(raw: string | null | undefined): AppRole | null {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (APP_ROLES.includes(r as AppRole)) return r as AppRole;
  return null;
}

/**
 * Effective role: allowlisted email → developer; else DB role; default student.
 */
export function resolveAppRole(email: string | null | undefined, dbRole: string | null | undefined): AppRole {
  const e = (email || '').trim().toLowerCase();
  if (e && DEVELOPER_EMAIL_ALLOWLIST.some((x) => x.toLowerCase() === e)) {
    return 'developer';
  }
  return normalizeDbRole(dbRole) ?? 'student';
}

export type DashboardView =
  | 'test'
  | 'online-exam'
  | 'students'
  | 'reports'
  | 'settings'
  | 'admin'
  | 'student-online-test'
  | 'student-mock-test';

const TEACHER_VIEWS: DashboardView[] = [
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
  if (role === 'school_admin') return 'test';
  return role === 'developer' || role === 'teacher' ? 'test' : 'student-online-test';
}
