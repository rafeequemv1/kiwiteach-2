import '../../types';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  Copy,
  FileText,
  Folder,
  GripVertical,
  FolderOpen,
  LayoutGrid,
  LayoutList,
  MoreVertical,
  Pencil,
  Trash2,
  Users2,
} from 'lucide-react';
import { explorerHeaderRowClass, workspacePageClass } from '../components/WorkspaceChrome';

type ViewMode = 'icons' | 'list' | 'calendar' | 'kanban';
type CalendarType = 'month' | 'week' | 'year';
type TestStatus = 'draft' | 'generated' | 'scheduled' | 'pending_evaluation' | 'completed';

interface Test {
  id: string;
  name: string;
  questionCount: number;
  generatedAt: string;
  scheduledAt?: string | null;
  status: 'draft' | 'scheduled' | 'generated';
  class_ids?: string[];
  config?: any;
  layout_config?: any;
  question_ids?: string[];
  questions?: any[];
  folder_id?: string | null;
  evaluationPending?: boolean;
}

interface Institute {
  id: string;
  name: string;
  color?: string;
}

interface OrgClass {
  id: string;
  name: string;
  institute_id: string | null;
}

interface Folder {
  id: string;
  name: string;
  parent_id?: string | null;
  tests: Test[];
  children?: Folder[];
}

interface TestDashboardProps {
  username?: string;
  institutesList: Institute[];
  classesList: OrgClass[];
  folders: Folder[];
  allTests: Test[];
  onAddFolder: (folder: { name: string; parent_id: string | null }) => void;
  /** Second arg: legacy calendar string date, or options including org class id when a class pill is selected. */
  onStartNewTest: (
    folderId: string | null,
    options?: string | { initialScheduleDate?: string; hubClassId?: string | null }
  ) => void;
  onTestClick: (test: Test) => void;
  onDeleteItem: (type: 'folder' | 'test', id: string, name: string) => void;
  onDuplicateTest: (test: Test) => void;
  onRenameTest: (testId: string, newName: string) => void;
  onScheduleTest: (testId: string, date: string | null) => void;
  onAssignClasses: (testId: string, classIds: string[]) => Promise<void>;
  onMoveTestToFolder?: (testId: string, folderId: string | null) => Promise<void>;
  onSetEvaluationPending?: (testId: string, pending: boolean) => Promise<void>;
  /** Move a test back to draft (board / kanban). */
  onRevertTestToDraft?: (testId: string) => Promise<void>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  calendarType: CalendarType;
  setCalendarType: (type: CalendarType) => void;
  title?: string;
  subtitle?: string;
  /** Primary CTA (default: New test) */
  primaryActionLabel?: string;
  /** Class tests: bordered segmented control. Online tests: flat zinc pills. */
  headerViewToggleStyle?: 'segmented' | 'flat';
}

function flattenFolderTree(nodes: Folder[]): Folder[] {
  const acc: Folder[] = [];
  const walk = (list: Folder[]) => {
    list.forEach((n) => {
      acc.push({ id: n.id, name: n.name, parent_id: n.parent_id, children: n.children, tests: n.tests });
      if (n.children?.length) walk(n.children);
    });
  };
  walk(nodes);
  return acc;
}

function parseTestDragPayload(e: React.DragEvent): { type: string; id: string } | null {
  try {
    const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
    if (!raw) return null;
    const d = JSON.parse(raw) as { type?: string; id?: string };
    if (d?.type === 'test' && d?.id) return { type: d.type, id: d.id };
  } catch {
    /* ignore */
  }
  return null;
}

/** Test `created_at` (mapped as `generatedAt`): show date + time if created within the last 24 hours, else date only. */
function formatTestCreatedLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ageMs = Date.now() - d.getTime();
  const within24h = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  if (within24h) {
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function computeTestStatus(t: Test): TestStatus {
  if (t.status === 'draft') return 'draft';
  if (t.evaluationPending) return 'pending_evaluation';
  if (t.scheduledAt) {
    const scheduleDate = new Date(t.scheduledAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduleDate.setHours(0, 0, 0, 0);
    return scheduleDate < today ? 'completed' : 'scheduled';
  }
  return 'generated';
}

type BoardOptimisticEntry = { patch: Partial<Test>; targetColumn: TestStatus };

function buildKanbanPatch(test: Test, target: TestStatus): Partial<Test> {
  if (target === 'draft') return { status: 'draft', scheduledAt: null, evaluationPending: false };
  if (target === 'pending_evaluation') return { evaluationPending: true };
  if (target === 'scheduled') {
    const date = test.scheduledAt ? new Date(test.scheduledAt) : new Date();
    const iso = date.toISOString().split('T')[0];
    return { status: 'scheduled', scheduledAt: new Date(iso).toISOString(), evaluationPending: false };
  }
  if (target === 'completed') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().split('T')[0];
    return { status: 'scheduled', scheduledAt: new Date(iso).toISOString(), evaluationPending: false };
  }
  if (target === 'generated') return { status: 'generated', scheduledAt: null, evaluationPending: false };
  return {};
}

function setTestDragPayload(e: React.DragEvent, testId: string) {
  const payload = JSON.stringify({ type: 'test', id: testId });
  e.dataTransfer.setData('text/plain', payload);
  e.dataTransfer.setData('application/json', payload);
  e.dataTransfer.effectAllowed = 'move';
}

/** Plain folder glyph — no box (Explorer-style) */
const ExplorerFolderIcon: React.FC<{ dragOver?: boolean }> = ({ dragOver }) => (
  <Folder
    className={`h-16 w-16 shrink-0 ${dragOver ? 'text-sky-500' : 'text-amber-500'}`}
    fill="currentColor"
    strokeWidth={1.15}
    aria-hidden
  />
);

/** Plain document glyph for tests — no “PDF” label */
const ExplorerTestDocIcon: React.FC = () => (
  <FileText className="h-14 w-11 shrink-0 text-zinc-600" strokeWidth={1.15} aria-hidden />
);

type MenuItem = { label: string; onClick: () => void; danger?: boolean; icon?: LucideIcon };

const ExplorerKebabMenu: React.FC<{ items: MenuItem[] }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[80] mt-0.5 min-w-[168px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] ${
                  item.danger ? 'text-red-600 hover:bg-red-50' : 'text-zinc-800 hover:bg-zinc-50'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />}
                <span className="min-w-0 flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const statusLabel = (s: TestStatus): string => {
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'scheduled':
      return 'Scheduled';
    case 'pending_evaluation':
      return 'Pending evaluation';
    case 'completed':
      return 'Completed';
    default:
      return 'Ready';
  }
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

