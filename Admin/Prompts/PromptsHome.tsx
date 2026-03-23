import '../../types';
import React, { useState, useEffect } from 'react';
import { refineSystemPrompt } from '../../services/geminiService';
import { NEURAL_STUDIO_FORGE_SECTIONS } from '../../services/neuralStudioPromptBlueprint';

type PromptsTab = 'system' | 'neural_forge';

/** Extensible prompt tracks — only NEET is wired today. */
type PromptSetId = 'neet';

interface PromptSetMeta {
  id: PromptSetId;
  label: string;
  description: string;
  icon: string;
}

const PROMPT_SETS: PromptSetMeta[] = [
  {
    id: 'neet',
    label: 'NEET UG',
    description: 'Medical entrance (NEET) — system prompts used for generation and refinement.',
    icon: 'mdi:stethoscope',
  },
];

const SECTIONS: {
  id: string;
  label: string;
  icon: string;
  iconBg: string;
  iconText: string;
  labelClass: string;
  wide?: boolean;
}[] = [
  { id: 'General', label: 'Core Logic', icon: 'mdi:tune', iconBg: 'bg-zinc-100', iconText: 'text-zinc-700', labelClass: 'text-zinc-700', wide: true },
  { id: 'Difficulty', label: 'Level Rules', icon: 'mdi:scale-balance', iconBg: 'bg-emerald-50', iconText: 'text-emerald-700', labelClass: 'text-emerald-700' },
  { id: 'Explanation', label: 'Explanation Logic', icon: 'mdi:school-outline', iconBg: 'bg-sky-50', iconText: 'text-sky-700', labelClass: 'text-sky-700' },
  { id: 'Distractors', label: 'Option / choice logic', icon: 'mdi:source-branch', iconBg: 'bg-amber-50', iconText: 'text-amber-800', labelClass: 'text-amber-800' },
  { id: 'Figure', label: 'Visuals', icon: 'mdi:image-filter-hdr', iconBg: 'bg-violet-50', iconText: 'text-violet-700', labelClass: 'text-violet-700' },
  { id: 'Chemistry', label: 'Chemistry', icon: 'mdi:flask-outline', iconBg: 'bg-cyan-50', iconText: 'text-cyan-800', labelClass: 'text-cyan-800' },
  { id: 'Latex', label: 'LaTeX protocol', icon: 'mdi:sigma', iconBg: 'bg-rose-50', iconText: 'text-rose-700', labelClass: 'text-rose-700' },
];

const DEFAULT_PROMPTS: Record<string, string> = {
  General: `TASK: Generate elite medical entrance (NEET UG) level questions.
    - RIGOR: Clinical, analytical, and professional.
    - NEGATIVE CONSTRAINT: NEVER use the words "NCERT", "Textbook", "The Source", "Chapter", or "Passage" in the output. The question must appear as an independent scientific problem.
    - SYLLABUS CONSTRAINT: Map every question to a specific sub-topic from the syllabus.`,

  Difficulty: `RIGOR PROTOCOL (ELITE STANDARD):
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

  Explanation: `EXPLANATION PROTOCOL (CRITICAL FOR LEARNING):
- **Clarity and Depth**: Explanations MUST be comprehensive, clear, and sufficient for a student to fully understand the reasoning. They should be detailed paragraphs, not terse one-liners.
- **Step-by-Step Logic**: For questions requiring calculation or multi-step reasoning, explicitly break down the process into logical, sequential steps. Show the work.
- **Conceptual Connection**: Clearly state the core scientific principle or concept being tested and explain how it applies to arrive at the correct answer.
- **Distractor Analysis**: Briefly but effectively explain why each of the incorrect options are wrong, targeting the specific misconception each distractor represents.
- **Self-Contained**: The explanation must be a standalone piece of teaching, making complete sense without needing to refer back to external source material.`,

  Distractors: `CHOICE & DISTRACTOR LOGIC (HIGH ENTROPY):
    1. **Plausible Distractors**: All wrong options must be scientifically grounded.
    2. **Common Errors**: Design based on frequent student misconceptions (e.g., confusing similar terms).
    3. **Numerical Nuance**: Include options resulting from common calculation slips.`,

  Figure: `VISUAL PROTOCOL (STRICT MONOCHROME):
    - **MONOCHROME ONLY**: 0% Color. Use #000000 (Pure Black) and #FFFFFF (Pure White) only. 
    - **NO GREYSCALE**: No shading, no grey, no gradients. Use stippling (dots) for density if needed.
    - **LABEL STYLE**: Labels must be BOLD and SOLID BLACK. Cushion each label with a small solid white mask.
    - **TARGETED LABELING**: ONLY draw labels referenced in the question stem. Remove all original source text.
    - **STYLE**: Clean, high-resolution 2D technical line-art suitable for laser printing.`,

  Chemistry: `EXPERT CHEMISTRY EXAM PROTOCOL (NEET/AIIMS STANDARD):

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

  Latex: `MATH & LATEX TYPOGRAPHY PROTOCOL (CRITICAL - STRICT COMPLIANCE REQUIRED):
    
    1. **JSON ESCAPING (MANDATORY)**: 
       - The output is a JSON string. You **MUST DOUBLE-ESCAPE** all backslashes.
       - **WRONG:** "\text{hello}", "\times", "\frac"
       - **CORRECT:** "\\text{hello}", "\\times", "\\frac"
       - **Reason:** A single backslash \\t is interpreted as a TAB character by parsers, destroying the LaTeX command.
    
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
       - **Avoid:** $0.5 \\text{\\text{mu}m}$.`,
};

