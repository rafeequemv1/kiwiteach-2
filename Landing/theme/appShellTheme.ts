import { landingTheme } from './landingTheme';

/**
 * App shell (login + dashboard) — aligned with landing brand.
 * Dark blue navigation / hero panel; purple interactive buttons.
 */
export const appShellTheme = {
  /** Main content area behind dashboard views */
  mainBackground: landingTheme.colors.page,

  /** Left sidebar — same navy family as homepage dark panels */
  sidebar: {
    // Darker navy shell; selected items use purple accent.
    gradient: 'linear-gradient(180deg, #08132d 0%, #0b1a3a 55%, #0f2248 100%)',
    border: 'border-indigo-900/40',
    /** Nav item — active */
    navActiveClass:
      'bg-indigo-500 text-white font-semibold shadow-sm shadow-indigo-900/30',
    navInactiveClass:
      'text-indigo-100/90 hover:bg-indigo-950/35 hover:text-white font-normal',
    logoWrap: 'bg-indigo-950/45 border border-indigo-400/20',
    footerBorder: 'border-indigo-900/45',
  },

  /** Primary actions — purple buttons */
  button: {
    primary:
      'bg-indigo-500 hover:bg-indigo-400 text-white font-black shadow-sm shadow-indigo-900/20',
    primarySubtle:
      'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200/80',
    outlineOnDark:
      'border border-indigo-400/40 text-indigo-100 hover:bg-indigo-950/40 hover:text-white',
  },

  /** Spinners / accents in loaders */
  accent: {
    spinner: 'border-slate-100 border-t-indigo-500',
    icon: 'text-indigo-600',
  },
} as const;

export type AppShellTheme = typeof appShellTheme;
