
import '../types';
import React, { useState } from 'react';
import KnowledgeSourceHome from './KnowledgeSource/KnowledgeSourceHome';
import KnowledgeBaseExplorer from './KnowledgeSource/KnowledgeBaseExplorer';
import QuestionDBHome from './QuestionDB/QuestionDBHome';
import PromptsHome from './Prompts/PromptsHome';
import SchoolManager from '../Settings/Schools/SchoolManager';

type AdminSection = 'dashboard' | 'knowledge-source' | 'kb-explorer' | 'question-db' | 'prompts' | 'campus';

interface KnowledgeBase {
  id: string;
  name: string;
}

interface AdminViewProps {
  schools: any[];
  schoolClasses: any[];
  onRefresh: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ schools, schoolClasses, onRefresh }) => {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setActiveSection('kb-explorer');
  };

  const renderContent = () => {
    switch (activeSection) {
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
      case 'campus':
        return <SchoolManager schools={schools} schoolClasses={schoolClasses} onRefresh={onRefresh} />;
      default:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
              color="text-emerald-600"
              bg="bg-emerald-50"
              onClick={() => setActiveSection('knowledge-source')}
            />
             <AdminCard 
              title="Campus Structure"
              description="Manage schools and classrooms."
              icon="mdi:school-outline"
              color="text-indigo-600"
              bg="bg-indigo-50"
              onClick={() => setActiveSection('campus')}
            />
            <AdminCard 
              title="System Logic"
              description="Configure AI generation rules & prompts."
              icon="mdi:console"
              color="text-violet-600"
              bg="bg-violet-50"
              onClick={() => setActiveSection('prompts')}
            />
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
      } else if (activeSection === 'campus') {
        parts.push(<iconify-icon icon="mdi:chevron-right" className="opacity-40" />);
        parts.push(<button className='text-slate-900'>Campus Structure</button>);
      }
      return parts;
  };

  const getTitle = () => {
    switch(activeSection) {
        case 'dashboard': return 'Administration';
        case 'kb-explorer': return selectedKb?.name || 'Explorer';
        case 'question-db': return 'Knowledge Database';
        case 'prompts': return 'System Configuration';
        case 'campus': return 'Campus Structure';
        default: return activeSection.replace('-', ' ');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 animate-fade-in font-sans">
      <header className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
            onClick={() => {
              if (activeSection === 'kb-explorer') setActiveSection('knowledge-source');
              else setActiveSection('dashboard');
            }}
            className="px-2.5 py-1 bg-white rounded-md text-[8px] font-black text-slate-500 hover:text-slate-900 uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200 shadow-sm"
           >
              <iconify-icon icon="mdi:arrow-left"></iconify-icon>
              Back
           </button>
        )}
      </header>

      <div className="min-h-[400px]">
        {renderContent()}
      </div>

      {activeSection === 'dashboard' && (
        <div className="mt-6 bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-center text-center">
             <div className="max-w-sm">
                <iconify-icon icon="mdi:shield-check-outline" className="text-slate-300 text-xl mb-1"></iconify-icon>
                <h4 className="text-[8px] font-black text-slate-800 uppercase tracking-widest mb-0.5">Secure Management Panel</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                    Define curriculum structures, question patterns, and settings with global persistence.
                </p>
             </div>
        </div>
      )}
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
    className="group cursor-pointer bg-white rounded-lg p-3.5 border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col gap-2"
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
