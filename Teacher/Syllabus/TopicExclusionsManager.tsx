import '../../types';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';
import {
  deleteTopicExclusion,
  fetchSuggestedTopicLabelsForChapter,
  fetchTopicExclusions,
  insertTopicExclusion,
  type TopicExclusionRow,
} from '../../services/syllabusService';

const TopicExclusionsManager: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [kbList, setKbList] = useState<{ id: string; name: string }[]>([]);
  const [kbId, setKbId] = useState('');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [chapters, setChapters] = useState<{ id: string; name: string }[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<TopicExclusionRow[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id || null);
      const { data: kbs } = await supabase.from('knowledge_bases').select('id, name').order('name');
      setKbList(kbs || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchTopicExclusions(supabase, userId).then(setRows).catch(console.error);
  }, [userId]);

  useEffect(() => {
    if (!kbId) {
      setClasses([]);
      setClassId('');
      return;
    }
    supabase
      .from('kb_classes')
      .select('id, name')
      .eq('kb_id', kbId)
      .then(({ data }) => setClasses(data || []));
  }, [kbId]);

  useEffect(() => {
    if (!classId) {
      setSubjects([]);
      setSubjectId('');
      return;
    }
    supabase
      .from('subjects')
      .select('id, name')
      .eq('class_id', classId)
      .then(({ data }) => setSubjects(data || []));
  }, [classId]);

  useEffect(() => {
    if (!subjectId) {
      setChapters([]);
      setChapterId('');
      return;
    }
    supabase
      .from('chapters')
      .select('id, name')
      .eq('subject_id', subjectId)
      .then(({ data }) => setChapters(data || []));
  }, [subjectId]);

  useEffect(() => {
    if (!chapterId || !kbId) {
      setSuggestions([]);
      return;
    }
    fetchSuggestedTopicLabelsForChapter(supabase, kbId, chapterId).then(setSuggestions).catch(() => setSuggestions([]));
  }, [chapterId, kbId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !topicLabel.trim()) return;
    setSaving(true);
    try {
      await insertTopicExclusion(supabase, {
        user_id: userId,
        knowledge_base_id: kbId || null,
        kb_class_id: classId || null,
        subject_id: subjectId || null,
        chapter_id: chapterId || null,
        topic_label: topicLabel.trim(),
        note: note.trim() || null,
      });
      setTopicLabel('');
      setNote('');
      const next = await fetchTopicExclusions(supabase, userId);
      setRows(next);
    } catch (err: any) {
      alert(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!userId || !confirm('Remove this exclusion?')) return;
    await deleteTopicExclusion(supabase, id, userId);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 opacity-30">
        <iconify-icon icon="mdi:loading" className="animate-spin" width="40" />
      </div>
    );
  }

  if (!userId) {
    return <p className="text-sm text-slate-500 p-6">Sign in to manage topic exclusions.</p>;
  }

  return (
    <div className="animate-fade-in p-6 space-y-6 max-w-5xl mx-auto">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-2">
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Negative topic list</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
          AI test generation will avoid these topics entirely. Pick class → subject → chapter from your knowledge base, then add a topic label (comma-list not needed — one label per row).
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5 grid gap-4 md:grid-cols-2"
      >
        <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Knowledge base</span>
            <select
              value={kbId}
              onChange={(e) => setKbId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
            >
              <option value="">Any / not scoped</option>
              {kbList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Class</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!kbId}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none disabled:opacity-40"
            >
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</span>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!classId}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none disabled:opacity-40"
            >
              <option value="">—</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chapter</span>
            <select
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              disabled={!subjectId}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none disabled:opacity-40"
            >
              <option value="">—</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {suggestions.length > 0 && (
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <span className="w-full text-[10px] font-black text-indigo-400 uppercase tracking-widest">From syllabus</span>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTopicLabel(s)}
                className="text-[9px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Topic to forbid</span>
          <input
            required
            value={topicLabel}
            onChange={(e) => setTopicLabel(e.target.value)}
            placeholder="e.g. Nuclear Physics"
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400"
          />
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
          />
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add exclusion'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Your exclusions</h3>
          <span className="text-[10px] font-bold text-slate-400">{rows.length} rows</span>
        </div>
        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto custom-scrollbar">
          {rows.length === 0 && (
            <li className="px-8 py-10 text-center text-xs text-slate-400 font-bold">No exclusions yet.</li>
          )}
          {rows.map((r) => {
            const rowKb =
              (r.knowledge_base_id && kbList.find((k) => k.id === r.knowledge_base_id)?.name) || null;
            const scopeBits = [
              rowKb ? `KB: ${rowKb}` : 'KB: any',
              r.kb_class_id ? 'Class' : null,
              r.subject_id ? 'Subject' : null,
              r.chapter_id ? 'Chapter' : null,
            ].filter(Boolean);
            return (
            <li key={r.id} className="px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-800">{r.topic_label}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1">
                  {scopeBits.join(' · ')}
                </p>
                {r.note && <p className="text-xs text-slate-500 mt-1">{r.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="text-rose-500 text-[10px] font-black uppercase shrink-0"
              >
                Remove
              </button>
            </li>
          );
          })}
        </ul>
      </div>
    </div>
  );
};

export default TopicExclusionsManager;
