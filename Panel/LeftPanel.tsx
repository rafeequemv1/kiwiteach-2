import '../types';
import React, { useState } from 'react';
import { generateOMR } from '../Quiz/components/OMR/OMRGenerator';
import { BrandingConfig } from '../Quiz/types';
import { appShellTheme } from '../Landing/theme';
import type { AppRole } from '../auth/roles';

interface LeftPanelProps {
  activeView: string;
  setActiveView: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  brandConfig: BrandingConfig;
  appRole: AppRole;
  onHomeClick?: () => void;
  onSignOut?: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  activeView,
  setActiveView,
  isOpen,
  onClose,
  brandConfig,
  appRole,
  onHomeClick,
  onSignOut,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const showTeacherNav = appRole === 'developer' || appRole === 'teacher' || appRole === 'school_admin';
  const showStudentZone = appRole === 'developer' || appRole === 'student';
  const showAdminInFooter =
    appRole === 'developer' || appRole === 'teacher' || appRole === 'school_admin';

  const navItems = [
    { id: 'test', label: 'Paper Tests', icon: 'mdi:file-document-outline', role: 'teacher' },
    { id: 'online-exam', label: 'Online Exam', icon: 'mdi:monitor-shimmer', role: 'teacher' },
    { id: 'students', label: 'Students', icon: 'mdi:account-group-outline', role: 'teacher' },
    { id: 'reports', label: 'Reports', icon: 'mdi:chart-bar', role: 'teacher' },
    { id: 'settings', label: 'Settings', icon: 'mdi:cog-outline', role: 'teacher' },
  ];

  const studentItems = [
    { id: 'student-online-test', label: 'Online Exams', icon: 'mdi:laptop-account', role: 'student' },
    { id: 'student-mock-test', label: 'Mock Tests', icon: 'mdi:flask-outline', role: 'student' }
  ];

  const handleNavClick = (id: string) => {
      setActiveView(id);
      onClose();
  };

  const downloadBlankOmr = async () => {
    setIsDownloading(true);
    try {
      await generateOMR({
        topic: 'Blank Assessment',
        questions: [], 
        filename: 'Blank_NEET_OMR_Sheet.pdf'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <aside
      className={`
        no-print
        fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r font-sans transition-all duration-300 ease-out
        lg:sticky lg:translate-x-0 ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-56'}
        ${appShellTheme.sidebar.border}
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}
      style={{ background: appShellTheme.sidebar.gradient, boxShadow: '4px 0 24px rgba(8, 25, 48, 0.12)' }}
    >
      <button
        type="button"
        onClick={() => setIsCollapsed((v) => !v)}
        className="absolute -right-3 top-4 hidden h-6 w-6 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-600 shadow-sm transition hover:bg-indigo-50 lg:flex"
        title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
      >
        <iconify-icon icon={isCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} width="14" />
      </button>
      <div className="flex shrink-0 items-center justify-between p-4 pb-2 lg:block">
        <button
          type="button"
          onClick={onHomeClick}
          className="mb-4 flex items-center gap-2.5 text-left"
          title="Go to Landing Page"
        >
          <div className={`flex min-h-[32px] min-w-[32px] items-center justify-center overflow-hidden rounded-md p-1.5 ${appShellTheme.sidebar.logoWrap}`}>
            {brandConfig.logo ? (
              <img src={brandConfig.logo} alt="Brand Logo" className="h-5 w-5 object-contain" />
            ) : (
              <iconify-icon icon="carbon:machine-learning-model" className="h-5 w-5 text-indigo-300" />
            )}
          </div>
          {!isCollapsed && <h1 className="truncate text-lg font-semibold tracking-tight text-white">{brandConfig.name}</h1>}
        </button>
        <button type="button" onClick={onClose} className="-mt-4 text-indigo-200/80 hover:text-white lg:hidden">
            <iconify-icon icon="mdi:close" width="20"></iconify-icon>
        </button>
      </div>

      <nav className={`flex flex-1 flex-col gap-0.5 overflow-y-auto pb-4 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        
        {/* Teacher nav */}
        {showTeacherNav &&
          navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={item.label}
                className={`flex shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
                  isActive ? appShellTheme.sidebar.navActiveClass : appShellTheme.sidebar.navInactiveClass
                }`}
              >
                <iconify-icon icon={item.icon} className="w-5 h-5"></iconify-icon>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}

        {/* Student Section */}
        {showStudentZone && (
            <>
                {!isCollapsed && <div className="mb-1 mt-4 px-3 text-[10px] font-medium uppercase tracking-widest text-indigo-300/70">Student</div>}
                {studentItems.map(item => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                        key={item.id}
                        title={item.label}
                        onClick={() => handleNavClick(item.id)}
                        className={`flex shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
                            isActive 
                            ? appShellTheme.sidebar.navActiveClass
                            : appShellTheme.sidebar.navInactiveClass
                        }`}
                        >
                        <iconify-icon icon={item.icon} className="w-5 h-5"></iconify-icon>
                        {!isCollapsed && <span>{item.label}</span>}
                        </button>
                    )
                })}
            </>
        )}
      </nav>

      {/* Footer — Admin (syllabus, OMR lab, etc. live inside Admin) */}
      <div className={`mt-auto flex shrink-0 flex-col gap-1.5 border-t z-10 ${isCollapsed ? 'p-2' : 'p-3'} ${appShellTheme.sidebar.footerBorder}`} style={{ background: 'rgba(15, 39, 68, 0.35)' }}>
        {showAdminInFooter && (
          <button
            type="button"
            onClick={() => handleNavClick('admin')}
            title="Admin"
            className={`flex shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
              activeView === 'admin' ? appShellTheme.sidebar.navActiveClass : appShellTheme.sidebar.navInactiveClass
            }`}
          >
            <iconify-icon icon="mdi:shield-account-outline" className="w-5 h-5"></iconify-icon>
            {!isCollapsed && <span>Admin</span>}
          </button>
        )}

        {showTeacherNav && (
          <button
            type="button"
            onClick={downloadBlankOmr}
            disabled={isDownloading}
            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all disabled:opacity-50 ${appShellTheme.button.outlineOnDark}`}
          >
            {isDownloading ? (
              <div className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${appShellTheme.accent.spinner}`}></div>
            ) : (
              <iconify-icon icon="mdi:file-document-outline" className="w-4 h-4"></iconify-icon>
            )}
            {!isCollapsed && <span>OMR Template</span>}
          </button>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all ${appShellTheme.button.outlineOnDark}`}
          >
            <iconify-icon icon="mdi:logout" className="w-4 h-4"></iconify-icon>
            {!isCollapsed && <span>Logout</span>}
          </button>
        )}
      </div>
    </aside>
  );
};

export default LeftPanel;