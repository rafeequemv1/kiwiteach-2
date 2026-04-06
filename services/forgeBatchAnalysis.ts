/**
 * NEET question-bank batch quality review via server Gemini proxy.
 * Payloads omit huge inline images to keep requests within context limits.
 */

import { adminGeminiGenerateContent } from './adminGeminiProxy';

export type AnalysisTableRow = Record<string, unknown>;

const MAX_ROWS_PER_CALL = 28;

const ANALYSIS_INSTRUCTION = `You are an expert NTA NEET (UG) item writer and psychometric reviewer.

You will receive a JSON array of objects. Each object is one row from our question_bank_neet-style table (stem, options, correct key, explanation, metadata). Inline images are omitted and marked as placeholders.

Write a structured **Markdown** report. Be specific and actionable; reference question indices (0-based, matching array order).

## Required sections

### 1. Batch overview
- **Overall quality score (0–100)** with one sentence rationale.
- **Difficulty calibration**: Do Easy / Medium / Hard tags match cognitive load and typical NEET bands? Flag systematic mis-tags.
- **Style mix**: Comment on MCQ vs reasoning (assertion) vs matching vs statement-type balance and whether formats look exam-authentic.
- **Topic stickiness**: Do \`topic_tag\` values align with stem content and \`chapter_name\` / subject? List mismatches by index.
- **Chapter & NEET pattern fit**: Do stems feel like real NEET arcs (clarity, clinical/science tone, distractor style) for this subject?

### 2. Explanations
- Average **explanation quality (0–10)** for the batch.
- Common issues (too short, wrong reasoning, not addressing distractors, LaTeX/clarity).
- Which indices need rewrite.

### 3. Choices (options / distractors)
- **Distractor quality (0–10)** for the batch: plausibility, parallelism, length balance, "all/none of the above" issues, duplicate concepts.
- Per-question **choice set score (0–10)** for each index in a compact table: | Index | choice_score | one-line note |

### 4. Per-question scores
For **each** question index, a short block:
- **Stem** 0–10, **Options** 0–10, **Explanation** 0–10, **Difficulty match** 0–10 (tag vs observed difficulty).
- **One-line verdict** (fix or ship).

### 5. Top improvements
Numbered priority list (max 8) of what to change before publishing.

Use tables where helpful. If the batch is small, still complete every per-index block.`;

function omitLargeStrings(value: unknown, key: string): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith('data:') || value.length > 4000) {
    return `[omitted: ${key}, ${value.length} chars]`;
  }
  return value;
}

/** Strip inline images and oversized fields before sending to the model. */
export function sanitizeRowForAnalysis(row: Record<string, unknown>): AnalysisTableRow {
  const keys = [
    'figure_url',
    'source_figure_url',
    'figureDataUrl',
    'sourceFigureDataUrl',
  ] as const;
  const out: AnalysisTableRow = { ...row };
  for (const k of keys) {
    if (k in out) out[k] = omitLargeStrings(out[k], k);
  }
  out.has_figure_url = Boolean(
    typeof row.figure_url === 'string' && row.figure_url.length > 0
  );
  out.has_source_figure_url = Boolean(
    typeof row.source_figure_url === 'string' && row.source_figure_url.length > 0
  );
  return out;
}

/** Map a browse/review QuestionItem-like object to a DB-shaped analysis row. */
export function questionItemToAnalysisRow(item: Record<string, unknown>): AnalysisTableRow {
  const row: Record<string, unknown> = {
    id: item.id,
    chapter_id: item.chapter_id,
    chapter_name: item.chapter_name,
    subject_name: item.subject_name,
    class_name: item.class_name,
    question_text: item.question_text ?? item.text,
    options: item.options,
    correct_index: item.correct_index ?? item.correctIndex,
    explanation: item.explanation,
    difficulty: item.difficulty,
    question_type: item.question_type ?? item.type,
    topic_tag: item.topic_tag,
    column_a: item.column_a ?? item.columnA,
    column_b: item.column_b ?? item.columnB,
    prompt_set_id: item.prompt_set_id,
    prompt_generation_source: item.prompt_generation_source,
    generation_model: item.generation_model,
    prompt_set_name: item.prompt_set_name,
  };
  row.figure_url = item.figure_url ?? item.figureDataUrl;
  row.source_figure_url = item.source_figure_url ?? item.sourceFigureDataUrl;
  return sanitizeRowForAnalysis(row);
}

export type ForgeAnalysisResult = {
  markdown: string;
  truncated: boolean;
  analyzedCount: number;
  totalCount: number;
};

export async function runForgeBatchQualityAnalysis(
  rows: AnalysisTableRow[],
  model: string
): Promise<ForgeAnalysisResult> {
  if (rows.length === 0) {
    return {
      markdown: '_No questions to analyze._',
      truncated: false,
      analyzedCount: 0,
      totalCount: 0,
    };
  }

  const totalCount = rows.length;
  const slice = rows.slice(0, MAX_ROWS_PER_CALL);
  const truncated = totalCount > MAX_ROWS_PER_CALL;

  const payload = JSON.stringify(slice, null, 0);
  const userBlock = `${ANALYSIS_INSTRUCTION}

---
**Batch meta:** ${slice.length} question(s) in this payload${truncated ? ` (of ${totalCount} total — only the first ${MAX_ROWS_PER_CALL} are included; run another forge or analyze selected subsets for the rest)` : ''}.

**JSON:**
\`\`\`json
${payload}
\`\`\``;

  const response = await adminGeminiGenerateContent({
    model,
    contents: { role: 'user', parts: [{ text: userBlock }] },
    config: {
      temperature: model.includes('pro') ? 0.25 : 0.2,
      maxOutputTokens: model.includes('pro') ? 24576 : 16384,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text?.trim() || '_No response text from model._';
  return {
    markdown: text,
    truncated,
    analyzedCount: slice.length,
    totalCount,
  };
}
