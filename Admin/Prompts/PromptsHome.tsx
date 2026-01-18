
import '../../types';
import React, { useState, useEffect } from 'react';
import { refineSystemPrompt } from '../../services/geminiService';

interface Prompt {
    section: string;
    prompt_text: string;
}

const SECTIONS = [
    { id: 'General', color: 'indigo', icon: 'mdi:tune', label: 'Core Logic' },
    { id: 'Difficulty', color: 'emerald', icon: 'mdi:scale-balance', label: 'Level Rules' },
    { id: 'Distractors', color: 'amber', icon: 'mdi:source-branch', label: 'Option/Choice Logic' },
    { id: 'Figure', color: 'purple', icon: 'mdi:image-filter-hdr', label: 'Visuals' },
    { id: 'Chemistry', color: 'cyan', icon: 'mdi:flask-outline', label: 'Chemistry' }
];

// Default prompts matching geminiService.ts
const DEFAULT_PROMPTS: Record<string, string> = {
    'General': `TASK: Generate specific, high-quality questions for a competitive entrance exam (NEET/JEE level).
    - Tone: Formal, academic, and clinically precise. No conversational filler.
    - Context: Questions must be STANDALONE. Do not refer to "the text provided" unless analyzing a specific passage included in the question itself.
    - Citations: If source material is provided, identify the specific page number in 'pageNumber'.`,

    'Difficulty': `STRICT DIFFICULTY STANDARDS:
    1. **EASY (Foundation)**: Tests core recall and direct definitions. Must use formal phrasing (e.g. "Which property primarily determines..." vs "What is...").
    2. **MEDIUM (Standard)**: Requires linking two distinct concepts, multi-step calculation, or condition analysis.
    3. **HARD (Ranker)**: Advanced application, interdisciplinary synthesis (e.g., Physics logic in Chemistry), or exceptions to rules.`,

    'Distractors': `CHOICE & DISTRACTOR LOGIC (CRITICAL):
    1. **Loosely Related Distractors**: Wrong options must be scientifically plausible and related to the topic. Use terminology that sounds correct to a novice but is clearly wrong to an expert.
    2. **Hard Choice**: Avoid obvious outliers. Distractors should represent common misconceptions or calculation errors.
    3. **Special Options**: In 25-30% of questions, YOU MUST use options like:
       - "All of the above"
       - "None of the above"
       - "Both A and B"
       - "Data insufficient"
    4. **Balance**: When special options are used, ensure they are the CORRECT answer roughly 40% of the time. Do not make them always correct or always wrong.`,

    'Figure': `VISUAL CONTENT RULES:
    - **Figure Mode**: For questions requiring a diagram, provide a detailed 'figurePrompt'.
    - **Edit Instructions**: If 'sourceImageIndex' is valid, write the prompt as an instruction to an illustrator to MODIFY the source image (e.g., "Label the mitochondria", "Show cross-section").
    - **New Figures**: If generating from scratch, describe the diagram in high-contrast scientific line-art style.`,
    
    'Chemistry': `CHEMISTRY FORMATTING:
    - Include SMILES strings for chemical structures in [SMILES:xyz] format.
    - Ensure stereochemistry and aromaticity are accurate.`
};

