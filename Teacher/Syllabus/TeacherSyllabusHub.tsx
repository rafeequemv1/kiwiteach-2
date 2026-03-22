import '../../types';
import React, { useState } from 'react';
import SyllabusManager from '../../Admin/Syllabus/SyllabusManager';
import TopicExclusionsManager from './TopicExclusionsManager';

type Tab = 'syllabus' | 'exclusions';

interface TeacherSyllabusHubProps {
  isDeveloper?: boolean;
}

const TeacherSyllabusHub: React.FC<TeacherSyllabusHubProps> = ({ isDeveloper = false }) => {
  const [tab, setTab] = useState<Tab>('syllabus');

  return (
    <div className="h-full flex flex-col bg-slate-50/50 overflow-hidden">
      <div className="shrink-0 px-6 pt-6 pb-2 flex flex-wrap gap-2 border-b border-slate-200/80 bg-white/80">
        <button
          type="button"
          onClick={() => setTab('syllabus')}
          className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'syllabus'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          Syllabi
        </button>
        <button
          type="button"
          onClick={() => setTab('exclusions')}
          className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'exclusions'
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          Topic exclusions
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'syllabus' ? <SyllabusManager isDeveloper={isDeveloper} /> : <TopicExclusionsManager />}
      </div>
    </div>
  );
};

export default TeacherSyllabusHub;
