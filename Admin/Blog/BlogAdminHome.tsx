import '../../types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase/client';
import type { BlogFaqItem } from '../../Blog/types';
import { defaultBlogCanonicalPath } from '../../Blog/siteUrl';
import BlogRichEditor, { type BlogEditorApi } from './BlogRichEditor';
import { uploadBlogImage } from './blogImageUpload';
import {
  aiExpandSelection,
  aiGenerateBlogFaqs,
  aiOutlineFromTopic,
  aiSuggestBlogMeta,
} from '../../services/blogAiHelpers';

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string;
  cover_image_url: string | null;
  author_name: string | null;
  published: boolean;
  published_at: string | null;
  updated_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_path: string | null;
  og_image_url: string | null;
  faqs: unknown;
  keywords: string | null;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emptyDoc = '<p></p>';

function parseFaqs(raw: unknown): BlogFaqItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const q = String((x as { question?: unknown }).question ?? '').trim();
      const a = String((x as { answer?: unknown }).answer ?? '').trim();
      if (!q || !a) return null;
      return { question: q, answer: a };
    })
    .filter(Boolean) as BlogFaqItem[];
}

function toJsonbFaqs(items: BlogFaqItem[]): unknown {
  return items.filter((f) => f.question.trim() && f.answer.trim());
}

