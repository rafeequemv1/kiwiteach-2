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
        flex flex-col border-r h-screen font-sans z-50 transition-transform duration-300 ease-out
        fixed top-0 left-0 w-64 lg:w-56
        lg:sticky lg:translate-x-0
        ${appShellTheme.sidebar.border}
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}
      style={{ background: appShellTheme.sidebar.gradient, boxShadow: '4px 0 24px rgba(8, 25, 48, 0.12)' }}
    >
      {/* Header - Compact */}
      <div className="p-4 pb-0 shrink-0 flex items-center justify-between lg:block">
        <button
          type="button"
          onClick={onHomeClick}
          className="flex items-center gap-2.5 mb-6 text-left"
          title="Go to Landing Page"
        >
          <div className={`p-1.5 rounded-lg overflow-hidden flex items-center justify-center min-w-[32px] min-h-[32px] ${appShellTheme.sidebar.logoWrap}`}>
            {brandConfig.logo ? (
              <img src={brandConfig.logo} alt="Brand Logo" className="w-5 h-5 object-contain" />
            ) : (
              <iconify-icon icon="carbon:machine-learning-model" className="w-5 h-5 text-indigo-300"></iconify-icon>
            )}
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight truncate">{brandConfig.name}</h1>
        </button>
        <button onClick={onClose} className="lg:hidden text-indigo-200/80 hover:text-white -mt-6">
            <iconify-icon icon="mdi:close" width="20"></iconify-icon>
        </button>
      </div>

      {/* Nav - Compact */}
      <nav className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
        
        {/* Teacher nav */}
        {showTeacherNav &&
          navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
                  isActive ? appShellTheme.sidebar.navActiveClass : appShellTheme.sidebar.navInactiveClass
                }`}
              >
                <iconify-icon icon={item.icon} className="w-5 h-5"></iconify-icon>
                <span>{item.label}</span>
              </button>
            );
          })}

        {/* Student Section */}
        {showStudentZone && (
            <>
                <div className="mt-4 mb-2 px-3 text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest">Student Zone</div>
                {studentItems.map(item => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
                            isActive 
                            ? appShellTheme.sidebar.navActiveClass
                            : appShellTheme.sidebar.navInactiveClass
                        }`}
                        >
                        <iconify-icon icon={item.icon} className="w-5 h-5"></iconify-icon>
                        <span>{item.label}</span>
                        </button>
                    )
                })}
            </>
        )}
      </nav>

      {/* Footer — Admin (syllabus, OMR lab, etc. live inside Admin) */}
      <div className={`p-4 mt-auto border-t shrink-0 z-10 flex flex-col gap-2 ${appShellTheme.sidebar.footerBorder}`} style={{ background: 'rgba(15, 39, 68, 0.35)' }}>
        {showAdminInFooter && (
          <button
            type="button"
            onClick={() => handleNavClick('admin')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
              activeView === 'admin' ? appShellTheme.sidebar.navActiveClass : appShellTheme.sidebar.navInactiveClass
            }`}
          >
            <iconify-icon icon="mdi:shield-account-outline" className="w-5 h-5"></iconify-icon>
            <span>Admin</span>
          </button>
        )}

        {showTeacherNav && (
          <button
            type="button"
            onClick={downloadBlankOmr}
            disabled={isDownloading}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-bold disabled:opacity-50 border ${appShellTheme.button.outlineOnDark}`}
          >
            {isDownloading ? (
              <div className="w-3.5 h-3.5 border-2 border-indigo-300/30 border-t-indigo-200 rounded-full animate-spin"></div>
            ) : (
              <iconify-icon icon="mdi:file-document-outline" className="w-4 h-4"></iconify-icon>
            )}
            <span>OMR Template</span>
          </button>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-bold border ${appShellTheme.button.outlineOnDark}`}
          >
            <iconify-icon icon="mdi:logout" className="w-4 h-4"></iconify-icon>
            <span>Logout</span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default LeftPanel;