interface PromptsHomeProps {
  /** Hide duplicate page title when wrapped in Admin section frame */
  embedded?: boolean;
}

const PromptsHome: React.FC<PromptsHomeProps> = ({ embedded }) => {
  const [activePromptSet, setActivePromptSet] = useState<PromptSetId>('neet');
  const [activeTab, setActiveTab] = useState<PromptsTab>('system');
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
        console.error('Failed to parse local prompts', e);
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
    if (confirm('Reset all prompts to system defaults?')) {
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
      setPrompts((prev) => ({ ...prev, [aiTargetSection]: refined }));
      setIsAiOpen(false);
      setAiInstruction('');
    } catch (e: any) {
      alert('AI Error: ' + e.message);
    } finally {
      setIsRefining(false);
    }
  };

  const neetPreview = prompts['General'] || DEFAULT_PROMPTS['General'];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 pb-2">
      {!embedded && (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Prompts</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            System logic for generation and Neural Studio forge documentation.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Prompt sets</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROMPT_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => setActivePromptSet(set.id)}
              className={`rounded-lg border text-left transition-colors ${
                activePromptSet === set.id
                  ? 'border-zinc-900 bg-zinc-900 text-white ring-1 ring-zinc-900'
                  : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <div className="border-b border-zinc-200/80 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                      activePromptSet === set.id ? 'bg-white/15' : 'bg-zinc-100'
                    }`}
                  >
                    <iconify-icon
                      icon={set.icon}
                      className={activePromptSet === set.id ? 'text-white' : 'text-zinc-700'}
                      width="22"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${activePromptSet === set.id ? 'text-white' : 'text-zinc-900'}`}>
                      {set.label}
                    </p>
                    <p
                      className={`mt-0.5 text-[11px] leading-snug ${
                        activePromptSet === set.id ? 'text-zinc-200' : 'text-zinc-500'
                      }`}
                    >
                      {set.description}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3">
                <p
                  className={`mb-1.5 text-[10px] font-medium uppercase tracking-wide ${
                    activePromptSet === set.id ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  Core prompt preview
                </p>
                <pre
                  className={`max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-[11px] leading-relaxed custom-scrollbar ${
                    activePromptSet === set.id
                      ? 'border-white/20 bg-black/20 text-zinc-100'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                  }`}
                >
                  {set.id === 'neet' ? neetPreview : ''}
                </pre>
              </div>
            </button>
          ))}

          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center">
            <iconify-icon icon="mdi:layers-plus" className="text-zinc-300" width="36" />
            <p className="mt-2 text-sm font-medium text-zinc-600">More prompt sets</p>
            <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-zinc-500">
              Additional exam tracks (for example JEE or state boards) will appear here as separate cards.
            </p>
          </div>
        </div>
      </section>

      {activePromptSet === 'neet' && (
        <>
          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">Edit the full prompt library for this set below.</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('system')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === 'system' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  System prompts
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('neural_forge')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === 'neural_forge' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Neural Studio forge
                </button>
              </div>
              {activeTab === 'system' && (
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs font-medium text-zinc-500 hover:text-red-600"
                >
                  Reset defaults
                </button>
              )}
            </div>
          </div>

          {activeTab === 'neural_forge' ? (
            <div className="flex-1 space-y-4 overflow-y-auto pb-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px] leading-relaxed text-zinc-700">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">How questions are forged</p>
                <p className="mt-2">
                  This documents how the app builds the Gemini request in{' '}
                  <code className="rounded bg-white px-1 py-0.5 text-[11px] text-zinc-800">generateQuizQuestions</code>.
                  Editable blocks live under <strong>System prompts</strong>; the forge also adds dynamic mandates (types,
                  difficulty, figures, syllabus) and optional source text or images.
                </p>
              </div>
              {NEURAL_STUDIO_FORGE_SECTIONS.map((section) => (
                <div key={section.title} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-800">{section.title}</h3>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-600">
                    {section.body}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto pb-4 xl:grid-cols-2">
              {SECTIONS.map((section) => (
                <div
                  key={section.id}
                  className={`flex h-[400px] flex-col gap-2 ${section.wide ? 'xl:col-span-2' : ''}`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${section.iconBg} ${section.iconText}`}
                      >
                        <iconify-icon icon={section.icon} width="14" />
                      </div>
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${section.labelClass}`}>
                        {section.label}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAiTargetSection(section.id);
                        setIsAiOpen(true);
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900"
                    >
                      <iconify-icon icon="mdi:auto-fix" width="14" />
                      Refine
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-zinc-300">
                    <textarea
                      value={prompts[section.id] || ''}
                      onChange={(e) => setPrompts((p) => ({ ...p, [section.id]: e.target.value }))}
                      className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-[11px] leading-relaxed text-zinc-700 outline-none"
                      placeholder={`Define strict rules for ${section.id} questions...`}
                    />
                    <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-3 py-2">
                      <span className="pl-1 text-[10px] tabular-nums text-zinc-400">
                        {(prompts[section.id] || '').length} chars
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSavePrompt(section.id, prompts[section.id])}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <iconify-icon icon="mdi:content-save-outline" width="14" />
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isAiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                <iconify-icon icon="mdi:auto-fix" width="22" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Refine prompt</h3>
                <p className="text-[11px] text-zinc-500">Target: {aiTargetSection}</p>
              </div>
            </div>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-600">Instruction</label>
            <textarea
              autoFocus
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="e.g. Make distractors focus on sign errors in numerical answers…"
              className="mb-4 h-28 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAiOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAiRefine}
                disabled={isRefining || !aiInstruction.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {isRefining ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <iconify-icon icon="mdi:auto-fix" width="16" />
                )}
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
