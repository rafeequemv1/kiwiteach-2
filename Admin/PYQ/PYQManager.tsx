import '../../types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  upload_set_id?: string | null;
}

interface PyqUploadSet {
  id: string;
  created_at: string;
  original_filename: string | null;
  source_kind: string;
  uploaded_by: string | null;
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

const toInsertPayload = (d: Draft, uploadSetId: string | null) => ({
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
  upload_set_id: uploadSetId,
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

function norm(s: string | null | undefined) {
  return (s || '').trim().toLowerCase();
}

const PYQManager: React.FC = () => {
  const [rows, setRows] = useState<PYQRow[]>([]);
  const [uploadSets, setUploadSets] = useState<PyqUploadSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [previewRows, setPreviewRows] = useState<Draft[]>([]);
  const [activeUploadSetId, setActiveUploadSetId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterFormat, setFilterFormat] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const setNameById = useMemo(() => {
    const m = new Map<string, string>();
    uploadSets.forEach((s) => m.set(s.id, s.original_filename || s.id.slice(0, 8)));
    return m;
  }, [uploadSets]);

  const loadUploadSets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pyq_upload_sets')
      .select('id, created_at, original_filename, source_kind, uploaded_by')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    setUploadSets((data || []) as PyqUploadSet[]);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: qData, error: qErr } = await supabase
        .from('pyq_questions_neet')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2500);
      if (qErr) throw qErr;
      setRows((qData || []) as PYQRow[]);
      await loadUploadSets();
    } catch (e: any) {
      alert(e?.message || 'Failed to load PYQs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createUploadSet = async (file: File, kind: string): Promise<string | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('pyq_upload_sets')
      .insert({
        original_filename: file.name,
        source_kind: kind,
        uploaded_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (error) {
      alert(error.message);
      return null;
    }
    const id = data.id as string;
    setActiveUploadSetId(id);
    await loadUploadSets();
    return id;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this PYQ?')) return;
    const { error } = await supabase.from('pyq_questions_neet').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  };

  const handleDeleteSet = async (setId: string) => {
    if (!confirm('Delete this upload batch and all its questions?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pyq_upload_sets').delete().eq('id', setId);
      if (error) throw error;
      if (activeUploadSetId === setId) {
        setActiveUploadSetId(null);
        setPreviewRows([]);
      }
      if (expandedSetId === setId) setExpandedSetId(null);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCsv = async (file: File) => {
    const setId = await createUploadSet(file, 'csv');
    if (!setId) return;
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
    const ext = file.name.toLowerCase();
    const kind = ext.endsWith('.txt') ? 'txt' : 'doc';
    const setId = await createUploadSet(file, kind);
    if (!setId) return;

    setParsingDoc(true);
    try {
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
    if (previewRows.length === 0 || !activeUploadSetId) {
      if (!activeUploadSetId) alert('Missing upload batch — pick a file again.');
      return;
    }
    setSaving(true);
    try {
      const user = await supabase.auth.getUser();
      const payload = previewRows.map((d) => ({
        ...toInsertPayload(d, activeUploadSetId),
        uploaded_by: user.data.user?.id || null,
      }));
      const { error } = await supabase.from('pyq_questions_neet').insert(payload);
      if (error) throw error;
      setPreviewRows([]);
      setActiveUploadSetId(null);
      await load();
      alert('PYQs uploaded.');
    } catch (e: any) {
      alert(e?.message || 'Bulk upload failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelPreview = () => {
    setPreviewRows([]);
    setActiveUploadSetId(null);
  };

  const rowMatchesFilters = useCallback(
    (r: {
      question_text: string;
      year: number | null;
      subject_name: string | null;
      question_type: string | null;
      difficulty: string | null;
      question_format: string | null;
      source_exam: string | null;
    }) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !r.question_text.toLowerCase().includes(q)) return false;
      if (filterYear && String(r.year ?? '') !== filterYear) return false;
      if (filterSubject && !norm(r.subject_name).includes(norm(filterSubject))) return false;
      if (filterType && norm(r.question_type) !== norm(filterType)) return false;
      if (filterDifficulty && norm(r.difficulty) !== norm(filterDifficulty)) return false;
      if (filterFormat && norm(r.question_format) !== norm(filterFormat)) return false;
      if (filterExam && !norm(r.source_exam).includes(norm(filterExam))) return false;
      return true;
    },
    [searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam]
  );

  const draftMatchesFilters = useCallback(
    (d: Draft) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !d.question_text.toLowerCase().includes(q)) return false;
      if (filterYear && String(d.year || '') !== filterYear) return false;
      if (filterSubject && !norm(d.subject_name).includes(norm(filterSubject))) return false;
      if (filterType && norm(d.question_type) !== norm(filterType)) return false;
      if (filterDifficulty && norm(d.difficulty) !== norm(filterDifficulty)) return false;
      if (filterFormat && norm(d.question_format) !== norm(filterFormat)) return false;
      if (filterExam && !norm(d.source_exam).includes(norm(filterExam))) return false;
      return true;
    },
    [searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam]
  );

  const filterOptions = useMemo(() => {
    const years = new Set<number>();
    const subjects = new Set<string>();
    const types = new Set<string>();
    const diffs = new Set<string>();
    const formats = new Set<string>();
    const exams = new Set<string>();
    const addRow = (r: PYQRow) => {
      if (r.year != null) years.add(r.year);
      if (r.subject_name?.trim()) subjects.add(r.subject_name.trim());
      if (r.question_type?.trim()) types.add(r.question_type.trim());
      if (r.difficulty?.trim()) diffs.add(r.difficulty.trim());
      if (r.question_format?.trim()) formats.add(r.question_format.trim());
      if (r.source_exam?.trim()) exams.add(r.source_exam.trim());
    };
    rows.forEach(addRow);
    previewRows.forEach((p) => {
      const y = Number(p.year);
      if (Number.isFinite(y)) years.add(y);
      if (p.subject_name?.trim()) subjects.add(p.subject_name.trim());
      if (p.question_type?.trim()) types.add(p.question_type.trim());
      if (p.difficulty?.trim()) diffs.add(p.difficulty.trim());
      if (p.question_format?.trim()) formats.add(p.question_format.trim());
      if (p.source_exam?.trim()) exams.add(p.source_exam.trim());
    });
    return {
      years: Array.from(years).sort((a, b) => b - a),
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b)),
      types: Array.from(types).sort(),
      difficulties: Array.from(diffs).sort(),
      formats: Array.from(formats).sort(),
      exams: Array.from(exams).sort(),
    };
  }, [rows, previewRows]);

  const countsBySet = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r.upload_set_id) m.set(r.upload_set_id, (m.get(r.upload_set_id) || 0) + 1);
    });
    return m;
  }, [rows]);

  const aggregateForSet = useCallback(
    (setId: string) => {
      const qs = rows.filter((r) => r.upload_set_id === setId);
      const fromPreview = setId === activeUploadSetId ? previewRows : [];
      const years: number[] = [];
      const subjects = new Set<string>();
      const types = new Set<string>();
      qs.forEach((r) => {
        if (r.year != null) years.push(r.year);
        if (r.subject_name) subjects.add(r.subject_name);
        if (r.question_type) types.add(r.question_type);
      });
      fromPreview.forEach((p) => {
        const y = Number(p.year);
        if (Number.isFinite(y)) years.push(y);
        if (p.subject_name) subjects.add(p.subject_name);
        if (p.question_type) types.add(p.question_type);
      });
      years.sort((a, b) => a - b);
      const yLabel =
        years.length === 0 ? '—' : years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
      return {
        count: setId === activeUploadSetId && previewRows.length > 0 ? previewRows.length : countsBySet.get(setId) || 0,
        yearLabel: yLabel,
        subjects: Array.from(subjects).slice(0, 4),
        types: Array.from(types).slice(0, 4),
        pending: setId === activeUploadSetId && previewRows.length > 0 && countsBySet.get(setId) === 0,
      };
    },
    [rows, activeUploadSetId, previewRows, countsBySet]
  );

  const setMatchesFilters = useCallback(
    (setId: string) => {
      const qs = rows.filter((r) => r.upload_set_id === setId);
      const prev = setId === activeUploadSetId ? previewRows : [];
      if (qs.length === 0 && prev.length === 0) return !searchQuery && !filterYear && !filterSubject && !filterType && !filterDifficulty && !filterFormat && !filterExam;
      const anyRow =
        qs.some((r) => rowMatchesFilters(r)) || prev.some((d) => draftMatchesFilters(d));
      const name = (setNameById.get(setId) || '').toLowerCase();
      const searchOk = !searchQuery.trim() || name.includes(searchQuery.trim().toLowerCase()) || anyRow;
      return searchOk && (qs.length + prev.length === 0 || anyRow);
    },
    [rows, activeUploadSetId, previewRows, rowMatchesFilters, draftMatchesFilters, searchQuery, filterYear, filterSubject, filterType, filterDifficulty, filterFormat, filterExam, setNameById]
  );

  const filteredSets = useMemo(() => uploadSets.filter((s) => setMatchesFilters(s.id)), [uploadSets, setMatchesFilters]);

  const legacyCount = useMemo(() => rows.filter((r) => !r.upload_set_id).length, [rows]);

  const legacyVisible = useMemo(
    () => rows.some((r) => !r.upload_set_id && rowMatchesFilters(r)),
    [rows, rowMatchesFilters]
  );

  const legacyFilteredCount = useMemo(
    () => rows.filter((r) => !r.upload_set_id && rowMatchesFilters(r)).length,
    [rows, rowMatchesFilters]
  );

  const filteredRows = useMemo(() => rows.filter((r) => rowMatchesFilters(r)), [rows, rowMatchesFilters]);

  const previewCountText = useMemo(() => `${previewRows.length} parsed rows`, [previewRows.length]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterYear('');
    setFilterSubject('');
    setFilterType('');
    setFilterDifficulty('');
    setFilterFormat('');
    setFilterExam('');
  };

  const hasActiveFilters =
    !!searchQuery.trim() ||
    !!filterYear ||
    !!filterSubject ||
    !!filterType ||
    !!filterDifficulty ||
    !!filterFormat ||
    !!filterExam;

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

  const questionsForExpanded = useMemo(() => {
    if (!expandedSetId) return [];
    return rows.filter((r) => r.upload_set_id === expandedSetId).filter(rowMatchesFilters);
  }, [expandedSetId, rows, rowMatchesFilters]);

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Upload and manage NEET PYQs</h3>
        <p className="mt-1 text-[12px] text-zinc-500">
          Each file upload creates a <strong>batch</strong>. Parse preview, then commit. Filter batches and questions by year,
          subject, type, and more.
        </p>
      </div>

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
        {activeUploadSetId && previewRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
            <span>
              Batch <span className="font-mono">{setNameById.get(activeUploadSetId) || '—'}</span> — not saved yet.
            </span>
            <button type="button" onClick={cancelPreview} className="font-semibold underline">
              Discard preview
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => void uploadPreviewRows()}
          disabled={saving || previewRows.length === 0 || !activeUploadSetId}
          className="rounded-md bg-indigo-600 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Upload parsed rows
        </button>

        <div className="max-h-[280px] overflow-auto rounded-md border border-zinc-200">
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
                  <td className="px-2 py-4 text-zinc-400" colSpan={7}>
                    No parsed rows yet.
                  </td>
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

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Search & filters</p>
            <p className="text-[11px] text-zinc-400">Narrow batches and the question table below.</p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:bg-zinc-50"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Search</label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Question text or filename…"
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Year</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All years</option>
              {filterOptions.years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Subject</label>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All subjects</option>
              {filterOptions.subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Difficulty</label>
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All</option>
              {filterOptions.difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Format</label>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All formats</option>
              {filterOptions.formats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-zinc-500">Exam</label>
            <select
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
            >
              <option value="">All exams</option>
              {filterOptions.exams.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Upload batches</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
        {loading && uploadSets.length === 0 ? (
          <p className="text-[12px] text-zinc-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {legacyVisible && (
              <div className="flex flex-col rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-800">Legacy (no batch)</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                    {legacyFilteredCount} Q
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">Rows imported before batch tracking ({legacyCount} total).</p>
              </div>
            )}
            {filteredSets.map((s) => {
              const agg = aggregateForSet(s.id);
              const expanded = expandedSetId === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col rounded-xl border p-4 shadow-sm transition-shadow ${
                    agg.pending ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200 bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900" title={s.original_filename || ''}>
                        {s.original_filename || 'Upload'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                        {agg.count} Q
                      </span>
                      {agg.pending && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                          Unsaved preview
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-600">
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium">Year {agg.yearLabel}</span>
                    {agg.subjects.map((sub) => (
                      <span key={sub} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-900">
                        {sub}
                      </span>
                    ))}
                    {agg.types.map((t) => (
                      <span key={t} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-900">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] uppercase text-zinc-400">Source: {s.source_kind}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedSetId(expanded ? null : s.id)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      {expanded ? 'Hide questions' : 'View questions'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDeleteSet(s.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Delete batch
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-3 max-h-48 overflow-auto rounded-md border border-zinc-100 bg-zinc-50/80 p-2">
                      {questionsForExpanded.length === 0 ? (
                        <p className="text-[10px] text-zinc-500">No matching questions (adjust filters).</p>
                      ) : (
                        <ul className="space-y-1.5 text-[10px] text-zinc-700">
                          {questionsForExpanded.slice(0, 40).map((q) => (
                            <li key={q.id} className="border-b border-zinc-100/80 pb-1.5 last:border-0">
                              <span className="line-clamp-2">{q.question_text}</span>
                              <span className="mt-0.5 block text-zinc-500">
                                {q.year ?? '—'} · {q.subject_name || '—'} · {q.question_type || '—'}
                              </span>
                            </li>
                          ))}
                          {questionsForExpanded.length > 40 && (
                            <li className="text-zinc-400">+{questionsForExpanded.length - 40} more…</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredSets.length === 0 && !(legacyCount > 0) && (
              <p className="col-span-full py-6 text-center text-sm text-zinc-400">
                No batches match filters.{uploadSets.length === 0 ? ' Upload a file to create one.' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
            All PYQs <span className="font-normal text-zinc-400">({filteredRows.length} shown)</span>
          </p>
        </div>
        {loading ? (
          <p className="text-[12px] text-zinc-500">Loading...</p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Batch</th>
                  <th className="px-2 py-1.5">Question</th>
                  <th className="px-2 py-1.5">Subject</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Year</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-zinc-500" title={r.upload_set_id ? setNameById.get(r.upload_set_id) : ''}>
                      {r.upload_set_id ? setNameById.get(r.upload_set_id)?.slice(0, 24) || '—' : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-700">{r.question_text.slice(0, 100)}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.subject_name || '-'}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.question_type || '-'}</td>
                    <td className="px-2 py-1.5 text-zinc-600">{r.year ?? '-'}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-zinc-400" colSpan={6}>
                      No PYQs match filters.
                    </td>
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
