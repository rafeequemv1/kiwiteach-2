import '../../types';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type {
  MindMapChapterRow,
  MindMapClassRow,
  MindMapKbRow,
  MindMapSubjectRow,
  MindMapTopicRow,
} from './questionBankMindmapService';

type NodeKind = 'kb' | 'class' | 'subject' | 'chapter' | 'topic';

export interface MindMapGraphNode {
  key: string;
  kind: NodeKind;
  label: string;
  count: number;
  /** For expand / load UI */
  expandable: boolean;
  loading: boolean;
  error: string | null;
  kbId?: string;
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  children: MindMapGraphNode[];
}

function estimatePillWidth(label: string): number {
  return Math.min(320, 56 + Math.min(label.length, 48) * 7.2 + 36);
}

const ROW_H = 52;
const COL_W = 228;
const BLOCK_GAP_ROWS = 2.5;

interface LayoutItem {
  node: MindMapGraphNode;
  depth: number;
  y: number;
}

interface LayoutSection {
  items: LayoutItem[];
  yMin: number;
  yMax: number;
}

function layoutSubtree(node: MindMapGraphNode, depth: number, nextLeafY: { n: number }): { yTop: number; yBottom: number; items: LayoutItem[] } {
  if (node.children.length === 0) {
    const y = nextLeafY.n++;
    return {
      yTop: y,
      yBottom: y,
      items: [{ node, depth, y }],
    };
  }
  const parts = node.children.map((c) => layoutSubtree(c, depth + 1, nextLeafY));
  const yTop = Math.min(...parts.map((p) => p.yTop));
  const yBottom = Math.max(...parts.map((p) => p.yBottom));
  const yMid = (yTop + yBottom) / 2;
  return {
    yTop,
    yBottom,
    items: [{ node, depth, y: yMid }, ...parts.flatMap((p) => p.items)],
  };
}

function stackForests(roots: MindMapGraphNode[]): LayoutItem[] {
  let rowOffset = 0;
  const out: LayoutItem[] = [];
  for (const root of roots) {
    const nextLeafY = { n: 0 };
    const { items, yTop, yBottom } = layoutSubtree(root, 0, nextLeafY);
    const shift = rowOffset - yTop;
    for (const it of items) {
      out.push({ ...it, y: it.y + shift });
    }
    rowOffset = yBottom + shift + BLOCK_GAP_ROWS;
  }
  return out;
}

function buildEdges(forest: MindMapGraphNode[]): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  function addEdges(n: MindMapGraphNode) {
    for (const c of n.children) {
      edges.push({ from: n.key, to: c.key });
      addEdges(c);
    }
  }
  for (const r of forest) addEdges(r);
  return edges;
}

const kindPillClass: Record<NodeKind, string> = {
  kb: 'border-indigo-200/90 bg-indigo-50 text-indigo-900',
  class: 'border-sky-200/90 bg-sky-50 text-sky-900',
  subject: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
  chapter: 'border-amber-200/90 bg-amber-50 text-amber-900',
  topic: 'border-zinc-200/90 bg-zinc-50 text-zinc-700',
};

const kindIcon: Record<NodeKind, string> = {
  kb: 'mdi:book-open-page-variant-outline',
  class: 'mdi:school-outline',
  subject: 'mdi:shape-outline',
  chapter: 'mdi:file-document-outline',
  topic: 'mdi:tag-text-outline',
};

export interface QuestionBankMindMapCanvasProps {
  roots: MindMapKbRow[] | null;
  expanded: Set<string>;
  loading: Set<string>;
  errors: Record<string, string>;
  classesByKb: Record<string, MindMapClassRow[]>;
  subjectsByClass: Record<string, MindMapSubjectRow[]>;
  chaptersBySubject: Record<string, MindMapChapterRow[]>;
  topicsByChapter: Record<string, MindMapTopicRow[]>;
  onKbToggle: (kbId: string) => void;
  onClassToggle: (classId: string) => void;
  onSubjectToggle: (subjectId: string) => void;
  onChapterToggle: (chapterId: string) => void;
}

