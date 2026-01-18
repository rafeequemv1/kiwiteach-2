
import '../../types';
import React from 'react';

// Hardcoded types that exist in the system (e.g. TestCreatorView)
const INBUILT_TYPES = [
    { id: 'mcq', label: 'Standard MCQ', icon: 'mdi:format-list-numbered', desc: '4 Options, 1 Correct. The gold standard for objective testing.' },
    { id: 'reasoning', label: 'Assertion-Reason', icon: 'mdi:brain-freeze', desc: 'Tests causal relationships between two statements.' },
    { id: 'matching', label: 'Matrix Matching', icon: 'mdi:grid-large', desc: 'Match items from Column I with Column II.' },
    { id: 'statements', label: 'Statement I/II', icon: 'mdi:card-text-outline', desc: 'Evaluate truthfulness of two independent statements.' },
    { id: 'statement_combo', label: 'Combination Choice', icon: 'mdi:format-list-checks', desc: 'Select correct combination (e.g. Only 1 and 3 are correct).' },
    { id: 'true_false', label: 'True / False', icon: 'mdi:check-circle-outline', desc: 'Binary choice rapid fire questions.' },
];

const QuestionTypesManager: React.FC = () => {
    return (
        <div className="animate-fade-in space-y-8 max-w-5xl mx-auto">
            <header className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                        <iconify-icon icon="mdi:format-list-bulleted-type" width="32" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Format Registry</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">In-Built System Types</p>
                    </div>
                </div>
                <div className="flex items-center gap-6 px-8 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="text-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Available</span>
                        <span className="text-lg font-black text-slate-800">{INBUILT_TYPES.length}</span>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {INBUILT_TYPES.map(type => (
                    <div 
                        key={type.id} 
                        className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-indigo-100 transition-all group"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                <iconify-icon icon={type.icon} width="24" />
                            </div>
                            <div className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-slate-50 text-slate-400 border border-slate-100">
                                {type.id}
                            </div>
                        </div>

                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-tight mb-2">{type.label}</h3>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{type.desc}</p>
                    </div>
                ))}
            </div>
            
            <div className="text-center pt-8">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    These formats are hardcoded into the generation engine.
                </p>
            </div>
        </div>
    );
};

export default QuestionTypesManager;
