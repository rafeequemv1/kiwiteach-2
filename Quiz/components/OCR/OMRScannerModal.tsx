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

interface MarkerPoint {
  label: 'TL' | 'TR' | 'BL' | 'BR';
  xPct: number;
  yPct: number;
  wPct?: number;
  hPct?: number;
}

interface AlignmentWorkerResult {
  aligned: boolean;
  points: MarkerPoint[];
  confidence?: number;
  cornerMatches?: Record<MarkerPoint['label'], boolean>;
}

const OMRScannerModal: React.FC<OMRScannerModalProps> = ({ questions, onClose, onScanComplete }) => {
  const [mode, setMode] = useState<'camera' | 'upload' | 'csv' | 'result'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(true);
  const [isAlignedForAutoScan, setIsAlignedForAutoScan] = useState(false);
  const [alignmentProgress, setAlignmentProgress] = useState(0);
  const [markerPoints, setMarkerPoints] = useState<MarkerPoint[]>([]);
  const [cornerMatches, setCornerMatches] = useState<Record<MarkerPoint['label'], boolean>>({
    TL: false,
    TR: false,
    BL: false,
    BR: false,
  });
  
  // Continuous Scanning State
  const [scanHistory, setScanHistory] = useState<HistoryItem[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const alignCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const alignedFramesRef = useRef(0);
  const autoCaptureLockRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const workerBusyRef = useRef(false);
  const detectFallbackRef = useRef(false);
  const smoothedPointsRef = useRef<Record<MarkerPoint['label'], MarkerPoint> | null>(null);
  const evaluateRequestIdRef = useRef(0);
  const evaluateResolversRef = useRef<Map<number, (value: EvaluationResult | null) => void>>(new Map());

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
      const consumeDetection = (detection: AlignmentWorkerResult) => {
        const alpha = 0.35;
        const prev = (smoothedPointsRef.current || {}) as Partial<Record<MarkerPoint['label'], MarkerPoint>>;
        const smoothed = (detection.points || []).map((p) => {
          const old = prev[p.label];
          if (!old) return p;
          return {
            ...p,
            xPct: old.xPct * (1 - alpha) + p.xPct * alpha,
            yPct: old.yPct * (1 - alpha) + p.yPct * alpha,
          };
        });
        smoothedPointsRef.current = Object.fromEntries(smoothed.map((p) => [p.label, p])) as Record<
          MarkerPoint['label'],
          MarkerPoint
        >;
        setMarkerPoints(smoothed);
        setCornerMatches({
          TL: !!detection.cornerMatches?.TL,
          TR: !!detection.cornerMatches?.TR,
          BL: !!detection.cornerMatches?.BL,
          BR: !!detection.cornerMatches?.BR,
        });
        const aligned = detection.aligned;
        if (aligned) {
          alignedFramesRef.current = Math.min(6, alignedFramesRef.current + 1);
        } else {
          alignedFramesRef.current = Math.max(0, alignedFramesRef.current - 1);
        }

        setIsAlignedForAutoScan(alignedFramesRef.current >= 4);
        setAlignmentProgress(Math.round((alignedFramesRef.current / 6) * 100));

        const detConfidence = detection.confidence ?? 0;
        if (alignedFramesRef.current >= 6 && detConfidence >= 0.72 && !isProcessing) {
          autoCaptureLockRef.current = true;
          captureAndEvaluate();
        }
      };

      if (workerReadyRef.current && workerRef.current && !workerBusyRef.current) {
        if (!alignCanvasRef.current) alignCanvasRef.current = document.createElement('canvas');
        const helperCanvas = alignCanvasRef.current;
        const targetW = 640;
        const targetH = 480;
        helperCanvas.width = targetW;
        helperCanvas.height = targetH;
        const ctx = helperCanvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        workerBusyRef.current = true;
        workerRef.current.postMessage(
          {
            type: 'detect',
            width: targetW,
            height: targetH,
            buffer: imageData.data.buffer,
          },
          [imageData.data.buffer]
        );
        return;
      }

      if (detectFallbackRef.current) {
        const detection = detectCornerAlignment(video);
        consumeDetection(detection);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [mode, stream, isAutoScanEnabled, isProcessing]);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      detectFallbackRef.current = true;
      return;
    }
    const worker = new Worker('/omr-alignment-worker.js');
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<any>) => {
      const message = event.data || {};
      if (message.type === 'ready') {
        workerReadyRef.current = true;
        detectFallbackRef.current = false;
        return;
      }
      if (message.type === 'error') {
        workerReadyRef.current = false;
        workerBusyRef.current = false;
        detectFallbackRef.current = true;
        return;
      }
      if (message.type === 'detectResult') {
        workerBusyRef.current = false;
        const detection = message.payload as AlignmentWorkerResult;
        const alpha = 0.35;
        const prev = (smoothedPointsRef.current || {}) as Partial<Record<MarkerPoint['label'], MarkerPoint>>;
        const smoothed = (detection.points || []).map((p) => {
          const old = prev[p.label];
          if (!old) return p;
          return {
            ...p,
            xPct: old.xPct * (1 - alpha) + p.xPct * alpha,
            yPct: old.yPct * (1 - alpha) + p.yPct * alpha,
          };
        });
        smoothedPointsRef.current = Object.fromEntries(smoothed.map((p) => [p.label, p])) as Record<
          MarkerPoint['label'],
          MarkerPoint
        >;
        setMarkerPoints(smoothed);
        setCornerMatches({
          TL: !!detection.cornerMatches?.TL,
          TR: !!detection.cornerMatches?.TR,
          BL: !!detection.cornerMatches?.BL,
          BR: !!detection.cornerMatches?.BR,
        });
        const aligned = !!detection.aligned;
        if (aligned) alignedFramesRef.current = Math.min(6, alignedFramesRef.current + 1);
        else alignedFramesRef.current = Math.max(0, alignedFramesRef.current - 1);
        setIsAlignedForAutoScan(alignedFramesRef.current >= 4);
        setAlignmentProgress(Math.round((alignedFramesRef.current / 6) * 100));
        if (alignedFramesRef.current >= 6 && (detection.confidence ?? 0) >= 0.72 && !isProcessing) {
          autoCaptureLockRef.current = true;
          captureAndEvaluate();
        }
        return;
      }
      if (message.type === 'evaluateResult') {
        const reqId = Number(message.reqId);
        const resolve = evaluateResolversRef.current.get(reqId);
        if (resolve) {
          evaluateResolversRef.current.delete(reqId);
          resolve((message.payload as EvaluationResult) || null);
        }
      }
    };

    worker.onerror = () => {
      workerReadyRef.current = false;
      workerBusyRef.current = false;
      detectFallbackRef.current = true;
      evaluateResolversRef.current.forEach((resolve) => resolve(null));
      evaluateResolversRef.current.clear();
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
      workerBusyRef.current = false;
      evaluateResolversRef.current.forEach((resolve) => resolve(null));
      evaluateResolversRef.current.clear();
    };
  }, [isProcessing]);

  const evaluateImageDataWithWorker = async (imageData: ImageData): Promise<EvaluationResult | null> => {
    if (!workerReadyRef.current || !workerRef.current) return null;
    const reqId = ++evaluateRequestIdRef.current;
    const p = new Promise<EvaluationResult | null>((resolve) => {
      evaluateResolversRef.current.set(reqId, resolve);
    });
    workerRef.current.postMessage(
      {
        type: 'evaluate',
        reqId,
        width: imageData.width,
        height: imageData.height,
        buffer: imageData.data.buffer,
        questions: questions.map((q) => ({ correctIndex: q.correctIndex })),
      },
      [imageData.data.buffer]
    );
    return p;
  };

  const finalizeEvaluationResult = (res: EvaluationResult | null) => {
    if (!res) {
      setIsProcessing(false);
      autoCaptureLockRef.current = false;
      alert('Scanner worker unavailable. Please retry.');
      return;
    }
    const gateConfidence = Math.min(res.scanConfidence ?? 0, res.warpConfidence ?? 0, res.readConfidence ?? 0);
    if (gateConfidence < 0.48) {
      setResult({ ...res, error: 'Low scan confidence. Please align sheet and rescan.' });
      setMode('result');
      setIsProcessing(false);
      autoCaptureLockRef.current = false;
      return;
    }
    setResult(res);
    onScanComplete?.(res);
    setMode('result');
    setIsProcessing(false);
    alignedFramesRef.current = 0;
    setAlignmentProgress(0);
    setIsAlignedForAutoScan(false);
    setMarkerPoints([]);
    setCornerMatches({ TL: false, TR: false, BL: false, BR: false });
    smoothedPointsRef.current = null;
    autoCaptureLockRef.current = false;
  };

  const detectCornerAlignment = (video: HTMLVideoElement): AlignmentWorkerResult => {
    if (typeof cv === 'undefined' || !cv.Mat) {
      return {
        aligned: false,
        points: [],
        confidence: 0,
        cornerMatches: { TL: false, TR: false, BL: false, BR: false },
      };
    }
    if (!alignCanvasRef.current) {
      alignCanvasRef.current = document.createElement('canvas');
    }

    const helperCanvas = alignCanvasRef.current;
    const targetW = 640;
    const targetH = 480;
    helperCanvas.width = targetW;
    helperCanvas.height = targetH;
    const ctx = helperCanvas.getContext('2d');
    if (!ctx) {
      return {
        aligned: false,
        points: [],
        confidence: 0,
        cornerMatches: { TL: false, TR: false, BL: false, BR: false },
      };
    }

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
      const markers: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < imageArea * 0.00015 || area > imageArea * 0.04) continue;
        const rect = cv.boundingRect(cnt);
        const aspect = rect.width / Math.max(1, rect.height);
        if (aspect < 0.5 || aspect > 2) continue;
        markers.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height });
      }
      if (markers.length < 4) {
        return {
          aligned: false,
          points: [],
          confidence: 0,
          cornerMatches: { TL: false, TR: false, BL: false, BR: false },
        };
      }

      const sortedBySum = [...markers].sort((a, b) => (a.x + a.y) - (b.x + b.y));
      const tl = sortedBySum[0];
      const br = sortedBySum[sortedBySum.length - 1];
      const sortedByDiff = [...markers].sort((a, b) => (a.x - a.y) - (b.x - b.y));
      const bl = sortedByDiff[0];
      const tr = sortedByDiff[sortedByDiff.length - 1];

      // Keep detector guide geometry in sync with the on-screen overlay (90% x 84% window).
      const guideLeft = targetW * 0.05;
      const guideRight = targetW * 0.95;
      const guideTop = targetH * 0.08;
      const guideBottom = targetH * 0.92;
      const tol = 96;

      const near = (p: { x: number; y: number }, ex: number, ey: number) =>
        Math.abs(p.x - ex) <= tol && Math.abs(p.y - ey) <= tol;

      const points: MarkerPoint[] = [
        { label: 'TL', xPct: (tl.x / targetW) * 100, yPct: (tl.y / targetH) * 100, wPct: (tl.w / targetW) * 100, hPct: (tl.h / targetH) * 100 },
        { label: 'TR', xPct: (tr.x / targetW) * 100, yPct: (tr.y / targetH) * 100, wPct: (tr.w / targetW) * 100, hPct: (tr.h / targetH) * 100 },
        { label: 'BL', xPct: (bl.x / targetW) * 100, yPct: (bl.y / targetH) * 100, wPct: (bl.w / targetW) * 100, hPct: (bl.h / targetH) * 100 },
        { label: 'BR', xPct: (br.x / targetW) * 100, yPct: (br.y / targetH) * 100, wPct: (br.w / targetW) * 100, hPct: (br.h / targetH) * 100 },
      ];

      const dTL = Math.hypot(tl.x - guideLeft, tl.y - guideTop);
      const dTR = Math.hypot(tr.x - guideRight, tr.y - guideTop);
      const dBL = Math.hypot(bl.x - guideLeft, bl.y - guideBottom);
      const dBR = Math.hypot(br.x - guideRight, br.y - guideBottom);
      const confidence = Math.max(0, Math.min(1, 1 - (dTL + dTR + dBL + dBR) / 4 / (tol * 1.4)));
      const aligned =
        near(tl, guideLeft, guideTop) &&
        near(tr, guideRight, guideTop) &&
        near(bl, guideLeft, guideBottom) &&
        near(br, guideRight, guideBottom);

      return {
        aligned,
        points,
        confidence,
        cornerMatches: {
          TL: dTL <= tol,
          TR: dTR <= tol,
          BL: dBL <= tol,
          BR: dBR <= tol,
        },
      };
    } catch {
      return {
        aligned: false,
        points: [],
        confidence: 0,
        cornerMatches: { TL: false, TR: false, BL: false, BR: false },
      };
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
    setMarkerPoints([]);
    setCornerMatches({ TL: false, TR: false, BL: false, BR: false });
    smoothedPointsRef.current = null;
    autoCaptureLockRef.current = false;
  };

  const captureAndEvaluate = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    
    setIsProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    if (useOffscreen) {
      const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
      if (offCtx) {
        offCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
        const workerRes = await evaluateImageDataWithWorker(frameData);
        if (workerRes) {
          finalizeEvaluationResult(workerRes);
          return;
        }
      }
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const workerData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const workerRes = await evaluateImageDataWithWorker(workerData);
      if (workerRes) {
        finalizeEvaluationResult(workerRes);
        return;
      }

      const image = new Image();
      image.src = canvas.toDataURL('image/png');
      image.onload = async () => {
        const res = await evaluateOMRSheet(image, questions);
        finalizeEvaluationResult(res);
      };
      return;
    }

    setIsProcessing(false);
    autoCaptureLockRef.current = false;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          
          setIsProcessing(true);
          
          reader.onload = async (evt) => {
              const src = evt.target?.result as string;
              setPreviewImage(src);

              if (workerReadyRef.current && workerRef.current && typeof createImageBitmap !== 'undefined') {
                try {
                  const bitmap = await createImageBitmap(file);
                  const w = bitmap.width;
                  const h = bitmap.height;
                  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
                  if (useOffscreen) {
                    const offscreen = new OffscreenCanvas(w, h);
                    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
                    if (offCtx) {
                      offCtx.drawImage(bitmap, 0, 0, w, h);
                      const imageData = offCtx.getImageData(0, 0, w, h);
                      const workerRes = await evaluateImageDataWithWorker(imageData);
                      bitmap.close();
                      setPreviewImage(null);
                      if (workerRes) {
                        finalizeEvaluationResult(workerRes);
                        return;
                      }
                    }
                  }
                  bitmap.close();
                } catch {
                  // fall back below
                }
              }

              const img = new Image();
              img.onload = async () => {
                setTimeout(async () => {
                  const res = await evaluateOMRSheet(img, questions);
                  setPreviewImage(null);
                  finalizeEvaluationResult(res);
                }, 300);
              };
              img.src = src;
          };
          reader.readAsDataURL(file);
      }
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && c === ',') {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const normalizeMachineChoice = (raw: string): number => {
    const v = raw.replace(/^'+/, '').trim().toUpperCase();
    if (!v || v === 'BLANK' || v === '-' || v === 'NA') return -1;
    if (['A', 'B', 'C', 'D'].includes(v)) return v.charCodeAt(0) - 65;
    if (['1', '2', '3', '4'].includes(v)) return Number(v) - 1;
    return -1;
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsProcessing(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV needs at least header + 1 data row');

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, '').trim());
      const row = parseCsvLine(lines[1]);
      const get = (keyLike: string[]) => {
        const idx = headers.findIndex((h) => keyLike.some((k) => h.includes(k)));
        return idx >= 0 ? (row[idx] || '').trim() : '';
      };

      const roll = get(['roll']);
      const booklet = get(['booklet']);
      const scoreRaw = get(['total score', 'score', 'marks', 'correct']);
      const maxRaw = get(['max score', 'total questions', 'max', 'total']);
      const parsedScore = Number(scoreRaw.replace(/[^\d.]/g, '')) || 0;
      const parsedTotal = Number(maxRaw.replace(/[^\d.]/g, '')) || questions.length || 0;

      const qColIndexes = headers
        .map((h, idx) => ({ h, idx }))
        .filter((x) => /^q\d+$/i.test(x.h))
        .sort((a, b) => Number(a.h.slice(1)) - Number(b.h.slice(1)));

      let detectedAnswers: Array<{ questionIndex: number; selectedIndex: number; isCorrect: boolean }> = [];
      if (qColIndexes.length > 0) {
        detectedAnswers = questions.map((q, i) => {
          const col = qColIndexes[i];
          const selectedIndex = col ? normalizeMachineChoice(row[col.idx] || '') : -1;
          return { questionIndex: i, selectedIndex, isCorrect: selectedIndex === q.correctIndex };
        });
      } else {
        const effectiveTotal = parsedTotal || questions.length;
        detectedAnswers = Array.from({ length: effectiveTotal }, (_, i) => {
          const isCorrect = i < Math.min(parsedScore, effectiveTotal);
          return {
            questionIndex: i,
            selectedIndex: isCorrect ? (questions[i]?.correctIndex ?? 0) : -1,
            isCorrect,
          };
        });
      }

      const finalTotal = Math.max(parsedTotal || questions.length, detectedAnswers.length);
      const finalScore = qColIndexes.length > 0 ? detectedAnswers.filter((d) => d.isCorrect).length : parsedScore;
      const csvResult: EvaluationResult = {
        score: finalScore,
        totalQuestions: finalTotal,
        detectedAnswers,
        rollNumber: roll || undefined,
        testBookletNumber: booklet || undefined,
      };
      setResult(csvResult);
      onScanComplete?.(csvResult);
      setMode('result');
    } catch (err: any) {
      alert(`CSV parse failed: ${err?.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
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
          setMarkerPoints([]);
          setCornerMatches({ TL: false, TR: false, BL: false, BR: false });
          smoothedPointsRef.current = null;
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
        <div className={`border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0 ${mode === 'camera' ? 'p-3' : 'p-4 md:p-6'}`}>
            <div className="flex items-center gap-3 md:gap-4">
                <h2 className={`${mode === 'camera' ? 'text-base' : 'text-lg md:text-xl'} font-bold text-text-primary flex items-center gap-2`}>
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
        <div className={`flex-1 bg-secondary custom-scrollbar ${mode === 'camera' ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-6'}`}>
            {mode === 'camera' && (
                <div className="relative h-full w-full bg-black">
                    <div className="relative h-full w-full overflow-hidden bg-black shadow-lg border-y border-white/30">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                        <div className="absolute inset-0 border-[3px] border-white/20 pointer-events-none"></div>
                        
                        {/* Camera Overlay Guide */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[84%] pointer-events-none">
                             <div className={`absolute top-0 left-0 h-14 w-14 rounded-md border-2 bg-black/20 ${cornerMatches.TL ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute top-0 right-0 h-14 w-14 rounded-md border-2 bg-black/20 ${cornerMatches.TR ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute bottom-0 left-0 h-14 w-14 rounded-md border-2 bg-black/20 ${cornerMatches.BL ? 'border-emerald-400' : 'border-accent'}`}></div>
                             <div className={`absolute bottom-0 right-0 h-14 w-14 rounded-md border-2 bg-black/20 ${cornerMatches.BR ? 'border-emerald-400' : 'border-accent'}`}></div>
                             
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                                    {isAutoScanEnabled
                                      ? (isAlignedForAutoScan ? 'Aligned - Auto Scan Ready' : `Align 4 Corners (${alignmentProgress}%)`)
                                      : 'Align 4 Corners'}
                                </div>
                             </div>
                        </div>
                        {markerPoints.map((p) => (
                          <div
                            key={p.label}
                            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                          >
                            <div
                              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-2 border-emerald-400/95 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                              style={{
                                width: `${Math.max(2.4, p.wPct ?? 2.4)}%`,
                                height: `${Math.max(2.4, p.hPct ?? 2.4)}%`,
                                left: '50%',
                                top: '50%',
                              }}
                            />
                            <div className="h-3 w-3 rounded-full bg-emerald-400 border border-white shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
                            <div className="mt-0.5 -ml-1 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
                              {p.label}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 flex items-center justify-center gap-3">
                      <p className="text-center text-[11px] text-white/85 bg-black/45 rounded-full px-3 py-1">Ensure good lighting and hold steady</p>
                      <button
                        type="button"
                        onClick={() => setIsAutoScanEnabled((v) => !v)}
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border backdrop-blur-sm ${
                          isAutoScanEnabled
                            ? 'bg-emerald-50/95 text-emerald-700 border-emerald-200'
                            : 'bg-white/90 text-gray-500 border-gray-200'
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

            {mode === 'csv' && (
                <div className="flex flex-col h-full justify-center max-w-2xl mx-auto">
                    <div
                      className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-indigo-300 rounded-3xl bg-white hover:border-indigo-500 transition-all cursor-pointer group"
                      onClick={() => csvFileInputRef.current?.click()}
                    >
                      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <iconify-icon icon="mdi:file-delimited-outline" className="w-10 h-10 text-indigo-600"></iconify-icon>
                      </div>
                      <p className="font-black text-text-primary text-lg">Upload OMR Machine CSV</p>
                      <p className="text-sm text-text-secondary mt-1">Supports headers like Roll, Booklet, Score, Q1..Qn</p>
                      <input ref={csvFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} />
                    </div>
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
            mode === 'camera' ? (
              <div className="p-2 bg-transparent shrink-0 z-20 flex items-center gap-2">
                <button
                  onClick={() => { setMode('upload'); setPreviewImage(null); }}
                  disabled={isProcessing}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 shadow-sm disabled:opacity-50"
                >
                  <iconify-icon icon="mdi:image-outline" className="w-4 h-4"></iconify-icon>
                  Upload
                </button>
                <button
                  onClick={() => { setMode('csv'); setPreviewImage(null); }}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 shadow-sm disabled:opacity-50"
                >
                  <iconify-icon icon="mdi:file-delimited" className="w-4 h-4"></iconify-icon>
                  CSV
                </button>
                <button
                  onClick={captureAndEvaluate}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? (
                    <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin"></div>
                  ) : (
                    <iconify-icon icon="mdi:camera-iris" className="w-4 h-4"></iconify-icon>
                  )}
                  Capture
                </button>
              </div>
            ) : (
            <div className="p-3 md:p-4 bg-white border-t border-gray-100 flex gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0 z-20">
                <button 
                    onClick={() => { setMode('camera'); setPreviewImage(null); }}
                    disabled={isProcessing}
                    className="flex-1 py-3 px-3 rounded-xl font-bold text-text-secondary hover:bg-gray-100 transition-colors disabled:opacity-50 border border-gray-200 flex flex-col items-center justify-center gap-1 active:scale-95"
                >
                    <iconify-icon icon="mdi:camera-outline" className="w-5 h-5"></iconify-icon>
                    <span className="text-[10px] uppercase tracking-wider">Camera</span>
                </button>
                <button
                    onClick={() => { setMode('csv'); setPreviewImage(null); }}
                    disabled={isProcessing}
                    className="flex-1 py-3 px-3 rounded-xl font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors border border-violet-100 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
                >
                    <iconify-icon icon="mdi:file-delimited-outline" className="w-5 h-5"></iconify-icon>
                    <span className="text-[10px] uppercase tracking-wider">CSV</span>
                </button>
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
            )
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
