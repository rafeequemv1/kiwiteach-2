import '../../types';
import React, { useCallback, useEffect, useState } from 'react';
import { mindMapCacheClearAll } from './questionBankMindmapCache';
import { QuestionBankMindMapCanvas } from './QuestionBankMindMapCanvas';
import {
  fetchMindMapChapters,
  fetchMindMapClasses,
  fetchMindMapKnowledgeBases,
  fetchMindMapSubjects,
  fetchMindMapTopicTags,
  formatMindMapError,
  type MindMapChapterRow,
  type MindMapClassRow,
  type MindMapKbRow,
  type MindMapSubjectRow,
  type MindMapTopicRow,
} from './questionBankMindmapService';
import { mindMapChapterPillLabel, mindMapSubjectPillLabel } from './questionBankMindmapLabels';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';

type NodeKind = 'kb' | 'class' | 'subject' | 'chapter' | 'topic';

interface TreeNodeProps {
  depth: number;
  label: string;
  count: number;
  icon: string;
  kind: NodeKind;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
  children?: React.ReactNode;
}

const CountBadge: React.FC<{ n: number }> = ({ n }) => (
  <span className="tabular-nums rounded-md bg-zinc-200/90 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
    {n.toLocaleString()}
  </span>
);

const TreeNode: React.FC<TreeNodeProps> = ({
  depth,
  label,
  count,
  icon,
  kind,
  expanded,
  loading,
  error,
  onToggle,
  children,
}) => {
  const hasChildren = kind !== 'topic';
  return (
    <div className="select-none">
      <div
        className="flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors hover:bg-zinc-100/80"
        style={{ paddingLeft: `${8 + depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:border-zinc-300 hover:text-zinc-800"
            aria-expanded={expanded}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-200 border-t-rose-500" />
            ) : (
              <iconify-icon icon={expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'} width="18" />
            )}
          </button>
        ) : (
          <span className="inline-flex w-7 shrink-0 justify-center text-zinc-300">
            <iconify-icon icon="mdi:circle-small" width="22" />
          </span>
        )}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm ${
            kind === 'kb'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : kind === 'class'
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : kind === 'subject'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : kind === 'chapter'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-600'
          }`}
        >
          <iconify-icon icon={icon} width="18" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-800">{label}</span>
          <CountBadge n={count} />
        </div>
      </div>
      {error && (
        <p className="pl-14 pr-2 text-xs text-rose-600" style={{ paddingLeft: `${36 + depth * 18}px` }}>
          {error}
        </p>
      )}
      {expanded && children}
    </div>
  );
};

const QuestionBankMindMap: React.FC = () => {
  const [roots, setRoots] = useState<MindMapKbRow[] | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [classesByKb, setClassesByKb] = useState<Record<string, MindMapClassRow[]>>({});
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, MindMapSubjectRow[]>>({});
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, MindMapChapterRow[]>>({});
  const [topicsByChapter, setTopicsByChapter] = useState<Record<string, MindMapTopicRow[]>>({});
  const [bankMapView, setBankMapView] = useState<'map' | 'list'>('map');

  const loadRoots = useCallback(async (bypassCache: boolean) => {
    setRootError(null);
    try {
      const rows = await fetchMindMapKnowledgeBases({ bypassCache });
      setRoots(rows);
    } catch (e: unknown) {
      const msg = formatMindMapError(e);
      setRootError(
        msg.toLowerCase().includes('not allowed') || msg.includes('42501')
          ? 'You need developer or school admin access for the bank map.'
          : msg
      );
      setRoots([]);
    }
  }, []);

  useEffect(() => {
    void loadRoots(refreshNonce > 0);
  }, [loadRoots, refreshNonce]);

  const setErr = (key: string, msg: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const ensureKbChildren = async (kbId: string) => {
    if (classesByKb[kbId]) return;
    const k = `kb-load:${kbId}`;
    setLoading((s) => new Set(s).add(k));
    setErr(k, null);
    try {
      const rows = await fetchMindMapClasses(kbId);
      setClassesByKb((p) => ({ ...p, [kbId]: rows }));
    } catch (e: unknown) {
      setErr(k, formatMindMapError(e));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  const ensureClassChildren = async (classId: string) => {
    if (subjectsByClass[classId]) return;
    const k = `cl-load:${classId}`;
    setLoading((s) => new Set(s).add(k));
    setErr(k, null);
    try {
      const rows = await fetchMindMapSubjects(classId);
      setSubjectsByClass((p) => ({ ...p, [classId]: rows }));
    } catch (e: unknown) {
      setErr(k, formatMindMapError(e));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  const ensureSubjectChildren = async (subjectId: string) => {
    if (chaptersBySubject[subjectId]) return;
    const k = `sub-load:${subjectId}`;
    setLoading((s) => new Set(s).add(k));
    setErr(k, null);
    try {
      const rows = await fetchMindMapChapters(subjectId);
      setChaptersBySubject((p) => ({ ...p, [subjectId]: rows }));
    } catch (e: unknown) {
      setErr(k, formatMindMapError(e));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  const ensureChapterChildren = async (chapterId: string) => {
    if (topicsByChapter[chapterId]) return;
    const k = `ch-load:${chapterId}`;
    setLoading((s) => new Set(s).add(k));
    setErr(k, null);
    try {
      const rows = await fetchMindMapTopicTags(chapterId);
      setTopicsByChapter((p) => ({ ...p, [chapterId]: rows }));
    } catch (e: unknown) {
      setErr(k, formatMindMapError(e));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  const onKbToggle = async (kbId: string) => {
    const key = `kb:${kbId}`;
    const willOpen = !expanded.has(key);
    toggle(key);
    if (willOpen) await ensureKbChildren(kbId);
  };

  const onClassToggle = async (classId: string) => {
    const key = `cl:${classId}`;
    const willOpen = !expanded.has(key);
    toggle(key);
    if (willOpen) await ensureClassChildren(classId);
  };

  const onSubjectToggle = async (subjectId: string) => {
    const key = `sub:${subjectId}`;
    const willOpen = !expanded.has(key);
    toggle(key);
    if (willOpen) await ensureSubjectChildren(subjectId);
  };

  const onChapterToggle = async (chapterId: string) => {
    const key = `ch:${chapterId}`;
    const willOpen = !expanded.has(key);
    toggle(key);
    if (willOpen) await ensureChapterChildren(chapterId);
  };

  const handleRefresh = () => {
    mindMapCacheClearAll();
    setClassesByKb({});
    setSubjectsByClass({});
    setChaptersBySubject({});
    setTopicsByChapter({});
    setExpanded(new Set());
    setErrors({});
    setRefreshNonce((n) => n + 1);
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/80 ${workspacePageClass}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">Bank map</h2>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">
            Lazy load · session cache · refresh clears cache
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setBankMapView('map')}
              className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                bankMapView === 'map' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setBankMapView('list')}
              className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                bankMapView === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              List
            </button>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-700 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800"
          >
            <iconify-icon icon="mdi:refresh" width="16" />
            Refresh data
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div
          className={`mx-auto rounded-2xl border border-zinc-200/80 bg-white shadow-sm ${
            bankMapView === 'map' ? 'max-w-[min(100%,1200px)] p-3' : 'max-w-3xl p-4'
          }`}
        >
          {rootError && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{rootError}</div>
          )}
          {!roots && !rootError && (
            <div className="flex items-center gap-3 py-8 text-sm text-zinc-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-rose-500" />
              Loading knowledge bases…
            </div>
          )}
          {roots && bankMapView === 'map' && (
            <QuestionBankMindMapCanvas
              roots={roots}
              expanded={expanded}
              loading={loading}
              errors={errors}
              classesByKb={classesByKb}
              subjectsByClass={subjectsByClass}
              chaptersBySubject={chaptersBySubject}
              topicsByChapter={topicsByChapter}
              onKbToggle={(id) => void onKbToggle(id)}
              onClassToggle={(id) => void onClassToggle(id)}
              onSubjectToggle={(id) => void onSubjectToggle(id)}
              onChapterToggle={(id) => void onChapterToggle(id)}
            />
          )}
          {roots &&
            bankMapView === 'list' &&
            roots.map((kb) => {
              const kbKey = `kb:${kb.kb_id}`;
              const kbExpanded = expanded.has(kbKey);
              const classes = classesByKb[kb.kb_id];
              const loadKey = `kb-load:${kb.kb_id}`;
              return (
                <TreeNode
                  key={kb.kb_id}
                  depth={0}
                  label={kb.kb_name || 'Untitled KB'}
                  count={kb.question_count}
                  icon="mdi:book-open-page-variant-outline"
                  kind="kb"
                  expanded={kbExpanded}
                  loading={loading.has(loadKey)}
                  error={errors[loadKey] ?? null}
                  onToggle={() => void onKbToggle(kb.kb_id)}
                >
                  {kbExpanded &&
                    classes &&
                    classes.map((cl) => {
                      const clKey = `cl:${cl.class_id}`;
                      const clExp = expanded.has(clKey);
                      const subs = subjectsByClass[cl.class_id];
                      const clLoad = `cl-load:${cl.class_id}`;
                      return (
                        <TreeNode
                          key={cl.class_id}
                          depth={1}
                          label={cl.class_name || 'Class'}
                          count={cl.question_count}
                          icon="mdi:school-outline"
                          kind="class"
                          expanded={clExp}
                          loading={loading.has(clLoad)}
                          error={errors[clLoad] ?? null}
                          onToggle={() => void onClassToggle(cl.class_id)}
                        >
                          {clExp &&
                            subs &&
                            subs.map((su) => {
                              const suKey = `sub:${su.subject_id}`;
                              const suExp = expanded.has(suKey);
                              const chs = chaptersBySubject[su.subject_id];
                              const suLoad = `sub-load:${su.subject_id}`;
                              return (
                                <TreeNode
                                  key={su.subject_id}
                                  depth={2}
                                  label={mindMapSubjectPillLabel(su.subject_name)}
                                  count={su.question_count}
                                  icon="mdi:shape-outline"
                                  kind="subject"
                                  expanded={suExp}
                                  loading={loading.has(suLoad)}
                                  error={errors[suLoad] ?? null}
                                  onToggle={() => void onSubjectToggle(su.subject_id)}
                                >
                                  {suExp &&
                                    chs &&
                                    chs.map((ch) => {
                                      const chKey = `ch:${ch.chapter_id}`;
                                      const chExp = expanded.has(chKey);
                                      const tags = topicsByChapter[ch.chapter_id];
                                      const chLoad = `ch-load:${ch.chapter_id}`;
                                      const chLabel = mindMapChapterPillLabel(ch, su.subject_name);
                                      return (
                                        <TreeNode
                                          key={ch.chapter_id}
                                          depth={3}
                                          label={chLabel || 'Chapter'}
                                          count={ch.question_count}
                                          icon="mdi:file-document-outline"
                                          kind="chapter"
                                          expanded={chExp}
                                          loading={loading.has(chLoad)}
                                          error={errors[chLoad] ?? null}
                                          onToggle={() => void onChapterToggle(ch.chapter_id)}
                                        >
                                          {chExp &&
                                            tags &&
                                            tags.map((tg) => (
                                              <TreeNode
                                                key={`${ch.chapter_id}:${tg.topic_label}`}
                                                depth={4}
                                                label={tg.topic_label}
                                                count={tg.question_count}
                                                icon="mdi:tag-text-outline"
                                                kind="topic"
                                                expanded={false}
                                                loading={false}
                                                error={null}
                                                onToggle={() => {}}
                                              />
                                            ))}
                                        </TreeNode>
                                      );
                                    })}
                                </TreeNode>
                              );
                            })}
                        </TreeNode>
                      );
                    })}
                </TreeNode>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default QuestionBankMindMap;
