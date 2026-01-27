
import '../types';
import React from 'react';
import BrandingCard from './Branding/BrandingCard';
import SchoolManager from './Schools/SchoolManager';
import { BrandingConfig } from '../Quiz/types';

interface SettingsViewProps {
  brandConfig: BrandingConfig;
  onUpdateBranding: (config: BrandingConfig) => void;
  onSignOut: () => void;
  // Updated Props
  schools?: any[];
  schoolClasses?: any[];
  onRefresh?: () => void;
  // Legacy props ignored
  folders?: any[]; 
  onAddFolder?: any;
  onDeleteFolder?: any;
}

const SettingsView: React.FC<SettingsViewProps> = ({ 
  brandConfig, 
  onUpdateBranding, 
  onSignOut,
  schools,
  schoolClasses,
  onRefresh
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 md:p-12 animate-fade-in">
      <header className="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">Settings</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Configure your KiwiTeach experience</p>
        </div>
        <button 
          onClick={onSignOut}
          className="bg-red-50 text-red-600 hover:bg-red-100 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all border border-red-100 flex items-center gap-2"
        >
          <iconify-icon icon="mdi:logout"></iconify-icon>
          Sign Out
        </button>
      </header>

      <div className="grid grid-cols-1 gap-12 pb-20">
        <section>
          <BrandingCard config={brandConfig} onUpdate={onUpdateBranding} />
        </section>
        
        <section>
          <SchoolManager 
            schools={schools} 
            schoolClasses={schoolClasses} 
            onRefresh={onRefresh} 
          />
        </section>
      </div>
    </div>
  );
};

export default SettingsView;
