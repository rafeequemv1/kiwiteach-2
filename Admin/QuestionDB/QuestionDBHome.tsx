import React, { useState } from 'react';
import QuestionBankHome from '../QuestionBank/QuestionBankHome';
import QuestionBankMindMap from '../QuestionBank/QuestionBankMindMap';

type QuestionDbTab = 'browse' | 'map';

const QuestionDBHome = () => {
  const [tab, setTab] = useState<QuestionDbTab>('browse');

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2">
        <button
          type="button"
          onClick={() => setTab('browse')}
          className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            tab === 'browse'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Browse &amp; forge
        </button>
        <button
          type="button"
          onClick={() => setTab('map')}
          className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            tab === 'map'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Bank map
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === 'browse' ? <QuestionBankHome /> : <QuestionBankMindMap />}
      </div>
    </div>
  );
};

export default QuestionDBHome;
