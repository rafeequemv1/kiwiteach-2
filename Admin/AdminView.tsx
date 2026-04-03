
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
import SubscriptionTiersPanel from './Subscriptions/SubscriptionTiersPanel';
import PYQManager from './PYQ/PYQManager';
import ReferenceQuestionsManager from './ReferenceQuestions/ReferenceQuestionsManager';
import KnowledgeBaseAccessManager from './KnowledgeSource/KnowledgeBaseAccessManager';
import PlatformBrandingPanel from './PlatformBranding/PlatformBrandingPanel';
import BlogAdminHome from './Blog/BlogAdminHome';
import ExamPaperHome from './ExamPaper/ExamPaperHome';
import AppArchitectureHome from './AppArchitecture/AppArchitectureHome';
import type { AppRole } from '../auth/roles';

type AdminSection =
  | 'institutes'
  | 'users'
  | 'roles'
  | 'flags'
  | 'subscriptions'
  | 'knowledge-access'
  | 'pyq'
  | 'reference-questions'
  | 'knowledge-source'
  | 'kb-explorer'
  | 'question-db'
  | 'prompts'
  | 'lab'
  | 'syllabus'
  | 'quality-lab'
  | 'omr-lab'
  | 'platform-branding'
  | 'blog'
  | 'exam-paper'
  | 'app-architecture';

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
  subscriptions: {
    title: 'Subscriptions',
    subtitle: 'B2B tier features (limits later)',
    icon: 'mdi:ticket-percent-outline',
  },
  'knowledge-access': {
    title: 'Knowledge Access',
    subtitle: 'Assign user-level access to knowledge bases',
    icon: 'mdi:key-outline',
  },
  pyq: {
    title: 'PYQ Upload',
    subtitle: 'Upload and manage NEET previous year questions',
    icon: 'mdi:file-upload-outline',
  },
  'reference-questions': {
    title: 'Reference Questions',
    subtitle: 'Upload and curate reference sets for quality',
    icon: 'mdi:book-check-outline',
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
  'platform-branding': {
    title: 'Branding',
    subtitle: 'KiwiTeach colors, typography, and button styles',
    icon: 'mdi:palette-swatch-outline',
  },
  blog: {
    title: 'Blog',
    subtitle: 'Journal posts, SEO, FAQs, and rich content',
    icon: 'mdi:post-outline',
  },
  'exam-paper': {
    title: 'Exam Paper',
    subtitle: 'Blueprints: totals, styles, subjects, chapters, figures — per knowledge base',
    icon: 'mdi:file-chart-outline',
  },
  'app-architecture': {
    title: 'App architecture',
    subtitle: 'Database map, user journeys, and system layers',
    icon: 'mdi:sitemap-outline',
  },
};

/** Full-height tools with their own chrome */
const FULL_BLEED_SECTIONS: AdminSection[] = ['lab', 'quality-lab'];

