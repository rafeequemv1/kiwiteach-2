
import '../types';
import React, { useState } from 'react';
import BrandingCard from './Branding/BrandingCard';
import SchoolManager from './Schools/SchoolManager';
import { BrandingConfig } from '../Quiz/types';
import { workspacePageClass } from '../Teacher/components/WorkspaceChrome';
import UserProfilePanel from './Profile/UserProfilePanel';
import TeamManager from './Institutes/TeamManager';

interface SettingsViewProps {
  brandConfig: BrandingConfig;
  onUpdateBranding: (config: BrandingConfig) => void;
  onSignOut: () => void;
  userId: string;
  onRefresh?: () => void;
  folders?: any[]; 
  onAddFolder?: any;
  onDeleteFolder?: any;
}

type SettingsSection = 'branding' | 'institutes' | 'team' | 'profile';

const SettingsView: React.FC<SettingsViewProps> = ({ 
  brandConfig, 
  onUpdateBranding, 
  onSignOut,
  userId,
  onRefresh
}) => {
  const [section, setSection] = useState<SettingsSection>('profile');
  const [navCollapsed, setNavCollapsed] = useState(false);

  const navBtn = (id: SettingsSection, label: string, icon: string) => {
    const active = section === id;
    return (
      <button
        type="button"
        onClick={() => setSection(id)}
        title={label}
        className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${navCollapsed ? 'justify-center gap-0' : 'gap-2.5'} ${
          active
            ? 'bg-zinc-900 text-white shadow-sm'
            : 'text-zinc-600 hover:bg-zinc-100'
        }`}
      >
        <iconify-icon icon={icon} className="h-5 w-5 shrink-0 opacity-90" />
        {!navCollapsed && <span className="font-medium">{label}</span>}
      </button>
    );
  };

  return (
    <div className={`${workspacePageClass} min-h-0 flex-1 overflow-hidden`}>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 shadow-sm md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">Settings</h1>
            <p className="text-[12px] text-zinc-500">Workspace &amp; organization</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-red-700 shadow-sm hover:bg-red-50"
          >
            <iconify-icon icon="mdi:logout" className="mr-1" />
            Sign out
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full flex-col gap-3 px-4 py-3 md:flex-row md:gap-4 md:px-8 md:py-4">
          <nav
            className={`hidden shrink-0 flex-col gap-0.5 border-r border-zinc-200 pr-3 md:flex ${navCollapsed ? 'w-16' : 'w-44'}`}
            aria-label="Settings sections"
          >
            <button
              type="button"
              onClick={() => setNavCollapsed((v) => !v)}
              className="mb-2 inline-flex h-7 w-7 items-center justify-center self-end rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
              title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              <iconify-icon icon={navCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} />
            </button>
            {navBtn('branding', 'Branding', 'mdi:palette-outline')}
            {navBtn('profile', 'Profile', 'mdi:account-circle-outline')}
            {navBtn('institutes', 'Institutes', 'mdi:domain')}
            {navBtn('team', 'Team', 'mdi:account-multiple-outline')}
          </nav>

          <div className="grid grid-cols-2 gap-1 md:hidden">
            {navBtn('branding', 'Branding', 'mdi:palette-outline')}
            {navBtn('profile', 'Profile', 'mdi:account-circle-outline')}
            {navBtn('institutes', 'Institutes', 'mdi:domain')}
            {navBtn('team', 'Team', 'mdi:account-multiple-outline')}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-transparent p-0">
            {section === 'branding' && (
              <BrandingCard config={brandConfig} onUpdate={onUpdateBranding} embedded />
            )}
            {section === 'profile' && (
              <UserProfilePanel userId={userId} embedded />
            )}
            {section === 'institutes' && (
              <SchoolManager userId={userId} onRefresh={onRefresh} embedded />
            )}
            {section === 'team' && (
              <TeamManager userId={userId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