export default function BlogAdminHome() {
  const [rows, setRows] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('General');
  const [authorName, setAuthorName] = useState('KiwiTeach');
  const [content, setContent] = useState(emptyDoc);
  const [published, setPublished] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [canonicalPath, setCanonicalPath] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [faqs, setFaqs] = useState<BlogFaqItem[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);

  const editorApiRef = useRef<BlogEditorApi | null>(null);
  const onEditorReady = useCallback((api: BlogEditorApi) => {
    editorApiRef.current = api;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select(
        'id, slug, title, excerpt, content, category, cover_image_url, author_name, published, published_at, updated_at, meta_title, meta_description, canonical_path, og_image_url, faqs, keywords'
      )
      .order('updated_at', { ascending: false });
    if (error) {
      console.error(error);
      setLoadError(error.message);
      setRows([]);
    } else {
      setLoadError(null);
      setRows((data || []) as BlogRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setSlug('');
    setTitle('');
    setExcerpt('');
    setCategory('General');
    setAuthorName('KiwiTeach');
    setContent(emptyDoc);
    setPublished(false);
    setMetaTitle('');
    setMetaDescription('');
    setCanonicalPath('');
    setOgImageUrl('');
    setCoverUrl('');
    setKeywords('');
    setFaqs([]);
  };

  const openNew = () => {
    resetForm();
    setEditingId(null);
    setView('edit');
  };

  const openEdit = (row: BlogRow) => {
    setEditingId(row.id);
    setSlug(row.slug);
    setTitle(row.title);
    setExcerpt(row.excerpt || '');
    setCategory(row.category || 'General');
    setAuthorName(row.author_name || 'KiwiTeach');
    setContent(row.content || emptyDoc);
    setPublished(!!row.published);
    setMetaTitle(row.meta_title || '');
    setMetaDescription(row.meta_description || '');
    setCanonicalPath(row.canonical_path || '');
    setOgImageUrl(row.og_image_url || '');
    setCoverUrl(row.cover_image_url || '');
    setKeywords(row.keywords || '');
    setFaqs(parseFaqs(row.faqs));
    setView('edit');
  };

  const validateSlug = () => {
    const s = slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) {
      alert('Slug: lowercase letters, numbers, and hyphens only (e.g. my-neet-guide).');
      return false;
    }
    return true;
  };

  const baseFields = () => {
    const rawPath = canonicalPath.trim() || defaultBlogCanonicalPath(slug.trim().toLowerCase());
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    return {
      slug: slug.trim().toLowerCase(),
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      content,
      category: category.trim() || 'General',
      cover_image_url: coverUrl.trim() || null,
      author_name: authorName.trim() || 'KiwiTeach',
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      canonical_path: path,
      og_image_url: ogImageUrl.trim() || null,
      keywords: keywords.trim() || null,
      faqs: toJsonbFaqs(faqs),
    };
  };

  const saveDraft = async () => {
    if (!validateSlug()) return;
    setSaving(true);
    try {
      const payload = {
        ...baseFields(),
        published: false,
        published_at: null,
      };
      if (editingId) {
        const { error } = await supabase.from('blog_posts').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('blog_posts').insert(payload).select('id').single();
        if (error) throw error;
        if (data?.id) setEditingId(data.id);
      }
      await load();
      alert('Draft saved.');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!validateSlug()) return;
    if (!title.trim() || content.replace(/<[^>]+>/g, '').trim().length < 20) {
      alert('Add a title and substantive body before publishing.');
      return;
    }
    setSaving(true);
    try {
      const row = editingId ? rows.find((r) => r.id === editingId) : null;
      const payload = {
        ...baseFields(),
        published: true,
        published_at: row?.published_at || new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from('blog_posts').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('blog_posts').insert(payload).select('id').single();
        if (error) throw error;
        if (data?.id) setEditingId(data.id);
      }
      setPublished(true);
      await load();
      alert('Published.');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirm('Delete this post permanently?')) return;
    const { error } = await supabase.from('blog_posts').delete().eq('id', editingId);
    if (error) {
      alert(error.message);
      return;
    }
    setView('list');
    setEditingId(null);
    await load();
  };

  const onCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const url = await uploadBlogImage(f);
      setCoverUrl(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const addFaqRow = () => setFaqs((f) => [...f, { question: '', answer: '' }]);
  const updateFaq = (i: number, patch: Partial<BlogFaqItem>) =>
    setFaqs((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeFaq = (i: number) => setFaqs((prev) => prev.filter((_, j) => j !== i));

  const runAi = async (kind: string, fn: () => Promise<void>) => {
    setAiBusy(kind);
    try {
      await fn();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setAiBusy(null);
    }
  };

  const loadErrorBanner = loadError ? (
    /does not exist|meta_title|column .* blog_posts/i.test(loadError) ? (
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Database schema is missing blog CMS columns.</p>
        <p className="mt-1 text-amber-900/90">
          In the Supabase Dashboard, open <strong>SQL Editor</strong>, paste the contents of{' '}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
            supabase/migrations/20260505120000_blog_cms_seo_storage.sql
          </code>
          , and run it. If you see an error about <code className="font-mono text-xs">is_developer</code>, apply{' '}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
            20260503120000_trust_model_developer_and_ai_rpc.sql
          </code>{' '}
          first, then run the blog migration again.
        </p>
      </div>
    ) : (
      <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        <p className="font-semibold">Could not load blog posts</p>
        <p className="mt-1 font-mono text-xs opacity-90">{loadError}</p>
      </div>
    )
  ) : null;

  if (view === 'list') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loadErrorBanner}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <p className="text-sm text-zinc-600">Create and publish journal posts (SEO, FAQs, rich text).</p>
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            New post
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No posts yet. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                      <td className="px-3 py-2 font-medium text-zinc-900">{r.title}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.slug}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {r.published ? 'Live' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => openEdit(r)} className="text-indigo-600 font-semibold hover:underline">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const editorKey = editingId || 'new';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {loadErrorBanner}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3">
        <button type="button" onClick={() => setView('list')} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">
          ← All posts
        </button>
        <span className="text-zinc-300">|</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveDraft()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void publish()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Publish
        </button>
        {editingId ? (
          <button type="button" onClick={() => void remove()} className="ml-auto text-sm font-semibold text-rose-600 hover:underline">
            Delete
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-800">Write with AI</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!aiBusy}
              onClick={() =>
                runAi('outline', async () => {
                  const topic = window.prompt('Topic or working title for a first draft?', title || '');
                  if (!topic?.trim()) return;
                  const html = await aiOutlineFromTopic({ topic: topic.trim() });
                  setContent(html || emptyDoc);
                  if (!title.trim()) setTitle(topic.trim());
                })
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
              {aiBusy === 'outline' ? '…' : 'Draft from topic'}
            </button>
            <button
              type="button"
              disabled={!!aiBusy}
              onClick={() =>
                runAi('meta', async () => {
                  const m = await aiSuggestBlogMeta({ title, excerpt, contentHtml: content });
                  setMetaTitle(m.meta_title);
                  setMetaDescription(m.meta_description);
                })
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
              {aiBusy === 'meta' ? '…' : 'Suggest SEO meta'}
            </button>
            <button
              type="button"
              disabled={!!aiBusy}
              onClick={() =>
                runAi('faq', async () => {
                  const list = await aiGenerateBlogFaqs({ title: title || 'Article', contentHtml: content });
                  if (list.length) setFaqs(list);
                })
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
              {aiBusy === 'faq' ? '…' : 'Generate FAQs'}
            </button>
            <button
              type="button"
              disabled={!!aiBusy}
              onClick={() =>
                runAi('expand', async () => {
                  const api = editorApiRef.current;
                  const sel = api?.getSelectedText() || '';
                  if (!sel.trim()) {
                    alert('Select text in the editor first.');
                    return;
                  }
                  const html = await aiExpandSelection({ selectedText: sel });
                  api?.replaceSelectionWithHtml(html);
                })
              }
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
              {aiBusy === 'expand' ? '…' : 'Expand selection'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-semibold text-zinc-600">
            Slug (URL)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="my-article-slug"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="md:col-span-2 block text-xs font-semibold text-zinc-600">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="md:col-span-2 block text-xs font-semibold text-zinc-600">
            Excerpt
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Author display name
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="block text-xs font-semibold text-zinc-600">
            Cover image
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input type="file" accept="image/*" onChange={(e) => void onCoverFile(e)} className="text-sm" />
              <input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="Or paste image URL"
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">SEO / GEO</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-semibold text-zinc-600">
              Meta title
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Defaults to title"
              />
            </label>
            <label className="block text-xs font-semibold text-zinc-600">
              Canonical path
              <input
                value={canonicalPath}
                onChange={(e) => setCanonicalPath(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="/blog/your-slug"
              />
            </label>
            <label className="md:col-span-2 block text-xs font-semibold text-zinc-600">
              Meta description
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="md:col-span-2 block text-xs font-semibold text-zinc-600">
              OG image URL (optional)
              <input
                value={ogImageUrl}
                onChange={(e) => setOgImageUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Defaults to cover"
              />
            </label>
            <label className="md:col-span-2 block text-xs font-semibold text-zinc-600">
              Keywords (optional)
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="neet, test prep, …"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Body</p>
          <BlogRichEditor key={editorKey} content={content} onChange={setContent} onEditorReady={onEditorReady} disabled={saving} />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">FAQs (GEO / rich results)</p>
            <button type="button" onClick={addFaqRow} className="text-sm font-semibold text-indigo-600 hover:underline">
              + Add FAQ
            </button>
          </div>
          <div className="space-y-3">
            {faqs.length === 0 ? <p className="text-sm text-zinc-500">No FAQs yet. Use “Generate FAQs” or add manually.</p> : null}
            {faqs.map((f, i) => (
              <div key={i} className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 space-y-2">
                <input
                  value={f.question}
                  onChange={(e) => updateFaq(i, { question: e.target.value })}
                  placeholder="Question"
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm font-medium"
                />
                <textarea
                  value={f.answer}
                  onChange={(e) => updateFaq(i, { answer: e.target.value })}
                  placeholder="Answer"
                  rows={3}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
                <button type="button" onClick={() => removeFaq(i)} className="text-xs font-semibold text-rose-600">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
