
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { Question, QuestionType } from "../Quiz/types";

// --- SYSTEM PROMPT DEFAULTS ---
// These match the keys in Admin/Prompts/PromptsHome.tsx
const SYSTEM_PROMPTS: Record<string, string> = {
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

// Helper to get prompt (local storage override or default)
const getPrompt = (key: string): string => {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem('kiwiteach_system_prompts');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed[key]) return parsed[key];
            }
        } catch (e) {
            console.warn("Failed to load prompt overrides", e);
        }
    }
    return SYSTEM_PROMPTS[key] || '';
};

// Helper function for embedding generation
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text }] },
    });
    return result.embedding.values;
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return [];
  }
};

/**
 * Utility to ensure the user has selected an API key for high-quality models.
 */
export const ensureApiKey = async () => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await (window as any).aistudio.openSelectKey();
    }
  }
};

/**
 * Generates a stylistic variation of a provided base image.
 */
export const generateStyleVariant = async (base64Image: string, prompt: string): Promise<string> => {
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const editPrompt = `
  Acting as a professional scientific illustrator, create a new version of the provided image based on these instructions:
  "${prompt}"
  
  CRITICAL REQUIREMENTS:
  - **Transformation**: Do NOT just copy the image. You MUST apply the requested style changes.
  - **Clarity**: Use high-contrast black lines on a white background (NEET/JEE style).
  - **Output**: Return a single high-quality image.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview', // Capable of image-to-image
      contents: {
        parts: [
          { text: editPrompt },
          { inlineData: { mimeType: 'image/png', data: base64Image } }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9", 
          imageSize: "2K"
        }
      }
    });

    let resultData = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        resultData = part.inlineData.data;
        break;
      }
    }
    return resultData;
  } catch (error: any) {
    console.error("Style variant generation failed:", error);
    return "";
  }
};

/**
 * Generates a batch of stylistic variations from a single source image in a grid.
 */
export const generateCompositeStyleVariants = async (base64Image: string, prompts: string[]): Promise<string[]> => {
  if (prompts.length === 0) return [];
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const GRID_ROWS = 2;
  const GRID_COLS = 3;
  const TOTAL_SLOTS = GRID_ROWS * GRID_COLS;

  const fullPrompts = [...prompts];
  while (fullPrompts.length < TOTAL_SLOTS) {
    fullPrompts.push("Leave this space completely empty white.");
  }

  const gridInstruction = fullPrompts.map((p, i) => `Slot ${i + 1}: ${p}`).join("\n");

  const mainPrompt = `
  Acting as a scientific illustrator, create a composite 2x3 grid image (6 slots) based on the PROVIDED SOURCE IMAGE.
  
  INPUT: Use the attached image as the base reference for ALL slots.
  
  LAYOUT:
  - 2 Rows, 3 Columns (Total 6 distinct panels).
  - Clean white background. No grid lines.
  
  INSTRUCTIONS PER SLOT (Apply these specific edits to the source image):
  ${gridInstruction}
  
  STYLE: High-contrast black line art (exam paper style).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { text: mainPrompt },
          { inlineData: { mimeType: 'image/png', data: base64Image } }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "4:3", 
          imageSize: "4K"
        }
      }
    });

    let resultData = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        resultData = part.inlineData.data;
        break;
      }
    }

    if (!resultData) return [];
    return await sliceCompositeImage(resultData, GRID_ROWS, GRID_COLS, prompts.length);
  } catch (error: any) {
    console.error("Composite variant generation failed:", error);
    return [];
  }
};

/**
 * Generates a composite grid of diagrams in a single call to reduce costs.
 */
