import '../../types';
import React, { useMemo } from 'react';
import { isOnlineExamAssignment } from '../../Quiz/services/studentTestService';
import { workspacePageClass } from '../../Teacher/components/WorkspaceChrome';

interface StudentOnlineTestDashboardProps {
  availableTests: any[];
  hasAssignedClass: boolean;
  onTakeExam: (test: any) => void;
  onViewSolutions?: (test: any) => void;
}

const StudentOnlineTestDashboard: React.FC<StudentOnlineTestDashboardProps> = ({
  availableTests,
  hasAssignedClass,
  onTakeExam,
  onViewSolutions,
}) => {
  const onlineOnly = useMemo(
    () => availableTests.filter((t) => isOnlineExamAssignment(t)),
    [availableTests]
  );

  const { upcoming, live, past } = useMemo(() => {
      const now = new Date();
      const u: any[] = [];
      const l: any[] = [];
      const p: any[] = [];

      onlineOnly.forEach(test => {
          if (!test.scheduledAt) {
              l.push(test);
              return;
          }
          const start = new Date(test.scheduledAt);
          const durationMs = (test.config?.duration || 60) * 60 * 1000;
          const end = new Date(start.getTime() + durationMs);

          if (now < start) {
              u.push(test);
          } else if (now >= start && now <= end) {
              l.push(test);
          } else {
              p.push(test);
          }
      });
      
      u.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      l.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      p.sort((a,b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

      return { upcoming: u, live: l, past: p };
  }, [onlineOnly]);

  const ExamCard: React.FC<{ test: any; status: 'upcoming' | 'live' | 'past' }> = ({ test, status }) => {
      const dateStr = test.scheduledAt ? new Date(test.scheduledAt).toLocaleDateString() : 'Flexible';
      const timeStr = test.scheduledAt ? new Date(test.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Anytime';
      const duration = test.config?.duration || 60;
      const solutionsReleased = test.config?.releaseAnswers;

      const ring =
        status === 'live'
          ? 'border-emerald-300 bg-emerald-50/40'
          : status === 'upcoming'
            ? 'border-zinc-200 bg-white'
            : 'border-zinc-200 bg-zinc-50/80';

      return (
          <div className={`relative flex flex-col gap-3 rounded-md border p-4 ${ring}`}>
              {status === 'live' && (
                  <div className="absolute right-0 top-0 rounded-bl-md bg-emerald-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white">
                      Live
                  </div>
              )}
              
              <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white ${
                      status === 'live' ? 'bg-emerald-600' : status === 'upcoming' ? 'bg-zinc-900' : 'bg-zinc-500'
                  }`}>
                      <iconify-icon icon="mdi:file-certificate-outline" width="20" />
                  </div>
                  <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-900">{test.name}</h3>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{test.questionCount} questions · {duration} min</p>
                  </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-[11px] text-zinc-600">
                  <span className="inline-flex items-center gap-1">
                      <iconify-icon icon="mdi:calendar" /> {dateStr}
                  </span>
                  <span className="text-zinc-300">·</span>
                  <span className="inline-flex items-center gap-1">
                      <iconify-icon icon="mdi:clock-outline" /> {timeStr}
                  </span>
              </div>

              {status === 'past' ? (
                  <button 
                    type="button"
                    onClick={() => onViewSolutions && onViewSolutions(test)}
                    className={`w-full rounded-md border py-2.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                      solutionsReleased
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                      <span className="inline-flex items-center justify-center gap-2">
                        <iconify-icon icon={solutionsReleased ? "mdi:book-open-variant" : "mdi:file-document-outline"} width="16"/>
                        {solutionsReleased ? 'View solutions' : 'View paper'}
                      </span>
                  </button>
              ) : (
                  <button 
                    type="button"
                    onClick={() => status === 'live' ? onTakeExam(test) : alert(status === 'upcoming' ? "This exam has not started yet." : "This exam has ended.")}
                    className={`w-full rounded-md py-2.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                        status === 'live' 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                        : status === 'upcoming' 
                            ? 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400' 
                            : 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400'
                    }`}
                  >
                      {status === 'live' ? <span className="inline-flex items-center justify-center gap-2"><iconify-icon icon="mdi:play-circle-outline" width="16"/> Start exam</span> : 
                       status === 'upcoming' ? 'Not started yet' : 'Ended'}
                  </button>
              )}
          </div>
      );
  };

  return (
    <div className={`${workspacePageClass} w-full overflow-y-auto p-6 md:p-10 custom-scrollbar`}>
        <header className="mb-8 border-b border-zinc-200 pb-6">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Online exams</h1>
            <p className="mt-1 text-[13px] text-zinc-500">Exams assigned to your class. Results save when you submit.</p>
        </header>

        {!hasAssignedClass && (
          <section className="mb-8 rounded-md border border-amber-200 bg-amber-50/80 p-4">
            <h2 className="text-sm font-semibold text-amber-950">Waiting for class assignment</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-900/90 max-w-2xl">
              Your teacher assigns you to a class in <strong>Students</strong>. Use the same email your teacher registered. Then scheduled exams for that class appear here.
            </p>
          </section>
        )}

        {hasAssignedClass && onlineOnly.length === 0 && (
          <div className="mb-8 rounded-md border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-xs font-medium text-zinc-500">No online exams assigned yet.</p>
          </div>
        )}

        <div className="space-y-10 pb-16">
            {live.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2 border-b border-zinc-200 pb-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Happening now</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {live.map(t => <ExamCard key={t.id} test={t} status="live" />)}
                    </div>
                </section>
            )}

            <section>
                <div className="mb-4 flex items-center gap-2 border-b border-zinc-200 pb-2">
                    <iconify-icon icon="mdi:calendar-clock" className="text-zinc-500" />
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Upcoming</h2>
                </div>
                {upcoming.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {upcoming.map(t => <ExamCard key={t.id} test={t} status="upcoming" />)}
                    </div>
                ) : (
                    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 py-8 text-center">
                        <p className="text-xs font-medium text-zinc-500">No upcoming exams.</p>
                    </div>
                )}
            </section>

            {past.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2 border-b border-zinc-200 pb-2">
                        <iconify-icon icon="mdi:history" className="text-zinc-400" />
                        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">History</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {past.map(t => <ExamCard key={t.id} test={t} status="past" />)}
                    </div>
                </section>
            )}
        </div>
    </div>
  );
};

export default StudentOnlineTestDashboard;
