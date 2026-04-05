import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';
import { workspacePageClass, WorkspacePageHeader, WorkspacePanel } from '../components/WorkspaceChrome';
import { usePlatformBranding } from '../../branding/PlatformBrandingContext';
import { isOnlineExamAssignment } from '../../Quiz/services/studentTestService';

interface Institute {
  id: string;
  name: string;
  color?: string;
}

interface OrgClass {
  id: string;
  name: string;
  institute_id: string;
}

interface TeacherOverviewProps {
  email?: string | null;
  institutes: Institute[];
  classes: OrgClass[];
  allTests: any[];
  onNavigate: (view: string) => void;
}

const TeacherOverview: React.FC<TeacherOverviewProps> = ({
  email,
  institutes,
  classes,
  allTests,
  onNavigate,
}) => {
  const pb = usePlatformBranding();
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          if (!cancelled) setStudentCount(0);
          return;
        }
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
        const role = String(prof?.role || '').toLowerCase();
        const rosterViaRls = ['teacher', 'school_admin', 'developer'].includes(role);
        let q = supabase.from('students').select('*', { count: 'exact', head: true });
        if (!rosterViaRls) q = q.eq('user_id', uid);
        const { count, error } = await q;
        if (error) throw error;
        if (!cancelled) setStudentCount(count ?? 0);
      } catch {
        if (!cancelled) setStudentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const paper = allTests.filter(
      (t: any) => t.config?.mode !== 'online' && t.config?.mode !== 'online-exam' && !isOnlineExamAssignment(t)
    );
    const online = allTests.filter((t: any) => isOnlineExamAssignment(t) || t.config?.mode === 'online-exam');
    const scheduled = allTests.filter((t: any) => t.status === 'scheduled');
    const draft = allTests.filter((t: any) => t.status === 'draft');
    return {
      total: allTests.length,
      paper: paper.length,
      online: online.length,
      scheduled: scheduled.length,
      draft: draft.length,
    };
  }, [allTests]);

  const classesByInstitute = useMemo(() => {
    const map = new Map<string, OrgClass[]>();
    for (const c of classes) {
      const list = map.get(c.institute_id) || [];
      list.push(c);
      map.set(c.institute_id, list);
    }
    return map;
  }, [classes]);

  const navCards = [
    { view: 'test', label: 'Class tests', desc: 'PDF & OMR', icon: 'mdi:file-document-outline' },
    { view: 'online-exam', label: 'Online exams', desc: 'Schedule & assign', icon: 'mdi:monitor-shimmer' },
    { view: 'students', label: 'Students', desc: 'Roster & classes', icon: 'mdi:account-group-outline' },
    { view: 'reports', label: 'Reports', desc: 'Performance', icon: 'mdi:chart-bar' },
  ] as const;

  return (
    <div className={workspacePageClass}>
      <WorkspacePageHeader
        title="Overview"
        subtitle={
          email ? (
            <span>
              Signed in as <span className="font-medium text-zinc-700">{email}</span>
            </span>
          ) : (
            'Your workspace at a glance'
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Activity</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { k: 'Tests', v: stats.total, sub: 'all types', icon: 'mdi:clipboard-text-outline' },
                { k: 'Class tests', v: stats.paper, sub: 'paper / OMR', icon: 'mdi:printer-outline' },
                { k: 'Online', v: stats.online, sub: 'assignments', icon: 'mdi:cloud-outline' },
                { k: 'Scheduled', v: stats.scheduled, sub: 'on calendar', icon: 'mdi:calendar-clock' },
                { k: 'Drafts', v: stats.draft, sub: 'in progress', icon: 'mdi:file-edit-outline' },
                {
                  k: 'Students',
                  v: studentCount === null ? '—' : studentCount,
                  sub: 'in roster',
                  icon: 'mdi:school-outline',
                },
              ].map((card) => (
                <div
                  key={card.k}
                  className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-2 flex items-center gap-2 text-zinc-400">
                    <iconify-icon icon={card.icon} width="18" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{card.k}</span>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{card.v}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{card.sub}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <WorkspacePanel title="Organizations">
              {institutes.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">
                  No schools yet. Add them from <strong>Students</strong> or workspace settings when available.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {institutes.map((inst) => {
                    const cls = classesByInstitute.get(inst.id) || [];
                    return (
                      <li key={inst.id} className="flex items-start gap-3 px-4 py-3">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                          style={{
                            backgroundColor:
                              inst.color === 'indigo'
                                ? '#6366f1'
                                : inst.color === 'rose'
                                  ? '#f43f5e'
                                  : inst.color === 'emerald'
                                    ? '#10b981'
                                    : inst.color === 'amber'
                                      ? '#f59e0b'
                                      : inst.color === 'violet'
                                        ? '#8b5cf6'
                                        : pb.primary_color,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-900">{inst.name}</p>
                          <p className="text-[12px] text-zinc-500">
                            {cls.length} class{cls.length === 1 ? '' : 'es'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </WorkspacePanel>

            <WorkspacePanel title="Classes">
              {classes.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">No classes linked to your account yet.</p>
              ) : (
                <ul className="max-h-[min(50vh,320px)] divide-y divide-zinc-100 overflow-y-auto custom-scrollbar">
                  {classes.map((c) => {
                    const inst = institutes.find((i) => i.id === c.institute_id);
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <span className="truncate font-medium text-zinc-800">{c.name}</span>
                        {inst && (
                          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                            {inst.name}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </WorkspacePanel>
          </section>

          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Go to</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {navCards.map((card) => (
                <button
                  key={card.view}
                  type="button"
                  onClick={() => onNavigate(card.view)}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105"
                    style={{ backgroundColor: pb.primary_color }}
                  >
                    <iconify-icon icon={card.icon} width="22" />
                  </span>
                  <span className="font-semibold text-zinc-900">{card.label}</span>
                  <span className="text-[12px] text-zinc-500">{card.desc}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TeacherOverview;
