
import { GoogleGenAI, Type, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { Question, QuestionType, TypeDistribution } from "../Quiz/types";
import { supabase } from "../supabase/client";

declare const mammoth: any;

const retryWithBackoff = async <T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3, 
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isRetryable = error.message.includes('Failed to fetch') || 
                          error.message.includes('NetworkError') || 
                          (error.status && error.status >= 500);
      
      if (isRetryable && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`Gemini API Request Failed (${error.message}). Retrying in ${delay}ms (Attempt ${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        if (!isRetryable) throw error;
      }
    }
  }
  throw lastError;
};

/**
 * Strips Null characters (\u0000) that cause PostgreSQL errors.
 */
const sanitizeString = (str: string): string => {
    if (!str) return str;
    return str.replace(/\u0000/g, '').replace(/\0/g, '');
};

const sanitizeResult = (obj: any): any => {
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeResult);
    if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
            cleaned[key] = sanitizeResult(obj[key]);
        }
        return cleaned;
    }
    return obj;
};

/**
 * Fixes common issues where LaTeX commands in JSON strings are interpreted as control characters.
 * E.g., "\text" -> becomes Tab + "ext" in standard JSON.parse if not escaped as "\\text".
 */
const repairMalformedJsonLatex = (jsonStr: string): string => {
    if (!jsonStr) return "[]";
    return jsonStr
        // Fix \text, \times, \theta, \tau (overlap with \t tab)
        .replace(/(?<!\\)\\(text|times|theta|tau)/g, '\\\\$1')
        // Fix \frac, \forall (overlap with \f formfeed)
        .replace(/(?<!\\)\\(frac|forall)/g, '\\\\$1')
        // Fix \beta, \bar (overlap with \b backspace)
        .replace(/(?<!\\)\\(beta|bar)/g, '\\\\$1')
        // Fix \rho (overlap with \r carriage return)
        .replace(/(?<!\\)\\(rho|right)/g, '\\\\$1');
};

export const ensureApiKey = async () => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) await (window as any).aistudio.openSelectKey();
  }
};

const cleanBase64 = (base64: string): string => {
    if (!base64) return "";
    return base64.replace(/^data:image\/[a-z]+;base64,/, "").trim();
};

const SYSTEM_PROMPTS: Record<string, string> = {
    'General': `TASK: Generate elite medical entrance (NEET UG) level questions.
    - RIGOR: Clinical, analytical, and professional.
    - NEGATIVE CONSTRAINT: NEVER use the words "NCERT", "Textbook", "The Source", "Chapter", or "Passage" in the output. The question must appear as an independent scientific problem.
    - SYLLABUS CONSTRAINT: Map every question to a specific sub-topic from the syllabus.`,
    
    'Difficulty': `RIGOR PROTOCOL (ELITE ENTRANCE STANDARD):
    1. EASY (Application Standard): 
       - RIGOR: Equivalent to typical 'Medium' level textbook questions.
       - LOGIC: Requires direct application of a concept to a scenario or a 1-2 step logical derivation. No simple recall.
    2. MEDIUM (Deep Analyzer): 
       - TARGET: Experienced repeater students.
       - STYLE: Increased length (50-80 words). Frame questions as complex application-based scenarios, experimental observations, or diagnostic cases.
       - LOGIC: Requires significant multi-step reasoning (3-4 logical steps). Must require correlating two different properties or principles within the topic. 
       - DISTRACTORS: Use "Strong Distractors" that target specific nuanced misconceptions of high-scoring students.
    3. HARD (Elite Ranker): 
       - TARGET: Top 1% Students (Single-digit rankers).
       - STYLE: Long-form, highly technical questions (70-120 words). Use clinical vignettes, intricate data interpretation, or multi-statement evaluation.
       - LOGIC: Requires cross-concept mapping, linking theories from different sub-sections of the curriculum to arrive at the solution.`,
    
    'Explanation': `EXPLANATION PROTOCOL:
- **Standard Questions**: Comprehensive, clear, step-by-step logic.
- **Diagram/Label Questions**: **STRICTLY CONCISE**.
  - If the question asks to identify labels (e.g. "Identify P and Q"), the explanation MUST be under 30 words.
  - Format: "P is [Structure X], Q is [Structure Y]. [Brief function]."
  - DO NOT write a paragraph. Direct identification only.`,

    'Figure': `VISUAL PROTOCOL (ANTI-CHEAT & ACCURACY):
    - **STYLE**: Strictly PURE BLACK lines on PURE WHITE background. High-contrast technical line art.
    - **ANTI-CHEAT CONSTRAINT**: NEVER include structural answers or descriptive names of products directly in the figure. 
    - **MASKING**: Use placeholder labels (P, Q, R, X, Y) in the diagram. The student must identify these from the options.
    - **MANDATORY**: A figure must pose a PROBLEM, not display the SOLUTION. If a reaction is shown, the product must be replaced with a label.`,

    'Chemistry': `EXPERT CHEMISTRY EXAM PROTOCOL (NEET/AIIMS STANDARD):

**ORGANIC CHEMISTRY EMPHASIS:**
1.  **REACTION SCHEMES:** When generating reaction sequences (e.g., A -> B -> C), the 'figurePrompt' MUST command the image model to mask the target product.
2.  **STRICT FIGURE RULE**: A figure for an organic chemistry question MUST NOT contain the answer. 
    *   Example: If asking "Identify the major product of ozonolysis of O-Xylene", the figure should show O-Xylene and the reagent arrows, but the product area must contain a large '?' or label 'P'.
    *   **NEVER** write product names (like "Glyoxal") inside the diagram if they are part of the options or List II.
3.  **MATCHING TYPE FIGURES**: For 'Match List I with List II', the figure should only show the structures/items of List I with generic index labels. It must NOT show the lines connecting them to answers or include the text of List II.
4.  **KaTeX for TEXT:** Use standard chemical formulas and KaTeX notation (e.g., H_2SO_4, CH_3COOH) for all chemical text in the question stem, options, and explanation.`,

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

export const getSystemPrompt = (key: string): string => {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem('kiwiteach_system_prompts');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed[key]) return parsed[key];
            }
        } catch (e) {}
    }
    return SYSTEM_PROMPTS[key] || '';
};

export const downsampleImage = (base64Data: string, mimeType: string, maxDim = 1024): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width <= maxDim && height <= maxDim && (mimeType === 'image/jpeg' || mimeType === 'image/png')) {
                resolve({ data: cleanBase64(base64Data), mimeType });
                return;
            }
            if (width > height) { height *= maxDim / width; width = maxDim; } else { width *= maxDim / height; height = maxDim; }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const newData = canvas.toDataURL('image/jpeg', 0.85);
            const [header, data] = newData.split(',');
            resolve({ data: data.trim(), mimeType: 'image/jpeg' });
        };
        img.onerror = () => resolve({ data: '', mimeType: 'image/jpeg' });
        img.src = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    });
};

export const extractImagesFromDoc = async (docPath: string): Promise<{ data: string, mimeType: string }[]> => {
    try {
        const { data: blob } = await supabase.storage.from('chapters').download(docPath);
        if (!blob) return [];
        const arrayBuffer = await blob.arrayBuffer();
        const images: { data: string, mimeType: string }[] = [];
        await (window as any).mammoth.convertToHtml({ arrayBuffer }, {
            convertImage: (window as any).mammoth.images.imgElement((image: any) => image.read("base64").then((imageBuffer: string) => {
                images.push({ data: imageBuffer, mimeType: image.contentType || 'image/png' });
                return { src: "" };
            }))
        });
        const processed = await Promise.all(images.map(img => downsampleImage(img.data, img.mimeType, 1024)));
        return processed.filter(p => p.data);
    } catch (e) {
        console.error("Extraction error", e);
        return [];
    }
};

export const generateQuizQuestions = async (
  topic: string,
  difficulty: any,
  count: number,
  sourceContext?: { text: string; images?: { data: string; mimeType: string; }[] },
  qType: QuestionType | TypeDistribution = 'mcq',
  onProgress?: (status: string) => void,
  figureCount: number = 0,
  useSmiles: boolean = false,
  figureBreakdown?: string,
  modelName: string = 'gemini-3-pro-preview',
  visualMode: 'image' | 'text' = 'image',
  syllabusTopics?: string[],
  pyqContext?: string,
  isLengthy?: boolean,
  isConfusingChoices?: boolean
): Promise<Question[]> => {
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const styleInstruction = ((): string => {
    if (typeof qType === 'string') {
      return `STRICT FORMAT: All ${count} questions MUST be of type "${qType}".`;
    }
    
    const typeSum = (qType.mcq || 0) + (qType.reasoning || 0) + (qType.matching || 0) + (qType.statements || 0);
    const isCounts = Math.round(typeSum) === count && count > 0;

    if (isCounts) {
      return `MANDATORY VOLUME DISTRIBUTION (TOTAL ${count} ITEMS):
        1. "mcq": Exactly ${qType.mcq || 0} items
        2. "reasoning": Exactly ${qType.reasoning || 0} items
        3. "matching": Exactly ${qType.matching || 0} items
        4. "statements": Exactly ${qType.statements || 0} items`;
    } else {
      const totalForRatio = typeSum || 1;
      return `MANDATORY VOLUME DISTRIBUTION (TOTAL ${count} ITEMS):
        1. "mcq": Exactly ${Math.round(((qType.mcq || 0) / totalForRatio) * count)} items
        2. "reasoning": Exactly ${Math.round(((qType.reasoning || 0) / totalForRatio) * count)} items
        3. "matching": Exactly ${Math.round(((qType.matching || 0) / totalForRatio) * count)} items
        4. "statements": Exactly ${Math.round(((qType.statements || 0) / totalForRatio) * count)} items`;
    }
  })();

  const difficultyInstruction = typeof difficulty === 'string'
    ? `STRICT DIFFICULTY MANDATE: All ${count} items MUST be precisely "${difficulty}" level.`
    : `STRICT DIFFICULTY COUNTS (MANDATORY):
    - "Easy": Exactly ${difficulty.easy} items.
    - "Medium": Exactly ${difficulty.medium} items.
    - "Hard": Exactly ${difficulty.hard} items.`;

  const visualInstruction = figureCount > 0 
    ? `[VISUAL_MANDATE]:
       - EXACTLY ${figureCount} out of ${count} questions MUST include a "figurePrompt".
       - For these ${figureCount} questions, you MUST specify a "sourceImageIndex" (integer) mapping to the diagrams provided.
       ${figureBreakdown ? `- FREQUENCY PER IMAGE (SourceIndex: Q_Count): ${figureBreakdown}` : ''}
       - **FIGURE PROMPT RULES**: 
         - The 'figurePrompt' must be a direct command to the image generator to TRACE the source image.
         - **SYNC RULE**: The labels in the figurePrompt must MATCH EXACTLY the labels in the question text.
            - Question asks "Identify P"? -> Prompt: "Label P only."
            - Question asks "Identify A, B, C"? -> Prompt: "Label A, B, C."
            - **DO NOT** generate extra labels in the figure that are ignored by the question.
         - Look at the text labels in the source image. Your prompt should be: "Trace the image EXACTLY. Replace label '[Original Text]' with '[New Label]'. Remove all other text."
         - **ANTI-DUPLICATION**: Explicitly instruct: "Use each label (P, Q, R...) EXACTLY ONCE. Do not label the same part twice."
       - **QUESTION SYNERGY**: The question text MUST reference these new labels.`
    : `[VISUAL_CONSTRAINT]: Do NOT include any figurePrompts. Generate text-only questions.`;

  const syllabusInstruction = syllabusTopics && syllabusTopics.length > 0 
    ? `[CRITICAL_SYLLABUS_PROTOCOL]:
       - You are provided with a definitive list of authorized 'topic_tag' values.
       - For EACH question you generate, the 'topic_tag' field in the JSON object MUST be an EXACT, case-sensitive match to one of the strings in this list.
       - AUTHORIZED TOPICS: [${syllabusTopics.map(t => `"${t.trim()}"`).join(', ')}]
       - **FAILURE CONDITION**: It is strictly forbidden to generate a 'topic_tag' that is not on this list. Do not paraphrase, summarize, or invent new topics. For example, if the list contains "Cell Cycle", the tag must be "Cell Cycle", not "Phases of the Cell Cycle".`
    : '';

  const formatProtocols = `
  STYLE PROTOCOLS (STRICT):
  1. mcq: Standard 4-option single correct choice.
  2. reasoning (Assertion-Reason): Clear A/R text.
  3. matching (MANDATORY): 
     - You MUST populate "columnA" and "columnB" with the actual list items (exactly 4 strings each).
     - **TEXT FORMATTING**: If you describe the columns in the question text or explanation, refer to them as "Column A" and "Column B".
  4. statements: Statement I and Statement II.`;

  try {
    const mainPrompt = `
    ${getSystemPrompt('General')}
    ${getSystemPrompt('Difficulty')}
    ${getSystemPrompt('Explanation')}
    ${getSystemPrompt('Chemistry')}
    ${getSystemPrompt('Latex')}
    ${figureCount > 0 ? getSystemPrompt('Figure') : ''}
    
    ${styleInstruction}
    ${difficultyInstruction}
    ${visualInstruction}
    ${syllabusInstruction}
    ${formatProtocols}

    WORLD CLASS TUNING:
    ${pyqContext ? `[PYQ_DNA_INJECTION_ACTIVE]: \n MIMIC THE STYLE OF THESE QUESTIONS BUT CHANGE THE CONTENT: \n ${pyqContext}` : ''}
    ${isLengthy ? `[CLINICAL_MODE_ACTIVE]: Frame questions as case studies, experiments, or real-world scenarios. Use scientific verbosity.` : ''}
    ${isConfusingChoices ? `[DECEPTION_MODE_ACTIVE]: Distractors must be highly plausible common misconceptions. Avoid obvious eliminations.` : ''}

    HARD COMPLIANCE CHECK:
    - You MUST return EXACTLY ${count} questions.
    - The difficulty counts MUST match exactly the mandate above.
    - **LABEL EXPLANATION CHECK**: If a question asks to identify labels (e.g. "Identify P"), the explanation MUST be ultra-short (max 2 sentences).

    - TARGET CHAPTER: "${topic}"
    - TOTAL QUANTITY: ${count} questions.
    - JSON OUTPUT REQUIRED.`;

    const contents: any[] = [{ role: 'user', parts: [{ text: mainPrompt }] }];
    
    const contextLimit = modelName.includes('pro') ? 100000 : 30000;
    if (sourceContext?.text) contents[0].parts.push({ text: `SOURCE MATERIAL: ${sourceContext.text.substring(0, contextLimit)}` });
    
    if (sourceContext?.images && sourceContext.images.length > 0) {
        sourceContext.images.forEach((img, idx) => {
            contents[0].parts.push({ text: `REFERENCE DIAGRAM ${idx}:` });
            contents[0].parts.push({ inlineData: { data: cleanBase64(img.data), mimeType: img.mimeType } });
        });
    }

    const config: any = {
        temperature: modelName.includes('pro') ? 0.2 : 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING },
                type: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                explanation: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                figurePrompt: { type: Type.STRING },
                sourceImageIndex: { type: Type.NUMBER },
                topic_tag: { type: Type.STRING },
                columnA: { type: Type.ARRAY, items: { type: Type.STRING } },
                columnB: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["text", "difficulty", "explanation", "options", "correctIndex", "type", "topic_tag"],
          }
        }
    };

    if (!modelName.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 0 };
    }

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelName,
      contents,
      config: config
    }));
    
    // Repair the raw JSON string before parsing
    const rawText = response.text || "[]";
    const repairedText = repairMalformedJsonLatex(rawText);
    
    const rawData = JSON.parse(repairedText);
    const safeData = sanitizeResult(rawData);

    return safeData.map((q: any, index: number) => ({ 
        id: `forge-${Date.now()}-${index}`, 
        ...q 
    }));
  } catch (error: any) { throw new Error(`Forge failed: ${error.message}`); }
};

export const generateCompositeStyleVariants = async (sourceBase64: string, sourceMimeType: string, prompts: string[], useAsIs: boolean = false): Promise<string[]> => {
    await ensureApiKey();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const results: string[] = [];
    const cleanedSource = cleanBase64(sourceBase64);
    if (!cleanedSource) return [];

    for (const prompt of prompts) {
        if (!prompt) {
            results.push("");
            continue;
        }
        try {
            const imagePart = { inlineData: { mimeType: sourceMimeType, data: cleanedSource } };
            const instruction = `TASK: Create a professional "NEET Exam Style" black-and-white line diagram based on the source image.

EXECUTION RULES (STRICT FIDELITY & CLEANING):
1. **TRACING MODE - ANCHOR PRESERVATION**: 
   - Trace the biological structures exactly as they appear. 
   - **CRITICAL**: Keep the leader lines (pointers) in the EXACT same position and angle as the original image.
   - ONLY change the text at the end of the line. 
   - If a line points to the Nucleus in the original, the new line MUST point to the Nucleus.
2. **CLEANING PHASE**: 
   - **REMOVE WATERMARKS**: Detect and erase any faint text, logos, or patterns overlaid on the image. The background must be pure white (#FFFFFF).
   - **REMOVE ORIGINAL TEXT**: Erase ALL existing text labels from the source image.
   - **AGGRESSIVE WHITENING**: Treat any light grey pixels as white to remove background noise/scans.
3. **LABELING PHASE**:
   - **EXCLUSIVE LABELING**: If the prompt asks for 'P', ONLY draw 'P'. Do NOT include 'Q', 'R', or any other label unless explicitly requested. If the original image had multiple labels, IGNORE them.
   - **STRICT MINIMALISM**: Only add the labels explicitly requested in the prompt (e.g., "Label 'Nucleus' as 'P'"). Do NOT add extra labels.
   - **NO DUPLICATES**: Use each label variable (P, Q, A, B) EXACTLY ONCE. Never label two different parts with the same letter.
   - **TYPOGRAPHY**: Use HUGE, BOLD, BLACK sans-serif font (size 40px+). Ensure letters are perfectly formed and horizontal.
4. **STYLE**: High-contrast black ink on white. No shading, gradients, or grey areas.

Prompt: ${prompt}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [imagePart, { text: instruction }] },
            });
            const outputPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (outputPart?.inlineData?.data) {
                results.push(cleanBase64(outputPart.inlineData.data));
            } else {
                console.warn("Gemini did not return an image for redraw prompt:", prompt);
                results.push("");
            }
        } catch (e: any) { 
            console.error("Visual Synthesis Error:", e);
            results.push("");
        }
    }
    return results;
};

