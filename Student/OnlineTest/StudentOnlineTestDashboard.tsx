import '../../types';
import React, { useMemo } from 'react';

interface StudentOnlineTestDashboardProps {
  availableTests: any[];
  onTakeExam: (test: any) => void;
  onViewSolutions?: (test: any) => void;
}

const StudentOnlineTestDashboard: React.FC<StudentOnlineTestDashboardProps> = ({ availableTests, onTakeExam, onViewSolutions }) => {
  
  const { upcoming, live, past } = useMemo(() => {
      const now = new Date();
      const u: any[] = [];
      const l: any[] = [];
      const p: any[] = [];

      availableTests.forEach(test => {
          if (!test.scheduledAt) {
              // If no date, treat as available now for demo/drafts
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
      
      // Sort logic
      u.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      l.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      p.sort((a,b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

      return { upcoming: u, live: l, past: p };
  }, [availableTests]);

  const ExamCard: React.FC<{ test: any; status: 'upcoming' | 'live' | 'past' }> = ({ test, status }) => {
      const dateStr = test.scheduledAt ? new Date(test.scheduledAt).toLocaleDateString() : 'Flexible';
      const timeStr = test.scheduledAt ? new Date(test.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Anytime';
      const duration = test.config?.duration || 60;
      const solutionsReleased = test.config?.releaseAnswers;

      return (
          <div className={`bg-white rounded-2xl p-5 border transition-all flex flex-col gap-4 relative overflow-hidden ${
              status === 'live' ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 
              status === 'upcoming' ? 'border-indigo-100 shadow-sm hover:border-indigo-300' : 'border-slate-100 opacity-80 hover:opacity-100 grayscale-[0.2]'
          }`}>
              {status === 'live' && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest animate-pulse">
                      Live Now
                  </div>
              )}
              
              <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md shrink-0 ${
                      status === 'live' ? 'bg-emerald-500' : status === 'upcoming' ? 'bg-indigo-500' : 'bg-slate-400'
                  }`}>
                      <iconify-icon icon="mdi:file-certificate-outline" width="24" />
                  </div>
                  <div>
                      <h3 className="font-black text-slate-800 text-sm leading-tight mb-1 line-clamp-2">{test.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{test.questionCount} Questions • {duration} Mins</p>
                  </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5">
                      <iconify-icon icon="mdi:calendar" /> {dateStr}
                  </div>
                  <div className="w-px h-3 bg-slate-300"></div>
                  <div className="flex items-center gap-1.5">
                      <iconify-icon icon="mdi:clock-outline" /> {timeStr}
                  </div>
              </div>

              {status === 'past' ? (
                  <button 
                    onClick={() => onViewSolutions && onViewSolutions(test)}
                    className={`w-full py-3 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-2 border ${solutionsReleased ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                      <iconify-icon icon={solutionsReleased ? "mdi:book-open-variant" : "mdi:file-document-outline"} width="16"/>
                      {solutionsReleased ? "View Solutions" : "View Paper"}
                  </button>
              ) : (
                  <button 
                    onClick={() => status === 'live' ? onTakeExam(test) : alert(status === 'upcoming' ? "This exam has not started yet." : "This exam has ended.")}
                    className={`w-full py-3 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-2 ${
                        status === 'live' 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 active:scale-95' 
                        : status === 'upcoming' 
                            ? 'bg-indigo-50 text-indigo-400 border border-indigo-100 cursor-not-allowed' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                      {status === 'live' ? <><iconify-icon icon="mdi:play-circle-outline" width="16"/> Start Exam</> : 
                       status === 'upcoming' ? 'Wait to Start' : 'Exam Ended'}
                  </button>
              )}
          </div>
      );
  };

  return (
    <div className="w-full h-full p-6 md:p-10 overflow-y-auto custom-scrollbar bg-slate-50 font-sans">
        <header className="mb-10">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">My Exams</h1>
            <p className="text-sm font-medium text-slate-400">View your scheduled assessments and track progress.</p>
        </header>

        <div className="space-y-12 pb-20">
            {/* Live Section */}
            {live.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                        <h2 className="text-sm font-black text-emerald-600 uppercase tracking-widest">Happening Now</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {live.map(t => <ExamCard key={t.id} test={t} status="live" />)}
                    </div>
                </section>
            )}

            {/* Upcoming Section */}
            <section>
                <div className="flex items-center gap-3 mb-5">
                    <iconify-icon icon="mdi:calendar-clock" className="text-indigo-400" />
                    <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">Upcoming</h2>
                </div>
                {upcoming.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {upcoming.map(t => <ExamCard key={t.id} test={t} status="upcoming" />)}
                    </div>
                ) : (
                    <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase">No upcoming exams scheduled.</p>
                    </div>
                )}
            </section>

            {/* Past Section */}
            {past.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-5">
                        <iconify-icon icon="mdi:history" className="text-slate-400" />
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">History</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {past.map(t => <ExamCard key={t.id} test={t} status="past" />)}
                    </div>
                </section>
            )}
        </div>
    </div>
  );
};

export default StudentOnlineTestDashboard;