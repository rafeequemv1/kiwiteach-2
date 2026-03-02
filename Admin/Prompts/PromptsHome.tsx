
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
    { id: 'Explanation', color: 'sky', icon: 'mdi:school-outline', label: 'Explanation Logic' },
    { id: 'Distractors', color: 'amber', icon: 'mdi:source-branch', label: 'Option/Choice Logic' },
    { id: 'Figure', color: 'purple', icon: 'mdi:image-filter-hdr', label: 'Visuals' },
    { id: 'Chemistry', color: 'cyan', icon: 'mdi:flask-outline', label: 'Chemistry' },
    { id: 'Latex', color: 'rose', icon: 'mdi:sigma', label: 'LaTeX Protocol' }
];

const DEFAULT_PROMPTS: Record<string, string> = {
    'General': `TASK: Generate elite medical entrance (NEET UG) level questions.
    - RIGOR: Clinical, analytical, and professional.
    - NEGATIVE CONSTRAINT: NEVER use the words "NCERT", "Textbook", "The Source", "Chapter", or "Passage" in the output. The question must appear as an independent scientific problem.
    - SYLLABUS CONSTRAINT: Map every question to a specific sub-topic from the syllabus.`,

    'Difficulty': `RIGOR PROTOCOL (ELITE STANDARD):
    1. **EASY (Application Standard)**: 
       - Corresponds to typical 'Medium' standard level. 
       - Frame as conceptual applications rather than pure recall. 
       - Requires 1-2 steps of logical derivation.
    2. **MEDIUM (Deep Analyzer)**: 
       - High-Standard rigor. 
       - STYLE: Increased length (50-90 words). Frame as intricate scenarios, experimental set-ups, or clinical observations. 
       - LOGIC: Requires multi-step analysis (3-4 steps) and correlating distinct scientific variables or principles from the same topic.
    3. **HARD (Elite Strategist)**: 
       - Designed for Top 1% Rankers (AIIMS/JIPMER).
       - **LENGTH**: Verbose (70-120 words), utilizing clinical vignettes, experimental data tables, or multi-statement analysis.
       - **CONSTRAINT**: Strictly within syllabus scope, testing deep theoretical nuances and cross-concept mapping.
       - **LOGIC**: Requires linking concepts from entirely different parts of the curriculum.`,

    'Explanation': `EXPLANATION PROTOCOL (CRITICAL FOR LEARNING):
- **Clarity and Depth**: Explanations MUST be comprehensive, clear, and sufficient for a student to fully understand the reasoning. They should be detailed paragraphs, not terse one-liners.
- **Step-by-Step Logic**: For questions requiring calculation or multi-step reasoning, explicitly break down the process into logical, sequential steps. Show the work.
- **Conceptual Connection**: Clearly state the core scientific principle or concept being tested and explain how it applies to arrive at the correct answer.
- **Distractor Analysis**: Briefly but effectively explain why each of the incorrect options are wrong, targeting the specific misconception each distractor represents.
- **Self-Contained**: The explanation must be a standalone piece of teaching, making complete sense without needing to refer back to external source material.`,

    'Distractors': `CHOICE & DISTRACTOR LOGIC (HIGH ENTROPY):
    1. **Plausible Distractors**: All wrong options must be scientifically grounded.
    2. **Common Errors**: Design based on frequent student misconceptions (e.g., confusing similar terms).
    3. **Numerical Nuance**: Include options resulting from common calculation slips.`,

    'Figure': `VISUAL PROTOCOL (STRICT MONOCHROME):
    - **MONOCHROME ONLY**: 0% Color. Use #000000 (Pure Black) and #FFFFFF (Pure White) only. 
    - **NO GREYSCALE**: No shading, no grey, no gradients. Use stippling (dots) for density if needed.
    - **LABEL STYLE**: Labels must be BOLD and SOLID BLACK. Cushion each label with a small solid white mask.
    - **TARGETED LABELING**: ONLY draw labels referenced in the question stem. Remove all original source text.
    - **STYLE**: Clean, high-resolution 2D technical line-art suitable for laser printing.`,
    
    'Chemistry': `EXPERT CHEMISTRY EXAM PROTOCOL (NEET/AIIMS STANDARD):

**PERSONA:** Act as a veteran chemistry professor with decades of experience setting papers for top-tier medical entrance exams. Your questions must be precise, conceptually deep, and reflect the patterns seen in high-stakes tests.

**ORGANIC CHEMISTRY EMPHASIS:**
1.  **STRUCTURE-FOCUSED QUESTIONS:** Prioritize questions where the options (A, B, C, D) are molecular structures. This is critical for testing understanding of isomerism, stereochemistry, reaction products, and reagents.
2.  **REACTION MECHANISM & SYNTHESIS:**
    *   Generate multi-step reaction sequences (like A -> B -> C). Ask for the final product, an intermediate, or a required reagent.
    *   For "Identify A, B" questions, the options should be structures or scientifically accurate names.
    *   Design problems based on named reactions, reagent-specific transformations, and tests for functional groups (e.g., Iodoform, Lucas test).
3.  **IUPAC NOMENCLATURE:** For naming questions, provide complex, branched structures involving multiple functional groups, double/triple bonds, and stereocenters to rigorously test IUPAC rules.

**FIGURE & DIAGRAM PROTOCOL (MANDATORY):**
1.  **COMPOSITE IMAGE GENERATION:** For any question involving a reaction scheme AND structural options, the 'figurePrompt' MUST command the image model to generate a SINGLE, composite diagram. This diagram must cleanly display the main reaction pathway AND the four labeled options (A, B, C, D) below it. This is non-negotiable.
2.  **VISUAL CLARITY:** All structures must be rendered as clean, unambiguous bond-line (skeletal) formulas. Ensure correct bond angles, valencies, and clear representation of stereochemistry (wedges/dashes) where relevant.
3.  **KaTeX for TEXT:** Use standard chemical formulas and KaTeX notation (e.g., H_2SO_4, CH_3COOH) for all chemical text in the question stem, options, and explanation. AVOID plain text like 'H2SO4'.`,

    'Latex': `MATH & LATEX TYPOGRAPHY PROTOCOL (CRITICAL - STRICT COMPLIANCE REQUIRED):
    
    1. **JSON ESCAPING (MANDATORY)**: 
       - The output is a JSON string. You **MUST DOUBLE-ESCAPE** all backslashes.
       - **WRONG:** "\text{hello}", "\times", "\frac"
       - **CORRECT:** "\\text{hello}", "\\times", "\\frac"
       - **Reason:** A single backslash \t is interpreted as a TAB character by parsers, destroying the LaTeX command.
    
    2. **MANDATORY DELIMITERS**: ALL mathematical expressions, symbols, variables, and equations MUST be wrapped in \`$\` signs.
       - Correct: "Calculate the velocity $v$ where $v = u + at$."
    
    3. **DIVISION SYNTAX**: 
       - ALWAYS use \`\\dfrac{numerator}{denominator}\`. 
       - Example: $\\dfrac{GM}{r^2}$
       - BANNED: Do not use \`/\` for vertical division in math.

    4. **SYMBOLS & UNITS**: 
       - Use \`\\times\` for multiplication (e.g., $4 \\times 10^5$).
       - Use standard units directly or with \`\\mathrm{}\`. Avoid nested \`\\text{}\` for simple units.
       - **Correct:** $0.5 \\mu\\mathrm{m}$ or $0.5 \\mu m$.
       - **Avoid:** $0.5 \\text{\\text{mu}m}$.`
};

