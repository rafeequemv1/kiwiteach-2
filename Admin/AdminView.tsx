
import '../types';
import React, { useMemo, useState } from 'react';
import { workspacePageClass } from '../Teacher/components/WorkspaceChrome';
import KnowledgeSourceHome from './KnowledgeSource/KnowledgeSourceHome';
import KnowledgeBaseExplorer from './KnowledgeSource/KnowledgeBaseExplorer';
import QuestionDBHome from './QuestionDB/QuestionDBHome';
import PromptsHome from './Prompts/PromptsHome';
import LabHome from './Lab/LabHome';
import QualityLab from './Lab/QualityLab';
import TeacherSyllabusHub from '../Teacher/Syllabus/TeacherSyllabusHub';
import OMRAccuracyTester from '../Quiz/components/OMR/OMRAccuracyTester';
import InstituteOrgPanel from '../Settings/Institutes/InstituteOrgPanel';
import UsersRoleManager from './Users/UsersRoleManager';
import RolesPermissionsManager from './Roles/RolesPermissionsManager';
import OutOfSyllabusFlagsPanel from './Flags/OutOfSyllabusFlagsPanel';
import type { AppRole } from '../auth/roles';

type AdminSection =
  | 'institutes'
  | 'users'
  | 'roles'
  | 'flags'
  | 'knowledge-source'
  | 'kb-explorer'
  | 'question-db'
  | 'prompts'
  | 'lab'
  | 'syllabus'
  | 'quality-lab'
  | 'omr-lab';

interface AdminViewProps {
  appRole: AppRole;
  userId: string;
  onRefreshOrg?: () => void;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

type SectionMeta = { title: string; subtitle: string; icon: string };

const SECTION_META: Record<AdminSection, SectionMeta> = {
  institutes: {
    title: 'Business',
    subtitle: 'Businesses, institutes (centres), and class batches',
    icon: 'mdi:briefcase-outline',
  },
  users: {
    title: 'Users',
    subtitle: 'Workspace accounts and roles',
    icon: 'mdi:account-cog-outline',
  },
  roles: {
    title: 'Roles & permissions',
    subtitle: 'Feature access and custom roles',
    icon: 'mdi:shield-account-outline',
  },
  flags: {
    title: 'Flags',
    subtitle: 'Out-of-syllabus reports and moderation',
    icon: 'mdi:flag-outline',
  },
  'knowledge-source': {
    title: 'Knowledge',
    subtitle: 'Curriculum bases and PDF context',
    icon: 'mdi:book-open-variant',
  },
  'kb-explorer': {
    title: 'Knowledge explorer',
    subtitle: 'Browse a selected knowledge base',
    icon: 'mdi:folder-open-outline',
  },
  'question-db': {
    title: 'Question DB',
    subtitle: 'Browse and forge questions from the bank',
    icon: 'mdi:database-search-outline',
  },
  prompts: {
    title: 'Prompts',
    subtitle: 'System prompts and Neural Studio forge',
    icon: 'mdi:console',
  },
  lab: {
    title: 'Batch Forge',
    subtitle: 'Rapid population from documents',
    icon: 'mdi:factory',
  },
  syllabus: {
    title: 'Syllabus & exclusions',
    subtitle: 'Syllabi and topic blocklists',
    icon: 'mdi:book-education-outline',
  },
  'quality-lab': {
    title: 'Quality Lab',
    subtitle: 'Model benchmarks and cost estimates',
    icon: 'mdi:matrix',
  },
  'omr-lab': {
    title: 'OMR Lab',
    subtitle: 'Recognition tuning (developers)',
    icon: 'mdi:flask-outline',
  },
};

/** Full-height tools with their own chrome */
const FULL_BLEED_SECTIONS: AdminSection[] = ['lab', 'quality-lab'];

/** Section body uses flex column + overflow hidden (roles manager) */
const ROLES_SECTIONS: AdminSection[] = ['roles'];

interface AdminSectionFrameProps {
  meta: SectionMeta;
  bleed?: boolean;
  rolesLayout?: boolean;
  children: React.ReactNode;
}

const AdminSectionFrame: React.FC<AdminSectionFrameProps> = ({ meta, bleed, rolesLayout, children }) => (
  <div
    className={`flex min-h-0 flex-col overflow-hidden bg-transparent ${
      rolesLayout || bleed ? 'min-h-0 flex-1' : ''
    }`}
  >
    <div className="shrink-0 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white px-4 py-3 md:px-5 md:py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-sm">
          <iconify-icon icon={meta.icon} className="h-5 w-5 opacity-90" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 md:text-[15px]">{meta.title}</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{meta.subtitle}</p>
        </div>
      </div>
    </div>
    <div
      className={
        bleed
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/40 [&>*]:min-h-0'
          : rolesLayout
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/30'
            : 'min-h-0 flex-1 overflow-y-auto bg-transparent'
      }
    >
      {children}
    </div>
  </div>
);

const AdminView: React.FC<AdminViewProps> = ({ appRole, userId, onRefreshOrg }) => {
  const isDeveloper = appRole === 'developer';
  const isSchoolAdmin = appRole === 'school_admin';
  const isTeacher = appRole === 'teacher';
  const canUseSyllabusHub = isDeveloper || isSchoolAdmin || isTeacher;

  const fallbackSection: AdminSection = isDeveloper || isSchoolAdmin ? 'institutes' : 'syllabus';

  const [activeSection, setActiveSection] = useState<AdminSection>(fallbackSection);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setActiveSection('kb-explorer');
  };

