
import '../types';
import React, { useState } from 'react';
import KnowledgeSourceHome from './KnowledgeSource/KnowledgeSourceHome';
import KnowledgeBaseExplorer from './KnowledgeSource/KnowledgeBaseExplorer';
import QuestionDBHome from './QuestionBank/QuestionBankHome';
import PromptsHome from './Prompts/PromptsHome';
import LabHome from './Lab/LabHome';
import QualityLab from './Lab/QualityLab';
import TeacherSyllabusHub from '../Teacher/Syllabus/TeacherSyllabusHub';
import OMRAccuracyTester from '../Quiz/components/OMR/OMRAccuracyTester';
import InstituteOrgPanel from '../Settings/Institutes/InstituteOrgPanel';
import UsersRoleManager from './Users/UsersRoleManager';
import type { AppRole } from '../auth/roles';

type AdminSection =
  | 'dashboard'
  | 'institutes'
  | 'users'
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

const AdminView: React.FC<AdminViewProps> = ({ appRole, userId, onRefreshOrg }) => {
  const isDeveloper = appRole === 'developer';
  const isSchoolAdmin = appRole === 'school_admin';
  const isTeacher = appRole === 'teacher';
  const canUseSyllabusHub = isDeveloper || isSchoolAdmin || isTeacher;

  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setActiveSection('kb-explorer');
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'institutes':
        return (
          <InstituteOrgPanel
            userId={userId}
            onRefresh={onRefreshOrg}
            title="Institutes"
            subtitle="Schools, coaching centres, and class batches"
          />
        );
      case 'users':
        return <UsersRoleManager />;
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
        return <PromptsHome />;
      case 'lab':
        return <LabHome onBack={() => setActiveSection('dashboard')} />;
      case 'quality-lab':
        return <QualityLab onBack={() => setActiveSection('dashboard')} />;
      case 'syllabus':
        return <TeacherSyllabusHub isDeveloper={isDeveloper} />;
      case 'omr-lab':
        return isDeveloper ? (
          <OMRAccuracyTester />
        ) : (
          <p className="p-6 text-sm text-slate-600">OMR Lab is only available to developers.</p>
        );
      default:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(isDeveloper || isSchoolAdmin) && (
              <AdminCard
                title="Institutes"
                description="Add schools, coaching centres, and classes."
                icon="mdi:domain"
                color="text-sky-600"
                bg="bg-sky-50"
                onClick={() => setActiveSection('institutes')}
              />
            )}
            {canUseSyllabusHub && (
              <AdminCard
                title="Syllabus & exclusions"
                description="Multiple syllabi per knowledge base, topic blocklist for AI."
                icon="mdi:book-education-outline"
                color="text-emerald-600"
                bg="bg-emerald-50"
                onClick={() => setActiveSection('syllabus')}
              />
            )}
            {isDeveloper && (
              <>
                <AdminCard
                  title="Users"
                  description="View all users and manage roles."
                  icon="mdi:account-cog-outline"
                  color="text-cyan-600"
                  bg="bg-cyan-50"
                  onClick={() => setActiveSection('users')}
                />
                <AdminCard
                  title="OMR Lab"
                  description="Tune OMR recognition & accuracy."
                  icon="mdi:flask-outline"
                  color="text-fuchsia-600"
                  bg="bg-fuchsia-50"
                  onClick={() => setActiveSection('omr-lab')}
                />
                <AdminCard
                  title="Quality Lab"
                  description="Benchmark Gemini models & estimate INR costs."
                  icon="mdi:matrix"
                  color="text-indigo-600"
                  bg="bg-indigo-50"
                  onClick={() => setActiveSection('quality-lab')}
                />
                <AdminCard
                  title="Batch Forge"
                  description="Rapid database population from files."
                  icon="mdi:factory"
                  color="text-rose-600"
                  bg="bg-rose-50"
                  onClick={() => setActiveSection('lab')}
                />
                <AdminCard
                  title="Question DB"
                  description="Browse synced knowledge & materials."
                  icon="mdi:database-search-outline"
                  color="text-amber-600"
                  bg="bg-amber-50"
                  onClick={() => setActiveSection('question-db')}
                />
                <AdminCard
                  title="Knowledge"
                  description="Manage curriculum & PDF context."
                  icon="mdi:book-open-variant"
                  color="text-teal-600"
                  bg="bg-teal-50"
                  onClick={() => setActiveSection('knowledge-source')}
                />
                <AdminCard
                  title="System Logic"
                  description="Configure AI generation rules & prompts."
                  icon="mdi:console"
                  color="text-violet-600"
                  bg="bg-violet-50"
                  onClick={() => setActiveSection('prompts')}
                />
              </>
            )}
            {isSchoolAdmin && !isDeveloper && (
              <p className="col-span-full text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Use <strong className="text-slate-600">Institutes</strong> to manage your centres and classes.
              </p>
            )}
          </div>
        );
    }
  };

  const getBreadcrumb = () => {
      const base = (
          <button 
            onClick={() => setActiveSection('dashboard')}
            className={`hover:text-accent transition-colors ${activeSection === 'dashboard' ? 'text-slate-900' : ''}`}
          >
            Admin
          </button>
      );
      
      if (activeSection === 'dashboard') return [base];

      let parts = [base];
      
      if (activeSection === 'knowledge-source' || activeSection === 'kb-explorer') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(
              <button 
                onClick={() => setActiveSection('knowledge-source')}
                className={`hover:text-accent transition-colors ${activeSection === 'knowledge-source' || activeSection === 'kb-explorer' ? 'text-slate-900' : ''}`}
              >
                Knowledge
              </button>
          );
      } else if (activeSection === 'question-db') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button className='text-slate-900'>Question DB</button>);
      } else if (activeSection === 'prompts') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button className='text-slate-900'>System Logic</button>);
      } else if (activeSection === 'lab' || activeSection === 'quality-lab' || activeSection === 'omr-lab') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button type="button" className="text-slate-900">{
            activeSection === 'lab' ? 'Batch Forge' : activeSection === 'quality-lab' ? 'Quality Lab' : 'OMR Lab'
          }</button>);
      } else if (activeSection === 'syllabus') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button className='text-slate-900'>Syllabus</button>);
      } else if (activeSection === 'institutes') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button type="button" className="text-slate-900">Institutes</button>);
      } else if (activeSection === 'users') {
          parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
          parts.push(<button type="button" className="text-slate-900">Users</button>);
      }
      return parts;
  };

  const getTitle = () => {
    switch(activeSection) {
        case 'dashboard': return 'Administration';
        case 'kb-explorer': return selectedKb?.name || 'Explorer';
        case 'question-db': return 'Knowledge Database';
        case 'prompts': return 'System Configuration';
        case 'lab': return 'Rapid Forging Lab';
        case 'quality-lab': return 'Model Benchmarking';
        case 'syllabus': return 'Syllabus & exclusions';
        case 'omr-lab': return 'OMR Lab';
        case 'institutes': return 'Institutes & classes';
        case 'users': return 'Users';
        default: return activeSection.replace('-', ' ');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
      <header className="mb-5 px-4 md:px-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
            {getBreadcrumb().map((part, i) => <React.Fragment key={i}>{part}</React.Fragment>)}
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight capitalize">
            {getTitle()}
          </h1>
        </div>
        
        {activeSection !== 'dashboard' && (
           <button 
            onClick={() => setActiveSection('dashboard')}
            className="px-2.5 py-1 bg-white rounded-md text-[8px] font-black text-slate-500 hover:text-slate-900 uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200 shadow-sm w-fit"
           >
              <iconify-icon icon="mdi:arrow-left"></iconify-icon>
              Exit Section
           </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {renderContent()}
      </div>
    </div>
  );
};

interface AdminCardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  onClick: () => void;
}

const AdminCard: React.FC<AdminCardProps> = ({ title, description, icon, color, bg, onClick }) => (
  <div 
    onClick={onClick} 
    className="group cursor-pointer bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col gap-2"
  >
    <div className={`w-8 h-8 ${bg} ${color} rounded-md flex items-center justify-center group-hover:scale-105 transition-transform`}>
      <iconify-icon icon={icon} width="18"></iconify-icon>
    </div>
    <div>
      <h3 className="text-xs font-black text-slate-800">{title}</h3>
      <p className="text-[9px] text-slate-500 font-medium leading-tight mt-0.5">{description}</p>
    </div>
    <div className={`mt-0.5 flex items-center gap-1 ${color} font-black text-[7px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all translate-x-[-3px] group-hover:translate-x-0`}>
      <span>Enter</span>
      <iconify-icon icon="mdi:arrow-right" width="10"></iconify-icon>
    </div>
  </div>
);

export default AdminView;
