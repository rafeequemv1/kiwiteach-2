import '../types';
import React, { useState } from 'react';
import { generateOMR } from '../Quiz/components/OMR/OMRGenerator';
import { BrandingConfig } from '../Quiz/types';

interface LeftPanelProps {
  activeView: string;
  setActiveView: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  brandConfig: BrandingConfig;
}

const LeftPanel: React.FC<LeftPanelProps> = ({ activeView, setActiveView, isOpen, onClose, brandConfig }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  
  // MOCK STUDENT BOOLEAN - In real implementation, this comes from Supabase auth profile
  const isStudent = true; 

  const navItems = [
    { id: 'test', label: 'Paper Tests', icon: 'mdi:file-document-outline', role: 'teacher' },
    { id: 'online-exam', label: 'Online Exam', icon: 'mdi:monitor-shimmer', role: 'teacher' },
    { id: 'students', label: 'Students', icon: 'mdi:account-group-outline', role: 'teacher' },
    { id: 'reports', label: 'Reports', icon: 'mdi:chart-bar', role: 'teacher' },
    { id: 'settings', label: 'Settings', icon: 'mdi:cog-outline', role: 'teacher' },
  ];

  const studentItems = [
    { id: 'student-online-test', label: 'My Exams', icon: 'mdi:laptop-account', role: 'student' },
    { id: 'student-mock-test', label: 'Mock Lab', icon: 'mdi:flask-outline', role: 'student' }
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
    <aside className={`
        no-print
        flex flex-col bg-slate-900 border-r border-slate-700 h-screen font-sans z-50 transition-transform duration-300 ease-out
        fixed top-0 left-0 w-64 lg:w-56
        lg:sticky lg:translate-x-0
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
    `}>
      {/* Header - Compact */}
      <div className="p-4 pb-0 shrink-0 flex items-center justify-between lg:block">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="p-1.5 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex items-center justify-center min-w-[32px] min-h-[32px]">
            {brandConfig.logo ? (
              <img src={brandConfig.logo} alt="Brand Logo" className="w-5 h-5 object-contain" />
            ) : (
              <iconify-icon icon="carbon:machine-learning-model" className="w-5 h-5 text-accent"></iconify-icon>
            )}
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight truncate">{brandConfig.name}</h1>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white -mt-6">
            <iconify-icon icon="mdi:close" width="20"></iconify-icon>
        </button>
      </div>

      {/* Nav - Compact */}
      <nav className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
        
        {/* Teacher Items */}
        {navItems.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
                isActive 
                ? 'bg-accent text-white font-medium shadow-md shadow-accent/10'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white font-normal'
              }`}
            >
              <iconify-icon icon={item.icon} className="w-5 h-5"></iconify-icon>
              <span>{item.label}</span>
            </button>
          )
        })}

        {/* Student Section (Conditional) */}
        {isStudent && (
            <>
                <div className="mt-4 mb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Student Zone</div>
                {studentItems.map(item => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
                            isActive 
                            ? 'bg-emerald-600 text-white font-medium shadow-md shadow-emerald-600/10'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white font-normal'
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

      {/* Footer - Compact */}
      <div className="p-4 mt-auto border-t border-slate-800 bg-slate-900 shrink-0 z-10 flex flex-col gap-2">
        <button
          onClick={() => handleNavClick('omr-lab')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
            activeView === 'omr-lab' 
            ? 'bg-slate-800 text-white font-medium'
            : 'text-slate-500 hover:bg-slate-800 hover:text-white font-normal'
          }`}
        >
          <iconify-icon icon="mdi:flask-outline" className="w-5 h-5"></iconify-icon>
          <span>OMR Lab</span>
        </button>
        
        <button
          onClick={() => handleNavClick('admin')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
            activeView === 'admin' 
            ? 'bg-slate-800 text-white font-medium'
            : 'text-slate-500 hover:bg-slate-800 hover:text-white font-normal'
          }`}
        >
          <iconify-icon icon="mdi:shield-account-outline" className="w-5 h-5"></iconify-icon>
          <span>Admin</span>
        </button>

        <button
          onClick={downloadBlankOmr}
          disabled={isDownloading}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-pink-400 bg-pink-400/5 hover:bg-pink-400/10 border border-pink-400/20 transition-all text-xs font-bold disabled:opacity-50"
        >
          {isDownloading ? (
            <div className="w-3.5 h-3.5 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin"></div>
          ) : (
            <iconify-icon icon="mdi:file-document-outline" className="w-4 h-4"></iconify-icon>
          )}
          <span>OMR Template</span>
        </button>
      </div>
    </aside>
  );
};

export default LeftPanel;