const TestsCalendarDemo: React.FC<{
  tests: Test[];
  onTestClick: (t: Test) => void;
  onAddAtDate: (dateISO: string) => void;
  onDropToDate: (testId: string, dateISO: string) => void;
}> = ({ tests, onTestClick, onAddAtDate, onDropToDate }) => {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);

  const toYmd = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const ymdFromRaw = (raw: string | null | undefined) => {
    if (!raw) return '';
    // Works for ISO timestamps and plain YYYY-MM-DD.
    const v = String(raw);
    return v.length >= 10 ? v.slice(0, 10) : '';
  };

  const { label, weeks } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const cells: { day: number | null; date: Date | null }[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, date: new Date(y, m, d) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, date: null });
    const w: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    return {
      label: cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
      weeks: w,
    };
  }, [cursor]);

  const testsByDay = useMemo(() => {
    const map = new Map<string, { test: Test; kind: 'scheduled' | 'created' }[]>();
    const cursorMonth = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    tests.forEach((t) => {
      const raw = t.scheduledAt || t.generatedAt;
      if (!raw) return;
      const ymd = ymdFromRaw(raw);
      if (!ymd || ymd.slice(0, 7) !== cursorMonth) return;
      const key = ymd;
      const kind: 'scheduled' | 'created' = t.scheduledAt ? 'scheduled' : 'created';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ test: t, kind });
    });
    return map;
  }, [tests, cursor]);

  const dayKey = (date: Date) => toYmd(date);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-800">Calendar</span>
          <span className="text-xs text-zinc-500">Scheduled date, or created date if not scheduled</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-medium text-zinc-800">{label}</span>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-100/80 text-center text-[11px] font-medium text-zinc-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="border-r border-zinc-200 py-2 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-zinc-100 last:border-b-0">
            {row.map((cell, ci) => {
              if (!cell.date || cell.day === null) {
                return <div key={ci} className="min-h-[88px] border-r border-zinc-100 bg-zinc-50/30 last:border-r-0" />;
              }
              const list = testsByDay.get(dayKey(cell.date)) || [];
              const key = dayKey(cell.date);
              return (
                <div
                  key={ci}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverDayKey(key);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverDayKey(key);
                  }}
                  onDragLeave={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && e.currentTarget.contains(next)) return;
                    setDragOverDayKey((k) => (k === key ? null : k));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const payload = parseTestDragPayload(e);
                    setDragOverDayKey(null);
                    if (!payload) return;
                    onDropToDate(payload.id, dayKey(cell.date!));
                  }}
                  className={`min-h-[88px] border-r border-zinc-100 p-1 last:border-r-0 ${
                    dragOverDayKey === key ? 'bg-sky-50 ring-1 ring-inset ring-sky-300' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddAtDate(dayKey(cell.date!));
                      }}
                      className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                      title="Add test on this date"
                      aria-label="Add test on this date"
                    >
                      +
                    </button>
                    <div className="text-right text-xs font-medium text-zinc-600">{cell.day}</div>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map(({ test: t, kind }) => {
                      const when = new Date(t.scheduledAt || t.generatedAt || '');
                      const whenLabel =
                        kind === 'scheduled'
                          ? `Scheduled: ${when.toLocaleString(undefined, { dateStyle: 'short' })}`
                          : `Created: ${when.toLocaleString(undefined, { dateStyle: 'short' })}`;
                      return (
                        <button
                          key={`${t.id}-${kind}`}
                          type="button"
                          draggable
                          onDragStart={(e) => setTestDragPayload(e, t.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTestClick(t);
                          }}
                          className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium hover:bg-sky-50 ${
                            kind === 'scheduled'
                              ? 'border-sky-200 bg-sky-50/80 text-zinc-800 hover:border-sky-300'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300'
                          }`}
                          title={`${t.name} — ${whenLabel}`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                    {list.length > 3 && (
                      <p className="text-[9px] text-zinc-400">+{list.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const TestDashboard: React.FC<TestDashboardProps> = ({
  username,
  institutesList,
  classesList,
  folders,
  allTests,
  onAddFolder,
  onStartNewTest,
  onTestClick,
  onDeleteItem,
  onDuplicateTest,
  onRenameTest,
  onScheduleTest,
  onAssignClasses,
  onMoveTestToFolder,
  onSetEvaluationPending,
  onRevertTestToDraft,
  viewMode,
  setViewMode,
  calendarType: _calendarType,
  setCalendarType: _setCalendarType,
  title = 'Test Repository',
  subtitle,
  primaryActionLabel = 'New test',
  headerViewToggleStyle = 'segmented',
}) => {
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, string | null>>({});
  /** Instant kanban column moves; cleared when server copy matches target column. */
  const [boardOptimistic, setBoardOptimistic] = useState<Record<string, BoardOptimisticEntry>>({});
  const [schedulingTest, setSchedulingTest] = useState<Test | null>(null);
  const [assigningTest, setAssigningTest] = useState<Test | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [isAssigningSaving, setIsAssigningSaving] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ type: 'folder' | 'test'; id: string; name: string } | null>(null);
  const [tempScheduleDate, setTempScheduleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverParent, setDragOverParent] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [editName, setEditName] = useState('');
  const [editScheduleDate, setEditScheduleDate] = useState('');
  const [editPendingEvaluation, setEditPendingEvaluation] = useState(false);

  useEffect(() => {
    if (schedulingTest) {
      const d = schedulingTest.scheduledAt ? new Date(schedulingTest.scheduledAt) : new Date();
      if (!isNaN(d.getTime())) setTempScheduleDate(d.toISOString().split('T')[0]);
      else setTempScheduleDate(new Date().toISOString().split('T')[0]);
    }
  }, [schedulingTest]);

  useEffect(() => {
    if (assigningTest) setSelectedAssignmentIds(assigningTest.class_ids || []);
  }, [assigningTest]);

  useEffect(() => {
    if (!editingTest) return;
    setEditName(editingTest.name || '');
    const d = editingTest.scheduledAt ? new Date(editingTest.scheduledAt) : new Date();
    setEditScheduleDate(!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setEditPendingEvaluation(!!editingTest.evaluationPending);
  }, [editingTest]);

  const displayedClasses = useMemo(() => {
    if (selectedInstituteId === 'all') return [];
    return classesList.filter((c) => c.institute_id === selectedInstituteId);
  }, [classesList, selectedInstituteId]);

  const testsToDisplay = useMemo(() => {
    let filtered = allTests;

    if (selectedInstituteId !== 'all') {
      const schoolClassIds = new Set(classesList.filter((c) => c.institute_id === selectedInstituteId).map((c) => c.id));
      filtered = filtered.filter((t) => {
        const ids = Array.isArray(t.class_ids) ? t.class_ids : [];
        if (ids.length === 0) return true;
        return ids.some((id) => schoolClassIds.has(id));
      });
    }

    if (selectedClassId) {
      filtered = filtered.filter((t) => {
        const ids = Array.isArray(t.class_ids) ? t.class_ids : [];
        return ids.includes(selectedClassId);
      });
    }

    if (currentFolderId) {
      filtered = filtered.filter((t) => t.folder_id === currentFolderId);
    }

    return filtered
      .map((t) => {
        let m = t;
        if (optimisticOverrides[t.id] !== undefined) {
          m = { ...m, scheduledAt: optimisticOverrides[t.id] };
        }
        const bo = boardOptimistic[t.id];
        if (bo) m = { ...m, ...bo.patch };
        return m;
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledAt || b.generatedAt || 0).getTime() - new Date(a.scheduledAt || a.generatedAt || 0).getTime()
      );
  }, [allTests, selectedInstituteId, selectedClassId, currentFolderId, classesList, optimisticOverrides, boardOptimistic]);

  useEffect(() => {
    setBoardOptimistic((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        const raw = allTests.find((t) => t.id === id);
        if (!raw) {
          delete next[id];
          changed = true;
          continue;
        }
        if (computeTestStatus(raw) === prev[id].targetColumn) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allTests]);

  const allFoldersFlat = useMemo(() => flattenFolderTree(folders), [folders]);

  const visibleFolders = useMemo(() => {
    if (selectedInstituteId !== 'all' || selectedClassId) return [];
    return allFoldersFlat.filter((f) => (currentFolderId ? f.parent_id === currentFolderId : !f.parent_id));
  }, [allFoldersFlat, currentFolderId, selectedInstituteId, selectedClassId]);

  const currentFolderMeta = useMemo(
    () => (currentFolderId ? allFoldersFlat.find((f) => f.id === currentFolderId) : null),
    [currentFolderId, allFoldersFlat]
  );

  const parentFolderIdForDrop = currentFolderMeta?.parent_id ?? null;

  const handleSchoolTabClick = (schoolId: string) => {
    setSelectedInstituteId(schoolId);
    setSelectedClassId(null);
    setCurrentFolderId(null);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onAddFolder({ name: newFolderName.trim(), parent_id: currentFolderId });
    setNewFolderName('');
    setIsCreateModalOpen(false);
  };

  const handleDropTestOnFolder = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    setDragOverParent(false);
    const payload = parseTestDragPayload(e);
    if (!payload || !onMoveTestToFolder) return;
    void onMoveTestToFolder(payload.id, targetFolderId);
  };

  const folderDragProps = (folderId: string) =>
    onMoveTestToFolder
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDragOverFolderId(folderId);
          },
          onDragLeave: (e: React.DragEvent) => {
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            setDragOverFolderId((id) => (id === folderId ? null : id));
          },
          onDrop: (e: React.DragEvent) => handleDropTestOnFolder(e, folderId),
        }
      : {};

  const parentDropZoneDragLeave = (e: React.DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOverParent(false);
  };

  const persistKanbanMove = async (test: Test, target: TestStatus) => {
    const rollback = () => {
      setBoardOptimistic((o) => {
        if (!(test.id in o)) return o;
        const n = { ...o };
        delete n[test.id];
        return n;
      });
    };
    try {
      if (target === 'draft') {
        if (!onRevertTestToDraft) {
          alert('Move to draft is not configured.');
          rollback();
          return;
        }
        setOptimisticOverrides((o) => {
          const n = { ...o };
          delete n[test.id];
          return n;
        });
        await onRevertTestToDraft(test.id);
        return;
      }

      if (target === 'pending_evaluation') {
        if (onSetEvaluationPending && !test.evaluationPending) await onSetEvaluationPending(test.id, true);
        return;
      }

      if (onSetEvaluationPending && test.evaluationPending) {
        await onSetEvaluationPending(test.id, false);
      }

      if (target === 'scheduled') {
        const date = test.scheduledAt ? new Date(test.scheduledAt) : new Date();
        const iso = date.toISOString().split('T')[0];
        setOptimisticOverrides((o) => ({ ...o, [test.id]: new Date(iso).toISOString() }));
        onScheduleTest(test.id, iso);
        return;
      }

      if (target === 'completed') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const iso = d.toISOString().split('T')[0];
        setOptimisticOverrides((o) => ({ ...o, [test.id]: new Date(iso).toISOString() }));
        onScheduleTest(test.id, iso);
        return;
      }

      if (target === 'generated') {
        setOptimisticOverrides((o) => ({ ...o, [test.id]: null }));
        onScheduleTest(test.id, null);
      }
    } catch {
      rollback();
    }
  };

  const applyKanbanDrop = (testId: string, target: TestStatus) => {
    const display = testsToDisplay.find((t) => t.id === testId);
    const canonical = allTests.find((t) => t.id === testId);
    if (!display || !canonical) return;

    const patch = buildKanbanPatch(display, target);
    setBoardOptimistic((o) => ({ ...o, [testId]: { patch, targetColumn: target } }));

    if (target === 'draft') {
      setOptimisticOverrides((o) => {
        const n = { ...o };
        delete n[testId];
        return n;
      });
    } else if (target === 'scheduled') {
      const date = display.scheduledAt ? new Date(display.scheduledAt) : new Date();
      const iso = date.toISOString().split('T')[0];
      setOptimisticOverrides((o) => ({ ...o, [testId]: new Date(iso).toISOString() }));
    } else if (target === 'completed') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const iso = d.toISOString().split('T')[0];
      setOptimisticOverrides((o) => ({ ...o, [testId]: new Date(iso).toISOString() }));
    } else if (target === 'generated') {
      setOptimisticOverrides((o) => ({ ...o, [testId]: null }));
    }

    void persistKanbanMove(canonical, target);
  };

  const saveEditModal = async () => {
    if (!editingTest) return;
    const nextName = editName.trim();
    if (nextName && nextName !== editingTest.name) onRenameTest(editingTest.id, nextName);
    if (editScheduleDate) {
      setOptimisticOverrides((o) => ({ ...o, [editingTest.id]: new Date(editScheduleDate).toISOString() }));
      onScheduleTest(editingTest.id, editScheduleDate);
    }
    if (onSetEvaluationPending && editPendingEvaluation !== !!editingTest.evaluationPending) {
      await onSetEvaluationPending(editingTest.id, editPendingEvaluation);
    }
    setEditingTest(null);
  };

  const confirmAssignment = async () => {
    if (!assigningTest) return;
    setIsAssigningSaving(true);
    await onAssignClasses(assigningTest.id, selectedAssignmentIds);
    setIsAssigningSaving(false);
    setAssigningTest(null);
  };

  const testKebabItems = (test: Test, status: TestStatus, setIsRenaming: (v: boolean) => void): MenuItem[] => {
    const items: MenuItem[] = [
      { label: 'Edit details', icon: Pencil, onClick: () => setEditingTest(test) },
      { label: 'Rename', icon: Pencil, onClick: () => setIsRenaming(true) },
      { label: 'Duplicate', icon: Copy, onClick: () => onDuplicateTest(test) },
    ];
    if (status !== 'draft') {
      items.push(
        { label: 'Schedule', icon: Calendar, onClick: () => setSchedulingTest(test) },
        { label: 'Assign classes', icon: Users2, onClick: () => setAssigningTest(test) },
      );
    }
    if (onSetEvaluationPending && status !== 'draft') {
      items.push(
        test.evaluationPending
          ? {
              label: 'Clear pending evaluation',
              icon: ClipboardCheck,
              onClick: () => void onSetEvaluationPending(test.id, false),
            }
          : {
              label: 'Pending evaluation',
              icon: ClipboardList,
              onClick: () => void onSetEvaluationPending(test.id, true),
            },
      );
    }
    items.push({
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onClick: () => setDeletingItem({ type: 'test', id: test.id, name: test.name }),
    });
    return items;
  };

  const ExplorerFileRow: React.FC<{ test: Test }> = ({ test }) => {
    const status = computeTestStatus(test);
    const [isRenaming, setIsRenaming] = useState(false);
    const [tempName, setTempName] = useState(test.name);

    const handleRenameSubmit = () => {
      if (tempName.trim() !== test.name && tempName.trim() !== '') onRenameTest(test.id, tempName.trim());
      else setTempName(test.name);
      setIsRenaming(false);
    };

    const createdLabel = formatTestCreatedLabel(test.generatedAt);

    return (
      <div
        draggable
        onDragStart={(e) => setTestDragPayload(e, test.id)}
        className="group grid grid-cols-[minmax(0,1fr)_140px_100px_80px] gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 hover:bg-zinc-50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-amber-600" />
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-0.5 text-sm outline-none ring-1 ring-zinc-200"
            />
          ) : (
            <button type="button" onClick={() => onTestClick(test)} className="min-w-0 truncate text-left font-medium text-zinc-900 hover:underline">
              {test.name}
            </button>
          )}
        </div>
        <div className="truncate text-xs text-zinc-600">{createdLabel}</div>
        <div className="truncate text-xs text-zinc-600">{statusLabel(status)}</div>
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs tabular-nums text-zinc-600">{test.questionCount}</span>
          <ExplorerKebabMenu items={testKebabItems(test, status, setIsRenaming)} />
        </div>
      </div>
    );
  };

  const ExplorerTestIconGrid: React.FC<{ test: Test }> = ({ test }) => {
    const status = computeTestStatus(test);
    const [isRenaming, setIsRenaming] = useState(false);
    const [tempName, setTempName] = useState(test.name);
    const handleRenameSubmit = () => {
      if (tempName.trim() !== test.name && tempName.trim() !== '') onRenameTest(test.id, tempName.trim());
      else setTempName(test.name);
      setIsRenaming(false);
    };
    return (
      <div
        draggable
        onDragStart={(e) => setTestDragPayload(e, test.id)}
        className="group relative flex flex-col items-center p-2.5 text-center transition-colors hover:bg-zinc-50/80"
      >
        <div className="absolute right-1 top-1 z-10 rounded-md bg-white/90 opacity-100 shadow-sm backdrop-blur-sm transition-opacity">
          <ExplorerKebabMenu items={testKebabItems(test, status, setIsRenaming)} />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isRenaming) onTestClick(test);
          }}
          className="flex w-full flex-col items-center gap-1.5 outline-none"
        >
          <ExplorerTestDocIcon />
          {isRenaming ? (
            <input
              autoFocus
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
              className="mt-1 w-full max-w-[140px] rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-center text-[12px]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="line-clamp-2 max-w-[128px] text-[12px] font-medium leading-tight text-zinc-900">{test.name}</span>
          )}
          <span className="text-[10px] text-zinc-500">
            {test.questionCount} qs · {statusLabel(status)}
          </span>
          <span className="line-clamp-2 max-w-[128px] text-[9px] leading-tight text-zinc-400">
            {formatTestCreatedLabel(test.generatedAt)}
          </span>
        </button>
      </div>
    );
  };

  const kanbanCardMenuItems = (test: Test): MenuItem[] => {
    const status = computeTestStatus(test);
    const items: MenuItem[] = [
      { label: 'Edit details', icon: Pencil, onClick: () => setEditingTest(test) },
      { label: 'Duplicate', icon: Copy, onClick: () => onDuplicateTest(test) },
    ];
    if (status !== 'draft') {
      items.push(
        { label: 'Schedule', icon: Calendar, onClick: () => setSchedulingTest(test) },
        { label: 'Assign classes', icon: Users2, onClick: () => setAssigningTest(test) },
      );
    }
    if (onSetEvaluationPending && status !== 'draft') {
      items.push(
        test.evaluationPending
          ? {
              label: 'Clear pending evaluation',
              icon: ClipboardCheck,
              onClick: () => void onSetEvaluationPending(test.id, false),
            }
          : {
              label: 'Pending evaluation',
              icon: ClipboardList,
              onClick: () => void onSetEvaluationPending(test.id, true),
            },
      );
    }
    items.push({
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onClick: () => setDeletingItem({ type: 'test', id: test.id, name: test.name }),
    });
    return items;
  };

  const KanbanMiniCard: React.FC<{ test: Test }> = ({ test }) => {
    const status = computeTestStatus(test);
    return (
      <div
        draggable
        onDragStart={(e) => {
          setTestDragPayload(e, test.id);
          (e.currentTarget as HTMLDivElement).setAttribute('data-dragging', '1');
        }}
        className="group cursor-grab rounded-lg border border-zinc-200/90 bg-white px-2 py-2 shadow-sm ring-zinc-300/0 transition-[box-shadow,border-color,ring,opacity] [touch-action:none] active:cursor-grabbing hover:border-zinc-300 hover:shadow-md data-[dragging=1]:opacity-90"
        onDragEnd={(e) => (e.currentTarget as HTMLDivElement).removeAttribute('data-dragging')}
      >
        <div className="flex items-start gap-1.5">
          <GripVertical
            className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-zinc-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <button
                type="button"
                onClick={() => onTestClick(test)}
                className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-neutral-900 hover:underline"
              >
                {test.name}
              </button>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <ExplorerKebabMenu items={kanbanCardMenuItems(test)} />
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {test.questionCount} q · {statusLabel(status)}
            </p>
            <p className="mt-0.5 text-[10px] text-neutral-400">{formatTestCreatedLabel(test.generatedAt)}</p>
          </div>
        </div>
      </div>
    );
  };

  const ExplorerFolderRow: React.FC<{ folder: Folder }> = ({ folder }) => (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setCurrentFolderId(folder.id)}
      onClick={() => setCurrentFolderId(folder.id)}
      {...folderDragProps(folder.id)}
      className={`group/folder grid grid-cols-[minmax(0,1fr)_140px_100px_80px] gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 cursor-pointer select-none ${
        dragOverFolderId === folder.id ? 'bg-sky-50' : 'hover:bg-zinc-50'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Folder className="h-4 w-4 shrink-0 text-sky-600" />
        <span className="truncate font-medium text-zinc-900">{folder.name}</span>
      </div>
      <div className="text-xs text-zinc-500">—</div>
      <div className="text-xs text-zinc-600">Folder</div>
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <ExplorerKebabMenu
          items={[
            { label: 'Open', icon: FolderOpen, onClick: () => setCurrentFolderId(folder.id) },
            {
              label: 'Delete',
              icon: Trash2,
              danger: true,
              onClick: () => setDeletingItem({ type: 'folder', id: folder.id, name: folder.name }),
            },
          ]}
        />
      </div>
    </div>
  );

  const schoolPills = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => handleSchoolTabClick('all')}
        className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
          selectedInstituteId === 'all'
            ? 'bg-neutral-900 text-white'
            : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-200'
        }`}
      >
        All
      </button>
      {institutesList.map((school) => (
        <button
          key={school.id}
          type="button"
          onClick={() => handleSchoolTabClick(school.id)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors max-w-[160px] truncate ${
            selectedInstituteId === school.id
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          {school.name}
        </button>
      ))}
    </div>
  );

  const classChips =
    selectedInstituteId !== 'all' && displayedClasses.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedClassId(null)}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            selectedClassId === null ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-600 border border-neutral-200 shadow-sm'
          }`}
        >
          All classes
        </button>
        {displayedClasses.map((cls) => (
          <button
            key={cls.id}
            type="button"
            onClick={() => setSelectedClassId(cls.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium max-w-[140px] truncate ${
              selectedClassId === cls.id ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-600 border border-neutral-200 shadow-sm'
            }`}
          >
            {cls.name}
          </button>
        ))}
      </div>
    ) : null;

  const viewToggle =
    headerViewToggleStyle === 'flat' ? (
      <div className="flex flex-wrap items-center gap-0.5">
        {(
          [
            ['icons', LayoutGrid, 'Icons'],
            ['list', LayoutList, 'Details'],
            ['kanban', Columns3, 'Board'],
            ['calendar', CalendarDays, 'Calendar'],
          ] as const
        ).map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === mode ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
            title={label}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="inline-flex flex-wrap rounded-md border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm">
        {(
          [
            ['icons', LayoutGrid, 'Icons'],
            ['list', LayoutList, 'Details'],
            ['kanban', Columns3, 'Board'],
            ['calendar', CalendarDays, 'Calendar'],
          ] as const
        ).map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === mode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title={label}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    );

  const isEmpty = visibleFolders.length === 0 && testsToDisplay.length === 0;

  return (
    <div className={workspacePageClass}>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
            <p className="text-[13px] text-zinc-500">{subtitle ?? (username ? `${username.split('@')[0]}` : 'Class tests')}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStartNewTest(currentFolderId, { hubClassId: selectedClassId })}
                className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white shadow hover:bg-zinc-800"
              >
                {primaryActionLabel}
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
              >
                New folder
              </button>
            </div>
            <div className="mx-auto">
              {viewToggle}
            </div>
            <div className="hidden md:block" />
          </div>
        </div>
      </header>

      {currentFolderId && (
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
          <button
            type="button"
            onClick={() => setCurrentFolderId(currentFolderMeta?.parent_id ?? null)}
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            {currentFolderMeta?.parent_id ? 'Back' : 'All tests'}
          </button>
        </div>
      )}

      <div className="kiwi-test-explorer-shell flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="kiwi-test-explorer-sidebar w-full shrink-0 border-b border-zinc-200 bg-white px-4 py-3 md:w-72 md:border-b-0 md:border-r">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Institutes</p>
              {schoolPills}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Classes</p>
              {classChips ? (
                classChips
              ) : selectedInstituteId === 'all' ? (
                <p className="text-[12px] text-zinc-500">Select an institute to see classes.</p>
              ) : (
                <p className="text-[12px] text-zinc-500">No classes found for this institute.</p>
              )}
            </div>
          </div>
        </aside>

        <div
          className={`flex min-h-0 flex-1 flex-col ${viewMode === 'icons' || viewMode === 'list' ? 'overflow-y-auto' : 'overflow-hidden'}`}
        >
        {viewMode === 'icons' && (
          <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
            {selectedInstituteId === 'all' && !selectedClassId && currentFolderId && onMoveTestToFolder && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverParent(true);
                }}
                onDragLeave={parentDropZoneDragLeave}
                onDrop={(e) => handleDropTestOnFolder(e, parentFolderIdForDrop)}
                className={`rounded-md border border-dashed px-3 py-2 text-[13px] ${
                  dragOverParent ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-zinc-300 bg-white text-zinc-500'
                }`}
              >
                Drop tests here to move up one level
              </div>
            )}

            {visibleFolders.length === 0 && testsToDisplay.length === 0 ? (
              isEmpty ? (
                <div className="py-12 text-center text-sm text-zinc-500">No tests yet — create one or pick a filter above.</div>
              ) : (
                <div className="py-10 text-center text-sm text-zinc-500">No items in this view</div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {selectedInstituteId === 'all' &&
                  !selectedClassId &&
                  visibleFolders.map((f) => (
                    <div
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setCurrentFolderId(f.id)}
                      onClick={() => setCurrentFolderId(f.id)}
                      {...folderDragProps(f.id)}
                      className={`group relative flex flex-col items-center p-2.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                        dragOverFolderId === f.id ? 'bg-sky-50/80' : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      <div className="absolute right-0 top-0 z-10 rounded-md bg-white/90 opacity-100 shadow-sm backdrop-blur-sm transition-opacity">
                        <ExplorerKebabMenu
                          items={[
                            { label: 'Open', icon: FolderOpen, onClick: () => setCurrentFolderId(f.id) },
                            {
                              label: 'Delete',
                              icon: Trash2,
                              danger: true,
                              onClick: () => setDeletingItem({ type: 'folder', id: f.id, name: f.name }),
                            },
                          ]}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <ExplorerFolderIcon dragOver={dragOverFolderId === f.id} />
                        <p className="line-clamp-2 w-full max-w-[128px] text-[13px] font-medium text-zinc-900">{f.name}</p>
                        <p className="text-[10px] text-zinc-500">Folder</p>
                      </div>
                    </div>
                  ))}
                {testsToDisplay.map((t) => (
                  <ExplorerTestIconGrid key={t.id} test={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="mx-auto w-full max-w-6xl p-4">
            {selectedInstituteId === 'all' && !selectedClassId && currentFolderId && onMoveTestToFolder && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverParent(true);
                }}
                onDragLeave={parentDropZoneDragLeave}
                onDrop={(e) => handleDropTestOnFolder(e, parentFolderIdForDrop)}
                className={`mb-3 rounded-md border border-dashed px-3 py-2 text-[13px] ${
                  dragOverParent ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-zinc-300 bg-white text-zinc-500'
                }`}
              >
                Drop tests here to move up one level
              </div>
            )}

            {visibleFolders.length === 0 && testsToDisplay.length === 0 ? (
              isEmpty ? (
                <div className="py-12 text-center text-sm text-zinc-500">No tests yet — create one or pick a filter above.</div>
              ) : (
                <div className="py-10 text-center text-sm text-zinc-500">No items in this view</div>
              )
            ) : (
              <>
                <div className={explorerHeaderRowClass}>
                  <span>Name</span>
                  <span>Created</span>
                  <span>Status</span>
                  <span className="text-right"> </span>
                </div>
                {selectedInstituteId === 'all' && !selectedClassId && visibleFolders.map((f) => (
                  <ExplorerFolderRow key={`folder-${f.id}`} folder={f} />
                ))}
                {testsToDisplay.map((t) => (
                  <ExplorerFileRow key={t.id} test={t} />
                ))}
              </>
            )}
          </div>
        )}

        {viewMode === 'kanban' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
            <KanbanBoard
              tests={testsToDisplay}
              getTestStatus={computeTestStatus}
              Card={KanbanMiniCard}
              onDropToStatus={(testId, targetStatus) => {
                applyKanbanDrop(testId, targetStatus);
              }}
            />
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-4">
            <div className="mx-auto h-full min-h-[420px] w-full max-w-5xl">
              <TestsCalendarDemo
                tests={testsToDisplay}
                onTestClick={onTestClick}
                onAddAtDate={(dateISO) =>
                  onStartNewTest(currentFolderId, { initialScheduleDate: dateISO, hubClassId: selectedClassId })
                }
                onDropToDate={(testId, dateISO) => {
                  setOptimisticOverrides((o) => ({ ...o, [testId]: new Date(dateISO).toISOString() }));
                  onScheduleTest(testId, dateISO);
                }}
              />
            </div>
          </div>
        )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl border border-neutral-100">
            <h2 className="text-[17px] font-semibold text-neutral-900">New group</h2>
            <p className="text-[13px] text-neutral-500 mt-1">Organize tests into a named group</p>
            <form onSubmit={handleCreateFolder} className="mt-5 space-y-4">
              <input
                autoFocus
                required
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Name"
              />
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-full px-5 py-2 text-[15px] font-semibold text-white bg-neutral-900">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <h3 className="text-[17px] font-semibold text-neutral-900">Delete {deletingItem.type === 'folder' ? 'group' : 'test'}?</h3>
            <p className="text-[14px] text-neutral-500 mt-2">
              “{deletingItem.name}” will be removed. This can’t be undone.
            </p>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="rounded-full px-4 py-2 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteItem(deletingItem.type, deletingItem.id, deletingItem.name);
                  setDeletingItem(null);
                }}
                className="rounded-full px-5 py-2 text-[15px] font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {schedulingTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <h3 className="text-[17px] font-semibold text-neutral-900">Schedule</h3>
            <input
              type="date"
              value={tempScheduleDate}
              onChange={(e) => setTempScheduleDate(e.target.value)}
              className="mt-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[15px]"
            />
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setSchedulingTest(null)}
                className="rounded-full px-4 py-2 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOptimisticOverrides((o) => ({ ...o, [schedulingTest.id]: new Date(tempScheduleDate).toISOString() }));
                  onScheduleTest(schedulingTest.id, tempScheduleDate);
                  setSchedulingTest(null);
                }}
                className="rounded-full px-5 py-2 text-[15px] font-semibold text-white bg-neutral-900"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <h3 className="text-[17px] font-semibold text-neutral-900">Edit test details</h3>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[12px] font-medium text-zinc-600">Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[15px]"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-zinc-600">Schedule date</span>
                <input
                  type="date"
                  value={editScheduleDate}
                  onChange={(e) => setEditScheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[15px]"
                />
              </label>
              {onSetEvaluationPending && (
                <label className="mt-1 inline-flex items-center gap-2 text-[13px] text-zinc-700">
                  <input
                    type="checkbox"
                    checked={editPendingEvaluation}
                    onChange={(e) => setEditPendingEvaluation(e.target.checked)}
                  />
                  Pending evaluation
                </label>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setEditingTest(null)}
                className="rounded-full px-4 py-2 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEditModal()}
                className="rounded-full px-5 py-2 text-[15px] font-semibold text-white bg-neutral-900"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningTest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl flex flex-col max-h-[85vh]">
            <h3 className="text-[17px] font-semibold text-neutral-900">Assign classes</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mt-4 pr-1">
              {institutesList.map((school) => {
                const schoolClasses = classesList.filter((c) => c.institute_id === school.id);
                if (schoolClasses.length === 0) return null;
                return (
                  <div key={school.id}>
                    <p className="text-[12px] font-medium text-neutral-400 uppercase tracking-wide mb-2">{school.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {schoolClasses.map((cls) => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() =>
                            setSelectedAssignmentIds((prev) =>
                              prev.includes(cls.id) ? prev.filter((id) => id !== cls.id) : [...prev, cls.id]
                            )
                          }
                          className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                            selectedAssignmentIds.includes(cls.id)
                              ? 'bg-neutral-900 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          {cls.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {institutesList.length === 0 && <p className="text-[14px] text-neutral-500 text-center">Add institutes in Settings first.</p>}
            </div>
            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setAssigningTest(null)}
                className="rounded-full px-4 py-2 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAssignment}
                disabled={isAssigningSaving}
                className="rounded-full px-5 py-2 text-[15px] font-semibold text-white bg-neutral-900 disabled:opacity-50"
              >
                {isAssigningSaving ? 'Saving…' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KANBAN_COLUMN_KEYS: TestStatus[] = ['draft', 'generated', 'scheduled', 'pending_evaluation', 'completed'];

const KANBAN_HEADER_BG: Record<TestStatus, string> = {
  draft: 'bg-stone-100/85 border-b border-stone-200/70',
  generated: 'bg-emerald-50/70 border-b border-emerald-200/45',
  scheduled: 'bg-sky-50/65 border-b border-sky-200/40',
  pending_evaluation: 'bg-amber-50/55 border-b border-amber-200/35',
  completed: 'bg-violet-50/50 border-b border-violet-200/35',
};

const KANBAN_HEADER_TEXT: Record<TestStatus, string> = {
  draft: 'text-stone-600',
  generated: 'text-emerald-900/75',
  scheduled: 'text-sky-900/75',
  pending_evaluation: 'text-amber-900/72',
  completed: 'text-violet-900/68',
};

const KANBAN_HEADER_BADGE: Record<TestStatus, string> = {
  draft: 'bg-stone-200/50 text-stone-600',
  generated: 'bg-emerald-100/80 text-emerald-800/85',
  scheduled: 'bg-sky-100/70 text-sky-800/85',
  pending_evaluation: 'bg-amber-100/65 text-amber-900/75',
  completed: 'bg-violet-100/55 text-violet-900/75',
};

const KanbanBoard: React.FC<{
  tests: Test[];
  getTestStatus: (t: Test) => TestStatus;
  Card: React.FC<{ test: Test }>;
  onDropToStatus: (testId: string, status: TestStatus) => void;
}> = ({ tests, getTestStatus, Card, onDropToStatus }) => {
  const [dragOverKey, setDragOverKey] = useState<TestStatus | null>(null);

  const columns = useMemo(() => {
    const cols: Record<TestStatus, Test[]> = {
      draft: [],
      generated: [],
      scheduled: [],
      pending_evaluation: [],
      completed: [],
    };
    tests.forEach((t) => {
      const status = getTestStatus(t);
      cols[status].push(t);
    });
    return cols;
  }, [tests, getTestStatus]);

  const titles: Record<TestStatus, string> = {
    draft: 'Draft',
    generated: 'Ready',
    scheduled: 'Scheduled',
    pending_evaluation: 'Pending evaluation',
    completed: 'Completed',
  };

  return (
    <div
      className="flex h-full min-h-0 w-full gap-0 overflow-x-auto overflow-y-hidden rounded-lg border border-zinc-200/90 bg-zinc-50/80 shadow-sm"
      onDragEnd={() => setDragOverKey(null)}
    >
      {KANBAN_COLUMN_KEYS.map((key) => {
        const items = columns[key];
        const isDropTarget = dragOverKey === key;
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              setDragOverKey(key);
            }}
            onDragLeave={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && (e.currentTarget as HTMLElement).contains(next)) return;
              setDragOverKey((k) => (k === key ? null : k));
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverKey(null);
              const payload = parseTestDragPayload(e);
              if (!payload) return;
              onDropToStatus(payload.id, key);
            }}
            className={`flex min-h-0 min-w-[168px] flex-1 flex-col border-r border-zinc-200/80 bg-white/90 last:border-r-0 transition-[box-shadow,background-color] ${
              isDropTarget ? 'bg-zinc-50 ring-2 ring-inset ring-zinc-300/50' : ''
            }`}
          >
            <div className={`flex shrink-0 items-center justify-between px-3 py-2.5 ${KANBAN_HEADER_BG[key]}`}>
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${KANBAN_HEADER_TEXT[key]}`}>
                {titles[key]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${KANBAN_HEADER_BADGE[key]}`}
              >
                {items.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 custom-scrollbar">
              {items.map((t) => (
                <Card key={t.id} test={t} />
              ))}
              {items.length === 0 && (
                <p className="py-10 text-center text-[11px] text-zinc-400">Drop tests here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TestDashboard;
