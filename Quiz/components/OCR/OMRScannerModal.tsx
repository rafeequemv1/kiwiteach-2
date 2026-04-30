import '../../../types';
import React, { useState, useRef, useEffect } from 'react';
import { Question } from '../../types';
import { evaluateOMRSheet, EvaluationResult } from './OMREvaluator';

declare var cv: any;

interface OMRScannerModalProps {
  questions: Question[];
  onClose: () => void;
  onScanComplete?: (result: EvaluationResult) => void;
}

interface HistoryItem extends EvaluationResult {
    timestamp: string;
}

const OMRScannerModal: React.FC<OMRScannerModalProps> = ({ questions, onClose, onScanComplete }) => {
  const [mode, setMode] = useState<'camera' | 'upload' | 'result'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(true);
  const [isAlignedForAutoScan, setIsAlignedForAutoScan] = useState(false);
  const [alignmentProgress, setAlignmentProgress] = useState(0);
  
  // Continuous Scanning State
  const [scanHistory, setScanHistory] = useState<HistoryItem[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const alignCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const alignedFramesRef = useRef(0);
  const autoCaptureLockRef = useRef(false);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'camera' || !isAutoScanEnabled || isProcessing || !stream) return;

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || autoCaptureLockRef.current) return;

      const aligned = detectCornerAlignment(video);
      if (aligned) {
        alignedFramesRef.current = Math.min(6, alignedFramesRef.current + 1);
      } else {
        alignedFramesRef.current = Math.max(0, alignedFramesRef.current - 1);
      }

      setIsAlignedForAutoScan(alignedFramesRef.current >= 4);
      setAlignmentProgress(Math.round((alignedFramesRef.current / 6) * 100));

      if (alignedFramesRef.current >= 6 && !isProcessing) {
        autoCaptureLockRef.current = true;
        captureAndEvaluate();
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [mode, stream, isAutoScanEnabled, isProcessing]);

  const detectCornerAlignment = (video: HTMLVideoElement): boolean => {
    if (typeof cv === 'undefined' || !cv.Mat) return false;
    if (!alignCanvasRef.current) {
      alignCanvasRef.current = document.createElement('canvas');
    }

    const helperCanvas = alignCanvasRef.current;
    const targetW = 640;
    const targetH = 480;
    helperCanvas.width = targetW;
    helperCanvas.height = targetH;
    const ctx = helperCanvas.getContext('2d');
    if (!ctx) return false;

    ctx.drawImage(video, 0, 0, targetW, targetH);

    let src: any, gray: any, thresh: any, contours: any, hierarchy: any;
    try {
      src = cv.imread(helperCanvas);
      gray = new cv.Mat();
      thresh = new cv.Mat();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 7);
      cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const imageArea = targetW * targetH;
      const markers: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < imageArea * 0.00015 || area > imageArea * 0.04) continue;
        const rect = cv.boundingRect(cnt);
        const aspect = rect.width / Math.max(1, rect.height);
        if (aspect < 0.5 || aspect > 2) continue;
        markers.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      }
      if (markers.length < 4) return false;

      const sortedBySum = [...markers].sort((a, b) => (a.x + a.y) - (b.x + b.y));
      const tl = sortedBySum[0];
      const br = sortedBySum[sortedBySum.length - 1];
      const sortedByDiff = [...markers].sort((a, b) => (a.x - a.y) - (b.x - b.y));
      const bl = sortedByDiff[0];
      const tr = sortedByDiff[sortedByDiff.length - 1];

      const guideLeft = targetW * 0.075;
      const guideRight = targetW * 0.925;
      const guideTop = targetH * 0.10;
      const guideBottom = targetH * 0.90;
      const tol = 70;

      const near = (p: { x: number; y: number }, ex: number, ey: number) =>
        Math.abs(p.x - ex) <= tol && Math.abs(p.y - ey) <= tol;

      return (
        near(tl, guideLeft, guideTop) &&
        near(tr, guideRight, guideTop) &&
        near(bl, guideLeft, guideBottom) &&
        near(br, guideRight, guideBottom)
      );
    } catch {
      return false;
    } finally {
      [src, gray, thresh, hierarchy, contours].forEach((m) => {
        if (m && typeof m.delete === 'function') m.delete();
      });
    }
  };

  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment', 
            width: { ideal: 1920 }, 
            height: { ideal: 1080 } 
        } 
      });
      setStream(ms);
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
      }
    } catch (e) {
      console.error("Camera failed", e);
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    alignedFramesRef.current = 0;
    setAlignmentProgress(0);
    setIsAlignedForAutoScan(false);
    autoCaptureLockRef.current = false;
  };

  const captureAndEvaluate = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    
    setIsProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = new Image();
        image.src = canvas.toDataURL('image/png');
        image.onload = async () => {
             const res = await evaluateOMRSheet(image, questions);
             setResult(res);
             onScanComplete?.(res);
             setMode('result');
             setIsProcessing(false);
             alignedFramesRef.current = 0;
             setAlignmentProgress(0);
             setIsAlignedForAutoScan(false);
             autoCaptureLockRef.current = false;
        };
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          
          setIsProcessing(true);
          
          reader.onload = (evt) => {
              const src = evt.target?.result as string;
              setPreviewImage(src);

              const img = new Image();
              img.onload = async () => {
                  setTimeout(async () => {
                    const res = await evaluateOMRSheet(img, questions);
                    setResult(res);
                    onScanComplete?.(res);
                    setMode('result');
                    setIsProcessing(false);
                    setPreviewImage(null);
                  }, 300);
              };
              img.src = src;
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSaveAndNext = () => {
      if (result) {
          const newItem: HistoryItem = {
              ...result,
              timestamp: new Date().toLocaleString()
          };
          setScanHistory(prev => [...prev, newItem]);
          setResult(null);
          setPreviewImage(null);
          setMode('camera');
          alignedFramesRef.current = 0;
          setAlignmentProgress(0);
          setIsAlignedForAutoScan(false);
          autoCaptureLockRef.current = false;
      }
  };

  const exportBulkCSV = () => {
    let dataToExport = [...scanHistory];
    if (result) {
        dataToExport.push({
            ...result,
            timestamp: new Date().toLocaleString()
        });
    }

    if (dataToExport.length === 0) return;

    const staticHeaders = ['Timestamp', 'Roll Number', 'Booklet Number', 'Total Score', 'Max Score', 'Accuracy (%)', 'Correct', 'Wrong', 'Unanswered'];
    const questionCount = questions.length;
    const questionHeaders = Array.from({ length: questionCount }, (_, i) => `Q${i + 1}`);
    const headers = [...staticHeaders, ...questionHeaders];

    const rows = dataToExport.map(item => {
        const accuracy = Math.round((item.score / item.totalQuestions) * 100);
        const attempted = item.detectedAnswers.filter(a => a.selectedIndex !== -1).length;
        const correct = item.score;
        const wrong = attempted - correct;
        const unanswered = item.totalQuestions - attempted;
        
        const answerMap = new Array(questionCount).fill("");
        item.detectedAnswers.forEach(ans => {
            if (ans.questionIndex < questionCount) {
                const char = ans.selectedIndex === -1 ? 'BLANK' : String.fromCharCode(65 + ans.selectedIndex);
                answerMap[ans.questionIndex] = char;
            }
        });

        return [
            item.timestamp.replace(',', ''),
            `'${item.rollNumber || '000000'}'`,
            `'${item.testBookletNumber || '000000'}'`,
            item.score,
            item.totalQuestions,
            `${accuracy}%`,
            correct,
            wrong,
            unanswered,
            ...answerMap
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `OMR_Batch_Export_${Date.now()}_(${rows.length}_Sheets).csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Derived Stats
  const correctCount = result ? result.score : 0;
  const attemptedCount = result ? result.detectedAnswers.filter(a => a.selectedIndex !== -1).length : 0;
  const unansweredCount = result ? result.totalQuestions - attemptedCount : 0;
  const wrongCount = result ? attemptedCount - correctCount : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      {/* Container: Full screen on mobile, Rounded on Desktop */}
      <div
        className={`bg-white w-full h-full overflow-hidden shadow-2xl flex flex-col relative ${
          mode === 'camera'
            ? 'md:h-[96vh] md:max-h-none md:max-w-[430px] md:rounded-[2rem]'
            : 'md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-3xl'
        }`}
      >
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
            <div className="flex items-center gap-3 md:gap-4">
                <h2 className="text-lg md:text-xl font-bold text-text-primary flex items-center gap-2">
                    <iconify-icon icon="mdi:camera-metering-spot" className="text-accent w-6 h-6"></iconify-icon>
                    <span className="hidden xs:inline">AI OMR Evaluator</span>
                    <span className="xs:hidden">OMR Scan</span>
                </h2>
                {scanHistory.length > 0 && (
                    <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100 flex items-center gap-1">
                        <iconify-icon icon="mdi:file-multiple-outline"></iconify-icon>
                        {scanHistory.length}
                    </div>
                )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors bg-gray-50 border border-gray-200">
                <iconify-icon icon="mdi:close" className="w-5 h-5 text-gray-500"></iconify-icon>
            </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-secondary custom-scrollbar">
            {mode === 'camera' && (
                <div className="flex flex-col h-full justify-center">
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] shadow-lg w-full max-w-[420px] mx-auto border-2 border-white/50">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-0 border-[3px] border-white/20 pointer-events-none"></div>
                        
                        {/* Camera Overlay Guide */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[80%] pointer-events-none">
                             <div className={`absolute top-0 left-0 h-9 w-9 rounded-md border-2 bg-black/20 ${isAlignedForAutoScan ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute top-0 right-0 h-9 w-9 rounded-md border-2 bg-black/20 ${isAlignedForAutoScan ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute bottom-0 left-0 h-9 w-9 rounded-md border-2 bg-black/20 ${isAlignedForAutoScan ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute bottom-0 right-0 h-9 w-9 rounded-md border-2 bg-black/20 ${isAlignedForAutoScan ? 'border-emerald-400' : 'border-accent'}`}></div>
                             
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                                    {isAutoScanEnabled
                                      ? (isAlignedForAutoScan ? 'Aligned - Auto Scan Ready' : `Align 4 Corners (${alignmentProgress}%)`)
                                      : 'Align 4 Corners'}
                                </div>
                             </div>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <p className="text-center text-xs text-gray-400">Ensure good lighting and hold steady</p>
                      <button
                        type="button"
                        onClick={() => setIsAutoScanEnabled((v) => !v)}
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                          isAutoScanEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white text-gray-500 border-gray-200'
                        }`}
                      >
                        {isAutoScanEnabled ? 'Auto Scan On' : 'Auto Scan Off'}
                      </button>
                    </div>
                </div>
            )}

            {mode === 'upload' && (
                <div className="flex flex-col h-full justify-center max-w-2xl mx-auto">
                    {previewImage ? (
                         <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-200 bg-white min-h-[300px] flex items-center justify-center">
                            <img src={previewImage} alt="Uploaded Preview" className="w-full h-auto object-contain max-h-[50vh] opacity-80" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 backdrop-blur-[1px]">
                                <div className="bg-slate-900/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-white/10 text-white text-center max-w-[80%]">
                                    <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="font-black text-xl mb-1">Analyzing</p>
                                    <p className="text-xs opacity-60">Scanning answer bubbles...</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-300 rounded-3xl bg-white hover:border-accent transition-all cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <iconify-icon icon="mdi:cloud-upload" className="w-10 h-10 text-accent"></iconify-icon>
                            </div>
                            <p className="font-black text-text-primary text-lg">Upload Photo</p>
                            <p className="text-sm text-text-secondary mt-1">Select from gallery</p>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </div>
                    )}
                </div>
            )}

            {mode === 'result' && result && (
                <div className="animate-slide-up flex flex-col gap-6">
                    {/* ID Card */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                         <div>
                             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Roll No</p>
                             <p className="text-lg font-mono font-bold text-slate-800">{result.rollNumber || '—'}</p>
                         </div>
                         <div className="h-8 w-px bg-gray-100"></div>
                         <div className="text-right">
                             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Booklet</p>
                             <p className="text-lg font-mono font-bold text-slate-800">{result.testBookletNumber || '—'}</p>
                         </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-3xl shadow-lg text-white text-center relative overflow-hidden">
                             <div className="relative z-10">
                                <p className="text-xs font-bold opacity-60 uppercase tracking-widest mb-1">Total Score</p>
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-6xl font-black tracking-tighter">{result.score}</span>
                                    <span className="text-xl font-medium opacity-60">/ {result.totalQuestions}</span>
                                </div>
                                <div className="mt-4 bg-white/10 rounded-full h-1.5 w-full max-w-[200px] mx-auto overflow-hidden">
                                    <div className="bg-emerald-400 h-full transition-all duration-1000" style={{width: `${(result.score/result.totalQuestions)*100}%`}}></div>
                                </div>
                             </div>
                             <iconify-icon icon="mdi:trophy" className="absolute -bottom-4 -right-4 text-white opacity-5 w-32 h-32 rotate-12"></iconify-icon>
                        </div>

                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center gap-1">
                            <iconify-icon icon="mdi:check-circle" className="text-emerald-500 w-6 h-6 mb-1"></iconify-icon>
                            <span className="text-2xl font-black text-emerald-700">{correctCount}</span>
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Correct</span>
                        </div>

                        <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex flex-col items-center justify-center gap-1">
                             <iconify-icon icon="mdi:close-circle" className="text-red-500 w-6 h-6 mb-1"></iconify-icon>
                            <span className="text-2xl font-black text-red-700">{wrongCount}</span>
                            <span className="text-[10px] font-bold text-red-600 uppercase">Wrong</span>
                        </div>
                        
                        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex flex-col items-center justify-center gap-1">
                             <iconify-icon icon="mdi:minus-circle-outline" className="text-amber-500 w-6 h-6 mb-1"></iconify-icon>
                            <span className="text-2xl font-black text-amber-700">{unansweredCount}</span>
                            <span className="text-[10px] font-bold text-amber-600 uppercase">Unanswered</span>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-1">
                             <iconify-icon icon="mdi:percent-outline" className="text-slate-400 w-6 h-6 mb-1"></iconify-icon>
                            <span className="text-2xl font-black text-slate-700">{Math.round((result.score / result.totalQuestions) * 100)}%</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Accuracy</span>
                        </div>
                    </div>

                    {result.error && (
                         <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-start gap-3">
                             <iconify-icon icon="mdi:alert-circle" className="w-5 h-5 shrink-0 mt-0.5"></iconify-icon>
                             <p className="font-medium">{result.error}</p>
                         </div>
                    )}
                    
                    {/* Collapsible Preview Image */}
                    {result.processedImageUrl && (
                        <div className="mt-2">
                             <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Scan Verification</p>
                             <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                                 <img src={result.processedImageUrl} alt="Processed OMR" className="w-full h-auto" />
                             </div>
                        </div>
                    )}
                </div>
            )}
            
            <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Sticky Action Footer */}
        {mode !== 'result' ? (
            <div className="p-3 md:p-4 bg-white border-t border-gray-100 flex gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0 z-20">
                <button 
                    onClick={() => { setMode(mode === 'camera' ? 'upload' : 'camera'); setPreviewImage(null); }}
                    disabled={isProcessing}
                    className="flex-1 py-3 px-3 rounded-xl font-bold text-text-secondary hover:bg-gray-100 transition-colors disabled:opacity-50 border border-gray-200 flex flex-col items-center justify-center gap-1 active:scale-95"
                >
                    <iconify-icon icon={mode === 'camera' ? 'mdi:image-outline' : 'mdi:camera-outline'} className="w-5 h-5"></iconify-icon>
                    <span className="text-[10px] uppercase tracking-wider">{mode === 'camera' ? 'Upload' : 'Camera'}</span>
                </button>
                
                {mode === 'camera' && (
                    <button 
                        onClick={captureAndEvaluate}
                        disabled={isProcessing}
                        className="flex-[2] bg-accent hover:bg-indigo-700 active:bg-indigo-800 text-white py-3 px-5 rounded-xl font-bold shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                        {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:camera-iris" className="w-6 h-6"></iconify-icon>}
                        <span className="uppercase text-xs tracking-widest">{isProcessing ? 'Scanning...' : 'Capture'}</span>
                    </button>
                )}
                
                {scanHistory.length > 0 && (
                    <button 
                         onClick={exportBulkCSV}
                         className="flex-1 py-3 px-3 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 flex flex-col items-center justify-center gap-1 active:scale-95"
                    >
                         <iconify-icon icon="mdi:download-outline" className="w-5 h-5"></iconify-icon>
                         <span className="text-[10px] uppercase tracking-wider">Export ({scanHistory.length})</span>
                    </button>
                )}
            </div>
        ) : (
            <div className="p-4 md:p-6 bg-white border-t border-gray-100 flex flex-col gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0 z-20">
                <div className="flex gap-3">
                     <button 
                        onClick={exportBulkCSV}
                        className="flex-1 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 py-3.5 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-indigo-100 shadow-sm active:scale-95"
                    >
                        <iconify-icon icon="mdi:file-export-outline" className="w-5 h-5"></iconify-icon>
                        <span className="text-sm">Export CSV {scanHistory.length > 0 ? `(${scanHistory.length + 1})` : ''}</span>
                    </button>
                </div>
                <button 
                    onClick={handleSaveAndNext}
                    className="w-full bg-accent hover:bg-indigo-700 active:bg-indigo-800 text-white py-4 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-accent/20 active:scale-95"
                >
                    <iconify-icon icon="mdi:refresh" className="w-6 h-6"></iconify-icon>
                    <span className="uppercase text-sm tracking-widest">Save & Scan Next</span>
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default OMRScannerModal;