  const activeMeta: SectionMeta = useMemo(() => {
    if (activeSection === 'kb-explorer' && selectedKb) {
      return {
        ...SECTION_META['kb-explorer'],
        title: selectedKb.name,
        subtitle: 'Explorer — curriculum and files',
      };
    }
    return SECTION_META[activeSection];
  }, [activeSection, selectedKb]);

  const isBleed = FULL_BLEED_SECTIONS.includes(activeSection);
  const isRolesLayout = ROLES_SECTIONS.includes(activeSection);

  const renderContent = () => {
    switch (activeSection) {
      case 'institutes':
        return (
          <InstituteOrgPanel
            userId={userId}
            onRefresh={onRefreshOrg}
            title="Business"
            subtitle="Businesses, institutes (centres), and class batches"
            embedded
          />
        );
      case 'users':
        return <UsersRoleManager embedded />;
      case 'roles':
        return <RolesPermissionsManager embedded />;
      case 'flags':
        return <OutOfSyllabusFlagsPanel />;
      case 'knowledge-source':
        return <KnowledgeSourceHome onSelectKb={handleSelectKb} />;
      case 'kb-explorer':
        return selectedKb ? (
          <KnowledgeBaseExplorer
            kbId={selectedKb.id}
            kbName={selectedKb.name}
            onBack={() => setActiveSection('knowledge-source')}
          />
        ) : null;
      case 'question-db':
        return <QuestionDBHome />;
      case 'prompts':
        return <PromptsHome embedded />;
      case 'lab':
        return <LabHome embedded onBack={() => setActiveSection(fallbackSection)} />;
      case 'quality-lab':
        return <QualityLab embedded onBack={() => setActiveSection(fallbackSection)} />;
      case 'syllabus':
        return <TeacherSyllabusHub isDeveloper={isDeveloper} />;
      case 'omr-lab':
        return isDeveloper ? (
          <OMRAccuracyTester />
        ) : (
          <p className="p-6 text-sm text-zinc-600">OMR Lab is only available to developers.</p>
        );
    }
  };

  const navActive = (s: AdminSection) =>
    activeSection === s || (s === 'knowledge-source' && activeSection === 'kb-explorer');

