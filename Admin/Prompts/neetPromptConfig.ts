/** Shared NEET admin prompt defaults and section metadata (Prompts hub + detail page). */

import { KIWITEACH_NEET_PROMPT_EXTRAS_KEY } from '../../services/neetReferenceLayer';

export const KIWITEACH_SYSTEM_PROMPTS_KEY = 'kiwiteach_system_prompts';

export { KIWITEACH_NEET_PROMPT_EXTRAS_KEY };

export type NeetPromptExtras = {
  referenceLayerEnabled: boolean;
  /** Style / depth bar from reference papers (Mathpix text). Not copied verbatim in outputs. */
  referenceLayerText: string;
};

export const DEFAULT_NEET_PROMPT_EXTRAS: NeetPromptExtras = {
  referenceLayerEnabled: false,
  referenceLayerText: '',
};

export const REFERENCE_LAYER_HELP = `Paste 3–10 representative items from your reference paper (Mathpix or plain text). This block is a quality bar only: match stem length, reasoning steps, option style, and difficulty feel. Do not ask the model to cite or reproduce the source. Remove paper titles and institute names.`;

export const SECTIONS: {
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

export const DEFAULT_PROMPTS: Record<string, string> = {
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

export function loadNeetPromptExtras(): NeetPromptExtras {
  if (typeof window === 'undefined') return { ...DEFAULT_NEET_PROMPT_EXTRAS };
  try {
    const raw = localStorage.getItem(KIWITEACH_NEET_PROMPT_EXTRAS_KEY);
    if (!raw) return { ...DEFAULT_NEET_PROMPT_EXTRAS };
    const parsed = JSON.parse(raw) as Partial<NeetPromptExtras>;
    return {
      referenceLayerEnabled: Boolean(parsed.referenceLayerEnabled),
      referenceLayerText: typeof parsed.referenceLayerText === 'string' ? parsed.referenceLayerText : '',
    };
  } catch {
    return { ...DEFAULT_NEET_PROMPT_EXTRAS };
  }
}

export function saveNeetPromptExtras(extras: NeetPromptExtras) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KIWITEACH_NEET_PROMPT_EXTRAS_KEY, JSON.stringify(extras));
}