const PromptsHome: React.FC = () => {
    // State now manages local overrides
    const [prompts, setPrompts] = useState<Record<string, string>>(DEFAULT_PROMPTS);
    const [saving, setSaving] = useState(false);

    // AI Refiner State
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiTargetSection, setAiTargetSection] = useState<string | null>(null);
    const [isRefining, setIsRefining] = useState(false);

    useEffect(() => {
        // Load from Local Storage on mount
        const saved = localStorage.getItem('kiwiteach_system_prompts');
        if (saved) {
            try {
                // Merge saved prompts with defaults to ensure new keys appear
                setPrompts({ ...DEFAULT_PROMPTS, ...JSON.parse(saved) });
            } catch (e) {
                console.error("Failed to parse local prompts", e);
            }
        }
    }, []);

    const handleSavePrompt = (section: string, text: string) => {
        setSaving(true);
        // Simulate network delay for UX
        setTimeout(() => {
            const updated = { ...prompts, [section]: text };
            setPrompts(updated);
            localStorage.setItem('kiwiteach_system_prompts', JSON.stringify(updated));
            setSaving(false);
        }, 500);
    };

    const handleResetDefaults = () => {
        if(confirm("Reset all prompts to System Defaults?")) {
            setPrompts(DEFAULT_PROMPTS);
            localStorage.removeItem('kiwiteach_system_prompts');
        }
    };

    const handleAiRefine = async () => {
        if (!aiTargetSection || !aiInstruction) return;
        setIsRefining(true);
        try {
            const currentText = prompts[aiTargetSection];
            const refined = await refineSystemPrompt(currentText, aiInstruction);
            
            setPrompts(prev => ({
                ...prev,
                [aiTargetSection]: refined
            }));
            setIsAiOpen(false);
            setAiInstruction('');
        } catch (e: any) {
            alert("AI Error: " + e.message);
        } finally {
            setIsRefining(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6 animate-fade-in pb-10">
            {/* Top Control Center */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row gap-6 items-center justify-between z-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 via-purple-400 to-indigo-400"></div>
                
                <div className="flex items-center gap-5">
                    <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/20">
                        <iconify-icon icon="mdi:console" width="28" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">System Control</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Global AI Logic Configuration</p>
                    </div>
                </div>

                <div className="flex gap-4 items-center">
                    <button 
                        onClick={handleResetDefaults}
                        className="text-xs font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <iconify-icon icon="mdi:restore" /> Reset Defaults
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-4 pb-10">
                {SECTIONS.map(section => (
                    <div key={section.id} className={`flex flex-col gap-3 ${section.id === 'General' ? 'xl:col-span-2' : ''} h-[400px] animate-slide-up`}>
                        <div className="flex justify-between items-center px-1">
                            <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center bg-${section.color}-50 text-${section.color}-500`}>
                                    <iconify-icon icon={section.icon} width="14" />
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-widest text-${section.color}-600`}>{section.label}</span>
                            </div>
                            <button 
                                onClick={() => { setAiTargetSection(section.id); setIsAiOpen(true); }}
                                className="text-indigo-400 hover:text-indigo-600 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider transition-colors"
                            >
                                <iconify-icon icon="mdi:magic-staff" /> Refine
                            </button>
                        </div>
                        
                        <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group focus-within:ring-4 focus-within:ring-indigo-50 focus-within:border-indigo-200">
                            <textarea
                                value={prompts[section.id] || ''}
                                onChange={e => setPrompts(p => ({ ...p, [section.id]: e.target.value }))}
                                className="flex-1 w-full p-5 text-[11px] font-mono leading-relaxed resize-none outline-none text-slate-600 bg-transparent"
                                placeholder={`Define strict rules for ${section.id} questions...`}
                            />
                            <div className="p-3 border-t border-slate-50 bg-slate-50/50 flex justify-between items-center">
                                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest pl-2">
                                    {(prompts[section.id] || '').length} chars
                                </span>
                                <button 
                                    onClick={() => handleSavePrompt(section.id, prompts[section.id])}
                                    disabled={saving}
                                    className="bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 active:scale-95"
                                >
                                    <iconify-icon icon="mdi:content-save-outline" /> Apply
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* AI Refiner Modal */}
            {isAiOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-white animate-slide-up">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                <iconify-icon icon="mdi:magic-staff" width="24" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800">Refine Prompt</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Target: {aiTargetSection}
                                </p>
                            </div>
                        </div>

                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Instruction</label>
                        <textarea
                            autoFocus
                            value={aiInstruction}
                            onChange={e => setAiInstruction(e.target.value)}
                            placeholder="e.g. Make the distractors strictly focused on numerical sign errors..."
                            className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 mb-6 resize-none"
                        />

                        <div className="flex gap-3">
                            <button onClick={() => setIsAiOpen(false)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                            <button 
                                onClick={handleAiRefine}
                                disabled={isRefining || !aiInstruction.trim()}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                {isRefining ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <iconify-icon icon="mdi:auto-fix" />}
                                Generate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptsHome;
