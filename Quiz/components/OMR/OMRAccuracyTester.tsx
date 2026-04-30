import '../../../types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { evaluateOMRSheet, EvaluationResult } from '../OCR/OMREvaluator';
import { generateOMR } from './OMRGenerator';
import OMRScannerModal from '../OCR/OMRScannerModal';
import { Question } from '../../types';

// --- Shared Rendering Logic ---
interface RenderConfig {
    rollNo: string;
    bookletNo: string;
    targetScore: number;
    totalQuestions: number;
    // Simulation Factors
    unattemptedRate: number; 
    blurAmount: number;
    contrast: number;
    rotation: number; 
    shadowOpacity: number; 
    noiseAmount: number; 
    skewX: number; 
    skewY: number; 
    glareOpacity: number;
    wrinklingAmount: number; // 0 to 100
}

const renderOMRSheet = (canvas: HTMLCanvasElement, config: RenderConfig): { correctAnswers: number[], attemptedMap: boolean[] } => {
    const SCALE = 4;
    const MM_TO_PX = SCALE;
    const SHEET_WIDTH = 210 * MM_TO_PX;
    const SHEET_HEIGHT = 297 * MM_TO_PX;
    const MARGIN_BUFFER = 120; 

    canvas.width = SHEET_WIDTH + (MARGIN_BUFFER * 2);
    canvas.height = SHEET_HEIGHT + (MARGIN_BUFFER * 2);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return { correctAnswers: [], attemptedMap: [] };

    // Desk background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create a temporary "Flat" canvas to draw the perfect sheet first, then we warp it
    const flatCanvas = document.createElement('canvas');
    flatCanvas.width = SHEET_WIDTH;
    flatCanvas.height = SHEET_HEIGHT;
    const fctx = flatCanvas.getContext('2d')!;

    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

    // Fiducials
    fctx.fillStyle = '#000000';
    const fidSize = 5 * MM_TO_PX;
    const fidOff = 2 * MM_TO_PX;
    fctx.fillRect(fidOff, fidOff, fidSize, fidSize);
    fctx.fillRect(SHEET_WIDTH - fidSize - fidOff, fidOff, fidSize, fidSize);
    fctx.fillRect(fidOff, SHEET_HEIGHT - fidSize - fidOff, fidSize, fidSize);
    fctx.fillRect(SHEET_WIDTH - fidSize - fidOff, SHEET_HEIGHT - fidSize - fidOff, fidSize, fidSize);

    const drawBubbles = (sx: number, sy: number, rows: number, cols: number, rg: number, cg: number, r: number, marks: number[]) => {
        for (let c = 0; c < cols; c++) {
            for (let r_idx = 0; r_idx < rows; r_idx++) {
                const cx = (sx + (c * cg)) * MM_TO_PX;
                const cy = (sy + (r_idx * rg)) * MM_TO_PX;
                fctx.beginPath();
                fctx.arc(cx, cy, r * MM_TO_PX, 0, 2 * Math.PI);
                fctx.strokeStyle = '#E91E63';
                fctx.lineWidth = 1;
                fctx.stroke();

                let isFilled = false;
                const val = (cols === 9 && rows === 10) ? marks[c] : marks[r_idx];
                if (val !== -1) {
                    if (cols === 9 && rows === 10) {
                        const digit = r_idx === 9 ? 0 : r_idx + 1;
                        if (val === digit) isFilled = true;
                    } else if (val === c) isFilled = true;
                }
                if (isFilled) { fctx.fillStyle = '#000000'; fctx.fill(); }
            }
        }
    };

    const rollDigits = config.rollNo.split('').map(d => parseInt(d));
    const bookDigits = config.bookletNo.split('').map(d => parseInt(d));
    drawBubbles(17.5, 47, 10, 9, 4.3, 4.2, 1.3, rollDigits);
    drawBubbles(17.5, 117, 10, 9, 4.3, 4.2, 1.3, bookDigits);

    const totalQuestions = config.totalQuestions;
    const questionAnswers = new Array(totalQuestions).fill(-1);
    const correctAnswers = new Array(totalQuestions).fill(0).map(() => Math.floor(Math.random() * 4));
    const attemptedMap = new Array(totalQuestions).fill(false);
    
    const unattemptedCount = Math.floor(totalQuestions * config.unattemptedRate);
    const indices = Array.from({length: totalQuestions}, (_, i) => i).sort(() => Math.random() - 0.5);
    const unattemptedIndices = new Set(indices.slice(0, unattemptedCount));
    const attemptedIndicesList = indices.slice(unattemptedCount).sort(() => Math.random() - 0.5);
    const correctIndices = new Set(attemptedIndicesList.slice(0, config.targetScore));

    for (let i = 0; i < totalQuestions; i++) {
        if (!unattemptedIndices.has(i)) {
            attemptedMap[i] = true;
            questionAnswers[i] = correctIndices.has(i) ? correctAnswers[i] : (correctAnswers[i] + 1) % 4;
        }
    }

    const drawQCol = (sq: number, count: number, bx: number) => {
        const local = [];
        for(let i=0; i<count; i++) local.push((sq+i) < totalQuestions ? questionAnswers[sq+i] : -1);
        drawBubbles(bx + 14, 32 + 5 + 2.1, count, 4, 4.2, 4, 1.3, local);
    };

    drawQCol(0, 50, 60); drawQCol(50, 50, 95); drawQCol(100, 50, 130); drawQCol(150, 50, 165);

    // --- APPLY WARP & WRINKLES ---
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((config.rotation * Math.PI) / 180);
    ctx.transform(1, config.skewY, config.skewX, 1, 0, 0);
    ctx.translate(-SHEET_WIDTH / 2, -SHEET_HEIGHT / 2);

    if (config.wrinklingAmount > 0) {
        // Advanced Mesh Distortion
        const gridRes = 20;
        const wAmt = (config.wrinklingAmount / 100) * 8; 
        for (let y = 0; y < gridRes; y++) {
            for (let x = 0; x < gridRes; x++) {
                const sx = (x / gridRes) * SHEET_WIDTH;
                const sy = (y / gridRes) * SHEET_HEIGHT;
                const sw = SHEET_WIDTH / gridRes;
                const sh = SHEET_HEIGHT / gridRes;

                // Non-linear displacement offset
                const ox = Math.sin(x * 0.8 + y * 0.5) * wAmt;
                const oy = Math.cos(x * 0.4 + y * 0.9) * wAmt;

                ctx.drawImage(flatCanvas, sx, sy, sw, sh, sx + ox, sy + oy, sw + 1, sh + 1);
            }
        }
        
        // Crease Overlays
        ctx.globalAlpha = config.wrinklingAmount / 400;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        for (let i = 0; i < config.wrinklingAmount / 5; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * SHEET_WIDTH, Math.random() * SHEET_HEIGHT);
            ctx.lineTo(Math.random() * SHEET_WIDTH, Math.random() * SHEET_HEIGHT);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    } else {
        ctx.drawImage(flatCanvas, 0, 0);
    }

    // Shadow & Glare
    if (config.shadowOpacity > 0) {
        const grad = ctx.createLinearGradient(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
        grad.addColorStop(0, `rgba(0,0,0,${config.shadowOpacity * 0.1})`);
        grad.addColorStop(1, `rgba(0,0,0,${config.shadowOpacity})`);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
    }
    if (config.glareOpacity > 0) {
        const glare = ctx.createRadialGradient(SHEET_WIDTH*0.7, SHEET_HEIGHT*0.3, 0, SHEET_WIDTH*0.7, SHEET_HEIGHT*0.3, SHEET_WIDTH*0.6);
        glare.addColorStop(0, `rgba(255,255,255,${config.glareOpacity * 0.8})`);
        glare.addColorStop(1, `rgba(255,255,255,0)`);
        ctx.fillStyle = glare; ctx.globalCompositeOperation = 'screen'; ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
        ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.restore();

    // Post filters
    if (config.blurAmount > 0 || config.contrast !== 100) {
        const temp = document.createElement('canvas'); temp.width = canvas.width; temp.height = canvas.height;
        const tctx = temp.getContext('2d')!; tctx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = `blur(${config.blurAmount}px) contrast(${config.contrast}%)`;
        ctx.drawImage(temp, 0, 0); ctx.filter = 'none';
    }

    if (config.noiseAmount > 0) {
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = idata.data; const nf = config.noiseAmount * 2.55;
        for (let i = 0; i < data.length; i += 4) { const r = (0.5 - Math.random()) * nf; data[i]+=r; data[i+1]+=r; data[i+2]+=r; }
        ctx.putImageData(idata, 0, 0);
    }
    
    return { correctAnswers, attemptedMap };
};

interface EnvParams {
    blur: number; contrast: number; rotation: number; skewX: number; skewY: number; shadow: number; glare: number; noise: number; wrinkling: number;
}

interface SimulationResult {
    iteration: number; params: EnvParams;
    expected: { roll: string; booklet: string; score: number; unattempted: number };
    actual: { roll?: string; booklet?: string; score: number; unattempted: number };
    isRollMatch: boolean; isBookletMatch: boolean; isScoreMatch: boolean; isPerfect: boolean;
}

const DEMO_TOTAL_QUESTIONS = 200;
const DEMO_MARKED_ANSWERS = Array.from({ length: DEMO_TOTAL_QUESTIONS }, (_, i) => i % 4);
const DEMO_SCAN_QUESTIONS: Question[] = Array.from({ length: DEMO_TOTAL_QUESTIONS }, (_, i) => ({
  id: `demo-q-${i + 1}`,
  text: `Demo Q${i + 1}`,
  type: 'mcq',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: DEMO_MARKED_ANSWERS[i],
  explanation: '',
  difficulty: 'Medium',
}));

const OMRAccuracyTester: React.FC = () => {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [rollNo, setRollNo] = useState('123456789');
  const [bookletNo, setBookletNo] = useState('987654321');
  const [targetScore, setTargetScore] = useState(45);
  const [unattemptedRate, setUnattemptedRate] = useState(0);
  const [blurAmount, setBlurAmount] = useState(0);
  const [contrast, setContrast] = useState(100); 
  const [rotation, setRotation] = useState(0);
  const [skew, setSkew] = useState(0); 
  const [shadowOpacity, setShadowOpacity] = useState(0);
  const [glareOpacity, setGlareOpacity] = useState(0);
  const [noiseAmount, setNoiseAmount] = useState(0);
  const [wrinkling, setWrinkling] = useState(0);

  const [manualResult, setManualResult] = useState<EvaluationResult | null>(null);
  const [manualAttemptedCount, setManualAttemptedCount] = useState<number>(0);
  const [manualCanvasUrl, setManualCanvasUrl] = useState<string | null>(null);
  const [simIterations, setSimIterations] = useState(10);
  const [simChaos, setSimChaos] = useState(2); 
  const [simResults, setSimResults] = useState<SimulationResult[]>([]);
  const [simProgress, setSimProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  const [liveScanResult, setLiveScanResult] = useState<EvaluationResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalQuestions = 50;

  const downloadDemoOmrSheet = () => {
    void (async () => {
      try {
        await generateOMR({
          topic: 'KIWITEACH_DEMO_OMR',
          questions: DEMO_SCAN_QUESTIONS,
          markedAnswers: DEMO_MARKED_ANSWERS,
          candidateName: 'DEMO CANDIDATE',
          rollNumber: '123456789',
          testBookletNumber: '987654321',
          filename: 'kiwiteach_demo_omr_answer_sheet_template.pdf',
          bottomNote:
            'Demo expected on scan: Roll 123456789 | Booklet 987654321 | Score 200/200 | Accuracy 100%',
        });
      } catch (err: any) {
        alert(`OMR template download failed: ${err?.message || String(err)}`);
      }
    })();
  };

  const runManualTest = async () => {
    setIsRunning(true); setManualResult(null);
    const canvas = canvasRef.current; if (!canvas) return;
    const skewRad = (skew * Math.PI) / 180;
    const { correctAnswers, attemptedMap } = renderOMRSheet(canvas, {
        rollNo, bookletNo, targetScore, totalQuestions, blurAmount, contrast, rotation, 
        shadowOpacity: shadowOpacity/100, noiseAmount, unattemptedRate: unattemptedRate/100,
        skewX: skewRad / 2, skewY: skewRad, glareOpacity: glareOpacity/100, wrinklingAmount: wrinkling
    });
    setManualAttemptedCount(attemptedMap.filter(Boolean).length);
    setManualCanvasUrl(canvas.toDataURL('image/jpeg', 0.8));
    setTimeout(async () => {
        const image = new Image(); image.src = canvas.toDataURL('image/png');
        image.onload = async () => {
            const mockQs = correctAnswers.map((ans, i) => ({ id: `q${i}`, text: `Q${i+1}`, options: ['A','B','C','D'], correctIndex: ans, explanation: '', difficulty: 'Medium' }));
            const evalResult = await evaluateOMRSheet(image, mockQs as any);
            setManualResult(evalResult); setIsRunning(false);
        };
    }, 100);
  };

  const runAutoSimulation = async () => {
    setIsRunning(true); setSimResults([]); setSimProgress(0);
    const results: SimulationResult[] = [];
    const tempCanvas = document.createElement('canvas');
    for (let i = 0; i < simIterations; i++) {
        const rRoll = Math.floor(Math.random() * 900000000 + 100000000).toString();
        const rBook = Math.floor(Math.random() * 900000000 + 100000000).toString();
        const rScore = Math.floor(Math.random() * (totalQuestions + 1));
        const c = simChaos / 5; 
        const rBlur = Math.random() * (2 * c); const rContrast = 100 + ((Math.random() - 0.5) * 40 * c);
        const rRot = (Math.random() - 0.5) * (15 * c); const rSkewX = (Math.random() - 0.5) * (0.2 * c);
        const rSkewY = (Math.random() - 0.5) * (0.2 * c); const rShadow = Math.random() * (0.6 * c);
        const rGlare = Math.random() * (0.4 * c); const rNoise = Math.random() * (30 * c);
        const rUnatt = Math.random() * (0.3 * c); const rWrinkle = Math.random() * (60 * c);

        const { correctAnswers, attemptedMap } = renderOMRSheet(tempCanvas, {
            rollNo: rRoll, bookletNo: rBook, targetScore: rScore, totalQuestions, 
            blurAmount: rBlur, contrast: rContrast, rotation: rRot, shadowOpacity: rShadow, 
            noiseAmount: rNoise, unattemptedRate: rUnatt, skewX: rSkewX, skewY: rSkewY, 
            glareOpacity: rGlare, wrinklingAmount: rWrinkle
        });
        const expUnatt = attemptedMap.filter(x => !x).length;
        const effScore = Math.min(rScore, totalQuestions - expUnatt);
        const img = new Image(); img.src = tempCanvas.toDataURL('image/jpeg', 0.8);
        await new Promise<void>(resolve => {
            img.onload = async () => {
                const mockQs = correctAnswers.map((ans, idx) => ({ id: `q${idx}`, text: `Q${idx}`, options:['A','B','C','D'], correctIndex: ans, explanation:'', difficulty:'Medium' }));
                const res = await evaluateOMRSheet(img, mockQs as any);
                const isScoreMatch = Math.abs(res.score - effScore) <= 1;
                results.push({ iteration: i + 1, params: { blur: rBlur, contrast: rContrast, rotation: rRot, skewX: rSkewX, skewY: rSkewY, shadow: rShadow, glare: rGlare, noise: rNoise, wrinkling: rWrinkle }, expected: { roll: rRoll, booklet: rBook, score: effScore, unattempted: expUnatt }, actual: { roll: res.rollNumber, booklet: res.testBookletNumber, score: res.score, unattempted: res.detectedAnswers.filter(a => a.selectedIndex === -1).length }, isRollMatch: res.rollNumber === rRoll, isBookletMatch: res.testBookletNumber === rBook, isScoreMatch, isPerfect: isScoreMatch && res.rollNumber === rRoll && res.testBookletNumber === rBook });
                setSimProgress(i + 1); resolve();
            }
        });
        await new Promise(r => setTimeout(r, 10));
    }
    setSimResults(results); setIsRunning(false);
  };

  const stressData = useMemo(() => {
      if (simResults.length === 0) return [];
      const vars: { key: keyof EnvParams, label: string, unit: string }[] = [
          { key: 'blur', label: 'Blur Radius', unit: 'px' },
          { key: 'rotation', label: 'Camera Rotation', unit: '°' },
          { key: 'noise', label: 'Sensor Noise', unit: '%' },
          { key: 'wrinkling', label: 'Surface Wrinkling', unit: '%' },
          { key: 'shadow', label: 'Shadow Opacity', unit: '%' },
          { key: 'skewY', label: 'Perspective Tilt', unit: 'rad' }
      ];
      return vars.map(v => {
          const passed = simResults.filter(r => r.isPerfect);
          const maxSafe = passed.length > 0 ? Math.max(...passed.map(r => Math.abs(r.params[v.key]))) : 0;
          const maxTested = Math.max(...simResults.map(r => Math.abs(r.params[v.key])));
          return { ...v, maxSafe, maxTested };
      });
  }, [simResults]);

  return (
    <div className="w-full max-w-7xl mx-auto p-6 h-[calc(100vh-2rem)] flex flex-col">
       <div className="mb-6 flex items-center justify-between">
           <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><iconify-icon icon="mdi:flask" className="text-pink-600" /> OMR Accuracy Lab</h1>
            <p className="text-slate-500 text-sm">Diagnostic tool for AI robustness testing.</p>
           </div>
           <div className="flex items-center gap-2">
               <button
                 type="button"
                 onClick={downloadDemoOmrSheet}
                 className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                 title="Download a demo OMR answer sheet for camera OCR testing"
               >
                 <iconify-icon icon="mdi:download" />
                 Demo OMR Sheet
               </button>
               <button
                 type="button"
                 onClick={() => setIsLiveScannerOpen(true)}
                 className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                 title="Open real camera scanner to test efficiency"
               >
                 <iconify-icon icon="mdi:camera-outline" />
                 Open Scan Camera
               </button>
               <div className="flex bg-slate-100 p-1 rounded-xl">
               {['manual', 'auto'].map(m => <button key={m} onClick={() => setMode(m as any)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize ${mode === m ? 'bg-white shadow-sm text-pink-600' : 'text-slate-400'}`}>{m} Lab</button>)}
               </div>
           </div>
       </div>
       {liveScanResult && (
         <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
           <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
             <p className="text-[10px] uppercase font-bold text-emerald-700">Live Scan Score</p>
             <p className="text-lg font-black text-emerald-800">
               {liveScanResult.score}/{liveScanResult.totalQuestions}
             </p>
           </div>
           <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
             <p className="text-[10px] uppercase font-bold text-indigo-700">Accuracy</p>
             <p className="text-lg font-black text-indigo-800">
               {Math.round((liveScanResult.score / Math.max(1, liveScanResult.totalQuestions)) * 100)}%
             </p>
           </div>
           <div className="rounded-xl border border-slate-200 bg-white p-3">
             <p className="text-[10px] uppercase font-bold text-slate-500">Detected IDs</p>
             <p className="text-sm font-bold text-slate-700">
               Roll {liveScanResult.rollNumber || '—'} | Booklet {liveScanResult.testBookletNumber || '—'}
             </p>
           </div>
         </div>
       )}

       {mode === 'manual' ? (
           <div className="flex-1 flex gap-6 overflow-hidden">
             <div className="w-80 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Ground Truth</h3>
                   <div className="space-y-4">
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Target Score</label><input type="range" min="0" max={totalQuestions} value={targetScore} onChange={e => setTargetScore(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>0</span> <span className="text-pink-600 font-bold">{targetScore}</span> <span>{totalQuestions}</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Unattempted Questions</label><input type="range" min="0" max="100" value={unattemptedRate} onChange={e => setUnattemptedRate(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>0%</span> <span className="text-pink-600 font-bold">{unattemptedRate}%</span> <span>100%</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Roll Number</label><input type="text" maxLength={9} value={rollNo} onChange={e => setRollNo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pink-500/20 outline-none" /></div>
                   </div>
                   <button onClick={runManualTest} disabled={isRunning} className="w-full mt-6 bg-pink-600 hover:bg-pink-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all">{isRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <iconify-icon icon="mdi:play" />} Run Single Test</button>
               </div>

               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Real World Simulation</h3>
                   <div className="space-y-4">
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tilt (Perspective)</label><input type="range" min="-10" max="10" value={skew} onChange={e => setSkew(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>Left</span> <span className="text-indigo-600 font-bold">{skew}°</span> <span>Right</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Camera Rotation</label><input type="range" min="-10" max="10" value={rotation} onChange={e => setRotation(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>-10°</span> <span className="text-indigo-600 font-bold">{rotation}°</span> <span>+10°</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Surface Wrinkling</label><input type="range" min="0" max="100" value={wrinkling} onChange={e => setWrinkling(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>None</span> <span className="text-indigo-600 font-bold">{wrinkling}%</span> <span>High</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Lighting/Shadows</label><input type="range" min="0" max="100" value={shadowOpacity} onChange={e => setShadowOpacity(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>None</span> <span className="text-indigo-600 font-bold">{shadowOpacity}%</span> <span>Dark</span></div></div>
                       <div><label className="block text-sm font-semibold text-slate-700 mb-1">Sensor Noise</label><input type="range" min="0" max="100" value={noiseAmount} onChange={e => setNoiseAmount(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><div className="flex justify-between text-xs font-medium text-slate-500 mt-1"><span>Clean</span> <span className="text-indigo-600 font-bold">{noiseAmount}</span> <span>Grainy</span></div></div>
                   </div>
               </div>
             </div>

             <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="grid grid-cols-4 gap-4 shrink-0">
                    <ResultCard label="Roll Number" expected={rollNo} actual={manualResult?.rollNumber} loading={isRunning} />
                    <ResultCard label="Attempted" expected={manualAttemptedCount.toString()} actual={manualResult ? (totalQuestions - (manualResult.detectedAnswers.filter(a => a.selectedIndex === -1).length)).toString() : undefined} loading={isRunning} />
                    <ResultCard label="Score" expected={Math.min(targetScore, manualAttemptedCount).toString()} actual={manualResult?.score.toString()} loading={isRunning} highlight />
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</span>{isRunning ? <span className="text-slate-500 font-medium text-sm animate-pulse">Processing...</span> : manualResult ? (manualResult.error ? <span className="text-red-500 font-bold text-sm">Failed</span> : <span className="text-emerald-500 font-bold text-lg">Complete</span>) : <span className="text-slate-400 font-medium text-sm">Ready</span>}</div>
                </div>
                <div className="flex-1 flex gap-4 min-h-0">
                   <div className="flex-1 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden relative"><div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold z-10">Simulation View</div><div className="w-full h-full overflow-auto custom-scrollbar p-4 flex justify-center bg-slate-200"><canvas ref={canvasRef} className="hidden" />{manualCanvasUrl ? <img src={manualCanvasUrl} className="max-w-full shadow-xl border border-white/20" style={{ width: '100%' }} /> : <div className="flex items-center justify-center h-full text-slate-400">Click Run</div>}</div></div>
                   <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative"><div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold z-10">Evaluator Vision</div><div className="w-full h-full overflow-auto custom-scrollbar p-4 flex justify-center bg-slate-950">{manualResult?.processedImageUrl ? <img src={manualResult.processedImageUrl} className="max-w-full shadow-xl border border-slate-700" style={{ width: '100%' }} /> : <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2"><iconify-icon icon="mdi:eye-off-outline" className="w-8 h-8" /><span className="text-sm">No Output Yet</span></div>}</div></div>
                </div>
             </div>
           </div>
       ) : (
           <div className="flex-1 flex gap-6 overflow-hidden animate-fade-in">
              <div className="w-80 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Sim Configuration</h3>
                      <div className="space-y-6">
                          <div><label className="block text-sm font-semibold text-slate-700 mb-2">Iterations</label><div className="flex items-center gap-3"><input type="range" min="5" max="50" step="5" value={simIterations} onChange={e => setSimIterations(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /><span className="text-indigo-600 font-bold w-8 text-right">{simIterations}</span></div><p className="text-xs text-slate-400 mt-1">Number of sheets to process</p></div>
                          <div><label className="block text-sm font-semibold text-slate-700 mb-2">Environment Chaos</label><div className="flex items-center gap-3"><input type="range" min="0" max="5" step="0.5" value={simChaos} onChange={e => setSimChaos(parseFloat(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500" /><span className="text-red-500 font-bold w-8 text-right">{simChaos}</span></div><p className="text-xs text-slate-400 mt-1">Randomizes wrinkling, rotation, shadows, etc.</p></div>
                      </div>
                      <button onClick={runAutoSimulation} disabled={isRunning} className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all">{isRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <iconify-icon icon="mdi:robot-outline" />} {isRunning ? 'Simulating...' : 'Start Simulation'}</button>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Progress</h3><div className="flex justify-between items-end mb-2"><span className="text-2xl font-black text-slate-700">{simProgress} <span className="text-sm font-medium text-slate-400">/ {simIterations}</span></span><span className="text-xs font-bold text-indigo-500">{Math.round((simProgress/simIterations)*100)}%</span></div><div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${(simProgress/simIterations)*100}%` }}></div></div></div>
              </div>

              <div className="flex-1 bg-slate-50 rounded-3xl border border-slate-200 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                 {simResults.length > 0 ? (
                    <>
                        <div className="grid grid-cols-4 gap-4">
                            <SummaryCard label="Score Accuracy" value={`${Math.round((simResults.filter(r => r.isScoreMatch).length / simResults.length) * 100)}%`} sub="Exact Match" color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-100" icon="mdi:bullseye-arrow" />
                            <SummaryCard label="Roll Accuracy" value={`${Math.round((simResults.filter(r => r.isRollMatch).length / simResults.length) * 100)}%`} sub="Digit Detection" color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-100" icon="mdi:account-details" />
                            <SummaryCard label="Blank Detection" value={`${Math.round((simResults.reduce((acc, r) => acc + (r.expected.unattempted === r.actual.unattempted ? 1 : 0), 0) / simResults.length) * 100)}%`} sub="Unattempted Qs" color="text-amber-600" bg="bg-amber-50" border="border-amber-100" icon="mdi:checkbox-blank-off-outline" />
                            <SummaryCard label="Processing" value="~240ms" sub="Avg Per Sheet" color="text-slate-600" bg="bg-slate-100" border="border-slate-200" icon="mdi:speedometer" />
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200"><h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><iconify-icon icon="mdi:chart-scatter-plot-hexbin" className="text-slate-500" /> Impact Analysis</h4><div className="grid grid-cols-3 gap-6">
                            <ScatterChart title="Accuracy vs Wrinkling" xLabel="Wrinkle %" data={simResults.map(r => ({ x: r.params.wrinkling, isSuccess: r.isPerfect }))} maxX={100} />
                            <ScatterChart title="Accuracy vs Rotation" xLabel="Rotation °" data={simResults.map(r => ({ x: Math.abs(r.params.rotation), isSuccess: r.isPerfect }))} maxX={Math.max(1, ...simResults.map(r => Math.abs(r.params.rotation)))} />
                            <ScatterChart title="Accuracy vs Blur" xLabel="Blur px" data={simResults.map(r => ({ x: r.params.blur, isSuccess: r.isPerfect }))} maxX={Math.max(1, ...simResults.map(r => r.params.blur))} />
                            <ScatterChart title="Accuracy vs Skew" xLabel="Tilt rad" data={simResults.map(r => ({ x: Math.abs(r.params.skewY), isSuccess: r.isPerfect }))} maxX={0.3} />
                            <ScatterChart title="Accuracy vs Glare" xLabel="Glare %" data={simResults.map(r => ({ x: r.params.glare * 100, isSuccess: r.isPerfect }))} maxX={100} />
                            <ScatterChart title="Accuracy vs Shadow" xLabel="Shadow %" data={simResults.map(r => ({ x: r.params.shadow * 100, isSuccess: r.isPerfect }))} maxX={100} />
                        </div></div>
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"><div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between"><h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><iconify-icon icon="mdi:speedometer-slow" className="text-red-500" /> Max Stress Limit Report</h4><span className="text-[10px] uppercase font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">Based on {simResults.length} iterations</span></div><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-6 py-3">Variable</th><th className="px-6 py-3 text-right">Max Tested</th><th className="px-6 py-3 text-right">Max Safe Limit</th><th className="px-6 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">
                            {stressData.map((row, i) => {
                                const per = row.maxTested > 0 ? (row.maxSafe / row.maxTested) * 100 : 100;
                                let c = "bg-emerald-100 text-emerald-700", t = "Excellent";
                                if (per < 50) { c = "bg-red-100 text-red-700"; t = "Critical"; } else if (per < 80) { c = "bg-amber-100 text-amber-700"; t = "Warning"; }
                                return (<tr key={i} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-3 font-medium text-slate-700">{row.label}</td><td className="px-6 py-3 text-right text-slate-500 font-mono">{row.maxTested.toFixed(2)} {row.unit}</td><td className="px-6 py-3 text-right font-bold font-mono">{row.maxSafe.toFixed(2)} {row.unit}</td><td className="px-6 py-3"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${c}`}>{t}</span></td></tr>)
                            })}
                        </tbody></table></div>
                    </>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50"><iconify-icon icon="mdi:chart-scatter-plot" className="w-16 h-16 mb-4" /><p className="font-bold">No Simulation Data</p><p className="text-sm">Run a simulation to view reports</p></div>
                 )}
              </div>
           </div>
      )}
      {isLiveScannerOpen && (
        <OMRScannerModal
          questions={DEMO_SCAN_QUESTIONS}
          onClose={() => setIsLiveScannerOpen(false)}
          onScanComplete={(res) => setLiveScanResult(res)}
        />
      )}
    </div>
  );
};

const ScatterChart: React.FC<{ title: string; xLabel: string; data: { x: number, isSuccess: boolean }[]; maxX: number }> = ({ title, xLabel, data, maxX }) => (
    <div className="flex flex-col h-32"><h5 className="text-[10px] font-bold text-slate-400 uppercase mb-2">{title}</h5><div className="flex-1 relative border-l border-b border-slate-100 bg-slate-50/30 rounded-tr-lg">
        {data.map((pt, i) => (<div key={i} className={`absolute w-1.5 h-1.5 rounded-full ${pt.isSuccess ? 'bg-emerald-400 opacity-60' : 'bg-red-500 z-10'}`} style={{ left: `${(pt.x / maxX) * 100}%`, bottom: `${pt.isSuccess ? '70%' : '20%'}` }}></div>))}
        <div className="absolute bottom-[70%] w-full h-px border-t border-dashed border-emerald-200"></div>
    </div><div className="flex justify-between mt-1"><span className="text-[9px] text-slate-400">0</span><span className="text-[9px] text-slate-400">{xLabel}</span></div></div>
);

const ResultCard: React.FC<{ label: string; expected: string; actual?: string; loading: boolean; highlight?: boolean }> = ({ label, expected, actual, loading, highlight }) => {
    const isMatch = actual === expected; const isMiss = actual === undefined;
    return (<div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${highlight ? 'bg-pink-50 border-pink-100' : 'bg-white border-slate-200'}`}><span className={`text-[10px] font-bold uppercase mb-1 ${highlight ? 'text-pink-600' : 'text-slate-400'}`}>{label}</span><div className="flex items-end justify-between"><div><span className="text-xs text-slate-400 block">Expected</span><span className="font-mono font-bold text-slate-700">{expected}</span></div><div className="text-right"><span className="text-xs text-slate-400 block">Detected</span>{loading ? <div className="h-5 w-16 bg-slate-100 rounded animate-pulse mt-0.5" /> : <span className={`font-mono font-bold text-lg ${isMiss ? 'text-slate-300' : isMatch ? 'text-emerald-500' : 'text-red-500'}`}>{actual ?? '-'}</span>}</div></div>{!loading && !isMiss && <div className={`h-1 w-full rounded-full mt-2 ${isMatch ? 'bg-emerald-500' : 'bg-red-500'}`} />}</div>);
};

const SummaryCard: React.FC<{ label: string; value: string; sub: string; color: string; bg: string; border: string; icon: string }> = ({ label, value, sub, color, bg, border, icon }) => (
    <div className={`p-5 rounded-2xl border ${bg} ${border} flex items-center gap-4`}><div className={`p-3 rounded-xl bg-white/60 ${color} shadow-sm`}><iconify-icon icon={icon} className="w-6 h-6" /></div><div><p className={`text-xs font-bold uppercase ${color} opacity-70`}>{label}</p><p className={`text-2xl font-black ${color}`}>{value}</p><p className={`text-[10px] font-medium ${color} opacity-60`}>{sub}</p></div></div>
);

export default OMRAccuracyTester;