const PromptsHome: React.FC = () => {
    const [prompts, setPrompts] = useState<Record<string, string>>(DEFAULT_PROMPTS);
    const [saving, setSaving] = useState(false);
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiTargetSection, setAiTargetSection] = useState<string | null>(null);
    const [isRefining, setIsRefining] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('kiwiteach_system_prompts');
        if (saved) {
            try {
                setPrompts({ ...DEFAULT_PROMPTS, ...JSON.parse(saved) });
            } catch (e) {
                console.error("Failed to parse local prompts", e);
            }
        }
    }, []);

    const handleSavePrompt = (section: string, text: string) => {
        setSaving(true);
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
            setPrompts(prev => ({ ...prev, [aiTargetSection]: refined }));
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
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row gap-6 items-center justify-between z-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 via-purple-400 to-indigo-400"></div>
                <div className="flex items-center gap-5">
                    <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/20">
                        <iconify-icon icon="mdi:console" width="28" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">System Control</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Global AI Logic Configuration</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <button onClick={handleResetDefaults} className="text-xs font-black text-slate-400 hover:text-rose-50 uppercase tracking-widest transition-colors flex items-center gap-2">
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
                            <button onClick={() => { setAiTargetSection(section.id); setIsAiOpen(true); }} className="text-indigo-400 hover:text-indigo-600 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider transition-colors">
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
                                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest pl-2">{(prompts[section.id] || '').length} chars</span>
                                <button onClick={() => handleSavePrompt(section.id, prompts[section.id])} disabled={saving} className="bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 active:scale-95">
                                    <iconify-icon icon="mdi:content-save-outline" /> Apply
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isAiOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-white animate-slide-up">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                <iconify-icon icon="mdi:magic-staff" width="24" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800">Refine Prompt</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target: {aiTargetSection}</p>
                            </div>
                        </div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Instruction</label>
                        <textarea autoFocus value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} placeholder="e.g. Make the distractors strictly focused on numerical sign errors..." className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 mb-6 resize-none" />
                        <div className="flex gap-3">
                            <button onClick={() => setIsAiOpen(false)} className="flex-1 py-3 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                            <button onClick={handleAiRefine} disabled={isRefining || !aiInstruction.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95">
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