export const generateCompositeFigures = async (prompts: string[]): Promise<string[]> => {
    await ensureApiKey();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const results: string[] = [];
    for (const prompt of prompts) {
        if (!prompt) {
            results.push("");
            continue;
        }
        try {
            const instruction = `TASK: Generate a high-precision "NEET Exam Style" black-and-white line diagram.
            
PROMPT: ${prompt}

RULES:
1. **STYLE**: Pure black ink on white. No shading, no grey. Professional textbook quality.
2. **CLEANING**: Ensure background is 100% white. No artifacts, no watermarks.
3. **LABELS**:
   - **EXCLUSIVE LABELING**: If the prompt asks for 'P', ONLY draw 'P'. Do NOT include 'Q', 'R', or any other label unless explicitly requested.
   - Use HUGE, BOLD, BLACK letters (A, B, C...) or numbers.
   - **NO DUPLICATES**: Ensure every label is unique. Do not label two parts with 'A'.
   - Draw precise leader lines pointing to the anatomical structures mentioned in the prompt.
   - **CENSORSHIP**: Do NOT write the name of the structure (e.g. "Mitochondria") in the image. Use the Label (e.g. "A") only.
4. **CLARITY**: Ensure lines are distinct and parts are easily distinguishable.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ text: instruction }] },
            });
            const outputPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (outputPart?.inlineData?.data) {
                results.push(cleanBase64(outputPart.inlineData.data));
            } else {
                console.warn("Gemini did not return an image for synthetic prompt:", prompt);
                results.push("");
            }
        } catch (e: any) { 
            console.error("Pure Synthetic Synthesis Error:", e);
            results.push("");
        }
    }
    return results;
};

export const refineSystemPrompt = async (currentPrompt: string, instruction: string): Promise<string> => {
    await ensureApiKey();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Refine prompt: ${instruction}. Current: ${currentPrompt}`
        });
        return response.text || currentPrompt;
    } catch (e) { return currentPrompt; }
};

export const forgeSequentialQuestions = generateQuizQuestions;
