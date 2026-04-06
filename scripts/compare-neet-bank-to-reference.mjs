/**
 * Compare question_bank_neet sample to a reference DOCX (NEET-style bar).
 *
 * Usage (from Kiwiteach-Quiz):
 *   node --env-file=.env scripts/compare-neet-bank-to-reference.mjs "C:/Users/User/Desktop/pw1.docx" 30
 *
 * Or export rows as JSON from Supabase (Table → Export) and run without DB URL:
 *   node --env-file=.env scripts/compare-neet-bank-to-reference.mjs --json=./scripts/data/bank-export.json "C:/Users/User/Desktop/pw1.docx"
 *
 * Requires:
 *   - GEMINI_API_KEY or GOOGLE_GENAI_API_KEY
 *   - Either: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended) or anon if RLS allows
 *   - Or: --json=file.json array of question objects
 *
 * Output: scripts/output/neet-vs-reference-report.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, 'output', 'neet-vs-reference-report.md');

function parseArgs(argv) {
  const jsonArg = argv.find((a) => a.startsWith('--json='));
  const jsonPath = jsonArg ? jsonArg.slice('--json='.length) : null;
  const positional = argv.filter((a) => !a.startsWith('--'));
  return { jsonPath, positional };
}

async function main() {
  const { jsonPath, positional } = parseArgs(process.argv.slice(2));
  const refPath =
    positional.find((p) => /\.docx$/i.test(p)) ||
    path.join(process.env.USERPROFILE || '', 'Desktop', 'pw1.docx');
  const limitArg = positional.find((p) => /^\d+$/.test(p));
  const limit = Math.min(80, Math.max(5, Number(limitArg || 30)));

  const refBuf = await fs.readFile(refPath);
  const refResult = await mammoth.extractRawText({ buffer: refBuf });
  let refText = (refResult.value || '').trim();
  const refTrunc = refText.length > 95000;
  if (refTrunc) refText = refText.slice(0, 95000) + '\n\n[Reference truncated at 95k chars for API input.]';

  let rows;
  if (jsonPath) {
    const raw = await fs.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error('--json must be an array of question objects (or { rows: [...] }).');
      process.exit(1);
    }
    rows = rows.slice(0, limit);
  } else {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const key = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    if (!url || !key) {
      console.error('Missing SUPABASE_URL and a key, or pass --json=export.json');
      process.exit(1);
    }

    const sb = createClient(url, key);
    const res = await sb
      .from('question_bank_neet')
      .select(
        'id, question_text, options, correct_index, difficulty, question_type, explanation, chapter_name, topic_tag, subject_name'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (res.error) {
      console.error('Supabase:', res.error.message);
      console.error('Tip: use SUPABASE_SERVICE_ROLE_KEY if RLS blocks anon reads on question_bank_neet.');
      process.exit(1);
    }
    rows = res.data;
    if (!rows?.length) {
      console.error('No rows returned from question_bank_neet.');
      process.exit(1);
    }
  }

  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '').trim();
  if (!geminiKey) {
    console.error('Set GEMINI_API_KEY or GOOGLE_GENAI_API_KEY.');
    process.exit(1);
  }

  let bankJson = JSON.stringify(rows);
  const bankCap = 180000;
  let bankTrunc = false;
  if (bankJson.length > bankCap) {
    bankJson = bankJson.slice(0, bankCap) + '...[bank JSON truncated]';
    bankTrunc = true;
  }

  const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();

  const instruction = `You are an expert NTA NEET (UG) assessment psychometrician and item writer.

## Reference material (DOCX plain text — pattern only)
Use this ONLY to infer style: typical stem length, numeric vs conceptual mix, MCQ vs assertion vs matching vs statements patterns, distractor density, LaTeX usage, perceived difficulty ladder.
Do NOT paste long verbatim excerpts from the reference. Do not name institutes or books.

---
${refText}
---

## Our database sample (question_bank_neet)
JSON array of ${rows.length} recent items (fields: question_text, options, correct_index, difficulty, question_type, explanation, chapter_name, topic_tag, subject_name, id):
\`\`\`json
${bankJson}
\`\`\`
${bankTrunc ? '\n_(Bank JSON was truncated for input size.)_\n' : ''}

## Required Markdown report

### 1. Reference profile (short)
Bullet list: what the reference “feels” like as a NEET-style paper (8–12 bullets).

### 2. Bank vs reference — alignment scores
Give each a **0–100** score with **one sentence** rationale:
| Dimension | Score | Note |
|-----------|-------|------|
| Reference fit (style / tone / format mix) | | |
| NEET authenticity | | |
| Difficulty calibration (Easy/Medium/Hard vs stem depth) | | |
| Distractor / option quality | | |
| Explanation usefulness | | |
| LaTeX / notation hygiene (if applicable) | | |

### 3. Overall weighted score
State weights (e.g. 20% reference fit, 20% authenticity, …) and compute **Overall: XX/100**.

### 4. Gap analysis
Numbered list: **10** prioritized changes to move the bank closer to the reference bar.

### 5. Weak / strong items
- **3 strongest** items by id (why).
- **3 weakest** items by id (why, actionable fix).

Use tables where helpful. Be direct and professional.`;

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: instruction }] }],
    config: { temperature: 0.25, maxOutputTokens: 12288 },
  });

  const reportBody = typeof res.text === 'string' ? res.text.trim() : '_No text in response._';

  const header = `# NEET bank vs reference (pw1-style)\n\n- Generated: ${new Date().toISOString()}\n- Model: ${model}\n- Reference file: ${refPath}\n- Bank rows: ${rows.length} (latest by created_at)\n- Reference chars: ${refResult.value?.length ?? 0}${refTrunc ? ' (truncated for API)' : ''}\n\n---\n\n`;

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, header + reportBody, 'utf8');
  console.log('Wrote', OUT_PATH);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
