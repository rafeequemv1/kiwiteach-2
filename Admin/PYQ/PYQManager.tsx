import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

interface PYQRow {
  id: string;
  question_text: string;
  options: string[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_type: string | null;
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
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
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

const emptyDraft: Draft = {
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
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
  correct_index: Number.isFinite(d.correct_index) ? d.correct_index : 0,
  explanation: d.explanation.trim() || null,
  question_type: d.question_type.trim() || 'mcq',
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
  option_a: mapped.option_a || mapped.a || '',
  option_b: mapped.option_b || mapped.b || '',
  option_c: mapped.option_c || mapped.c || '',
  option_d: mapped.option_d || mapped.d || '',
  correct_index: Number(mapped.correct_index || mapped.answer_index || 0) || 0,
  explanation: mapped.explanation || '',
  question_type: mapped.question_type || mapped.type || 'mcq',
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

const parseDocBlocks = (text: string): Draft[] => {
  const blocks = text
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const rows: Draft[] = [];
  for (const b of blocks) {
    const lines = b
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const mapped: Record<string, string> = {};
    for (const l of lines) {
      const m = l.match(/^([A-Za-z_ ]+)\s*:\s*(.+)$/);
      if (!m) continue;
      mapped[normalizeHeader(m[1])] = m[2].trim();
    }
    const d = applyMapped(emptyDraft, mapped);
    if (d.question_text.trim()) rows.push(d);
  }
  return rows;
};

const PYQManager: React.FC = () => {
  const [rows, setRows] = useState<PYQRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const handleSave = async () => {
    if (!draft.question_text.trim()) {
      alert('Question text is required');
      return;
    }
    setSaving(true);
    try {
      const payload = toInsertPayload(draft);
      if (editingId) {
        const { error } = await supabase
          .from('pyq_questions_neet')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const user = await supabase.auth.getUser();
        const { error } = await supabase
          .from('pyq_questions_neet')
          .insert([{ ...payload, uploaded_by: user.data.user?.id || null }]);
        if (error) throw error;
      }
      setDraft(emptyDraft);
      setEditingId(null);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (r: PYQRow) => {
    const opts = (r.options || []) as string[];
    setDraft({
      question_text: r.question_text || '',
      option_a: opts[0] || '',
      option_b: opts[1] || '',
      option_c: opts[2] || '',
      option_d: opts[3] || '',
      correct_index: r.correct_index ?? 0,
      explanation: r.explanation || '',
      question_type: r.question_type || 'mcq',
      difficulty: r.difficulty || 'Medium',
      subject_name: r.subject_name || '',
      chapter_name: r.chapter_name || '',
      topic_tag: r.topic_tag || '',
      class_name: r.class_name || 'NEET',
      year: r.year ? String(r.year) : '',
      source_exam: r.source_exam || 'NEET',
      paper_code: r.paper_code || '',
      image_url: r.image_url || '',
    });
    setEditingId(r.id);
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

  const handleImageUpload = async (f: File) => {
    const path = `pyq/${Date.now()}-${f.name.replace(/\s+/g, '_')}`;
    const { error } = await supabase.storage.from('pyq-images').upload(path, f, { upsert: true });
    if (error) {
      alert(error.message);
      return;
    }
    const { data } = supabase.storage.from('pyq-images').getPublicUrl(path);
    setDraft((p) => ({ ...p, image_url: data.publicUrl }));
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
    const ext = file.name.toLowerCase();
    if (ext.endsWith('.txt')) {
      const txt = await file.text();
      setPreviewRows(parseDocBlocks(txt));
      return;
    }

    const mammoth = (window as any)?.mammoth;
    if (!mammoth?.extractRawText) {
      alert('DOC/DOCX parser not available. Please use CSV or TXT.');
      return;
    }
    const buffer = await file.arrayBuffer();
    const out = await mammoth.extractRawText({ arrayBuffer: buffer });
    setPreviewRows(parseDocBlocks(out.value || ''));
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

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Upload and manage NEET PYQs</h3>
        <p className="mt-1 text-[12px] text-zinc-500">Manual CRUD, image upload, CSV import, and DOC/TXT parsing with preview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <textarea
              value={draft.question_text}
              onChange={(e) => setDraft((p) => ({ ...p, question_text: e.target.value }))}
              placeholder="Question text"
              className="md:col-span-2 min-h-[92px] rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input value={draft.option_a} onChange={(e) => setDraft((p) => ({ ...p, option_a: e.target.value }))} placeholder="Option A" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.option_b} onChange={(e) => setDraft((p) => ({ ...p, option_b: e.target.value }))} placeholder="Option B" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.option_c} onChange={(e) => setDraft((p) => ({ ...p, option_c: e.target.value }))} placeholder="Option C" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.option_d} onChange={(e) => setDraft((p) => ({ ...p, option_d: e.target.value }))} placeholder="Option D" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={String(draft.correct_index)} onChange={(e) => setDraft((p) => ({ ...p, correct_index: Number(e.target.value) || 0 }))} placeholder="Correct index (0-3)" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.difficulty} onChange={(e) => setDraft((p) => ({ ...p, difficulty: e.target.value }))} placeholder="Difficulty" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.question_type} onChange={(e) => setDraft((p) => ({ ...p, question_type: e.target.value }))} placeholder="Question type" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.subject_name} onChange={(e) => setDraft((p) => ({ ...p, subject_name: e.target.value }))} placeholder="Subject" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.chapter_name} onChange={(e) => setDraft((p) => ({ ...p, chapter_name: e.target.value }))} placeholder="Chapter" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.topic_tag} onChange={(e) => setDraft((p) => ({ ...p, topic_tag: e.target.value }))} placeholder="Topic tag" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.year} onChange={(e) => setDraft((p) => ({ ...p, year: e.target.value }))} placeholder="Year" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.source_exam} onChange={(e) => setDraft((p) => ({ ...p, source_exam: e.target.value }))} placeholder="Source exam" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.paper_code} onChange={(e) => setDraft((p) => ({ ...p, paper_code: e.target.value }))} placeholder="Paper code" className="rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <input value={draft.image_url} onChange={(e) => setDraft((p) => ({ ...p, image_url: e.target.value }))} placeholder="Image URL (optional)" className="md:col-span-2 rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <textarea value={draft.explanation} onChange={(e) => setDraft((p) => ({ ...p, explanation: e.target.value }))} placeholder="Explanation" className="md:col-span-2 min-h-[78px] rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
              <iconify-icon icon="mdi:image-plus-outline" />
              Upload image
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageUpload(f);
                }}
              />
            </label>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-md bg-zinc-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-zinc-800 disabled:opacity-60">
              {editingId ? 'Update PYQ' : 'Create PYQ'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); }} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50">
                Cancel edit
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Bulk upload with preview</p>
          <div className="flex flex-wrap items-center gap-2">
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
              Import DOC/DOCX/TXT
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
          <p className="text-[12px] text-zinc-500">{previewCountText}</p>
          <button type="button" onClick={() => void uploadPreviewRows()} disabled={saving || previewRows.length === 0} className="rounded-md bg-indigo-600 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-60">
            Upload parsed rows
          </button>

          <div className="max-h-[320px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Question</th>
                  <th className="px-2 py-1.5">Subject</th>
                  <th className="px-2 py-1.5">Chapter</th>
                  <th className="px-2 py-1.5">Year</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-zinc-400" colSpan={4}>No parsed rows yet.</td>
                  </tr>
                ) : (
                  previewRows.map((r, i) => (
                    <tr key={`${i}-${r.question_text.slice(0, 12)}`} className="border-t border-zinc-100">
                      <td className="px-2 py-1.5 text-zinc-700">{r.question_text.slice(0, 90)}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.subject_name || '-'}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{r.chapter_name || '-'}</td>
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
                        <button type="button" onClick={() => handleEdit(r)} className="rounded border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50">Edit</button>
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

