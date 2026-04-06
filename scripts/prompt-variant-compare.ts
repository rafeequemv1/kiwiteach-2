/**
 * Compare two forge prompt assemblies on the same chapter stub:
 *   A — system sections + FORGE_FORMAT_PROTOCOLS (matches production shape)
 *   B — same system sections + mandates, WITHOUT FORGE_FORMAT_PROTOCOLS
 *
 * Requires: GEMINI_API_KEY or GOOGLE_GENAI_API_KEY in env.
 * Run: npx tsx scripts/prompt-variant-compare.ts
 */

import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_PROMPTS } from '../Admin/Prompts/neetPromptConfig';
import { FORGE_FORMAT_PROTOCOLS } from '../services/neuralStudioPromptBlueprint';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

const CHAPTER_STUB = `Cell Cycle and Cell Division (NEET scope excerpt for item writing):
- Interphase: G1 (growth), S (DNA replication), G2 (preparation for mitosis).
- M phase: mitosis (prophase, metaphase, anaphase, telophase) and cytokinesis.
- Regulation: checkpoints (G1/S, G2/M, spindle); roles of cyclins and CDKs (high level).
- Meiosis: reductional division; crossing over in prophase I; significance of gametogenesis.
Use only syllabus-faithful facts; do not copy any real exam item verbatim.`;

const BANNED = /\b(NCERT|Textbook|The Source|Chapter|Passage)\b/i;

function buildCoreBlocks(): string {
  const p = DEFAULT_PROMPTS;
  return [
    p.General,
    p.Difficulty,
    p.Explanation,
    p.Distractors,
    p.Chemistry,
    p.Latex,
  ].join('\n\n');
}

function buildTail(includeForgeProtocols: boolean): string {
  const style = `STRICT FORMAT: All 3 questions MUST be of type "mcq".`;
  const diff = `STRICT DIFFICULTY COUNTS (MANDATORY):
    - "Easy": Exactly 1 item.
    - "Medium": Exactly 1 item.
    - "Hard": Exactly 1 item.`;
  const order = `
    - **JSON "difficulty" (ORDER-LOCKED)**: Return exactly 3 objects in array order:
      - First item: "Easy"
      - Second item: "Medium"
      - Third item: "Hard"
    - **Semantic match**: Stem/options must match each tier per the Difficulty protocol.`;
  const visual = `[VISUAL_CONSTRAINT]: Do NOT include any figurePrompts. Text-only.`;
  const protocols = includeForgeProtocols ? `\n${FORGE_FORMAT_PROTOCOLS}\n` : '\n';

  const compliance = `
    HARD COMPLIANCE CHECK:
    - You MUST return EXACTLY 3 questions.
    - The difficulty order MUST be Easy, then Medium, then Hard.
    - **NEET GOAL**: Overall batch reflects a real paper mix.
    - topic_tag must be a plausible subtopic string for this chapter.

    - TARGET CHAPTER: "Cell Cycle and Cell Division"
    - TOTAL QUANTITY: 3 questions.
    - JSON OUTPUT REQUIRED.`;

  return `${style}\n${diff}\n${order}\n${visual}${protocols}${compliance}`;
}

function fullPrompt(includeForgeProtocols: boolean): string {
  return `${buildCoreBlocks()}\n\n${buildTail(includeForgeProtocols)}`;
}

type GenQ = {
  text?: string;
  type?: string;
  difficulty?: string;
  explanation?: string;
  options?: string[];
  correctIndex?: number;
  topic_tag?: string;
};

