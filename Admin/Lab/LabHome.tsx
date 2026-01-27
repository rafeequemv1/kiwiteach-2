import '../../types';
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { forgeSequentialQuestions, ensureApiKey, downsampleImage } from '../../services/geminiService';
import { Question, QuestionType } from '../../Quiz/types';
import QuestionListScreen from '../../Quiz/components/ResultScreen';

declare const mammoth: any;

interface LabHomeProps {
  onBack: () => void;
}

const LabHome: React.FC<LabHomeProps> = ({ onBack }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [forgeStatus, setForgeStatus] = useState('');
  const [forgedResult, setForgedResult] = useState<{ topic: string, questions: Question[] } | null>(null);
  
  const [extractedImages, setExtractedImages] = useState<{ data: string, mimeType: string }[]>([]);
  const [cleanText, setCleanText] = useState('');

  const [config, setConfig] = useState({
      count: 15,
      figureCount: 5,
      difficulty: 'Medium',
      topic: '',
      qType: 'neet' as QuestionType,
      useSingleImageMode: false,
      selectedImageIndex: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          
          setIsForging(true);
          setForgeStatus('Scanning for images...');
          
          try {
              let htmlText = '';
              if (selectedFile.name.toLowerCase().endsWith('.docx') || selectedFile.name.toLowerCase().endsWith('.doc')) {
                  const arrayBuffer = await selectedFile.arrayBuffer();
                  const options = {
                      convertImage: mammoth.images.imgElement(function(image: any) {
                          return image.read("base64").then(function(imageBuffer: string) {
                              const contentType = image.contentType.startsWith('image/') ? image.contentType : 'image/png';
                              return {
                                  src: "data:" + contentType + ";base64," + imageBuffer
                              };
                          });
                      })
                  };

                  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
                  htmlText = result.value; 
              } else {
                  htmlText = await selectedFile.text();
              }

              const parser = new DOMParser();
              const doc = parser.parseFromString(htmlText, 'text/html');
              const images = Array.from(doc.querySelectorAll('img'));
              const rawImages: { data: string, mimeType: string }[] = [];
              
              images.forEach((img) => {
                  const src = img.getAttribute('src') || '';
                  if (src.includes('base64,')) {
                      const [header, data] = src.split(',');
                      let mimeType = header.split(':')[1].split(';')[0];
                      if (!mimeType.startsWith('image/') || mimeType === 'application/octet-stream') {
                          mimeType = 'image/png';
                      }
                      rawImages.push({ data: data.trim(), mimeType });
                  }
              });

              setForgeStatus(`Standardizing ${rawImages.length} images...`);
              const processedResults = await Promise.all(rawImages.map(img => downsampleImage(img.data, img.mimeType, 1024)));
              const processed = processedResults.filter(img => img.data && img.data.length > 0);

              setExtractedImages(processed);
              setCleanText(doc.body.innerText || doc.body.textContent || '');
              setConfig(prev => ({ 
                  ...prev, 
                  topic: selectedFile.name.replace(/\.(html|docx|doc)$/i, ''),
                  figureCount: Math.min(prev.count, processed.length || 5),
                  selectedImageIndex: 0
              }));
          } catch (err: any) {
              console.error("Doc preprocessing error:", err);
              alert("Preprocessing failed: " + err.message);
          } finally {
              setIsForging(false);
              setForgeStatus('');
          }
      }
  };

  const runForge = async () => {
      if (!file || !cleanText) return;
      await ensureApiKey();
      
      setIsForging(true);
      setForgeStatus('Initializing Sequential Pipeline...');

      try {
          const questions = await forgeSequentialQuestions(
              config.topic,
              config.difficulty,
              config.count,
              { text: cleanText, images: extractedImages },
              config.qType,
              (status) => setForgeStatus(status),
              config.figureCount,
              undefined,
              config.useSingleImageMode ? config.selectedImageIndex : undefined
          );

          setForgedResult({ topic: config.topic, questions });
      } catch (e: any) {
          console.error("Forging error:", e);
          alert("Forging Failed: " + e.message);
      } finally {
          setIsForging(false);
          setForgeStatus('');
      }
  };

  const handleSaveToRepo = async (questions: Question[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
          const payload = {
              name: forgedResult?.topic || 'Lab Test',
              user_id: user.id,
              questions: questions,
              question_count: questions.length,
              status: 'generated',
              config: { mode: 'paper', source: 'lab', type: config.qType }
          };
          await supabase.from('tests').insert([payload]);
          alert("Saved to repository.");
          setForgedResult(null);
          setFile(null);
          setExtractedImages([]);
      } catch (err: any) { alert("Save failed: " + err.message); }
  };

  if (forgedResult) {
      return (
          <div className="fixed inset-0 z-50 bg-white">
              <QuestionListScreen 
                topic={forgedResult.topic} 
                questions={forgedResult.questions} 
                onRestart={() => setForgedResult(null)} 
                onSave={handleSaveToRepo}
                brandConfig={{ name: 'KiwiTeach Lab', logo: null, showOnTest: true, showOnOmr: true }} 
              />
          </div>
      );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fade-in font-sans">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden relative">
        {isForging && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 border-4 border-rose-100 border-t-rose-600 rounded-full animate-spin mb-8 shadow-inner"></div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Analyzing Material</h3>
                <p className="text-xs font-bold text-rose-500 uppercase tracking-[0.3em]">{forgeStatus}</p>
                <div className="w-72 h-2 bg-slate-100 rounded-full mt-10 overflow-hidden">
                    <div className="h-full bg-rose-500 animate-[loading_2s_infinite]"></div>
                </div>
            </div>
        )}

        <div className="p-10">
            <header className="flex items-center gap-5 mb-10 pb-8 border-b border-slate-100">
                <div className="w-16 h-16 bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-rose-200 transform -rotate-3">
                    <iconify-icon icon="mdi:flask-round-bottom" width="36" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Smart Forging Lab</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sequential Figure-Stylization Assessment Forge</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5 space-y-6">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded flex items-center justify-center text-[9px]">1</span>
                        Source Selection
                    </label>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`aspect-square md:aspect-auto md:h-64 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${file ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-rose-400 hover:bg-rose-50/20'}`}
                    >
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-all ${file ? 'bg-white' : 'bg-slate-100'}`}>
                            <iconify-icon icon={file ? "mdi:file-check" : "mdi:cloud-upload-outline"} width="32" className={file ? "text-emerald-500" : "text-slate-300"} />
                        </div>
                        <div className="text-center px-8">
                            <p className="text-xs font-black uppercase tracking-wide truncate max-w-[200px] mx-auto">{file ? file.name : 'Upload Doc / HTML'}</p>
                            <p className="text-[8px] font-bold opacity-60 uppercase mt-1">Word (.docx) & Mathpix HTML</p>
                        </div>
                    </div>
                    <input type="file" accept=".html,.docx" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

                    {extractedImages.length > 0 && (
                        <div className="space-y-3 animate-fade-in">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detected Figures ({extractedImages.length})</label>
                                <button 
                                    onClick={() => setConfig({...config, useSingleImageMode: !config.useSingleImageMode})}
                                    className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all border ${config.useSingleImageMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                                >
                                    {config.useSingleImageMode ? 'Single Mode ON' : 'Multi Mode'}
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                {extractedImages.map((img, idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => config.useSingleImageMode && setConfig({...config, selectedImageIndex: idx})}
                                        className={`aspect-square rounded-lg border-2 overflow-hidden transition-all relative group ${config.useSingleImageMode ? (config.selectedImageIndex === idx ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md' : 'border-white hover:border-indigo-200') : 'border-white grayscale opacity-60'}`}
                                    >
                                        <img src={`data:${img.mimeType};base64,${img.data}`} className="w-full h-full object-cover" />
                                        {config.useSingleImageMode && config.selectedImageIndex === idx && (
                                            <div className="absolute inset-0 bg-indigo-600/10 flex items-center justify-center">
                                                <iconify-icon icon="mdi:check-circle" className="text-indigo-600 text-lg" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {config.useSingleImageMode && (
                                <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest text-center animate-pulse">Select one image to generate all questions for.</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-7 space-y-8">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded flex items-center justify-center text-[9px]">2</span>
                        Forge Parameters
                    </label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-full">
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Topic / Exam Name</label>
                            <input 
                                type="text" 
                                value={config.topic} 
                                onChange={e => setConfig({...config, topic: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black text-slate-800 focus:border-rose-500 outline-none transition-all shadow-inner"
                                placeholder="Enter specific topic..."
                            />
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Question Pattern</label>
                            <select 
                                value={config.qType} 
                                onChange={e => setConfig({...config, qType: e.target.value as QuestionType})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black text-slate-700 outline-none focus:border-rose-500 appearance-none cursor-pointer"
                            >
                                <option value="neet">NEET Format (Mixed)</option>
                                <option value="mcq">Standard MCQ Only</option>
                                <option value="reasoning">Assertion & Reason</option>
                                <option value="matching">Matrix Matching</option>
                                <option value="statements">Statement I & II</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Challenge Level</label>
                            <div className="flex gap-1.5 p-1 bg-slate-50 rounded-2xl border border-slate-200">
                                {['Easy', 'Medium', 'Hard'].map(d => (
                                    <button 
                                        key={d}
                                        onClick={() => setConfig({...config, difficulty: d})}
                                        className={`flex-1 py-3 rounded-xl font-black uppercase text-[8px] tracking-widest transition-all ${config.difficulty === d ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Total Quantity</label>
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner">
                                <button onClick={() => setConfig(prev => ({...prev, count: Math.max(1, prev.count - 1)}))} className="text-slate-400 hover:text-rose-500"><iconify-icon icon="mdi:minus" /></button>
                                <input 
                                    type="number" 
                                    value={config.count} 
                                    onChange={e => setConfig({...config, count: Math.min(100, parseInt(e.target.value)||1)})}
                                    className="flex-1 bg-transparent text-center text-sm font-black text-slate-800 outline-none"
                                />
                                <button onClick={() => setConfig(prev => ({...prev, count: Math.min(100, prev.count + 1)}))} className="text-slate-400 hover:text-rose-500"><iconify-icon icon="mdi:plus" /></button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Figure Questions</label>
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner">
                                <button onClick={() => setConfig(prev => ({...prev, figureCount: Math.max(0, prev.figureCount - 1)}))} className="text-slate-400 hover:text-rose-500"><iconify-icon icon="mdi:minus" /></button>
                                <input 
                                    type="number" 
                                    value={config.figureCount} 
                                    onChange={e => setConfig({...config, figureCount: Math.min(config.count, parseInt(e.target.value)||0)})}
                                    className="flex-1 bg-transparent text-center text-sm font-black text-slate-800 outline-none"
                                />
                                <button onClick={() => setConfig(prev => ({...prev, figureCount: Math.min(config.count, prev.figureCount + 1)}))} className="text-slate-400 hover:text-rose-500"><iconify-icon icon="mdi:plus" /></button>
                            </div>
                            <p className="text-[8px] text-slate-400 uppercase font-black mt-2 tracking-widest text-center">
                                {config.useSingleImageMode 
                                    ? `AI will generate ${config.figureCount} unique diagrams based on selected source`
                                    : (config.figureCount > extractedImages.length 
                                        ? `AI will stylize ${extractedImages.length} figures and generate ${config.figureCount - extractedImages.length} synthetic diagrams`
                                        : `AI will stylize ${config.figureCount} source figures`)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-12 pt-10 border-t border-slate-100">
                <button 
                    disabled={!file || isForging}
                    onClick={runForge}
                    className="w-full bg-rose-600 text-white py-6 rounded-[1.5rem] font-black uppercase tracking-[0.4em] text-sm shadow-xl shadow-rose-200 hover:bg-rose-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-4"
                >
                    <iconify-icon icon="mdi:lightning-bolt" width="24" />
                    <span>Initiate Rapid Forge</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LabHome;