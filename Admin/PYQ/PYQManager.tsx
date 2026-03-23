import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from '@google/genai';
import { assertGeminiApiKey } from '../../config/env';

interface PYQRow {
  id: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
  question_format: string | null;
  difficulty: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  topic_tag: string | null;
  class_name: string | null;
  year: number | null;
  source_exam: string | null;
  paper_code: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type Draft = {
  question_text: string;
  question_format: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  correct_index: number;
  explanation: string;
  question_type: string;
  difficulty: string;
  subject_name: string;
  chapter_name: string;
  topic_tag: string;
  class_name: string;
  year: string;
  source_exam: string;
  paper_code: string;
  image_url: string;
};

type GeminiDocRow = Partial<Draft>;

const emptyDraft: Draft = {
  question_text: '',
  question_format: 'text',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_answer: 'A',
  correct_index: 0,
  explanation: '',
  question_type: 'mcq',
  difficulty: 'Medium',
  subject_name: '',
  chapter_name: '',
  topic_tag: '',
  class_name: 'NEET',
  year: '',
  source_exam: 'NEET',
  paper_code: '',
  image_url: '',
};

const csvSplit = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
      continue;
    }
    if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_');

const toOptionArray = (d: Draft) => [d.option_a, d.option_b, d.option_c, d.option_d].filter((x) => x.trim().length > 0);

const toInsertPayload = (d: Draft) => ({
  question_text: d.question_text.trim(),
  options: toOptionArray(d),
  choice_a: d.option_a.trim() || null,
  choice_b: d.option_b.trim() || null,
  choice_c: d.option_c.trim() || null,
  choice_d: d.option_d.trim() || null,
  correct_answer: d.correct_answer.trim() || null,
  correct_index: Number.isFinite(d.correct_index) ? d.correct_index : 0,
  explanation: d.explanation.trim() || null,
  question_type: d.question_type.trim() || 'mcq',
  question_format: d.question_format.trim() || 'text',
  difficulty: d.difficulty.trim() || null,
  subject_name: d.subject_name.trim() || null,
  chapter_name: d.chapter_name.trim() || null,
  topic_tag: d.topic_tag.trim() || null,
  class_name: d.class_name.trim() || 'NEET',
  year: d.year.trim() ? Number(d.year) : null,
  source_exam: d.source_exam.trim() || null,
  paper_code: d.paper_code.trim() || null,
  image_url: d.image_url.trim() || null,
  metadata: {},
});

const applyMapped = (base: Draft, mapped: Record<string, string>) => ({
  ...base,
  question_text: mapped.question_text || mapped.question || '',
  question_format: (mapped.question_format || mapped.format || 'text').toLowerCase(),
  option_a: mapped.option_a || mapped.a || '',
  option_b: mapped.option_b || mapped.b || '',
  option_c: mapped.option_c || mapped.c || '',
  option_d: mapped.option_d || mapped.d || '',
  correct_answer: (mapped.correct_answer || mapped.answer || 'A').toUpperCase(),
  correct_index:
    Number(mapped.correct_index || mapped.answer_index) ||
    ({ A: 0, B: 1, C: 2, D: 3 }[(mapped.correct_answer || mapped.answer || '').toUpperCase() as 'A' | 'B' | 'C' | 'D'] ?? 0),
  explanation: mapped.explanation || '',
  question_type: (mapped.question_type || mapped.type || 'mcq').toLowerCase(),
  difficulty: mapped.difficulty || 'Medium',
  subject_name: mapped.subject_name || mapped.subject || '',
  chapter_name: mapped.chapter_name || mapped.chapter || '',
  topic_tag: mapped.topic_tag || mapped.topic || '',
  class_name: mapped.class_name || mapped.class || 'NEET',
  year: mapped.year || '',
  source_exam: mapped.source_exam || mapped.exam || 'NEET',
  paper_code: mapped.paper_code || mapped.paper || '',
  image_url: mapped.image_url || mapped.figure_url || '',
});

