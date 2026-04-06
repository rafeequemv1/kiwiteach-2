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
  General: `TASK: Generate NTA NEET (UG) style assessment items with a clear ladder of depth.
    - GOAL: Match the real exam arc — from accessible, well-scored items through standard NEET reasoning to a thin band of elite discriminators. Easy → Medium → Hard must mean visibly increasing cognitive load, not the same stem with a different label.
    - TONE: Clinical and analytical where appropriate; always professional. Stems read like a formal entrance paper, not a textbook excerpt.
    - NEGATIVE CONSTRAINT: NEVER use the words "NCERT", "Textbook", "The Source", "Chapter", or "Passage" in the output. The question must appear as an independent scientific problem.
    - SYLLABUS CONSTRAINT: Map every question to a specific sub-topic from the syllabus.`,

  Difficulty: `NEET DIFFICULTY CALIBRATION (STRICT LADDER — EASY < MEDIUM < HARD):

    1. EASY (Accessible / high yield — like the “scoring” zone on NEET papers):
       - STEM: Clear, concise (typically ~20–45 words unless a table/list is needed). One main idea.
       - COGNITION: Direct recall of definitions, facts, classifications, standard diagrams, or single-step application (one logical hop). Comparable to straightforward PYQ-style recall and “obvious if you know the line” items.
       - NOT THIS TIER: Multi-paragraph vignettes, deep traps, or cross-chapter synthesis — those belong in Medium/Hard.

    2. MEDIUM (Standard NEET core — thoughtful, exam-authentic):
       - STEM: Moderate length (~35–70 words) or compact data; may use short scenarios, exceptions, “which is correct”, or two linked concepts within the same chapter/theme.
       - COGNITION: 2–4 reasoning steps, compare/contrast, mild numerical reasoning, or ruling out options with real science (not guessing from wording).
       - DISTRACTORS: Plausible to a prepared student; at least two wrong options should tempt someone who partially knows the topic.

    3. HARD (Elite / repeater tier — top ~0.5–2% discrimination, still syllabus-true):
       - AUDIENCE: Students who already know the chapter cold and need items that separate “good” from “airtight”.
       - STEM: Often longer (~55–110 words), dense, or multi-part (assertion–reason, multi-statement, integrated numeric + concept, edge cases, “except”, subtle data).
       - COGNITION: Cross-concept links within the syllabus, uncommon but fair twists, strict attention to exceptions, or reasoning that only resolves after full working. Must feel worth the label — not just a verbose Easy question.
       - QUALITY BAR: Every Hard item should be something a committed repeater respects as “exam-winning” preparation material.`,

  Explanation: `EXPLANATION PROTOCOL (CRITICAL FOR LEARNING):
- **Clarity and Depth**: Explanations MUST be comprehensive, clear, and sufficient for a student to fully understand the reasoning. They should be detailed paragraphs, not terse one-liners.
- **Step-by-Step Logic**: For questions requiring calculation or multi-step reasoning, explicitly break down the process into logical, sequential steps. Show the work.
- **Conceptual Connection**: Clearly state the core scientific principle or concept being tested and explain how it applies to arrive at the correct answer.
- **Distractor Analysis**: Briefly but effectively explain why each of the incorrect options are wrong, targeting the specific misconception each distractor represents.
- **Self-Contained**: The explanation must be a standalone piece of teaching, making complete sense without needing to refer back to external source material.`,

  Distractors: `OPTION & DISTRACTOR LOGIC (SCALE WITH DIFFICULTY):
    - EASY: Wrong options are clearly weaker scientifically once the key fact is known; avoid cruel trick wording.
    - MEDIUM: At least two distractors are highly plausible; design from typical misconceptions and “almost right” statements.
    - HARD: All four choices defensible on a quick read; wrong answers map to specific expert-level slips (sign errors, wrong exception, conflated mechanisms). No throwaway fillers on Hard items.`,

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
