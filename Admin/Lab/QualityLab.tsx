
import '../../types';
import React, { useState, useMemo } from 'react';
import { generateQuizQuestions, ensureApiKey } from '../../services/geminiService';
import { Question } from '../../Quiz/types';
import { renderWithSmiles } from '../../utils/smilesRenderer';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

interface QualityLabProps {
  onBack: () => void;
}

const COST_ESTIMATES = {
  'gemini-3-pro-preview': 4.50, // INR per question
  'gemini-3-flash-preview': 0.15,
  'gemini-flash-lite-latest': 0.05
};

const QualityLab: React.FC<QualityLabProps> = ({ onBack }) => {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(1);
  const [isForging, setIsForging] = useState(false);
  const [results, setResults] = useState<Record<string, Question[]>>({});
  const [activeTab, setActiveTab] = useState<string>('gemini-3-pro-preview');

  const estimateTotalCost = useMemo(() => {
    return (count * COST_ESTIMATES[activeTab as keyof typeof COST_ESTIMATES]).toFixed(2);
  }, [count, activeTab]);

  const runTest = async (model: string) => {
    if (!topic.trim()) return alert("Enter a topic to test.");
    setIsForging(true);
    try {
      await ensureApiKey();
      const res = await generateQuizQuestions(
        topic, 
        'Medium', 
        count, 
        undefined, 
        'mcq', 
        undefined, 
        0, 
        false, 
        undefined, 
        model, 
        'text'
      );
      setResults(prev => ({ ...prev, [model]: res }));
    } catch (e: any) {
      alert("Test failed: " + e.message);
    } finally {
      setIsForging(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fade-in font-sans">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col min-h-[600px]">
        
        {/* Header Section */}
        <header className="bg-slate-900 p-8 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <iconify-icon icon="mdi:matrix" width="32" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Quality Benchmark Lab</h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cross-Model Logic Evaluation</p>
            </div>
          </div>
          <button onClick={onBack} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all">Close Lab</button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Controls Sidebar */}
          <aside className="w-80 border-r border-slate-100 bg-slate-50/50 p-8 space-y-8 shrink-0 overflow-y-auto custom-scrollbar">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">1. Test Context</label>
              <textarea 
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Topic or Text Snippet..."
                className="w-full h-32 bg-white border border-slate-200 rounded-2xl p-4 text-xs font-medium outline-none focus:border-indigo-500 shadow-inner resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">2. Item Quantity</label>
              <div className="flex items-center bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
                <button onClick={() => setCount(Math.max(1, count - 1))} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"><iconify-icon icon="mdi:minus-circle" /></button>
                <input type="number" value={count} onChange={e => setCount(parseInt(e.target.value)||1)} className="flex-1 bg-transparent text-center font-black text-slate-800 outline-none" />
                <button onClick={() => setCount(count + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-colors"><iconify-icon icon="mdi:plus-circle" /></button>
              </div>
            </div>

            <div className="pt-4">
              <div className="bg-slate-900 rounded-3xl p-6 shadow-xl border-4 border-indigo-500/20">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Estimated Cloud Cost</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">₹{estimateTotalCost}</span>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase">INR</span>
                </div>
                <p className="text-[8px] text-slate-500 mt-4 leading-relaxed font-medium">Based on ~2500 tokens/question (Input + Output mix) on selected model.</p>
              </div>
            </div>

            <button 
              onClick={() => runTest(activeTab)}
              disabled={isForging || !topic.trim()}
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isForging ? <iconify-icon icon="mdi:loading" className="animate-spin" /> : <iconify-icon icon="mdi:lightning-bolt" />}
              Generate Benchmark
            </button>
          </aside>

          {/* Result Area */}
          <main className="flex-1 flex flex-col bg-white overflow-hidden">
            <div className="bg-slate-100/50 p-1 flex border-b border-slate-200">
              {(['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'] as const).map(m => (
                <button 
                  key={m}
                  onClick={() => setActiveTab(m)}
                  className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <iconify-icon icon={m.includes('pro') ? 'mdi:diamond' : m.includes('flash') ? 'mdi:lightning-bolt' : 'mdi:feather'} />
                  {m.includes('pro') ? 'Gemini 3 Pro' : m.includes('flash') ? 'Gemini 3 Flash' : 'Gemini Lite'}
                  {results[m] && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/30">
              {results[activeTab] ? (
                <div className="space-y-6 animate-slide-up">
                  {results[activeTab].map((q, i) => (
                    <div key={i} className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Validated Output</span>
                      </div>
                      <div className="flex items-center gap-3 mb-6">
                        <span className="bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-lg">ITEM {i+1}</span>
                        <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">MEDIUM RIGOR</span>
                      </div>
                      
                      <div className="text-lg font-bold text-slate-800 leading-relaxed mb-8">
                        {renderWithSmiles(parsePseudoLatexAndMath(q.text), 140)}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className={`p-4 rounded-xl border flex items-center gap-3 ${oi === q.correctIndex ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500 opacity-60'}`}>
                            <span className="font-black opacity-30 text-xs">({String.fromCharCode(65+oi)})</span>
                            <span className="text-xs font-bold">{renderWithSmiles(parsePseudoLatexAndMath(opt), 80)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><iconify-icon icon="mdi:lightbulb-on" className="text-amber-500" /> Explanation Analysis</h4>
                        <div className="text-xs text-slate-600 italic leading-relaxed font-medium">
                          {renderWithSmiles(parsePseudoLatexAndMath(q.explanation), 100)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-40">
                  <iconify-icon icon="mdi:flask-empty-outline" width="64" />
                  <p className="text-sm font-black uppercase tracking-widest mt-4">No benchmark data for {activeTab.replace('-preview','').replace('-latest','')}</p>
                  <p className="text-xs font-bold mt-1">Configure parameters and click "Generate Benchmark"</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default QualityLab;