const normalizeGeminiRow = (row: GeminiDocRow): Draft => ({
  ...emptyDraft,
  question_text: String(row.question_text || ''),
  question_format: String((row as any).question_format || 'text').toLowerCase(),
  option_a: String(row.option_a || ''),
  option_b: String(row.option_b || ''),
  option_c: String(row.option_c || ''),
  option_d: String(row.option_d || ''),
  correct_answer: String((row as any).correct_answer || 'A').toUpperCase(),
  correct_index: Number(row.correct_index ?? 0) || 0,
  explanation: String(row.explanation || ''),
  question_type: String(row.question_type || 'mcq').toLowerCase(),
  difficulty: String(row.difficulty || 'Medium'),
  subject_name: String(row.subject_name || ''),
  chapter_name: String(row.chapter_name || ''),
  topic_tag: String(row.topic_tag || ''),
  class_name: String(row.class_name || 'NEET'),
  year: row.year == null ? '' : String(row.year),
  source_exam: String(row.source_exam || 'NEET'),
  paper_code: String(row.paper_code || ''),
  image_url: String(row.image_url || ''),
});

const parseGeminiJson = (txt: string): GeminiDocRow[] => {
  const cleaned = txt
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];
  return parsed as GeminiDocRow[];
};

const PYQManager: React.FC = () => {
  const [rows, setRows] = useState<PYQRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [previewRows, setPreviewRows] = useState<Draft[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pyq_questions_neet')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as PYQRow[]);
    } catch (e: any) {
      alert(e?.message || 'Failed to load PYQs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this PYQ?')) return;
    const { error } = await supabase.from('pyq_questions_neet').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  };

  const handleCsv = async (file: File) => {
    const txt = await file.text();
    const lines = txt.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      alert('CSV is empty');
      return;
    }
    const headers = csvSplit(lines[0]).map(normalizeHeader);
    const parsed: Draft[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = csvSplit(lines[i]);
      const mapped: Record<string, string> = {};
      headers.forEach((h, idx) => {
        mapped[h] = cells[idx] || '';
      });
      const d = applyMapped(emptyDraft, mapped);
      if (d.question_text.trim()) parsed.push(d);
    }
    setPreviewRows(parsed);
  };

  const handleDoc = async (file: File) => {
    setParsingDoc(true);
    try {
      const ext = file.name.toLowerCase();
      let rawText = '';
      if (ext.endsWith('.txt')) {
        rawText = await file.text();
      } else {
        const mammoth = (window as any)?.mammoth;
        if (!mammoth?.extractRawText) {
          alert('DOC/DOCX parser not available.');
          return;
        }
        const buffer = await file.arrayBuffer();
        const out = await mammoth.extractRawText({ arrayBuffer: buffer });
        rawText = out.value || '';
      }

      if (!rawText.trim()) {
        alert('No readable text found in document.');
        return;
      }

      const ai = new GoogleGenAI({ apiKey: assertGeminiApiKey() });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Convert the following NEET PYQ source text into a strictly structured JSON array. ' +
                  'Do not paraphrase or alter factual content. Keep text verbatim wherever present. ' +
                  'If value is missing, use empty string. Output JSON only, no markdown.\n\n' +
                  'Each row must include keys: question_text, option_a, option_b, option_c, option_d, correct_index, explanation, question_type, difficulty, subject_name, chapter_name, topic_tag, class_name, year, source_exam, paper_code, image_url.\n\n' +
                  'Allowed question_format: text, figure. ' +
                  'Allowed question_type: mcq, assertion_reason, reason_based, match_list. ' +
                  'Allowed difficulty: easy, medium, hard.\n\n' +
                  `Source filename: ${file.name}\n\nSOURCE TEXT:\n${rawText}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question_text: { type: Type.STRING },
                option_a: { type: Type.STRING },
                option_b: { type: Type.STRING },
                option_c: { type: Type.STRING },
                option_d: { type: Type.STRING },
                correct_answer: { type: Type.STRING },
                correct_index: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
                question_type: { type: Type.STRING },
                question_format: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                subject_name: { type: Type.STRING },
                chapter_name: { type: Type.STRING },
                topic_tag: { type: Type.STRING },
                class_name: { type: Type.STRING },
                year: { type: Type.STRING },
                source_exam: { type: Type.STRING },
                paper_code: { type: Type.STRING },
                image_url: { type: Type.STRING },
              },
            },
          },
        },
      });
      const outText = response.text || '[]';
      const parsed = parseGeminiJson(outText).map(normalizeGeminiRow).filter((r) => r.question_text.trim());
      setPreviewRows(parsed);
    } catch (e: any) {
      alert(e?.message || 'Failed to parse document with Gemini');
    } finally {
      setParsingDoc(false);
    }
  };

  const uploadPreviewRows = async () => {
    if (previewRows.length === 0) return;
    setSaving(true);
    try {
      const user = await supabase.auth.getUser();
      const payload = previewRows.map((d) => ({ ...toInsertPayload(d), uploaded_by: user.data.user?.id || null }));
      const { error } = await supabase.from('pyq_questions_neet').insert(payload);
      if (error) throw error;
      setPreviewRows([]);
      await load();
      alert('PYQs uploaded.');
    } catch (e: any) {
      alert(e?.message || 'Bulk upload failed');
    } finally {
      setSaving(false);
    }
  };

  const previewCountText = useMemo(() => `${previewRows.length} parsed rows`, [previewRows.length]);

  const downloadCsvTemplate = () => {
    const headers = [
      'question_text',
      'question_format',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'correct_index',
      'explanation',
      'question_type',
      'difficulty',
      'subject_name',
      'chapter_name',
      'topic_tag',
      'class_name',
      'year',
      'source_exam',
      'paper_code',
      'image_url',
    ];
    const sample = [
      'Assertion reason question sample',
      'text',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'B',
      '1',
      'Reasoning for the answer',
      'assertion_reason',
      'medium',
      'Biology',
      'Genetics',
      'Mendelian inheritance',
      'NEET',
      '2023',
      'NEET',
      'SET-A',
      'https://example.com/image.png',
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = `${headers.map(esc).join(',')}\n${sample.map(esc).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyq_neet_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Upload and manage NEET PYQs</h3>
        <p className="mt-1 text-[12px] text-zinc-500">Bulk upload only. CSV import or DOC/DOCX/TXT to Gemini structured parsing, then preview and upload.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Bulk upload with preview</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              <iconify-icon icon="mdi:download-outline" />
              Download CSV template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
              <iconify-icon icon="mdi:file-delimited-outline" />
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCsv(f);
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
              <iconify-icon icon="mdi:file-document-outline" />
              Import DOC/DOCX/TXT via Gemini
              <input
                type="file"
                accept=".doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleDoc(f);
                }}
              />
            </label>
          </div>
          {parsingDoc && <p className="text-[12px] text-indigo-600">Parsing document with Gemini...</p>}
          <p className="text-[12px] text-zinc-500">{previewCountText}</p>
          <button type="button" onClick={() => void uploadPreviewRows()} disabled={saving || previewRows.length === 0} className="rounded-md bg-indigo-600 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-60">
            Upload parsed rows
          </button>

          <div className="max-h-[320px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Question</th>
                  <th className="px-2 py-1.5">Format</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Subject</th>
                  <th className="px-2 py-1.5">Chapter</th>
                  <th className="px-2 py-1.5">Difficulty</th>
                  <th className="px-2 py-1.5">Year</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-zinc-400" colSpan={7}>No parsed rows yet.</td>
                  </tr>
                ) : (
                  previewRows.map((r, i) => (
                    <tr key={`${i}-${r.question_text.slice(0, 12)}`} className="border-t border-zinc-100">
                      <td className="px-2 py-1.5 text-zinc-700">{r.question_text.slice(0, 90)}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.question_format || 'text'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.question_type || 'mcq'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.subject_name || '-'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.chapter_name || '-'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.difficulty || '-'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.year || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Uploaded PYQs</p>
          <button type="button" onClick={() => void load()} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50">Refresh</button>
        </div>
        {loading ? (
          <p className="text-[12px] text-zinc-500">Loading...</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Question</th>
                  <th className="px-2 py-1.5">Subject</th>
                  <th className="px-2 py-1.5">Year</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-2 py-1.5 text-zinc-700">{r.question_text.slice(0, 100)}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.subject_name || '-'}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.year || '-'}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => void handleDelete(r.id)} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-zinc-400" colSpan={4}>No PYQs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PYQManager;

