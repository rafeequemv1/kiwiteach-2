/**
 * Single source of truth for the static "format protocols" block inside
 * `generateQuizQuestions` (Neural Studio / Question DB forge).
 * Admin → Prompts → "Neural Studio forge" documents the full assembly.
 */

export const FORGE_FORMAT_PROTOCOLS = `
  STYLE PROTOCOLS (STRICT):
  1. mcq: Standard 4-option single correct choice.
  2. reasoning (Assertion-Reason): Clear A/R text.
  3. matching (MANDATORY): 
     - You MUST populate "columnA" and "columnB" with the actual list items (exactly 4 strings each).
     - **TEXT FORMATTING**: If you describe the columns in the question text or explanation, refer to them as "Column A" and "Column B".
  4. statements: Statement I and Statement II.`;

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
    body: `These are concatenated at the start of the main prompt, in order:\n• General\n• Difficulty\n• Explanation\n• Chemistry\n• Latex\n• Figure — only when the run requests figures (figureCount > 0)\n\nText is loaded via \`getSystemPrompt(...)\`: values from localStorage \`kiwiteach_system_prompts\` override defaults in \`SYSTEM_PROMPTS\` inside geminiService.`,
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
    body: `The following block is always appended after the above (same string as in code):\n\n${FORGE_FORMAT_PROTOCOLS.trim()}`,
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
    body: `Gemini is called with \`responseMimeType: application/json\` and a schema: an array of objects with fields text, type, difficulty, explanation, options, correctIndex, figurePrompt, sourceImageIndex, topic_tag, columnA, columnB. Required: text, difficulty, explanation, options, correctIndex, type, topic_tag.\n\nAfter parsing, **difficulty labels are aligned to the forge recipe** (Easy/Medium/Hard counts and array order) so UI tags match chapter config; the model’s free-form difficulty field is not trusted for counts mode.`,
  },
  {
    title: 'Other Gemini calls',
    body: `Composite figure generation (\`generateCompositeStyleVariants\`, \`generateCompositeFigures\`) and prompt refinement (\`refineSystemPrompt\`) use separate system/user templates in the same service file.`,
  },
];
