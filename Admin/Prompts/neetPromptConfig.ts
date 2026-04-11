/** Shared NEET admin prompt defaults and section metadata (Prompts hub + detail page). */

import { KIWITEACH_NEET_PROMPT_EXTRAS_KEY } from '../../services/neetReferenceLayer';
import { CHOICE_DIVERSITY_BATCH_RULES } from '../../services/neuralStudioPromptBlueprint';

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
    - OPTION VARIETY (BATCH): Across each batch, include a reasonable share of numerically framed four-option sets and of near-miss / confusion-style distractors where the topic allows—see Distractors and Neural Studio forge protocols (approx. ~25–35% each, not every item).
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
    - HARD: All four choices defensible on a quick read; wrong answers map to specific expert-level slips (sign errors, wrong exception, conflated mechanisms). No throwaway fillers on Hard items.
${CHOICE_DIVERSITY_BATCH_RULES}`,

  Figure: `VISUAL PROTOCOL (STRICT MONOCHROME):
    - **MONOCHROME ONLY**: 0% Color. Use #000000 (Pure Black) and #FFFFFF (Pure White) only. 
    - **NO GREYSCALE**: No shading, no grey, no gradients. Use stippling (dots) for density if needed.
    - **LABEL STYLE**: Labels must be BOLD and SOLID BLACK. Cushion each label with a small solid white mask.
    - **INTEGRAL, NOT REDUNDANT**: The figure must add information the stem cannot (layout, single structure, graph, apparatus). **Do not** redraw a full multi-step reaction or long scheme **already written in the stem**.
    - **FIGURE-ESSENTIAL STEM (STRICT — NON-NEGOTIABLE)**: A student with the figure **hidden** must **not** be able to answer correctly from stem + options alone. **Forbidden**: naming, defining, or quoting the exact process / technique / structure / pathway that the image is meant to show (e.g. do **not** write “spooling” in the stem if the figure illustrates spooling — that makes the image decorative). **Forbidden**: prose that **describes the same scene** the drawing shows (e.g. “thread-like DNA lifted on a glass rod from ethanol”) when that is exactly what is drawn. **Required**: the stem must force **visual interpretation** — e.g. ask what the **illustrated** setup represents, identify the **method shown**, or use **neutral** wording (“The procedure depicted…”, “As shown in the figure…”) **without** giving away the named technique or answer in text. Options may name candidates; the stem must not collapse the item to recall of a term already stated above the image.
    - **NO FOUR-OPTION ANSWER STRIP IN ONE FIGURE**: Do not command one image that shows **all four** MCQ answer structures labeled **A–D** (exam option letters). Put structures in **JSON options** (KaTeX / inline chem). **Allowed PYQ layouts**: a **stem** figure with **(I)(II)(III)** in a row, a reaction arrow ending in **?**, resonance sets, or curved-arrow mechanisms labeled **(1)–(4)** when the stem compares those patterns.
    - **TARGETED LABELING**: ONLY draw labels referenced in the question stem. Remove all original source text; never copy an entire labeled textbook figure if the question only needs one or two markers.
    - **LABEL-TYPE vs CONTEXT-ONLY**: If the stem compares numbered panels **(I)(II)(III)** or sites P/Q/R, the figure must show those markers. **Organic chemistry** rarely uses a totally unlabeled stem figure — use **?**, Roman numerals, or atom labels as the stem demands. Reserve “no on-image letters” for generic graphs or non-chem apparatus when appropriate.
    - **NO DUAL LABELING**: Never show both a part marker (P, Q, R) and the written name of that part on the figure. **Forbidden**: on-image captions that mix prose with letters (e.g. "Vegetative cell P", "Nucleus Q") — the diagram may show **only** P, Q, R, … with leader lines when needed; names stay in stem/options only.
    - **STYLE**: Clean, high-resolution 2D technical line-art suitable for laser printing.`,

  Chemistry: `EXPERT CHEMISTRY EXAM PROTOCOL (NEET/AIIMS STANDARD):

**PERSONA:** Act as a veteran chemistry professor with decades of experience setting papers for top-tier medical entrance exams. Your questions must be precise, conceptually deep, and reflect the patterns seen in high-stakes tests.

**ORGANIC CHEMISTRY EMPHASIS:**
1.  **STRUCTURE-FOCUSED OPTIONS:** Prioritize items where options (1–4) are **molecular structures in KaTeX** (bond-line / condensed) — isomerism, acidity, stability, products, carbocations, etc., as in NEET/AIIMS.
2.  **STEM FIGURES (GOC / REACTION):** The **main figure** (figurePrompt) should usually show **bond-line chemistry**: **(I)(II)(III)** rows, **reaction arrows** with **?** for unknown product/intermediate, **resonance** sets, **curved-arrow** mechanisms, or **labeled sites** on one framework. Avoid random lab glassware unless the syllabus item is experimental technique.
3.  **MECHANISM & SYNTHESIS:** Multi-step sequences; ask for product, intermediate, reagent, or correct electron-pushing. Mask answers in the diagram with **?** or **P** when options are candidate structures.
4.  **IUPAC & PROPERTY RANKING:** Naming, heat of hydrogenation, hyperconjugation, etc. — stem figure shows compounds under comparison; options are orders, text, or structures per PYQ style.

**FIGURE & DIAGRAM PROTOCOL (MANDATORY):**
1.  **STEM FIGURE vs OPTION STRUCTURES:** The **single** rendered figure illustrates the **stem** (reaction row, panels, mechanism). The **four** answer structures go in **options[]** as KaTeX — **not** one composite image labeled A–D. Exception: stem shows **four small mechanism diagrams (1)–(4)** to choose between.
2.  **REFERENCE PAGE:** With PDF/DOCX references, **sourceImageIndex** must index the bitmap that **actually contains** the scheme you trace — wrong index mis-pairs crop and text.
3.  **VISUAL CLARITY:** Clean skeletal art; correct valency/stereo when relevant; monochrome.
4.  **KaTeX:** Chemical formulas in $...$ (e.g. $H_2SO_4$, $CH_3COOH$). AVOID plain 'H2SO4'.`,

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