function buildGraphForest(
  roots: MindMapKbRow[],
  expanded: Set<string>,
  loading: Set<string>,
  errors: Record<string, string>,
  classesByKb: Record<string, MindMapClassRow[]>,
  subjectsByClass: Record<string, MindMapSubjectRow[]>,
  chaptersBySubject: Record<string, MindMapChapterRow[]>,
  topicsByChapter: Record<string, MindMapTopicRow[]>
): MindMapGraphNode[] {
  return roots.map((kb) => {
    const kbKey = `kb:${kb.kb_id}`;
    const kbLoad = `kb-load:${kb.kb_id}`;
    const kbChildren: MindMapGraphNode[] = [];
    if (expanded.has(kbKey) && classesByKb[kb.kb_id]) {
      for (const cl of classesByKb[kb.kb_id]) {
        const clKey = `cl:${cl.class_id}`;
        const clLoad = `cl-load:${cl.class_id}`;
        const clChildren: MindMapGraphNode[] = [];
        if (expanded.has(clKey) && subjectsByClass[cl.class_id]) {
          for (const su of subjectsByClass[cl.class_id]) {
            const suKey = `sub:${su.subject_id}`;
            const suLoad = `sub-load:${su.subject_id}`;
            const suChildren: MindMapGraphNode[] = [];
            if (expanded.has(suKey) && chaptersBySubject[su.subject_id]) {
              for (const ch of chaptersBySubject[su.subject_id]) {
                const chKey = `ch:${ch.chapter_id}`;
                const chLoad = `ch-load:${ch.chapter_id}`;
                const chLabel =
                  ch.chapter_number != null ? `${ch.chapter_number}. ${ch.chapter_name}` : ch.chapter_name || 'Chapter';
                const chChildren: MindMapGraphNode[] = [];
                if (expanded.has(chKey) && topicsByChapter[ch.chapter_id]) {
                  for (const tg of topicsByChapter[ch.chapter_id]) {
                    const tKey = `${ch.chapter_id}:${tg.topic_label}`;
                    chChildren.push({
                      key: tKey,
                      kind: 'topic',
                      label: tg.topic_label,
                      count: tg.question_count,
                      expandable: false,
                      loading: false,
                      error: null,
                      children: [],
                    });
                  }
                }
                suChildren.push({
                  key: chKey,
                  kind: 'chapter',
                  label: chLabel,
                  count: ch.question_count,
                  expandable: true,
                  loading: loading.has(chLoad),
                  error: errors[chLoad] ?? null,
                  chapterId: ch.chapter_id,
                  children: chChildren,
                });
              }
            }
            clChildren.push({
              key: suKey,
              kind: 'subject',
              label: su.subject_name || 'Subject',
              count: su.question_count,
              expandable: true,
              loading: loading.has(suLoad),
              error: errors[suLoad] ?? null,
              subjectId: su.subject_id,
              children: suChildren,
            });
          }
        }
        kbChildren.push({
          key: clKey,
          kind: 'class',
          label: cl.class_name || 'Class',
          count: cl.question_count,
          expandable: true,
          loading: loading.has(clLoad),
          error: errors[clLoad] ?? null,
          classId: cl.class_id,
          children: clChildren,
        });
      }
    }
    return {
      key: kbKey,
      kind: 'kb',
      label: kb.kb_name || 'Untitled KB',
      count: kb.question_count,
      expandable: true,
      loading: loading.has(kbLoad),
      error: errors[kbLoad] ?? null,
      kbId: kb.kb_id,
      children: kbChildren,
    };
  });
}

