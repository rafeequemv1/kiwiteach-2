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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap gap-1 rounded-md border border-zinc-200 bg-white p-1 shadow-sm md:gap-1.5">
        <button
          type="button"
          onClick={() => setTab('syllabus')}
          className={`rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
            tab === 'syllabus'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Syllabi
        </button>
        <button
          type="button"
          onClick={() => setTab('exclusions')}
          className={`rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
            tab === 'exclusions'
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Topic exclusions
        </button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 shadow-sm md:p-4">
        {tab === 'syllabus' ? <SyllabusManager isDeveloper={isDeveloper} /> : <TopicExclusionsManager />}
      </div>
    </div>
  );
};

export default TeacherSyllabusHub;