/** Section body uses flex column + overflow hidden (roles manager, blog CMS) */
const ROLES_SECTIONS: AdminSection[] = ['roles', 'blog'];

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
  const canManagePlatformBranding = isDeveloper || isSchoolAdmin;
  const canManageExamPapers = isDeveloper || isSchoolAdmin;

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
      case 'subscriptions':
        return <SubscriptionTiersPanel />;
      case 'knowledge-access':
        return <KnowledgeBaseAccessManager />;
      case 'pyq':
        return <PYQManager />;
      case 'reference-questions':
        return <ReferenceQuestionsManager />;
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
      case 'platform-branding':
        return canManagePlatformBranding ? (
          <PlatformBrandingPanel userId={userId} />
        ) : (
          <p className="p-6 text-sm text-zinc-600">Branding is only available to administrators.</p>
        );
      case 'blog':
        return canManagePlatformBranding ? (
          <BlogAdminHome />
        ) : (
          <p className="p-6 text-sm text-zinc-600">Blog is only available to administrators.</p>
        );
      case 'exam-paper':
        return canManageExamPapers ? (
          <ExamPaperHome userId={userId} />
        ) : (
          <p className="p-6 text-sm text-zinc-600">Exam paper blueprints are only available to administrators.</p>
        );
      case 'app-architecture':
        return isDeveloper || isSchoolAdmin ? (
          <AppArchitectureHome />
        ) : (
          <p className="p-6 text-sm text-zinc-600">App architecture maps are only available to administrators.</p>
        );
    }
  };

  const navActive = (s: AdminSection) =>
    activeSection === s || (s === 'knowledge-source' && activeSection === 'kb-explorer');

  type NavEntry = { id: AdminSection; label: string; icon: string; mobileLabel?: string };

  const navBtn = (entry: NavEntry, layout: 'sidebar' | 'chip') => {
    const active = navActive(entry.id);
    const label = layout === 'chip' && entry.mobileLabel ? entry.mobileLabel : entry.label;
    const isChip = layout === 'chip';
    return (
      <button
        type="button"
        onClick={() => setActiveSection(entry.id)}
        title={entry.label}
        className={
          isChip
            ? `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                active ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`
            : `flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${navCollapsed ? 'justify-center gap-0' : 'gap-2.5'} ${
                active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100/90'
              }`
        }
      >
        <iconify-icon icon={entry.icon} className={`shrink-0 opacity-90 ${isChip ? 'h-4 w-4' : 'h-5 w-5'}`} />
        {(!navCollapsed || isChip) && <span className="font-medium whitespace-nowrap">{label}</span>}
      </button>
    );
  };

  type NavGroupDef = { title: string; items: Array<NavEntry & { show: boolean }> };

  const navGroups: NavGroupDef[] = useMemo(
    () => [
      {
        title: 'Organization',
        items: [
          { id: 'institutes', label: 'Business', icon: 'mdi:briefcase-outline', show: isDeveloper || isSchoolAdmin },
          {
            id: 'platform-branding',
            label: 'Branding',
            icon: 'mdi:palette-swatch-outline',
            mobileLabel: 'Brand',
            show: canManagePlatformBranding,
          },
          {
            id: 'blog',
            label: 'Blog',
            icon: 'mdi:post-outline',
            show: canManagePlatformBranding,
          },
          {
            id: 'exam-paper',
            label: 'Exam Paper',
            icon: 'mdi:file-chart-outline',
            mobileLabel: 'Exam',
            show: canManageExamPapers,
          },
          {
            id: 'app-architecture',
            label: 'App architecture',
            icon: 'mdi:sitemap-outline',
            mobileLabel: 'Arch',
            show: isDeveloper || isSchoolAdmin,
          },
        ],
      },
      {
        title: 'Curriculum',
        items: [
          {
            id: 'syllabus',
            label: 'Syllabus & exclusions',
            icon: 'mdi:book-education-outline',
            mobileLabel: 'Syllabus',
            show: canUseSyllabusHub,
          },
          { id: 'flags', label: 'Flags', icon: 'mdi:flag-outline', show: isDeveloper || isSchoolAdmin },
        ],
      },
      {
        title: 'People & access',
        items: [
          { id: 'users', label: 'Users', icon: 'mdi:account-cog-outline', show: isDeveloper },
          {
            id: 'roles',
            label: 'Roles & permissions',
            icon: 'mdi:shield-account-outline',
            mobileLabel: 'Roles',
            show: isDeveloper,
          },
          {
            id: 'subscriptions',
            label: 'Subscriptions',
            icon: 'mdi:ticket-percent-outline',
            mobileLabel: 'Subs',
            show: isDeveloper,
          },
          {
            id: 'knowledge-access',
            label: 'Knowledge Access',
            icon: 'mdi:key-outline',
            mobileLabel: 'KB Access',
            show: isDeveloper,
          },
        ],
      },
      {
        title: 'Libraries',
        items: [
          {
            id: 'pyq',
            label: 'PYQ Upload',
            icon: 'mdi:file-upload-outline',
            mobileLabel: 'PYQ',
            show: isDeveloper,
          },
          {
            id: 'reference-questions',
            label: 'Reference Qs',
            icon: 'mdi:book-check-outline',
            mobileLabel: 'Ref Qs',
            show: isDeveloper,
          },
          {
            id: 'knowledge-source',
            label: 'Knowledge',
            icon: 'mdi:book-open-variant',
            show: isDeveloper,
          },
          {
            id: 'question-db',
            label: 'Question DB',
            icon: 'mdi:database-search-outline',
            mobileLabel: 'QDB',
            show: isDeveloper,
          },
        ],
      },
      {
        title: 'AI & labs',
        items: [
          { id: 'prompts', label: 'Prompts', icon: 'mdi:console', show: isDeveloper },
          {
            id: 'lab',
            label: 'Batch Forge',
            icon: 'mdi:factory',
            mobileLabel: 'Forge',
            show: isDeveloper,
          },
          {
            id: 'quality-lab',
            label: 'Quality Lab',
            icon: 'mdi:matrix',
            mobileLabel: 'Quality',
            show: isDeveloper,
          },
          {
            id: 'omr-lab',
            label: 'OMR Lab',
            icon: 'mdi:flask-outline',
            mobileLabel: 'OMR',
            show: isDeveloper,
          },
        ],
      },
    ],
    [
      isDeveloper,
      isSchoolAdmin,
      canManagePlatformBranding,
      canManageExamPapers,
      canUseSyllabusHub,
    ]
  );

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
            className={`hidden min-h-0 shrink-0 flex-col pr-4 md:flex md:border-r md:border-zinc-200/90 ${navCollapsed ? 'w-[72px]' : 'w-[220px]'}`}
            aria-label="Admin sections"
          >
            <div className="mb-2 flex items-center justify-between">
              {!navCollapsed && <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Navigate</p>}
              <button
                type="button"
                onClick={() => setNavCollapsed((v) => !v)}
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 ${navCollapsed ? 'mx-auto' : ''}`}
                title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
              >
                <iconify-icon icon={navCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto pb-2">
              {navGroups
                .map((group) => ({ group, visible: group.items.filter((i) => i.show) }))
                .filter((x) => x.visible.length > 0)
                .map(({ group, visible }, idx) => (
                  <div
                    key={group.title}
                    className={
                      navCollapsed
                        ? idx > 0
                          ? 'mt-2 border-t border-zinc-200/90 pt-2'
                          : ''
                        : 'mb-4 last:mb-0'
                    }
                  >
                    {!navCollapsed && (
                      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{group.title}</p>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {visible.map(({ show: _s, ...entry }) => (
                        <React.Fragment key={entry.id}>{navBtn(entry, 'sidebar')}</React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </nav>

          <div className="-mx-1 flex flex-col gap-2 pb-1 md:hidden px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Go to</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              {navGroups.map((group) => {
                const visible = group.items.filter((i) => i.show);
                if (visible.length === 0) return null;
                return (
                  <div key={group.title} className="flex w-full min-w-0 flex-col gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">{group.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {visible.map(({ show: _s, ...entry }) => (
                        <React.Fragment key={entry.id}>{navBtn(entry, 'chip')}</React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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