export const QuestionBankMindMapCanvas: React.FC<QuestionBankMindMapCanvasProps> = ({
  roots,
  expanded,
  loading,
  errors,
  classesByKb,
  subjectsByClass,
  chaptersBySubject,
  topicsByChapter,
  onKbToggle,
  onClassToggle,
  onSubjectToggle,
  onChapterToggle,
}) => {
  const forest = useMemo(() => {
    if (!roots || roots.length === 0) return [];
    return buildGraphForest(roots, expanded, loading, errors, classesByKb, subjectsByClass, chaptersBySubject, topicsByChapter);
  }, [roots, expanded, loading, errors, classesByKb, subjectsByClass, chaptersBySubject, topicsByChapter]);

  const layoutItems = useMemo(() => stackForests(forest), [forest]);
  const edges = useMemo(() => buildEdges(forest), [forest]);

  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number; depth: number; node: MindMapGraphNode }>();
    for (const it of layoutItems) {
      const x = 40 + it.depth * COL_W;
      const y = 36 + it.y * ROW_H;
      m.set(it.node.key, { x, y, depth: it.depth, node: it.node });
    }
    return m;
  }, [layoutItems]);

  const bounds = useMemo(() => {
    let maxX = 400;
    let maxY = 200;
    for (const it of layoutItems) {
      const x = 40 + it.depth * COL_W + estimatePillWidth(it.node.label) / 2 + 40;
      const y = 36 + it.y * ROW_H + 40;
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { w: maxX, h: maxY };
  }, [layoutItems]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onPointerDownBg = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-mindmap-pill]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
  }, [pan.x, pan.y]);

  const onPointerMoveBg = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) });
  }, []);

  const onPointerUpBg = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onPillClick = useCallback(
    (node: MindMapGraphNode) => {
      if (!node.expandable) return;
      if (node.kind === 'kb' && node.kbId) onKbToggle(node.kbId);
      else if (node.kind === 'class' && node.classId) onClassToggle(node.classId);
      else if (node.kind === 'subject' && node.subjectId) onSubjectToggle(node.subjectId);
      else if (node.kind === 'chapter' && node.chapterId) onChapterToggle(node.chapterId);
    },
    [onKbToggle, onClassToggle, onSubjectToggle, onChapterToggle]
  );

  const edgePaths = useMemo(() => {
    const paths: { d: string; key: string }[] = [];
    for (const { from, to } of edges) {
      const a = positions.get(from);
      const b = positions.get(to);
      if (!a || !b) continue;
      const wFrom = estimatePillWidth(a.node.label);
      const wTo = estimatePillWidth(b.node.label);
      const x1 = a.x + wFrom / 2;
      const y1 = a.y;
      const x2 = b.x - wTo / 2;
      const y2 = b.y;
      const mid = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
      paths.push({ d, key: `${from}->${to}` });
    }
    return paths;
  }, [edges, positions]);

  if (!roots || roots.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">No knowledge bases to map.</p>;
  }

  return (
    <div
      className="relative h-[min(72vh,680px)] w-full cursor-grab overflow-hidden rounded-xl border border-zinc-200 bg-[#fafafa] active:cursor-grabbing"
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMoveBg}
      onPointerUp={onPointerUpBg}
      onPointerLeave={onPointerUpBg}
    >
      <p className="pointer-events-none absolute left-3 top-2 z-10 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
        Drag background to pan · click pills to expand
      </p>
      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        <svg
          width={bounds.w}
          height={bounds.h}
          className="pointer-events-none absolute left-0 top-0 text-zinc-300"
          aria-hidden
        >
          {edgePaths.map(({ d, key }) => (
            <path key={key} d={d} fill="none" stroke="currentColor" strokeWidth={1.25} opacity={0.55} />
          ))}
        </svg>
        <div className="relative" style={{ width: bounds.w, height: bounds.h }}>
          {layoutItems.map((it) => {
            const { x, y } = { x: 40 + it.depth * COL_W, y: 36 + it.y * ROW_H };
            const n = it.node;
            return (
              <div
                key={n.key}
                data-mindmap-pill
                className="absolute flex items-center"
                style={{
                  left: x,
                  top: y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 2,
                }}
              >
                <button
                  type="button"
                  disabled={!n.expandable}
                  onClick={() => onPillClick(n)}
                  className={`flex max-w-[320px] items-center gap-2 rounded-full border px-3 py-2 text-left shadow-sm transition-all ${
                    kindPillClass[n.kind]
                  } ${n.expandable ? 'cursor-pointer hover:brightness-[0.97] hover:shadow-md' : 'cursor-default'}`}
                  title={n.expandable ? (expanded.has(n.key) ? 'Collapse branch' : 'Expand branch') : undefined}
                >
                  {n.expandable && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/80 text-zinc-600">
                      {n.loading ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-rose-500" />
                      ) : (
                        <iconify-icon icon={expanded.has(n.key) ? 'mdi:chevron-down' : 'mdi:chevron-right'} width="16" />
                      )}
                    </span>
                  )}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/5 bg-white/60">
                    <iconify-icon icon={kindIcon[n.kind]} width="16" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs font-semibold leading-tight">{n.label}</span>
                    {n.error && <span className="mt-0.5 block truncate text-[10px] text-rose-600">{n.error}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums rounded-md bg-black/10 px-2 py-0.5 text-[10px] font-bold">
                    {n.count.toLocaleString()}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
