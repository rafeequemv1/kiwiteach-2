import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { Question, QuestionType } from "../Quiz/types";
import { supabase } from "../supabase/client";

const SYSTEM_PROMPTS: Record<string, string> = {
    'General': `TASK: Generate elite-tier questions for NEET UG entrance exams.
    - Context: You are provided with TEXT and potentially IMAGE references.
    - Consistency: Focus on NCERT core concepts.
    - Identification: Return page numbers if found in "--- Page X ---" headers.`,

    'Difficulty': `STRICT DIFFICULTY STANDARDS:
    1. EASY: Direct NCERT recall.
    2. MEDIUM: Concept application or multi-step logic.
    3. HARD: Complex linkage, exceptions, or high-order analysis.`,

    'Figure': `FIGURE GENERATION LOGIC:
    - Describe the diagram in 'figurePrompt' using NEET UG textbook standards.
    - SUBJECT INTEGRITY: The diagram MUST match the question topic exactly.
    - BACKGROUND: MUST BE PURE WHITE (#FFFFFF). NO notebook lines, NO paper textures, NO grid.
    - ANNOTATIONS: ALLOW full scientific labels and anatomical names. Labels must be sharp and legible.
    - META-TEXT BAN: DO NOT include text like "Figure 1", "NEET Exam", "Diagram", or captions inside the image.
    - Style: Professional high-contrast black-and-white line art.`,
};

const getPrompt = (key: string): string => {
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

export const ensureApiKey = async () => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) await (window as any).aistudio.openSelectKey();
  }
};

export const downsampleImage = (base64Data: string, mimeType: string, maxDim = 1024): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width <= maxDim && height <= maxDim && (mimeType === 'image/jpeg' || mimeType === 'image/png')) {
                resolve({ data: base64Data, mimeType });
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
        img.src = `data:${mimeType};base64,${base64Data}`;
    });
};

export const generateQuizQuestions = async (
  topic: string,
  difficulty: any,
  count: number,
  sourceContext?: { text: string; images?: { data: string; mimeType: string; }[] },
  qType: QuestionType = 'mcq',
  onProgress?: (status: string) => void,
  figureCount: number = 0,
  useSmiles: boolean = false
): Promise<Question[]> => {
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    let difficultyInstruction = typeof difficulty === 'string' 
        ? `ALL questions must be of '${difficulty}' difficulty.`
        : `DISTRIBUTE DIFFICULTY RATIO: ${difficulty.easy}% Easy, ${difficulty.medium}% Medium, ${difficulty.hard}% Hard.`;

    const mainPrompt = `
    ${getPrompt('General')}
    TOPIC: "${topic}"
    QUANTITY: ${count} questions.
    ${figureCount > 0 ? `FIGURES: Exactly ${figureCount} questions MUST include a 'figurePrompt' for a diagram. If you base it on a specific source image, put its index (0-indexed) in 'sourceImageIndex'.` : ''}
    TYPE: ${qType.toUpperCase()}.
    ${difficultyInstruction}
    ${getPrompt('Difficulty')}
    ${getPrompt('Figure')}
    EXPLANATION RULES: ALWAYS start with "Correct Answer: (Option Letter)" followed by a full detailed scientific explanation.
    Return as JSON array with properties: text, options, correctIndex, difficulty, explanation, pageNumber, figurePrompt, sourceImageIndex.`;

    const contents: any[] = [{ role: 'user', parts: [{ text: mainPrompt }] }];
    if (sourceContext?.text) contents[0].parts.push({ text: `TEXT SOURCE: ${sourceContext.text.substring(0, 100000)}` });
    if (sourceContext?.images && sourceContext.images.length > 0) {
        sourceContext.images.forEach((img, idx) => {
            contents[0].parts.push({ text: `REFERENCE IMAGE ${idx}:` });
            contents[0].parts.push({ inlineData: img });
        });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                explanation: { type: Type.STRING },
                pageNumber: { type: Type.INTEGER },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                figurePrompt: { type: Type.STRING },
                sourceImageIndex: { type: Type.NUMBER }
            },
            required: ["text", "difficulty", "explanation", "options", "correctIndex"],
          }
        }
      }
    });

    return JSON.parse(response.text || "[]").map((q: any, index: number) => {
        return { id: `forge-${Date.now()}-${index}`, type: qType, ...q };
    });
  } catch (error: any) { throw new Error(`Forge failed: ${error.message}`); }
};

export const generateCompositeFigures = async (prompts: string[]): Promise<string[]> => {
    await ensureApiKey();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const results: string[] = [];
    
    for (const prompt of prompts) {
        try {
            const cleanPrompt = `Subject: ${prompt}. Professional NEET line art. Background: PURE WHITE (#FFFFFF). NO notebook lines, NO paper texture. ALLOW scientific labels and anatomical names. NO meta-text or titles. ENSURE THE CONTENT MATCHES THE TOPIC DESCRIPTION.`;
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ text: cleanPrompt }] },
                config: {
                    imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
                }
            });
            const candidates = (response as any).candidates;
            if (candidates?.[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) { 
                    if (part.inlineData?.data) { 
                        results.push(part.inlineData.data); 
                        break; 
                    } 
                }
            } else { results.push(""); }
        } catch (e) { results.push(""); }
    }
    return results;
};

export const generateCompositeStyleVariants = async (sourceImageBase64: string, prompts: string[]): Promise<string[]> => {
    await ensureApiKey();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const results: string[] = [];
    
    for (const prompt of prompts) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: {
                    parts: [
                        { inlineData: { data: sourceImageBase64, mimeType: 'image/jpeg' } },
                        { text: `REDRAW THIS EXACT DIAGRAM. DO NOT CHANGE THE SUBJECT MATTER. IF IT IS PHYSICS, KEEP IT PHYSICS. Style: Clean black ink line art on PURE WHITE background (#FFFFFF). NO notebook texture or lines. Preserve all scientific annotations and labels: ${prompt}` }
                    ]
                },
                config: { imageConfig: { aspectRatio: "1:1" } }
            });
            const candidates = (response as any).candidates;
            if (candidates?.[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) { 
                    if (part.inlineData?.data) { 
                        results.push(part.inlineData.data); 
                        break; 
                    } 
                }
            } else { results.push(""); }
        } catch (e) { results.push(""); }
    }
    return results;
};

export const forgeSequentialQuestions = async (
    topic: string,
    difficulty: any,
    count: number,
    sourceContext: { text: string; images?: { data: string; mimeType: string; }[] },
    qType: QuestionType = 'mcq',
    onProgress?: (status: string) => void,
    figureCount: number = 0,
    options?: any,
    specificImageIndex?: number
): Promise<Question[]> => {
    return generateQuizQuestions(topic, difficulty, count, sourceContext, qType, onProgress, figureCount);
};

export const refineSystemPrompt = async (c:string, i:string) => c;