export const generateCompositeFigures = async (prompts: string[]): Promise<string[]> => {
  if (prompts.length === 0) return [];
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const GRID_ROWS = 2;
  const GRID_COLS = 3;
  const TOTAL_SLOTS = GRID_ROWS * GRID_COLS;
  
  const fullPrompts = [...prompts];
  while (fullPrompts.length < TOTAL_SLOTS) {
    fullPrompts.push("Leave this space completely empty white.");
  }

  const gridInstruction = fullPrompts.map((p, i) => `Slot ${i + 1}: ${p}`).join("\n");
  
  const mainPrompt = `Generate a single 4K resolution image containing a grid of ${TOTAL_SLOTS} distinct scientific diagrams arranged in 2 rows and 3 columns.
  
  CRITICAL STYLE REQUIREMENTS (NEET/JEE EXAM STANDARD):
  - **Mode**: Professional high-contrast BLACK LINE ART on a pure WHITE background. No shading, no gray-scale, no 3D rendering.
  - **Line Weight**: Use thin, crisp uniform lines (like a printed textbook).
  - **Layout**: The image must be divided into a 2x3 grid implicitly. 
  - **NO BORDERS**: Do NOT draw grid lines or boxes around the slots.
  
  SCIENTIFIC DOMAIN RULES:
  1. **COMPOSITE / MULTI-VIEW FIGURES**:
     - If a slot request asks for "Style A vs Style B" or "Cross-section and External", draw BOTH views side-by-side within that single slot.
  
  GRID ASSIGNMENTS:
  ${gridInstruction}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: mainPrompt }] },
      config: {
        imageConfig: {
          aspectRatio: "4:3", 
          imageSize: "4K"
        }
      }
    });

    let base64Data = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
        break;
      }
    }

    if (!base64Data) return [];
    return await sliceCompositeImage(base64Data, GRID_ROWS, GRID_COLS, prompts.length);
  } catch (error: any) {
    console.error("Composite figure generation failed:", error);
    if (error?.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && (window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
    }
    return [];
  }
};

const sliceCompositeImage = (base64: string, rows: number, cols: number, originalCount: number): Promise<string[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const results: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }
      const slotWidth = img.width / cols;
      const slotHeight = img.height / rows;
      canvas.width = slotWidth;
      canvas.height = slotHeight;
      
      let count = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (count >= originalCount) break;
          ctx.clearRect(0, 0, slotWidth, slotHeight);
          ctx.drawImage(img, c * slotWidth, r * slotHeight, slotWidth, slotHeight, 0, 0, slotWidth, slotHeight);
          results.push(canvas.toDataURL('image/png').split(',')[1]);
          count++;
        }
        if (count >= originalCount) break;
      }
      resolve(results);
    };
    img.src = `data:image/png;base64,${base64}`;
  });
};

export const refineSystemPrompt = async (currentPrompt: string, instruction: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    You are an expert prompt engineer. 
    Your task is to refine the following system prompt based on the user's instruction.
    
    CURRENT PROMPT:
    "${currentPrompt}"
    
    INSTRUCTION:
    ${instruction}
    
    Return ONLY the refined prompt text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || currentPrompt;
  } catch (error: any) {
    console.error("Prompt refinement failed:", error);
    throw new Error("Failed to refine prompt.");
  }
};

interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export const generateQuizQuestions = async (
  topic: string,
  difficulty: 'Easy' | 'Medium' | 'Hard' | DifficultyMix,
  count: number,
  sourceContext?: { text: string; images?: { data: string; mimeType: string; }[] },
  qType: QuestionType = 'mcq',
  onProgress?: (status: string) => void,
  figureCount: number = 0,
  useSmiles: boolean = false
): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    onProgress?.("Structuring prompt...");
    let difficultyInstruction = typeof difficulty === 'string' 
      ? `All questions must be of '${difficulty}' difficulty.`
      : `Difficulty mix: ${difficulty.easy}% Easy, ${difficulty.medium}% Medium, ${difficulty.hard}% Hard.`;

    const smilesInstruction = useSmiles ? getPrompt('Chemistry') : "";

    // Load sub-prompts dynamically from storage or defaults
    const generalPrompt = getPrompt('General');
    const difficultyContext = getPrompt('Difficulty');
    const distractorContext = getPrompt('Distractors');
    const figureContext = getPrompt('Figure');

    const mainPrompt = `
    ${generalPrompt}
    TOPIC: "${topic}"
    QUANTITY: Exactly ${count} questions.
    TYPE: ${qType.toUpperCase()}
    
    ${difficultyInstruction}
    
    ${difficultyContext}
    
    ${distractorContext}
    
    ${smilesInstruction}

    ${figureContext}
    
    FIGURE INTEGRATION:
    For exactly ${figureCount} questions, you MUST provide a "figurePrompt" and set "sourceImageIndex".
    - If context images exist, refer to them by index (0 to ${sourceContext?.images?.length ? sourceContext.images.length - 1 : 0}).
    - If no context images, set 'sourceImageIndex' to -1 and describe the figure.
    - For the other ${Math.max(0, count - figureCount)} questions, leave "figurePrompt" empty.

    Output as a JSON Array of objects.`;

    const properties: any = {
        text: { type: Type.STRING },
        difficulty: { type: Type.STRING },
        explanation: { type: Type.STRING },
        pageNumber: { type: Type.INTEGER, description: "The specific page number from the provided context text where this concept is located." },
        figurePrompt: { type: Type.STRING, description: "Detailed visual description. If referencing a source image, request a COMPOSITE EDIT (e.g., Schematic + Detailed)." },
        sourceImageIndex: { type: Type.INTEGER, description: "Index of the source image to use as a base. -1 if generating from scratch." },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctIndex: { type: Type.INTEGER }
    };

    if (qType === 'matching') {
        properties.columnA = { type: Type.ARRAY, items: { type: Type.STRING } };
        properties.columnB = { type: Type.ARRAY, items: { type: Type.STRING } };
        properties.correctMatches = { type: Type.ARRAY, items: { type: Type.INTEGER } };
    }

    onProgress?.(`Generating ${count} questions...`);
    
    // Construct the parts array
    const parts: any[] = [{ text: mainPrompt }];
    
    if (sourceContext) {
        if (sourceContext.text) {
            parts.push({ text: `SOURCE MATERIAL TEXT:\n${sourceContext.text}` });
        }
        if (sourceContext.images && sourceContext.images.length > 0) {
            parts.push({ text: `SOURCE MATERIAL FIGURES (Reference these by index 0 to ${sourceContext.images.length - 1}):` });
            sourceContext.images.forEach(img => {
                parts.push({ inlineData: img });
            });
        }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties,
            required: ["text", "difficulty", "explanation", "options", "correctIndex", "figurePrompt"],
          }
        }
      }
    });

    const parsedData = JSON.parse(response.text || "[]");
    return parsedData.map((q: any, index: number) => ({
      id: `q-${Date.now()}-${index}`,
      type: qType,
      ...q
    }));
  } catch (error: any) {
    throw new Error(`Generation failed: ${error.message}`);
  }
};