  const navBtn = (id: AdminSection, label: string, icon: string) => {
    const active = navActive(id);
    return (
      <button
        type="button"
        onClick={() => setActiveSection(id)}
        title={label}
        className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${navCollapsed ? 'justify-center gap-0' : 'gap-2.5'} ${
          active
            ? 'bg-zinc-900 text-white shadow-sm'
            : 'text-zinc-600 hover:bg-zinc-100/90'
        }`}
      >
        <iconify-icon icon={icon} className="h-5 w-5 shrink-0 opacity-90" />
        {!navCollapsed && <span className="font-medium">{label}</span>}
      </button>
    );
  };

  return (
    <div className={`${workspacePageClass} min-h-0 flex-1 overflow-hidden font-sans`}>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 shadow-sm md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">Admin</h1>
            <p className="text-[12px] text-zinc-500">Tools and data for your workspace</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full flex-col gap-3 px-4 py-3 md:flex-row md:gap-0 md:px-8 md:py-5">
          <nav
            className={`hidden shrink-0 flex-col gap-0.5 pr-4 md:flex md:border-r md:border-zinc-200/90 ${navCollapsed ? 'w-[72px]' : 'w-[220px]'}`}
            aria-label="Admin sections"
          >
            <div className="mb-2 flex items-center justify-between">
              {!navCollapsed && <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Sections</p>}
              <button
                type="button"
                onClick={() => setNavCollapsed((v) => !v)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
              >
                <iconify-icon icon={navCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} />
              </button>
            </div>
            {(isDeveloper || isSchoolAdmin) && navBtn('institutes', 'Business', 'mdi:briefcase-outline')}
            {(isDeveloper || isSchoolAdmin) && navBtn('flags', 'Flags', 'mdi:flag-outline')}
            {canUseSyllabusHub && navBtn('syllabus', 'Syllabus & exclusions', 'mdi:book-education-outline')}
            {isDeveloper && (
              <>
                {navBtn('users', 'Users', 'mdi:account-cog-outline')}
                {navBtn('roles', 'Roles & permissions', 'mdi:shield-account-outline')}
                {navBtn('knowledge-source', 'Knowledge', 'mdi:book-open-variant')}
                {navBtn('question-db', 'Question DB', 'mdi:database-search-outline')}
                {navBtn('prompts', 'Prompts', 'mdi:console')}
                {navBtn('lab', 'Batch Forge', 'mdi:factory')}
                {navBtn('quality-lab', 'Quality Lab', 'mdi:matrix')}
                {navBtn('omr-lab', 'OMR Lab', 'mdi:flask-outline')}
              </>
            )}
          </nav>

          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto pb-1 md:hidden px-1">
            <span className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Go to</span>
            {(isDeveloper || isSchoolAdmin) && navBtn('institutes', 'Business', 'mdi:briefcase-outline')}
            {(isDeveloper || isSchoolAdmin) && navBtn('flags', 'Flags', 'mdi:flag-outline')}
            {canUseSyllabusHub && navBtn('syllabus', 'Syllabus', 'mdi:book-education-outline')}
            {isDeveloper && (
              <>
                {navBtn('users', 'Users', 'mdi:account-cog-outline')}
                {navBtn('roles', 'Roles', 'mdi:shield-account-outline')}
                {navBtn('knowledge-source', 'Knowledge', 'mdi:book-open-variant')}
                {navBtn('question-db', 'QDB', 'mdi:database-search-outline')}
                {navBtn('prompts', 'Prompts', 'mdi:console')}
                {navBtn('lab', 'Forge', 'mdi:factory')}
                {navBtn('quality-lab', 'Quality', 'mdi:matrix')}
                {navBtn('omr-lab', 'OMR', 'mdi:flask-outline')}
              </>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AdminSectionFrame meta={activeMeta} bleed={isBleed} rolesLayout={isRolesLayout}>
              {renderContent()}
            </AdminSectionFrame>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminView;
