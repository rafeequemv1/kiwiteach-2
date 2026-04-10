/**
 * Single source of truth for the static "format protocols" block inside
 * `generateQuizQuestions` (Neural Studio / Question DB forge).
 * Admin → Prompts → "Neural Studio forge" documents the full assembly.
 */

/** Appended to system "Distractors" + forge protocols — batch-level variety, not forced on every item. */
export const CHOICE_DIVERSITY_BATCH_RULES = `
OPTION FORMAT MIX (BATCH-LEVEL — NOT EVERY ITEM):
Across all items in this response, vary how the four options (A–D) are built. These are approximate targets for the batch as a whole; do not cram every pattern into every question.

- **Numerical / quantitative options (aim ~25–35% of items when the chapter supports math or data):** For that share, centre the option set on numbers: concrete values, short expressions, or answers with correct units. Wrong options should mirror real exam slips—wrong powers of ten, rounding, dropped factors (e.g. 2, π), sign errors, misapplied constants, or same-order-of-magnitude blunders—not absurd unrelated numbers.

- **Near-miss / “looks similar” distractors (aim ~25–35% of items):** For that share, make wrong options deliberately easy to confuse at a glance: parallel phrasing, same structure or units, adjacent concepts, swapped labels, or organic/chemistry pairs that differ by one step or stereochemistry. The student must use reasoning, not typography tricks, to separate correct from incorrect.

- **Rest of the batch:** Conceptual, definitional, or mixed option styles as the topic demands. Easy items may use gentler distractors; Hard items must still satisfy Difficulty + base distractor rules.`;

export const FORGE_FORMAT_PROTOCOLS = `
  NEET FORGE GOAL:
  - Calibrate like NTA NEET (UG): Easy = scoring-friendly clarity; Medium = standard exam reasoning; Hard = elite repeater-tier discrimination (syllabus-fair, top-quality traps and synthesis).
  - The JSON "difficulty" field must describe how hard the item actually is to solve, not a random tag.
  - Option variety: over the full batch, include a substantial minority of numerically dominated option sets and a substantial minority of near-miss / confusion-style distractors where the material allows (see OPTION FORMAT MIX below).

${CHOICE_DIVERSITY_BATCH_RULES}

  STYLE PROTOCOLS (STRICT):
  1. mcq: Standard 4-option single correct choice.
  2. reasoning (Assertion-Reason): Clear A/R text.
  3. matching (MANDATORY): 
     - You MUST populate "columnA" and "columnB" with the actual list items (exactly 4 strings each).
     - **TEXT FORMATTING**: If you describe the columns in the question text or explanation, refer to them as "Column A" and "Column B".
  4. statements: Statement I and Statement II.

  MATH IN JSON (STEM, OPTIONS, EXPLANATION):
  - Follow the **Latex** system prompt: double-escaped backslashes, every formula in \`$...$\` (or \`$$...$$\`), use \`\\dfrac\` not slash fractions, \`\\times\` / \`\\log\` / \`\\Delta\` as needed.
  - Do not emit placeholder strings or non-LaTeX markup in explanations.`;

export interface NeuralDocSection {
  title: string;
  body: string;
}

/** Read-only documentation shown in Admin → Prompts (Neural Studio forge tab). */
export const NEURAL_STUDIO_FORGE_SECTIONS: NeuralDocSection[] = [
  {
    title: 'Where this runs',
    body: `Question generation for Neural Studio / Question DB uses \`generateQuizQuestions\` in \`services/geminiService.ts\`. The model receives one \`user\` turn whose \`parts\` are: (1) the main text prompt, (2) optional \`SOURCE MATERIAL\` text, (3) optional \`REFERENCE DIAGRAM n\` image parts.`,
  },
  {
    title: '1. System blocks (editable in this screen)',
    body: `These are concatenated at the start of the main prompt, in order:\n• General\n• Difficulty\n• Explanation\n• Distractors\n• Chemistry\n• Latex\n• Figure — only when the run requests figures (figureCount > 0)\n\nText is loaded via \`getSystemPrompt(...)\` (and KB prompt sets): values from localStorage \`kiwiteach_system_prompts\` override defaults in \`SYSTEM_PROMPTS\` / \`DEFAULT_PROMPTS\` in code.`,
  },
  {
    title: '2. Style mandate (question types)',
    body: `Built from your type selection: either a single type string (e.g. all MCQ) or exact/ratio counts for mcq / reasoning / matching / statements. See \`styleInstruction\` in geminiService.`,
  },
  {
    title: '3. Difficulty mandate',
    body: `Either one difficulty for all items, or exact Easy / Medium / Hard counts. See \`difficultyInstruction\`.`,
  },
  {
    title: '4. Visual mandate',
    body: `If figureCount > 0: instructions for figurePrompt, sourceImageIndex, tracing rules, and label sync. If zero: explicit text-only constraint. See \`visualInstruction\`.`,
  },
  {
    title: '5. Syllabus & exclusions',
    body: `Optional authorized \`topic_tag\` list and optional forbidden topic labels. See \`syllabusInstruction\` and \`exclusionInstruction\`.`,
  },
  {
    title: '6. Format protocols (fixed block)',
    body: `The following block is always appended after the above (same string as in code). It includes NEET FORGE GOAL plus OPTION FORMAT MIX (batch targets for numeric options and near-miss distractors):\n\n${FORGE_FORMAT_PROTOCOLS.trim()}`,
  },
  {
    title: '7. World-class tuning',
    body: `Optional blocks when enabled:\n• PYQ DNA — past-question style mimic\n• Clinical / lengthy mode\n• Deceptive distractors mode\n\nThen compliance checks (exact count, difficulty match, short explanations for label-ID questions) and chapter/topic line.`,
  },
  {
    title: '8. Source material & diagrams',
    body: `After the main prompt text, the API appends truncated chapter text as \`SOURCE MATERIAL:\` and each source image as \`REFERENCE DIAGRAM {index}:\` plus inline image data.`,
  },
  {
    title: '9. Response schema',
    body: `Gemini is called with \`responseMimeType: application/json\` and a schema: an array of objects with fields text, type, difficulty, explanation, options, correctIndex, figurePrompt, sourceImageIndex, topic_tag, columnA, columnB. Required: text, difficulty, explanation, options, correctIndex, type, topic_tag.\n\nThe model is instructed (order-locked when counts are mixed) to match **content depth** to each tier per the Difficulty system prompt; there is no separate server-side relabelling pass.`,
  },
  {
    title: 'Other Gemini calls',
    body: `Composite figure generation (\`generateCompositeStyleVariants\`, \`generateCompositeFigures\`) can batch up to **four** prompts per image API call on a uniform **square 2×2 grid**, then split client-side (\`splitBase64ImageTo2x2Grid\`). Admin UI defaults this **batch + slice** mode on; turning it off uses **one image call per figure**. On batch failure, single-image fallback runs per prompt. Prompt refinement (\`refineSystemPrompt\`) uses separate templates in the same service file.`,
  },
];
