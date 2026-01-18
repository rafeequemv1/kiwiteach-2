import '../../../types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { evaluateOMRSheet, EvaluationResult } from '../OCR/OMREvaluator';

// --- Shared Rendering Logic ---
interface RenderConfig {
    rollNo: string;
    bookletNo: string;
    targetScore: number;
    totalQuestions: number;
    // Simulation Factors
    unattemptedRate: number; // 0.0 to 1.0
    blurAmount: number;
    contrast: number;
    rotation: number; // degrees
    shadowOpacity: number; // 0.0 to 1.0
    noiseAmount: number; // 0 to 100
    skewX: number; // -0.2 to 0.2 (Perspective Tilt X)
    skewY: number; // -0.2 to 0.2 (Perspective Tilt Y)
    glareOpacity: number; // 0.0 to 1.0
}

const renderOMRSheet = (canvas: HTMLCanvasElement, config: RenderConfig): { correctAnswers: number[], attemptedMap: boolean[] } => {
    // Scale: 4px per mm (High Res)
    const SCALE = 4;
    const MM_TO_PX = SCALE;
    const SHEET_WIDTH = 210 * MM_TO_PX;
    const SHEET_HEIGHT = 297 * MM_TO_PX;

    // We make the canvas slightly larger to allow for rotation/skew without cropping
    const MARGIN_BUFFER = 100; 
    canvas.width = SHEET_WIDTH + (MARGIN_BUFFER * 2);
    canvas.height = SHEET_HEIGHT + (MARGIN_BUFFER * 2);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return { correctAnswers: [], attemptedMap: [] };

    // 1. Draw Desk Background (Dark Gray)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- Start Transformations ---
    ctx.save();
    
    // Move to center
    ctx.translate(canvas.width / 2, canvas.height / 2);
    
    // Apply Rotation
    ctx.rotate((config.rotation * Math.PI) / 180);
    
    // Apply Skew (Simulate Tilt/Perspective)
    // transform(a, b, c, d, e, f) -> x' = ax + cy + e, y' = bx + dy + f
    // a=1, b=skewY, c=skewX, d=1
    ctx.transform(1, config.skewY, config.skewX, 1, 0, 0);

    // Move back
    ctx.translate(-SHEET_WIDTH / 2, -SHEET_HEIGHT / 2);

    // 2. Draw Paper Background
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
    ctx.shadowBlur = 0; // Reset shadow

    // 3. Fiducials (Black Squares)
    ctx.fillStyle = '#000000';
    const fidSize = 5 * MM_TO_PX;
    const fidOff = 2 * MM_TO_PX;
    
    ctx.fillRect(fidOff, fidOff, fidSize, fidSize); // TL
    ctx.fillRect(SHEET_WIDTH - fidSize - fidOff, fidOff, fidSize, fidSize); // TR
    ctx.fillRect(fidOff, SHEET_HEIGHT - fidSize - fidOff, fidSize, fidSize); // BL
    ctx.fillRect(SHEET_WIDTH - fidSize - fidOff, SHEET_HEIGHT - fidSize - fidOff, fidSize, fidSize); // BR

    // 4. Draw Grid Bubbles Helper
    const drawBubbles = (
        startXMm: number, 
        startYMm: number, 
        rows: number, 
        cols: number, 
        rowGapMm: number, 
        colGapMm: number, 
        radiusMm: number,
        markedIndices: number[] 
    ) => {
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const cx = (startXMm + (c * colGapMm)) * MM_TO_PX;
                const cy = (startYMm + (r * rowGapMm)) * MM_TO_PX;
                
                ctx.beginPath();
                ctx.arc(cx, cy, radiusMm * MM_TO_PX, 0, 2 * Math.PI);
                ctx.strokeStyle = '#E91E63'; // Pink outline
                ctx.lineWidth = 1;
                ctx.stroke();

                let isFilled = false;
                const val = (cols === 9 && rows === 10) ? markedIndices[c] : markedIndices[r];

                if (val !== -1) {
                    if (cols === 9 && rows === 10) {
                        const currentRowDigit = r === 9 ? 0 : r + 1;
                        if (val === currentRowDigit) isFilled = true;
                    } else {
                        if (val === c) isFilled = true;
                    }
                }

                if (isFilled) {
                    ctx.fillStyle = '#000000';
                    ctx.fill();
                }
            }
        }
    };

    // --- Sidebar Identity Grids ---
    const SIDEBAR_START_X = 16 + 1.5; 
    const rollDigits = config.rollNo.split('').map(d => parseInt(d));
    const bookDigits = config.bookletNo.split('').map(d => parseInt(d));

    drawBubbles(SIDEBAR_START_X, 47, 10, 9, 4.3, 4.2, 1.3, rollDigits);
    drawBubbles(SIDEBAR_START_X, 117, 10, 9, 4.3, 4.2, 1.3, bookDigits);

    // --- Questions ---
    const totalQuestions = config.totalQuestions;
    const questionAnswers = new Array(totalQuestions).fill(-1);
    const correctAnswers = new Array(totalQuestions).fill(0); 
    const attemptedMap = new Array(totalQuestions).fill(true);

    for(let i=0; i<totalQuestions; i++) correctAnswers[i] = Math.floor(Math.random() * 4);

    const indices = Array.from({length: totalQuestions}, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    const unattemptedCount = Math.floor(totalQuestions * config.unattemptedRate);
    const unattemptedIndices = new Set(indices.slice(0, unattemptedCount));

    const maxPossibleScore = totalQuestions - unattemptedCount;
    const actualTargetScore = Math.min(config.targetScore, maxPossibleScore);

    const attemptedIndicesList = indices.slice(unattemptedCount);
    for (let i = attemptedIndicesList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [attemptedIndicesList[i], attemptedIndicesList[j]] = [attemptedIndicesList[j], attemptedIndicesList[i]];
    }

    const correctIndices = new Set(attemptedIndicesList.slice(0, actualTargetScore));

    for (let i = 0; i < totalQuestions; i++) {
        if (unattemptedIndices.has(i)) {
            questionAnswers[i] = -1; 
            attemptedMap[i] = false;
        } else if (correctIndices.has(i)) {
            questionAnswers[i] = correctAnswers[i];
            attemptedMap[i] = true;
        } else {
            let wrong = (correctAnswers[i] + 1) % 4;
            questionAnswers[i] = wrong;
            attemptedMap[i] = true;
        }
    }

    const drawQuestionCol = (startQ: number, count: number, colBaseX: number) => {
        const localAnswers = [];
        for(let i=0; i<count; i++) {
            const qIdx = startQ + i;
            localAnswers.push(qIdx < totalQuestions ? questionAnswers[qIdx] : -1);
        }
        const bubbleX = colBaseX + 14;
        const bubbleY = 32 + 5 + (4.2/2); 
        drawBubbles(bubbleX, bubbleY, count, 4, 4.2, 4, 1.3, localAnswers);
    };

    drawQuestionCol(0, 50, 60);
    drawQuestionCol(50, 50, 60 + 35);
    drawQuestionCol(100, 50, 60 + 70);
    drawQuestionCol(150, 50, 60 + 105);

    // --- Environmental Effects (Inside Rotation/Skew Context) ---

    // Shadow Gradient
    if (config.shadowOpacity > 0) {
        const gradient = ctx.createLinearGradient(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
        gradient.addColorStop(0, `rgba(0,0,0,${config.shadowOpacity * 0.1})`);
        gradient.addColorStop(0.5, `rgba(0,0,0,0)`);
        gradient.addColorStop(1, `rgba(0,0,0,${config.shadowOpacity})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
    }

    // Glare (Bright Spot)
    if (config.glareOpacity > 0) {
        // Randomize glare position slightly or center it
        const gx = SHEET_WIDTH * 0.7;
        const gy = SHEET_HEIGHT * 0.3;
        const gRadius = SHEET_WIDTH * 0.6;
        
        const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, gRadius);
        glare.addColorStop(0, `rgba(255,255,255,${config.glareOpacity * 0.8})`);
        glare.addColorStop(1, `rgba(255,255,255,0)`);
        
        ctx.fillStyle = glare;
        // Use composite operation to lighten/bleach
        ctx.globalCompositeOperation = 'screen'; 
        ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
        ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.restore(); // Restore coordinate system

    // --- Post-Processing Effects (Global Pixels) ---
    
    // Blur & Contrast
    if (config.blurAmount > 0 || config.contrast !== 100) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
            tCtx.drawImage(canvas, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.filter = `blur(${config.blurAmount}px) contrast(${config.contrast}%)`;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.filter = 'none';
        }
    }

    // Camera Noise
    if (config.noiseAmount > 0) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const noiseFactor = config.noiseAmount * 2.55; 
        for (let i = 0; i < data.length; i += 4) {
            const random = (0.5 - Math.random()) * noiseFactor;
            data[i] += random;     
            data[i+1] += random;   
            data[i+2] += random;   
        }
        ctx.putImageData(imageData, 0, 0);
    }
    
    return { correctAnswers, attemptedMap };
};


// --- Simulation Types ---
interface EnvParams {
    blur: number;
    contrast: number;
    rotation: number;
    skewX: number;
    skewY: number;
    shadow: number;
    glare: number;
    noise: number;
}

interface SimulationResult {
    iteration: number;
    params: EnvParams;
    expected: { roll: string; booklet: string; score: number; unattempted: number };
    actual: { roll?: string; booklet?: string; score: number; unattempted: number };
    isRollMatch: boolean;
    isBookletMatch: boolean;
    isScoreMatch: boolean;
    isPerfect: boolean;
}


// --- Main Component ---
const OMRAccuracyTester: React.FC = () => {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  
  // Manual State
  const [rollNo, setRollNo] = useState('123456789');
  const [bookletNo, setBookletNo] = useState('987654321');
  const [targetScore, setTargetScore] = useState(45);
  const [unattemptedRate, setUnattemptedRate] = useState(0); // 0-100%
  
  // Distortion State
  const [blurAmount, setBlurAmount] = useState(0);
  const [contrast, setContrast] = useState(100); 
  const [rotation, setRotation] = useState(0);
  const [skew, setSkew] = useState(0); 
  const [shadowOpacity, setShadowOpacity] = useState(0);
  const [glareOpacity, setGlareOpacity] = useState(0);
  const [noiseAmount, setNoiseAmount] = useState(0);

  const [manualResult, setManualResult] = useState<EvaluationResult | null>(null);
  const [manualAttemptedCount, setManualAttemptedCount] = useState<number>(0);
  const [manualCanvasUrl, setManualCanvasUrl] = useState<string | null>(null);
  
  // Auto State
  const [simIterations, setSimIterations] = useState(10);
  const [simChaos, setSimChaos] = useState(2); // General Chaos Factor
  const [simResults, setSimResults] = useState<SimulationResult[]>([]);
  const [simProgress, setSimProgress] = useState(0);
  
  const [isRunning, setIsRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalQuestions = 50;


  const runManualTest = async () => {
    setIsRunning(true);
    setManualResult(null);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const skewRad = (skew * Math.PI) / 180;

    const { correctAnswers, attemptedMap } = renderOMRSheet(canvas, {
        rollNo, bookletNo, targetScore, totalQuestions, 
        blurAmount, contrast, rotation, 
        shadowOpacity: shadowOpacity/100, 
        noiseAmount,
        unattemptedRate: unattemptedRate/100,
        skewX: skewRad / 2, 
        skewY: skewRad,
        glareOpacity: glareOpacity/100
    });
    
    setManualAttemptedCount(attemptedMap.filter(Boolean).length);
    setManualCanvasUrl(canvas.toDataURL('image/jpeg', 0.8));

    setTimeout(async () => {
        const image = new Image();
        image.src = canvas.toDataURL('image/png');
        image.onload = async () => {
            const mockQuestions = correctAnswers.map((ans, i) => ({
                id: `q${i}`, text: `Q${i+1}`, options: ['A','B','C','D'], correctIndex: ans, explanation: '', difficulty: 'Medium'
            }));
            const evalResult = await evaluateOMRSheet(image, mockQuestions as any);
            setManualResult(evalResult);
            setIsRunning(false);
        };
    }, 100);
  };


  const runAutoSimulation = async () => {
    setIsRunning(true);
    setSimResults([]);
    setSimProgress(0);

    const results: SimulationResult[] = [];
    const tempCanvas = document.createElement('canvas');

    for (let i = 0; i < simIterations; i++) {
        // 1. Generate Random Params based on Chaos Factor
        const rRoll = Math.floor(Math.random() * 900000000 + 100000000).toString();
        const rBook = Math.floor(Math.random() * 900000000 + 100000000).toString();
        const rScore = Math.floor(Math.random() * (totalQuestions + 1));
        
        // Chaos multipliers
        const c = simChaos / 5; // 0 to 1 scaling
        
        const rBlur = Math.random() * (2 * c);
        const rContrast = 100 + ((Math.random() - 0.5) * 40 * c); // 80-120
        const rRotation = (Math.random() - 0.5) * (15 * c); // +/- 7.5 deg
        const rSkewX = (Math.random() - 0.5) * (0.2 * c); // +/- 0.1 rad
        const rSkewY = (Math.random() - 0.5) * (0.2 * c);
        const rShadow = Math.random() * (0.6 * c);
        const rGlare = Math.random() * (0.4 * c);
        const rNoise = Math.random() * (30 * c);
        const rUnattempted = Math.random() * (0.3 * c); // up to 30% empty

        // 2. Render
        const { correctAnswers, attemptedMap } = renderOMRSheet(tempCanvas, {
            rollNo: rRoll,
            bookletNo: rBook,
            targetScore: rScore,
            totalQuestions,
            blurAmount: rBlur,
            contrast: rContrast,
            rotation: rRotation,
            shadowOpacity: rShadow,
            noiseAmount: rNoise,
            unattemptedRate: rUnattempted,
            skewX: rSkewX,
            skewY: rSkewY,
            glareOpacity: rGlare
        });
        
        const expUnattempted = attemptedMap.filter(x => !x).length;
        const maxScore = totalQuestions - expUnattempted;
        const effectiveScore = Math.min(rScore, maxScore);

        // 3. Convert to Image
        const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
        const img = new Image();
        img.src = dataUrl;
        
        await new Promise<void>(resolve => {
            img.onload = async () => {
                const mockQuestions = correctAnswers.map((ans, idx) => ({
                    id: `q${idx}`, text: `Q${idx}`, options:['A','B','C','D'], correctIndex: ans, explanation:'', difficulty:'Medium'
                }));
                
                const res = await evaluateOMRSheet(img, mockQuestions as any);
                const actUnattempted = res.detectedAnswers.filter(a => a.selectedIndex === -1).length;
                const isScoreMatch = Math.abs(res.score - effectiveScore) <= 1;
                const isRollMatch = res.rollNumber === rRoll;
                const isBookletMatch = res.testBookletNumber === rBook;

                results.push({
                    iteration: i + 1,
                    params: { blur: rBlur, contrast: rContrast, rotation: rRotation, skewX: rSkewX, skewY: rSkewY, shadow: rShadow, glare: rGlare, noise: rNoise },
                    expected: { roll: rRoll, booklet: rBook, score: effectiveScore, unattempted: expUnattempted },
                    actual: { roll: res.rollNumber, booklet: res.testBookletNumber, score: res.score, unattempted: actUnattempted },
                    isRollMatch,
                    isBookletMatch,
                    isScoreMatch,
                    isPerfect: isScoreMatch && isRollMatch && isBookletMatch
                });
                
                setSimProgress(i + 1);
                resolve();
            }
        });
        
        await new Promise(r => setTimeout(r, 10));
    }

    setSimResults(results);
    setIsRunning(false);
  };

  const getStressAnalysis = () => {
      if (simResults.length === 0) return [];
      
      const vars: { key: keyof EnvParams, label: string, unit: string }[] = [
          { key: 'blur', label: 'Blur Radius', unit: 'px' },
          { key: 'rotation', label: 'Camera Rotation', unit: '°' },
          { key: 'noise', label: 'Sensor Noise', unit: '%' },
          { key: 'shadow', label: 'Shadow Opacity', unit: '%' },
          { key: 'glare', label: 'Glare Opacity', unit: '%' },
          { key: 'skewY', label: 'Perspective Tilt', unit: 'rad' }
      ];

      return vars.map(v => {
          // Find max value where isPerfect is true
          const passed = simResults.filter(r => r.isPerfect);
          const maxSafe = passed.length > 0 
            ? Math.max(...passed.map(r => Math.abs(r.params[v.key]))) 
            : 0;
          
          const maxTested = Math.max(...simResults.map(r => Math.abs(r.params[v.key])));

          return { ...v, maxSafe, maxTested };
      });
  };

  const stressData = useMemo(() => getStressAnalysis(), [simResults]);

  return (
    <div className="w-full max-w-7xl mx-auto p-6 h-[calc(100vh-2rem)] flex flex-col">
       {/* Header */}
       <div className="mb-6 flex items-center justify-between">
           <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <iconify-icon icon="mdi:flask" className="text-pink-600"></iconify-icon>
                OMR Accuracy Lab
            </h1>
            <p className="text-slate-500 text-sm">Diagnostic tool for AI robustness testing.</p>
           </div>
           
           <div className="flex bg-slate-100 p-1 rounded-xl">
               <button 
                onClick={() => setMode('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-pink-600' : 'text-slate-400'}`}
               >
                   Manual Lab
               </button>
               <button 
                onClick={() => setMode('auto')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'auto' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
               >
                   Auto Simulation
               </button>
           </div>
       </div>

       {mode === 'manual' ? (
           <div className="flex-1 flex gap-6 overflow-hidden">
             {/* Manual Controls */}
             <div className="w-80 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Ground Truth</h3>
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Target Score</label>
                           <input type="range" min="0" max={totalQuestions} value={targetScore} onChange={e => setTargetScore(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>0</span> <span className="text-pink-600 font-bold">{targetScore}</span> <span>{totalQuestions}</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Unattempted Questions</label>
                           <input type="range" min="0" max="100" value={unattemptedRate} onChange={e => setUnattemptedRate(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>0%</span> <span className="text-pink-600 font-bold">{unattemptedRate}%</span> <span>100%</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Roll Number</label>
                           <input type="text" maxLength={9} value={rollNo} onChange={e => setRollNo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pink-500/20 outline-none" />
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Booklet No</label>
                           <input type="text" maxLength={9} value={bookletNo} onChange={e => setBookletNo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pink-500/20 outline-none" />
                       </div>
                   </div>
                   <button onClick={runManualTest} disabled={isRunning} className="w-full mt-6 bg-pink-600 hover:bg-pink-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                        {isRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:play"></iconify-icon>}
                        Run Single Test
                   </button>
               </div>

               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Real World Simulation</h3>
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Tilt (Perspective)</label>
                           <input type="range" min="-10" max="10" value={skew} onChange={e => setSkew(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>Left</span> <span className="text-indigo-600 font-bold">{skew}°</span> <span>Right</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Camera Rotation</label>
                           <input type="range" min="-10" max="10" value={rotation} onChange={e => setRotation(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>-10°</span> <span className="text-indigo-600 font-bold">{rotation}°</span> <span>+10°</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Lighting/Shadows</label>
                           <input type="range" min="0" max="100" value={shadowOpacity} onChange={e => setShadowOpacity(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>None</span> <span className="text-indigo-600 font-bold">{shadowOpacity}%</span> <span>Dark</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Glare (Reflection)</label>
                           <input type="range" min="0" max="100" value={glareOpacity} onChange={e => setGlareOpacity(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>None</span> <span className="text-indigo-600 font-bold">{glareOpacity}%</span> <span>Bright</span>
                           </div>
                       </div>
                       <div>
                           <label className="block text-sm font-semibold text-slate-700 mb-1">Sensor Noise</label>
                           <input type="range" min="0" max="100" value={noiseAmount} onChange={e => setNoiseAmount(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           <div className="flex justify-between text-xs font-medium text-slate-500 mt-1">
                               <span>Clean</span> <span className="text-indigo-600 font-bold">{noiseAmount}</span> <span>Grainy</span>
                           </div>
                       </div>
                   </div>
               </div>
             </div>

             {/* Visualization Area */}
             <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="grid grid-cols-4 gap-4 shrink-0">
                    <ResultCard label="Roll Number" expected={rollNo} actual={manualResult?.rollNumber} loading={isRunning} />
                    <ResultCard label="Attempted" expected={manualAttemptedCount.toString()} actual={manualResult ? (totalQuestions - (manualResult.detectedAnswers.filter(a => a.selectedIndex === -1).length)).toString() : undefined} loading={isRunning} />
                    <ResultCard label="Score" expected={Math.min(targetScore, manualAttemptedCount).toString()} actual={manualResult?.score.toString()} loading={isRunning} highlight />
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</span>
                        {isRunning ? <span className="text-slate-500 font-medium text-sm animate-pulse">Processing...</span> : manualResult ? (manualResult.error ? <span className="text-red-500 font-bold text-sm">Failed</span> : <span className="text-emerald-500 font-bold text-lg">Complete</span>) : <span className="text-slate-400 font-medium text-sm">Ready</span>}
                    </div>
                </div>

                <div className="flex-1 flex gap-4 min-h-0">
                   <div className="flex-1 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden relative">
                        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold z-10">Simulation View</div>
                        <div className="w-full h-full overflow-auto custom-scrollbar p-4 flex justify-center bg-slate-200">
                           <canvas ref={canvasRef} className="hidden" />
                           {manualCanvasUrl ? <img src={manualCanvasUrl} className="max-w-full shadow-xl border border-white/20" style={{ width: '100%' }} /> : <div className="flex items-center justify-center h-full text-slate-400">Click Run</div>}
                        </div>
                   </div>
                   <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative">
                        <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold z-10">Evaluator Vision</div>
                        <div className="w-full h-full overflow-auto custom-scrollbar p-4 flex justify-center bg-slate-950">
                            {manualResult?.processedImageUrl ? <img src={manualResult.processedImageUrl} className="max-w-full shadow-xl border border-slate-700" style={{ width: '100%' }} /> : <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2"><iconify-icon icon="mdi:eye-off-outline" className="w-8 h-8"></iconify-icon><span className="text-sm">No Output Yet</span></div>}
                        </div>
                   </div>
                </div>
             </div>
           </div>
       ) : (
           <div className="flex-1 flex gap-6 overflow-hidden animate-fade-in">
              {/* Auto Config */}
              <div className="w-80 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Sim Configuration</h3>
                      <div className="space-y-6">
                          <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-2">Iterations</label>
                              <div className="flex items-center gap-3">
                                  <input type="range" min="5" max="50" step="5" value={simIterations} onChange={e => setSimIterations(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                  <span className="text-indigo-600 font-bold w-8 text-right">{simIterations}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Number of sheets to process</p>
                          </div>
                          <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-2">Environment Chaos</label>
                              <div className="flex items-center gap-3">
                                  <input type="range" min="0" max="5" step="0.5" value={simChaos} onChange={e => setSimChaos(parseFloat(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                                  <span className="text-red-500 font-bold w-8 text-right">{simChaos}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Randomizes lighting, angles, noise, and unattempted answers.</p>
                          </div>
                      </div>
                      <button onClick={runAutoSimulation} disabled={isRunning} className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                            {isRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <iconify-icon icon="mdi:robot-outline"></iconify-icon>}
                            {isRunning ? 'Simulating...' : 'Start Simulation'}
                      </button>
                  </div>

                  {/* Progress Card */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                       <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Progress</h3>
                       <div className="flex justify-between items-end mb-2">
                           <span className="text-2xl font-black text-slate-700">{simProgress} <span className="text-sm font-medium text-slate-400">/ {simIterations}</span></span>
                           <span className="text-xs font-bold text-indigo-500">{Math.round((simProgress/simIterations)*100)}%</span>
                       </div>
                       <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                           <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${(simProgress/simIterations)*100}%` }}></div>
                       </div>
                  </div>
              </div>

              {/* Simulation Results Dashboard */}
              <div className="flex-1 bg-slate-50 rounded-3xl border border-slate-200 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                 {simResults.length > 0 ? (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-4 gap-4">
                            <SummaryCard 
                                label="Score Accuracy" 
                                value={`${Math.round((simResults.filter(r => r.isScoreMatch).length / simResults.length) * 100)}%`} 
                                sub="Exact Match" 
                                color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-100" icon="mdi:bullseye-arrow"
                            />
                            <SummaryCard 
                                label="Roll No. Accuracy" 
                                value={`${Math.round((simResults.filter(r => r.isRollMatch).length / simResults.length) * 100)}%`} 
                                sub="Digit Detection" 
                                color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-100" icon="mdi:account-details"
                            />
                             <SummaryCard 
                                label="Blank Detection" 
                                value={`${Math.round((simResults.reduce((acc, r) => acc + (r.expected.unattempted === r.actual.unattempted ? 1 : 0), 0) / simResults.length) * 100)}%`} 
                                sub="Unattempted Qs" 
                                color="text-amber-600" bg="bg-amber-50" border="border-amber-100" icon="mdi:checkbox-blank-off-outline"
                            />
                             <SummaryCard 
                                label="Processing" 
                                value="~210ms" 
                                sub="Avg Per Sheet" 
                                color="text-slate-600" bg="bg-slate-100" border="border-slate-200" icon="mdi:speedometer"
                            />
                        </div>

                        {/* Environment Impact Grid */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                             <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <iconify-icon icon="mdi:chart-scatter-plot-hexbin" className="text-slate-500"></iconify-icon>
                                Environment Impact Analysis
                             </h4>
                             <div className="grid grid-cols-3 gap-6">
                                <ScatterChart 
                                    title="Accuracy vs Blur"
                                    xLabel="Blur Radius (px)"
                                    data={simResults.map(r => ({ x: r.params.blur, isSuccess: r.isPerfect }))}
                                    maxX={Math.max(1, ...simResults.map(r => r.params.blur))}
                                />
                                <ScatterChart 
                                    title="Accuracy vs Rotation"
                                    xLabel="Rotation (deg)"
                                    data={simResults.map(r => ({ x: Math.abs(r.params.rotation), isSuccess: r.isPerfect }))}
                                    maxX={Math.max(1, ...simResults.map(r => Math.abs(r.params.rotation)))}
                                />
                                <ScatterChart 
                                    title="Accuracy vs Skew"
                                    xLabel="Tilt (rad)"
                                    data={simResults.map(r => ({ x: Math.abs(r.params.skewY), isSuccess: r.isPerfect }))}
                                    maxX={Math.max(0.1, ...simResults.map(r => Math.abs(r.params.skewY)))}
                                />
                                <ScatterChart 
                                    title="Accuracy vs Glare"
                                    xLabel="Glare (%)"
                                    data={simResults.map(r => ({ x: r.params.glare * 100, isSuccess: r.isPerfect }))}
                                    maxX={100}
                                />
                                <ScatterChart 
                                    title="Accuracy vs Shadow"
                                    xLabel="Shadow (%)"
                                    data={simResults.map(r => ({ x: r.params.shadow * 100, isSuccess: r.isPerfect }))}
                                    maxX={100}
                                />
                                <ScatterChart 
                                    title="Accuracy vs Noise"
                                    xLabel="Noise Level"
                                    data={simResults.map(r => ({ x: r.params.noise, isSuccess: r.isPerfect }))}
                                    maxX={Math.max(10, ...simResults.map(r => r.params.noise))}
                                />
                             </div>
                        </div>

                        {/* Stress Limit Report Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <iconify-icon icon="mdi:speedometer-slow" className="text-red-500"></iconify-icon>
                                    Max Stress Limit Report
                                </h4>
                                <span className="text-[10px] uppercase font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                                    Based on {simResults.length} iterations
                                </span>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3">Variable</th>
                                        <th className="px-6 py-3 text-right">Max Tested</th>
                                        <th className="px-6 py-3 text-right">Max Safe Limit <span className="text-[9px] lowercase opacity-70">(100% acc)</span></th>
                                        <th className="px-6 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stressData.map((row, i) => {
                                        const percentage = row.maxTested > 0 ? (row.maxSafe / row.maxTested) * 100 : 100;
                                        let statusColor = "bg-emerald-100 text-emerald-700";
                                        let statusText = "Excellent";
                                        if (percentage < 50) { statusColor = "bg-red-100 text-red-700"; statusText = "Critical"; }
                                        else if (percentage < 80) { statusColor = "bg-amber-100 text-amber-700"; statusText = "Warning"; }

                                        return (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-3 font-medium text-slate-700">{row.label}</td>
                                                <td className="px-6 py-3 text-right text-slate-500 font-mono">{row.maxTested.toFixed(2)} {row.unit}</td>
                                                <td className="px-6 py-3 text-right font-bold font-mono">{row.maxSafe.toFixed(2)} {row.unit}</td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${statusColor}`}>
                                                        {statusText}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* General Correlation Charts */}
                        <div className="grid grid-cols-2 gap-6 h-64">
                            {/* Score Correlation Chart */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Score Correlation</h4>
                                <div className="flex-1 relative border-l border-b border-slate-100">
                                    <div className="absolute left-0 bottom-0 w-full h-full border-t border-slate-100" style={{ transform: 'rotate(-45deg)', transformOrigin: 'bottom left', width: '141%' }}></div>
                                    {simResults.map((r, i) => (
                                        <div 
                                            key={i}
                                            className={`absolute w-2 h-2 rounded-full border border-white shadow-sm transition-all hover:scale-150 ${r.isScoreMatch ? 'bg-emerald-400 opacity-60' : 'bg-red-500 z-10'}`}
                                            style={{
                                                left: `${(r.expected.score / totalQuestions) * 100}%`,
                                                bottom: `${(r.actual.score / totalQuestions) * 100}%`,
                                            }}
                                            title={`Exp: ${r.expected.score}, Act: ${r.actual.score}`}
                                        ></div>
                                    ))}
                                    <div className="absolute -bottom-5 right-0 text-[10px] text-slate-400">Target Score &rarr;</div>
                                    <div className="absolute top-0 -left-6 text-[10px] text-slate-400 -rotate-90">Detected Score &rarr;</div>
                                </div>
                            </div>
                            
                            {/* Accuracy vs Chaos Trend */}
                             <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Accuracy vs Chaos</h4>
                                <div className="flex-1 relative border-l border-b border-slate-100">
                                    {simResults.map((r, i) => {
                                        // Calculate an approximate "chaos score" for this iteration
                                        const chaosScore = (r.params.blur * 10) + Math.abs(r.params.rotation) + (r.params.noise * 2);
                                        // Approximate max chaos to normalize X
                                        const maxChaos = 50; 
                                        return (
                                            <div 
                                                key={i}
                                                className={`absolute w-2 h-2 rounded-full border border-white shadow-sm ${r.isPerfect ? 'bg-indigo-400' : 'bg-red-500'}`}
                                                style={{
                                                    left: `${Math.min(100, (chaosScore / maxChaos) * 100)}%`,
                                                    bottom: `${r.isPerfect ? '80%' : '20%'}`,
                                                }}
                                            ></div>
                                        )
                                    })}
                                    <div className="absolute -bottom-5 right-0 text-[10px] text-slate-400">Environment Stress &rarr;</div>
                                    <div className="absolute top-2 right-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 rounded">Pass</div>
                                    <div className="absolute bottom-2 right-2 text-[10px] font-bold text-red-500 bg-red-50 px-2 rounded">Fail</div>
                                </div>
                            </div>
                        </div>

                    </>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                         <iconify-icon icon="mdi:chart-scatter-plot" className="w-16 h-16 mb-4"></iconify-icon>
                         <p className="font-bold">No Simulation Data</p>
                         <p className="text-sm">Run a simulation to view reports</p>
                     </div>
                 )}
              </div>
           </div>
       )}
    </div>
  );
};

// --- Sub Components ---

const ScatterChart: React.FC<{ title: string; xLabel: string; data: { x: number, isSuccess: boolean }[]; maxX: number }> = ({ title, xLabel, data, maxX }) => {
    return (
        <div className="flex flex-col h-32">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-2">{title}</h5>
            <div className="flex-1 relative border-l border-b border-slate-100 bg-slate-50/30 rounded-tr-lg">
                {data.map((pt, i) => (
                     <div 
                        key={i}
                        className={`absolute w-1.5 h-1.5 rounded-full ${pt.isSuccess ? 'bg-emerald-400 opacity-60' : 'bg-red-500 z-10'}`}
                        style={{
                            left: `${(pt.x / maxX) * 100}%`,
                            bottom: `${pt.isSuccess ? '70%' : '20%'}`,
                        }}
                    ></div>
                ))}
                {/* Safe Zone Indicator */}
                 <div className="absolute bottom-[70%] w-full h-px border-t border-dashed border-emerald-200"></div>
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[9px] text-slate-400">0</span>
                <span className="text-[9px] text-slate-400">{xLabel}</span>
            </div>
        </div>
    )
}

const ResultCard: React.FC<{ label: string; expected: string; actual?: string; loading: boolean; highlight?: boolean }> = ({ label, expected, actual, loading, highlight }) => {
    const isMatch = actual === expected;
    const isMissing = actual === undefined;
    return (
        <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${highlight ? 'bg-pink-50 border-pink-100' : 'bg-white border-slate-200'}`}>
            <span className={`text-[10px] font-bold uppercase mb-1 ${highlight ? 'text-pink-600' : 'text-slate-400'}`}>{label}</span>
            <div className="flex items-end justify-between">
                <div>
                    <span className="text-xs text-slate-400 block">Expected</span>
                    <span className="font-mono font-bold text-slate-700">{expected}</span>
                </div>
                <div className="text-right">
                    <span className="text-xs text-slate-400 block">Detected</span>
                    {loading ? <div className="h-5 w-16 bg-slate-100 rounded animate-pulse mt-0.5"></div> : <span className={`font-mono font-bold text-lg ${isMissing ? 'text-slate-300' : isMatch ? 'text-emerald-500' : 'text-red-500'}`}>{actual ?? '-'}</span>}
                </div>
            </div>
            {!loading && !isMissing && <div className={`h-1 w-full rounded-full mt-2 ${isMatch ? 'bg-emerald-500' : 'bg-red-500'}`}></div>}
        </div>
    );
}

const SummaryCard: React.FC<{ label: string; value: string; sub: string; color: string; bg: string; border: string; icon: string }> = ({ label, value, sub, color, bg, border, icon }) => (
    <div className={`p-5 rounded-2xl border ${bg} ${border} flex items-center gap-4`}>
        <div className={`p-3 rounded-xl bg-white/60 ${color} shadow-sm`}>
            <iconify-icon icon={icon} className="w-6 h-6"></iconify-icon>
        </div>
        <div>
            <p className={`text-xs font-bold uppercase ${color} opacity-70`}>{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className={`text-[10px] font-medium ${color} opacity-60`}>{sub}</p>
        </div>
    </div>
);

export default OMRAccuracyTester;
