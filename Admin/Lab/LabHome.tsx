
import '../../types';
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { forgeSequentialQuestions, ensureApiKey, downsampleImage, getSystemPrompt } from '../../services/geminiService';
import { Question, QuestionType } from '../../Quiz/types';
import QuestionPaperItem from '../../Quiz/components/QuestionPaperItem';

declare const mammoth: any;

interface LabHomeProps {
  onBack: () => void;
  /** Fill admin section panel (no outer max-width / padding) */
  embedded?: boolean;
}

/**
 * Utility to strip Null characters (\u0000) which are illegal in Postgres text types.
 */
const sanitizeForPostgres = (obj: any): any => {
    if (typeof obj === 'string') {
        return obj.replace(/\u0000/g, '').replace(/\0/g, '');
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForPostgres);
    }
    if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
            cleaned[key] = sanitizeForPostgres(obj[key]);
        }
        return cleaned;
    }
    return obj;
};

const LabHome: React.FC<LabHomeProps> = ({ onBack, embedded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [cleanText, setCleanText] = useState('');
  const [isForging, setIsForging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [forgeStatus, setForgeStatus] = useState('');
  
  const [config, setConfig] = useState({
      topic: '',
      count: 10,
      difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard',
      qType: 'mcq' as QuestionType,
      model: 'gemini-3-pro-preview'
  });

  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [showReview, setShowReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          setForgeStatus('Reading Source...');
          setIsForging(true);
          
          try {
              let htmlText = '';
              if (selectedFile.name.toLowerCase().endsWith('.docx') || selectedFile.name.toLowerCase().endsWith('.doc')) {
                  const arrayBuffer = await selectedFile.arrayBuffer();
                  const result = await mammoth.convertToHtml({ arrayBuffer });
                  htmlText = result.value; 
              } else {
                  htmlText = await selectedFile.text();
              }
              const parser = new DOMParser();
              const doc = parser.parseFromString(htmlText, 'text/html');
              setCleanText(doc.body.innerText || '');
              setConfig(prev => ({ ...prev, topic: selectedFile.name.replace(/\.(html|docx|doc)$/i, '') }));
          } catch (err: any) {
              alert("Failed to parse file: " + err.message);
          } finally {
              setIsForging(false);
              setForgeStatus('');
          }
      }
  };

  const runForgeBatch = async () => {
      if (!file || !cleanText) return alert("Please upload a source file first.");
      await ensureApiKey();
      setIsForging(true);
      setForgeStatus(`Synthesizing ${config.count} ${config.difficulty} Items...`);
      
      try {
          const difficultyTag = config.difficulty;
          const specialRigor = difficultyTag === 'Medium' 
            ? "[STRICT RIGOR]: Ensure difficulty is 'Above Average' - require 2-step logical derivation." 
            : "";

          const results = await forgeSequentialQuestions(
              config.topic, 
              difficultyTag, 
              config.count,
              { text: specialRigor + "\n\n" + cleanText },
              config.qType, 
              undefined, 
              0, 
              false, 
              undefined,
              config.model,
              'text' 
          );

          setReviewQueue(results.map(q => ({
              ...q,
              chapter_name: config.topic,
              difficulty: difficultyTag,
              question_text: q.text,
              question_type: q.type
          })));
          setShowReview(true);
      } catch (e: any) {
          alert("Forging Failed: " + e.message);
      } finally {
          setIsForging(false);
          setForgeStatus('');
      }
  };

  const commitToDatabase = async () => {
      if (reviewQueue.length === 0) return;
      setIsSaving(true);
      setForgeStatus('Cloud Sync Active...');
      try {
          const safeReviewQueue = sanitizeForPostgres(reviewQueue);

          const cleanData = safeReviewQueue.map((item: any) => ({
              chapter_name: item.chapter_name || config.topic,
              question_text: item.question_text || item.text,
              options: item.options,
              correct_index: item.correct_index !== undefined ? item.correct_index : item.correctIndex,
              explanation: item.explanation,
              difficulty: item.difficulty,
              question_type: item.question_type || item.type,
              topic_tag: item.topic_tag || 'General'
          }));

          const { error } = await supabase.from('question_bank_neet').insert(cleanData);
          if (error) throw error;
          
          alert(`Success! ${reviewQueue.length} items added to database.`);
          setReviewQueue([]);
          setShowReview(false);
      } catch (err: any) {
          console.error("Database Error Details", err);
          alert("Database Error: " + err.message);
      } finally {
          setIsSaving(false);
          setForgeStatus('');
      }
  };

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 w-full flex-1 flex-col font-sans'
          : 'mx-auto max-w-5xl animate-fade-in p-2 font-sans md:p-4'
      }
    >
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ${
          embedded ? 'min-h-0 flex-1' : 'min-h-[500px]'
        }`}
      >
        
        {(isForging || isSaving) && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 p-12 text-center backdrop-blur-md animate-fade-in">
                <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-zinc-100 border-t-zinc-900"></div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight text-zinc-900">{isSaving ? 'Syncing repository' : 'Neural forge active'}</h3>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{forgeStatus}</p>
            </div>
        )}

        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-900 px-6 py-5">
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-white shadow-inner">
                    <iconify-icon icon="mdi:database-plus" width="26" />
                </div>
                <div>
                    <h2 className="text-base font-semibold tracking-tight text-white">Batch Forge</h2>
                    <p className="mt-0.5 text-[11px] font-medium text-zinc-400">Rapid database population</p>
                </div>
            </div>
            <button type="button" onClick={onBack} className="rounded-lg bg-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-white transition-colors hover:bg-white/20">Exit</button>
        </header>

        {showReview ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-fade-in bg-slate-50">
                <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Review Queue</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Verify synthesized items before cloud commit</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowReview(false)} className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button onClick={commitToDatabase} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-black uppercase text-[9px] tracking-[0.2em] shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center gap-2">
                            <iconify-icon icon="mdi:cloud-check" width="16" /> Commit to Hub
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {reviewQueue.map((q, i) => (
                        <QuestionPaperItem 
                            key={i}
                            index={i}
                            question={{
                                ...q,
                                id: `preview-${i}`,
                                text: q.question_text || q.text,
                                type: q.question_type || q.type,
                                correctIndex: q.correct_index !== undefined ? q.correct_index : q.correctIndex,
                                figureDataUrl: q.figureDataUrl,
                                sourceFigureDataUrl: q.sourceFigureDataUrl,
                                columnA: q.columnA || q.column_a,
                                columnB: q.columnB || q.column_b
                            }}
                            showExplanation={true}
                        />
                    ))}
                </div>
            </div>
        ) : (
            <div className="flex-1 p-10 flex flex-col gap-10">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                    <div className="md:col-span-5 space-y-8">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">1. Knowledge Base Source</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()} 
                                className={`aspect-video border-4 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:bg-indigo-50/50 ${file ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:border-indigo-400'}`}
                            >
                                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${file ? 'bg-emerald-500 text-white' : 'bg-white text-slate-300'}`}>
                                    <iconify-icon icon={file ? "mdi:check-decagram" : "mdi:cloud-upload"} width="32" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black uppercase text-slate-700 tracking-tight">{file ? file.name : 'Upload Curriculum Doc'}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{file ? 'Source Ready' : 'HTML or DOCX format'}</p>
                                </div>
                            </div>
                            <input type="file" accept=".html,.docx" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">2. Database Identifier (Chapter)</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Biological Classification"
                                value={config.topic} 
                                onChange={e => setConfig({...config, topic: e.target.value})} 
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-black text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-inner" 
                            />
                        </div>
                    </div>

                    <div className="md:col-span-7">
                        <div className="bg-slate-50 rounded-[3rem] p-10 border border-slate-100 h-full flex flex-col justify-between">
                            <div className="space-y-10">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5 block">3. Target Rigor Protocol</label>
                                    <div className="grid grid-cols-3 gap-4">
                                        {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                                            <button 
                                                key={d}
                                                onClick={() => setConfig({...config, difficulty: d})}
                                                className={`py-6 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 group ${config.difficulty === d ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'bg-white border-white text-slate-400 hover:border-indigo-200'}`}
                                            >
                                                <iconify-icon icon={d === 'Easy' ? 'mdi:seed-outline' : d === 'Medium' ? 'mdi:brain' : 'mdi:fire'} width="24" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{d}</span>
                                                {d === 'Medium' && <span className="text-[7px] font-bold opacity-60 uppercase">High Standard</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-10">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Batch Quantity</label>
                                        <div className="flex items-center bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
                                            <button onClick={() => setConfig({...config, count: Math.max(1, config.count - 1)})} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500"><iconify-icon icon="mdi:minus-circle" /></button>
                                            <input type="number" value={config.count} onChange={e => setConfig({...config, count: parseInt(e.target.value)||1})} className="flex-1 bg-transparent text-center text-xl font-black text-slate-800 outline-none" />
                                            <button onClick={() => setConfig({...config, count: config.count + 1})} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-emerald-500"><iconify-icon icon="mdi:plus-circle" /></button>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Model Intelligence</label>
                                        <select 
                                            value={config.model}
                                            onChange={e => setConfig({...config, model: e.target.value})}
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 text-[10px] font-black uppercase tracking-widest text-indigo-600 outline-none shadow-sm appearance-none"
                                        >
                                            <option value="gemini-3-pro-preview">Gemini 3 Pro (Elite)</option>
                                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={runForgeBatch}
                                disabled={!file || isForging}
                                className="w-full mt-12 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs shadow-2xl shadow-slate-900/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                            >
                                <iconify-icon icon="mdi:lightning-bolt" width="20" />
                                Run Batch Forge
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default LabHome;