function scoreBatch(label: string, raw: unknown): { label: string; total: number; details: Record<string, number>; items: GenQ[] } {
  const items = Array.isArray(raw) ? (raw as GenQ[]) : [];
  let total = 0;
  const d: Record<string, number> = {};

  const countOk = items.length === 3 ? 25 : 0;
  d.count3 = countOk;
  total += countOk;

  const order = ['Easy', 'Medium', 'Hard'];
  let orderOk = 0;
  for (let i = 0; i < 3; i++) {
    if (String(items[i]?.difficulty) === order[i]) orderOk += 15;
  }
  d.difficultyOrder = orderOk;
  total += orderOk;

  let mcqOk = 0;
  let structOk = 0;
  let banOk = 0;
  let explainOk = 0;

  for (const q of items) {
    if (String(q?.type).toLowerCase() === 'mcq') mcqOk += 5;
    const opts = q?.options;
    if (Array.isArray(opts) && opts.length === 4) structOk += 8;
    const ci = q?.correctIndex;
    if (typeof ci === 'number' && ci >= 0 && ci <= 3) structOk += 2;
    const blob = `${q?.text || ''} ${(opts || []).join(' ')} ${q?.explanation || ''}`;
    if (!BANNED.test(blob)) banOk += 5;
    const ex = String(q?.explanation || '');
    if (ex.length >= 120) explainOk += 6;
    else if (ex.length >= 40) explainOk += 3;
  }
  d.typeMcq = mcqOk;
  d.structure = Math.min(30, structOk);
  d.noBannedWords = Math.min(15, banOk);
  d.explanationDepth = Math.min(18, explainOk);
  total += mcqOk + Math.min(30, structOk) + Math.min(15, banOk) + Math.min(18, explainOk);

  return { label, total: Math.min(100, total), details: d, items };
}

async function generateVariant(includeForge: boolean): Promise<{ text: string; parsed: unknown }> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Set GEMINI_API_KEY or GOOGLE_GENAI_API_KEY');

  const ai = new GoogleGenAI({ apiKey });
  const userText = `${fullPrompt(includeForge)}\n\nSOURCE MATERIAL:\n${CHAPTER_STUB}`;

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
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
            topic_tag: { type: Type.STRING },
          },
          required: ['text', 'difficulty', 'explanation', 'options', 'correctIndex', 'type', 'topic_tag'],
        },
      },
    },
  });

  const t = typeof res.text === 'string' ? res.text : '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    parsed = [];
  }
  return { text: t, parsed };
}

function mainSummary(a: ReturnType<typeof scoreBatch>, b: ReturnType<typeof scoreBatch>): string {
  const winner = a.total > b.total ? 'A (full + FORGE_FORMAT_PROTOCOLS)' : b.total > a.total ? 'B (system only, no forge block)' : 'Tie';
  return [
    '## Rubric (0–100, heuristic)',
    '- 25: exactly 3 items',
    '- 45: Easy/Medium/Hard order (15 each)',
    '- 15: all mcq (5 each)',
    '- 30: four options + valid correctIndex per item',
    '- 15: no banned words (NCERT/Textbook/…) in stem/options/explanation',
    '- 18: explanation length (depth proxy)',
    '',
    `**Variant A total:** ${a.total}`,
    `**Variant B total:** ${b.total}`,
    `**Higher rubric score:** ${winner}`,
    '',
    'Note: This is an automated proxy, not human psychometrics. Small score gaps may be noise; run multiple seeds or judge a sample manually for real decisions.',
  ].join('\n');
}

async function main() {
  console.log(`Model: ${MODEL}`);
  console.log('Generating variant A (with FORGE_FORMAT_PROTOCOLS)...');
  const genA = await generateVariant(true);
  console.log('Generating variant B (without FORGE_FORMAT_PROTOCOLS)...');
  const genB = await generateVariant(false);

  const scoreA = scoreBatch('A_full_forge_block', genA.parsed);
  const scoreB = scoreBatch('B_no_forge_block', genB.parsed);

  const report = [
    '# Prompt variant comparison',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Model: ${MODEL}`,
    '',
    '## Chapter stub',
    CHAPTER_STUB,
    '',
    '## Variant A — system prompts + FORGE_FORMAT_PROTOCOLS',
    '```json',
    JSON.stringify(genA.parsed, null, 2),
    '```',
    '',
    `**Rubric:** ${JSON.stringify(scoreA.details)} → **${scoreA.total}/100**`,
    '',
    '## Variant B — system prompts only (no FORGE_FORMAT_PROTOCOLS)',
    '```json',
    JSON.stringify(genB.parsed, null, 2),
    '```',
    '',
    `**Rubric:** ${JSON.stringify(scoreB.details)} → **${scoreB.total}/100**`,
    '',
    mainSummary(scoreA, scoreB),
  ].join('\n');

  const outPath = join(__dirname, 'output', 'prompt-variant-compare-report.md');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, 'utf8');

  console.log('\n--- Scores (heuristic /100) ---');
  console.log('A (full):', scoreA.total, scoreA.details);
  console.log('B (no forge block):', scoreB.total, scoreB.details);
  console.log('\nReport written to:', outPath);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
