import '../types';
import React, { useState, useMemo, useEffect } from 'react';
import { Student, SchoolClass } from './StudentDirectory';
import { supabase } from '../supabase/client';
import { jsPDF } from 'jspdf';

interface TestResult {
    id: string;
    student_id: string;
    test_name: string;
    subject: string;
    score: number;
    max_score: number;
    accuracy: number;
    date: string;
}

interface StudentProfileProps {
  student: Student;
  schoolsAndClasses: any[];
  onBack: () => void;
  onUpdate: () => void; 
}

interface DemoMetricRow {
  metric: string;
  current: string;
  studentAction: string;
}

interface DemoHistoryRow {
  testName: string;
  subject: string;
  score: string;
  accuracy: string;
  date: string;
  takeaway: string;
}

const StudentProfile: React.FC<StudentProfileProps> = ({ student, schoolsAndClasses, onBack, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'report' | 'demo'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [showReportPreview, setShowReportPreview] = useState(false);

  const [formData, setFormData] = useState({
      name: student.name,
      email: student.email || '',
      mobile_phone: student.mobile_phone || '',
      institute_id: student.institute_id || '',
      class_id: student.class_id || '',
      attending_exams: student.attending_exams?.join(', ') || ''
  });

  useEffect(() => {
      // Load results from local storage
      const localResults = localStorage.getItem('kt_test_results');
      if (localResults) {
          const all = JSON.parse(localResults) as TestResult[];
          setResults(all.filter(r => r.student_id === student.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
  }, [student.id]);

  const schools = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'school'), [schoolsAndClasses]);
  const classes = useMemo(() => schoolsAndClasses.filter(sc => sc.type === 'class'), [schoolsAndClasses]);

  const { schoolName, className } = useMemo(() => {
    if (student.institute_id) {
      const school = schools.find((s) => s.id === student.institute_id);
      const sClass = student.class_id ? classes.find((c) => c.id === student.class_id) : null;
      return {
        schoolName: school?.name || 'Unknown',
        className: sClass?.name || 'N/A',
      };
    }
    if (!student.class_id) return { schoolName: 'Unassigned', className: 'N/A' };
    const sClass = classes.find((c) => c.id === student.class_id);
    if (!sClass) return { schoolName: 'Unknown', className: 'Unknown' };
    const school = schools.find((s) => s.id === sClass.parent_id);
    return { schoolName: school?.name || 'Unassigned', className: sClass.name };
  }, [student, schools, classes]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'institute_id') {
        return { ...prev, institute_id: value, class_id: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        if (!formData.institute_id || !formData.class_id) {
          throw new Error('Institute and class are required for every student.');
        }
        const school = schools.find((s) => s.id === formData.institute_id);
        const business_id = (school as any)?.business_id || null;
        if (!business_id) {
          throw new Error('Selected institute is not assigned to a business.');
        }
        const exams = formData.attending_exams.split(',').map(e => e.trim()).filter(Boolean);
        const { error } = await supabase
          .from('students')
          .update({
            name: formData.name,
            email: formData.email || null,
            mobile_phone: formData.mobile_phone || null,
            business_id,
            institute_id: formData.institute_id || null,
            class_id: formData.class_id || null,
            attending_exams: exams,
          })
          .eq('id', student.id);
        if (error) throw error;
        onUpdate();
        setIsEditing(false);
    } catch (err: any) {
        alert("Update failed: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const avgAccuracy = useMemo(() => {
      if (results.length === 0) return 0;
      return Math.round(results.reduce((acc, r) => acc + r.accuracy, 0) / results.length);
  }, [results]);

  const avgScorePercent = useMemo(() => {
    if (results.length === 0) return 0;
    const totalScored = results.reduce((acc, r) => acc + r.score, 0);
    const totalMax = results.reduce((acc, r) => acc + r.max_score, 0);
    if (totalMax === 0) return 0;
    return Math.round((totalScored / totalMax) * 100);
  }, [results]);

  const strongestSubject = useMemo(() => {
    if (results.length === 0) return 'Biology';
    const bySubject = new Map<string, { total: number; count: number }>();
    for (const row of results) {
      const subject = row.subject || 'General';
      const prev = bySubject.get(subject) ?? { total: 0, count: 0 };
      bySubject.set(subject, { total: prev.total + row.accuracy, count: prev.count + 1 });
    }
    let best = 'General';
    let bestAvg = -1;
    bySubject.forEach((value, subject) => {
      const avg = value.total / value.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = subject;
      }
    });
    return best;
  }, [results]);

  const improvementArea = useMemo(() => {
    if (results.length === 0) return 'Time Management';
    if (avgAccuracy < 50) return 'Concept Revision';
    if (avgAccuracy < 75) return 'Negative Marking Control';
    return 'High-Difficulty Question Practice';
  }, [avgAccuracy, results.length]);

  const demoMetrics: DemoMetricRow[] = useMemo(
    () => [
      {
        metric: 'Average Accuracy',
        current: `${avgAccuracy}%`,
        studentAction:
          avgAccuracy >= 75
            ? 'You are doing well. Take 2 mixed mock tests each week to stay sharp.'
            : 'Do one 30-question timed practice daily and review mistakes right after.',
      },
      {
        metric: 'Score Consistency',
        current: results.length >= 4 ? 'Stable' : 'Developing',
        studentAction: 'Compare your last 3 test scores and revise your weakest chapter every Sunday.',
      },
      {
        metric: 'Strongest Subject',
        current: strongestSubject,
        studentAction: `Start mock tests with ${strongestSubject} questions to build confidence and momentum.`,
      },
      {
        metric: 'Primary Improvement Area',
        current: improvementArea,
        studentAction: `Spend 20-30 minutes daily on ${improvementArea.toLowerCase()} with short revision notes.`,
      },
      {
        metric: 'Completion Rate',
        current: results.length > 0 ? `${Math.min(100, 55 + results.length * 8)}%` : '0%',
        studentAction: 'Finish all section tests first, then move to full-length mock papers.',
      },
    ],
    [avgAccuracy, improvementArea, results.length, strongestSubject],
  );

  const demoHistoryRows: DemoHistoryRow[] = useMemo(() => {
    if (results.length > 0) {
      return results.slice(0, 6).map((r) => ({
        testName: r.test_name,
        subject: r.subject || 'General',
        score: `${r.score}/${r.max_score}`,
        accuracy: `${r.accuracy}%`,
        date: new Date(r.date).toLocaleDateString(),
        takeaway:
          r.accuracy >= 75
            ? 'Great job. Keep this level consistent.'
            : r.accuracy >= 50
              ? 'Good attempt. Revise mistakes before next test.'
              : 'Needs support. Relearn basics and retry similar questions.',
      }));
    }

    return [
      {
        testName: 'Weekly Mock Test 1',
        subject: 'Biology',
        score: '62/90',
        accuracy: '69%',
        date: '05/04/2026',
        takeaway: 'Good progress. Focus on diagram-based questions.',
      },
      {
        testName: 'Chapter Test - Cell',
        subject: 'Biology',
        score: '22/30',
        accuracy: '73%',
        date: '10/04/2026',
        takeaway: 'Strong understanding. Practice higher-difficulty MCQs.',
      },
      {
        testName: 'Unit Test - Chemistry',
        subject: 'Chemistry',
        score: '18/35',
        accuracy: '51%',
        date: '18/04/2026',
        takeaway: 'Improve formula recall and reaction balancing speed.',
      },
      {
        testName: 'Timed Practice - Physics',
        subject: 'Physics',
        score: '14/30',
        accuracy: '47%',
        date: '22/04/2026',
        takeaway: 'Revise core concepts and reduce calculation errors.',
      },
    ];
  }, [results]);

  const generateReportPdf = () => {
    const doc = new jsPDF();
    let y = 16;

    doc.setFontSize(16);
    doc.text('KiwiTeach - Student Report Card (Demo)', 14, y);
    y += 10;

    doc.setFontSize(11);
    doc.text(`Student: ${student.name}`, 14, y);
    y += 6;
    doc.text(`Class: ${className} | Institute: ${schoolName}`, 14, y);
    y += 6;
    doc.text(`Average Accuracy: ${avgAccuracy}%`, 14, y);
    y += 6;
    doc.text(`Average Score: ${avgScorePercent}%`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text('AI Performance Impressions', 14, y);
    y += 7;
    doc.setFontSize(10);
    const insights = [
      `Strength: ${student.name} shows strongest outcomes in ${strongestSubject}.`,
      `Weakness: Current gap appears in ${improvementArea.toLowerCase()}.`,
      'Actionable next steps: 3 timed practice blocks/week + chapter error-log reviews.',
    ];
    insights.forEach((line) => {
      const wrapped = doc.splitTextToSize(`- ${line}`, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 5 + 1;
    });

    y += 3;
    doc.setFontSize(12);
    doc.text('Actionable Metrics', 14, y);
    y += 7;
    doc.setFontSize(10);
    demoMetrics.forEach((row, index) => {
      const entry = `${index + 1}. ${row.metric}: ${row.current} | What you should do: ${row.studentAction}`;
      const wrapped = doc.splitTextToSize(entry, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 5 + 1;
    });

    doc.save(`${student.name.replace(/\s+/g, '_')}_report_card_demo.pdf`);
  };

  return (
    <div className="w-full h-full flex flex-col animate-fade-in overflow-hidden bg-slate-50/50">
      <div className="px-6 pt-6 shrink-0 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-800"><iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon></button>
                <div className="flex items-center gap-4">
                    <img src={student.avatar} alt={student.name} className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 shadow-sm" />
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">{student.name}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{className} • {schoolName}</p>
                    </div>
                </div>
            </div>
            {!isEditing && activeTab === 'profile' ? (
                <button onClick={() => setIsEditing(true)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all"><iconify-icon icon="mdi:pencil"></iconify-icon> Edit Profile</button>
            ) : isEditing ? (
                <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="bg-white border border-slate-200 text-slate-500 px-4 py-2 rounded-lg font-medium text-xs transition-all">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="bg-accent text-white px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95">
                        {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:check"></iconify-icon>}
                        Save Changes
                    </button>
                </div>
            ) : null}
        </div>

        <div className="flex gap-8">
            <button 
                onClick={() => {setActiveTab('profile'); setIsEditing(false);}}
                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'profile' ? 'text-accent' : 'text-slate-300 hover:text-slate-500'}`}
            >
                Overview
                {activeTab === 'profile' && <div className="absolute bottom-0 left-0 w-full h-1 bg-accent rounded-full animate-fade-in" />}
            </button>
            <button 
                onClick={() => {setActiveTab('report'); setIsEditing(false);}}
                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'report' ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}
            >
                Performance Report
                {activeTab === 'report' && <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-500 rounded-full animate-fade-in" />}
            </button>
            <button
                onClick={() => {setActiveTab('demo'); setIsEditing(false);}}
                className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'demo' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}
            >
                Demo Report Card
                {activeTab === 'demo' && <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500 rounded-full animate-fade-in" />}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'profile' ? (
              <div className="space-y-6 animate-fade-in">
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 flex flex-col sm:flex-row items-center text-center sm:text-left gap-8">
                    <img src={student.avatar} alt={student.name} className="w-24 h-24 rounded-[2rem] border-4 border-slate-50 bg-slate-50 shadow-inner shrink-0" />
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                           <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full text-xl font-bold text-slate-800 leading-tight bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-accent shadow-inner"/>
                        </div>
                      ) : (
                        <h1 className="text-3xl font-black text-slate-800 leading-tight tracking-tight">{student.name}</h1>
                      )}
                      {isEditing ? (
                        <div className="space-y-2 mt-4">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Email</label>
                           <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-accent shadow-inner"/>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-slate-400 mt-1 flex items-center gap-2">
                            <iconify-icon icon="mdi:email-outline" /> {student.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Contact Matrix</h3>
                      <div className="space-y-5">
                        <InfoItem icon="mdi:email-outline" label="Email Address" value={isEditing ? <span className="text-slate-400 italic">Editing above...</span> : student.email} />
                        <InfoItem icon="mdi:phone-outline" label="Mobile Phone" value={isEditing ? <input type="text" name="mobile_phone" value={formData.mobile_phone} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-100 shadow-inner outline-none focus:border-accent"/> : student.mobile_phone} />
                      </div>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Academic Mapping</h3>
                      <div className="space-y-5">
                         <InfoItem icon="mdi:school-outline" label="Campus" value={isEditing ? (
                             <select name="institute_id" value={formData.institute_id} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-200 outline-none focus:border-accent appearance-none cursor-pointer">
                                 <option value="">Unassigned</option>
                                 {schools.map((sch) => (
                                   <option key={sch.id} value={sch.id}>{sch.name}</option>
                                 ))}
                             </select>
                         ) : schoolName} />
                         <InfoItem icon="mdi:google-classroom" label="Classroom" value={isEditing ? (
                             <select name="class_id" value={formData.class_id} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg p-2 border border-slate-200 outline-none focus:border-accent appearance-none cursor-pointer">
                                 <option value="">Unassigned</option>
                                 {(formData.institute_id
                                   ? classes.filter((c) => c.parent_id === formData.institute_id)
                                   : classes
                                 ).map((c) => (
                                   <option key={c.id} value={c.id}>{c.name}</option>
                                 ))}
                             </select>
                         ) : className} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Career Focus / Competitive Exams</h3>
                    {isEditing ? (
                         <div className="space-y-2">
                             <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1">Comma Separated List</label>
                             <input type="text" name="attending_exams" value={formData.attending_exams} onChange={handleInputChange} className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner outline-none focus:border-accent" placeholder="e.g. NEET, JEE, KVPY"/>
                         </div>
                    ) : (
                        <div className="flex flex-wrap gap-2.5">
                            {(student.attending_exams?.length || 0) > 0 ? student.attending_exams?.map((exam, i) => (
                                <span key={i} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-100/50 shadow-sm">{exam.trim()}</span>
                            )) : <span className="text-xs text-slate-300 italic font-medium">No specialized tracking configured</span>}
                        </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 rounded-[2rem] border border-indigo-100 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-xs font-black text-indigo-700 uppercase tracking-[0.15em]">Demo Student Profile Report</h3>
                      <p className="text-xs text-slate-600 mt-2">
                        Open a demo-only report card with AI impressions, actionable metrics, preview, and PDF download.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('demo')}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-xs hover:bg-indigo-700"
                    >
                      Open Demo Report Card
                    </button>
                  </div>
              </div>
          ) : activeTab === 'report' ? (
              <div className="animate-fade-in space-y-8">
                  {/* Report Header Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-200/50 flex flex-col justify-center items-center text-center relative overflow-hidden">
                          <iconify-icon icon="mdi:target-variant" className="absolute -top-4 -right-4 text-white/5 w-32 h-32 rotate-12" />
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Average Accuracy</span>
                          <span className="text-5xl font-black mb-1">{avgAccuracy}%</span>
                          <div className="w-full bg-white/10 h-1 rounded-full mt-4 overflow-hidden">
                              <div className="bg-emerald-400 h-full transition-all duration-1000" style={{ width: `${avgAccuracy}%` }} />
                          </div>
                      </div>

                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                              <iconify-icon icon="mdi:clipboard-check-outline" width="28" />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Assessments Cleared</span>
                          <span className="text-3xl font-black text-slate-800">{results.length}</span>
                      </div>

                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                           <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                              <iconify-icon icon="mdi:history" width="28" />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Last Evaluation</span>
                          <span className="text-sm font-black text-slate-800 uppercase">{results.length > 0 ? new Date(results[0].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'N/A'}</span>
                      </div>
                  </div>

                  {/* Test History List */}
                  <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                      <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Detailed History</h3>
                          <button className="text-[10px] font-bold text-accent uppercase tracking-widest hover:underline">Export Report</button>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                      <th className="px-8 py-4">Test Name</th>
                                      <th className="px-4 py-4">Subject</th>
                                      <th className="px-4 py-4">Score</th>
                                      <th className="px-4 py-4">Accuracy</th>
                                      <th className="px-4 py-4">Date</th>
                                      <th className="px-8 py-4 text-right">Result</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {results.map(r => (
                                      <tr key={r.id} className="hover:bg-slate-50/30 transition-colors group">
                                          <td className="px-8 py-5">
                                              <span className="text-sm font-bold text-slate-700 block leading-tight">{r.test_name}</span>
                                              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">Authorized Assessment</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg">{r.subject}</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-sm font-black text-slate-700">{r.score}</span>
                                              <span className="text-xs text-slate-400 font-medium"> / {r.max_score}</span>
                                          </td>
                                          <td className="px-4 py-5">
                                              <div className="flex items-center gap-2">
                                                  <div className="w-10 bg-slate-100 h-1 rounded-full overflow-hidden shrink-0">
                                                      <div 
                                                          className={`h-full ${r.accuracy > 70 ? 'bg-emerald-500' : r.accuracy > 40 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                                                          style={{ width: `${r.accuracy}%` }} 
                                                      />
                                                  </div>
                                                  <span className="text-xs font-bold text-slate-600">{r.accuracy}%</span>
                                              </div>
                                          </td>
                                          <td className="px-4 py-5">
                                              <span className="text-[10px] font-medium text-slate-400">{new Date(r.date).toLocaleDateString()}</span>
                                          </td>
                                          <td className="px-8 py-5 text-right">
                                              {r.accuracy >= 50 ? (
                                                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">PASS</span>
                                              ) : (
                                                  <span className="text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100">RETREAT</span>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                                  {results.length === 0 && (
                                      <tr>
                                          <td colSpan={6} className="py-20 text-center">
                                              <iconify-icon icon="mdi:file-search-outline" width="48" className="text-slate-100 mb-2" />
                                              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No assessment data found for this student</p>
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Demo Student Report Card</h3>
                        <p className="text-xs text-slate-500 mt-2">
                          Preview-only module. This does not save to Supabase.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowReportPreview((prev) => !prev)}
                          className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-xs hover:bg-slate-50"
                        >
                          {showReportPreview ? 'Hide Report Preview' : 'Get Report Card Preview'}
                        </button>
                        <button
                          onClick={generateReportPdf}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-xs hover:bg-emerald-700"
                        >
                          Download PDF
                        </button>
                      </div>
                    </div>

                    {showReportPreview && (
                      <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-5 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Student</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{student.name}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Class</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{className}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Average Accuracy</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{avgAccuracy}%</p>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                            AI Generated Impressions
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-white rounded-xl border border-emerald-100 p-4">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Strength</p>
                              <p className="text-xs text-slate-600 mt-2">
                                Strong performance trend in <span className="font-bold">{strongestSubject}</span> with consistent concept retention.
                              </p>
                            </div>
                            <div className="bg-white rounded-xl border border-amber-100 p-4">
                              <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Weakness</p>
                              <p className="text-xs text-slate-600 mt-2">
                                Improvement needed in <span className="font-bold">{improvementArea}</span>, especially under timed conditions.
                              </p>
                            </div>
                            <div className="bg-white rounded-xl border border-indigo-100 p-4">
                              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Actionable Next Step</p>
                              <p className="text-xs text-slate-600 mt-2">
                                Assign 3 targeted practice sessions weekly and track error patterns chapter-wise.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                            Performance Action Matrix
                          </h4>
                          <table className="w-full text-left bg-white rounded-xl overflow-hidden border border-slate-100">
                            <thead>
                              <tr className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-3">Metric</th>
                                <th className="px-4 py-3">Current</th>
                                <th className="px-4 py-3">What You Should Do</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {demoMetrics.map((row) => (
                                <tr key={row.metric}>
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.metric}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.current}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.studentAction}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
              </div>
          ) : (
              <div className="animate-fade-in space-y-8">
                  <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Demo Student Report Card</h3>
                        <p className="text-xs text-slate-500 mt-2">
                          Preview-only module in Students section. This does not save to Supabase.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowReportPreview((prev) => !prev)}
                          className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-xs hover:bg-slate-50"
                        >
                          {showReportPreview ? 'Hide Report Preview' : 'Get Report Card Preview'}
                        </button>
                        <button
                          onClick={generateReportPdf}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-xs hover:bg-emerald-700"
                        >
                          Download PDF
                        </button>
                      </div>
                    </div>
                    {showReportPreview && (
                      <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-5 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Student</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{student.name}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Class</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{className}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Average Accuracy</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{avgAccuracy}%</p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left bg-white rounded-xl overflow-hidden border border-slate-100">
                            <thead>
                              <tr className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-3">Metric</th>
                                <th className="px-4 py-3">Current</th>
                                <th className="px-4 py-3">What You Should Do</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {demoMetrics.map((row) => (
                                <tr key={row.metric}>
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.metric}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.current}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.studentAction}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="overflow-x-auto">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                            Demo Detailed History
                          </h4>
                          <table className="w-full text-left bg-white rounded-xl overflow-hidden border border-slate-100">
                            <thead>
                              <tr className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-3">Test</th>
                                <th className="px-4 py-3">Subject</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3">Accuracy</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Student Takeaway</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {demoHistoryRows.map((row, idx) => (
                                <tr key={`${row.testName}-${idx}`}>
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.testName}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.subject}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.score}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.accuracy}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.date}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600">{row.takeaway}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value?: string | null | React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex gap-4">
    <div className="w-10 h-10 shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100/50 shadow-inner group-hover:text-accent transition-colors"><iconify-icon icon={icon} width="20"></iconify-icon></div>
    <div className="overflow-hidden flex-1 pt-0.5">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1.5">{label}</p>
      {typeof value === 'string' || value === null || value === undefined ? (
          <p className="text-sm font-bold text-slate-700 truncate">{value || 'Not Configured'}</p>
      ) : value}
    </div>
  </div>
);

export default StudentProfile;