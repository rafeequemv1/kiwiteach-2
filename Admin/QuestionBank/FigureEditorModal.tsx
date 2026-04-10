import React, { useCallback, useEffect, useRef, useState } from 'react';
import { editBankFigureWithUserPrompt } from '../../services/geminiService';

export type FigureEditorModalProps = {
  open: boolean;
  questionId: string;
  imageUrl: string;
  onClose: () => void;
  /** Persist PNG data URL to hub; parent runs Supabase update + local list patch. */
  onSave: (questionId: string, pngDataUrl: string) => Promise<void>;
};

type PencilMode = 'black' | 'white';

/** Copy RGBA rectangle from ImageData (avoids reading dashed crop UI from the canvas). */
function copyImageDataRegion(src: ImageData, sx: number, sy: number, sw: number, sh: number): ImageData {
  const dest = new ImageData(sw, sh);
  const s = src.data;
  const d = dest.data;
  const srcW = src.width;
  for (let row = 0; row < sh; row++) {
    const srcRow = (sy + row) * srcW + sx;
    const dstRow = row * sw;
    for (let col = 0; col < sw; col++) {
      const si = (srcRow + col) * 4;
      const di = (dstRow + col) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }
  return dest;
}

function clientToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/**
 * Modal: paint black/white strokes on a question figure, optional crop, save as PNG data URL to DB.
 */
export const FigureEditorModal: React.FC<FigureEditorModalProps> = ({
  open,
  questionId,
  imageUrl,
  onClose,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const cropBackupRef = useRef<ImageData | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Latest crop rect (sync); React state can lag one frame behind “Apply crop”. */
  const cropRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  /** PNG data URLs: oldest → newest; used for Undo after crop / AI / pencil-before-AI. */
  const historyRef = useRef<string[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pencil, setPencil] = useState<PencilMode>('black');
  const [brushPx, setBrushPx] = useState(6);
  const [cropMode, setCropMode] = useState(false);
  const [cropDrag, setCropDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const pushHistoryIfChanged = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 2) return;
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      return;
    }
    const prev = historyRef.current;
    const last = prev[prev.length - 1];
    if (last === dataUrl) return;
    historyRef.current = [...prev, dataUrl].slice(-14);
    setCanUndo(historyRef.current.length > 1);
  }, []);

  const restoreFromDataUrl = useCallback(
    (dataUrl: string, cancelledRef?: { current: boolean }, onDone?: () => void) => {
      const img = new Image();
      img.onload = () => {
        if (cancelledRef?.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w <= 0 || h <= 0) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        cropBackupRef.current = null;
        cropStartRef.current = null;
        setCropDrag(null);
        cropRectRef.current = null;
        setCropMode(false);
        onDone?.();
      };
      img.onerror = () => {
        if (!cancelledRef?.current) alert('Could not restore that version.');
      };
      img.src = dataUrl;
    },
    []
  );

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.length <= 1) return;
    const next = h.slice(0, -1);
    historyRef.current = next;
    const url = next[next.length - 1];
    setCanUndo(next.length > 1);
    restoreFromDataUrl(url);
  }, [restoreFromDataUrl]);

  const drawImageToCanvas = useCallback((url: string, cancelledRef?: { current: boolean }) => {
    const commitPaintFromImage = (img: HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas || cancelledRef?.current) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0) {
        setLoadError('Image has invalid dimensions.');
        setLoading(false);
        return;
      }
      const maxDim = 2400;
      let cw = w;
      let ch = h;
      if (Math.max(cw, ch) > maxDim) {
        const s = maxDim / Math.max(cw, ch);
        cw = Math.round(cw * s);
        ch = Math.round(ch * s);
      }
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setLoadError('Canvas not available.');
        setLoading(false);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      cropBackupRef.current = null;
      cropStartRef.current = null;
      setCropDrag(null);
      cropRectRef.current = null;
      setCropMode(false);
      setLoading(false);
      try {
        const initial = canvas.toDataURL('image/png');
        historyRef.current = [initial];
        setCanUndo(false);
      } catch {
        setLoadError(
          'Loaded image but the canvas is blocked from export (often cross-origin). Try re-uploading the figure or use a data URL.'
        );
      }
    };

    const fail = (msg: string) => {
      if (cancelledRef?.current) return;
      setLoadError(msg);
      setLoading(false);
    };

    const tryLoadViaFetch = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (cancelledRef?.current) {
          reject(new Error('cancelled'));
          return;
        }
        void fetch(url, { mode: 'cors', credentials: 'omit' })
          .then((res) => {
            if (cancelledRef?.current) throw new Error('cancelled');
            if (!res.ok) throw new Error(String(res.status));
            return res.blob();
          })
          .then((blob) => {
            if (cancelledRef?.current) throw new Error('cancelled');
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(objectUrl);
              if (cancelledRef?.current) {
                reject(new Error('cancelled'));
                return;
              }
              commitPaintFromImage(img);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error('decode'));
            };
            img.src = objectUrl;
          })
          .catch(reject);
      });

    setLoadError(null);
    setLoading(true);

    let canvasWaitAttempts = 0;
    const run = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        canvasWaitAttempts += 1;
        if (canvasWaitAttempts > 90) {
          fail('Editor canvas did not initialize. Close and reopen the modal.');
          return;
        }
        requestAnimationFrame(run);
        return;
      }
      if (cancelledRef?.current) return;

      if (url.startsWith('data:')) {
        const img = new Image();
        img.onload = () => {
          if (cancelledRef?.current) return;
          commitPaintFromImage(img);
        };
        img.onerror = () => fail('Could not decode data URL image.');
        img.src = url;
        return;
      }

      void tryLoadViaFetch().catch(() => {
        if (cancelledRef?.current) return;
        const tryWithCrossOrigin = (useCors: boolean) => {
          const img = new Image();
          if (useCors) {
            img.crossOrigin = 'anonymous';
          }
          img.onload = () => {
            if (cancelledRef?.current) return;
            commitPaintFromImage(img);
          };
          img.onerror = () => {
            if (cancelledRef?.current) return;
            if (useCors) {
              const img2 = new Image();
              img2.onload = () => {
                if (cancelledRef?.current) return;
                commitPaintFromImage(img2);
              };
              img2.onerror = () => {
                if (cancelledRef?.current) return;
                fail(
                  'Could not load image (network or CORS). Try re-uploading the figure or use a forged/data URL.'
                );
              };
              img2.src = url;
              return;
            }
            fail(
              'Could not load image (network or CORS). Try re-uploading the figure or use a forged/data URL.'
            );
          };
          img.src = url;
        };
        tryWithCrossOrigin(true);
      });
    };

    requestAnimationFrame(run);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!imageUrl) {
      setLoadError('No image URL for this question.');
      return;
    }
    const cancelledRef = { current: false };
    drawImageToCanvas(imageUrl, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [open, imageUrl, drawImageToCanvas]);

  const paintStroke = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, brushPx);
      ctx.strokeStyle = pencil === 'black' ? '#000000' : '#ffffff';
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    [brushPx, pencil]
  );

  const redrawCropPreview = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const canvas = canvasRef.current;
      const backup = cropBackupRef.current;
      if (!canvas || !backup) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(backup, 0, 0);
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(left, top, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const p = clientToCanvas(canvas, e.clientX, e.clientY);
    if (cropMode) {
      cropStartRef.current = p;
      const ctx = canvas.getContext('2d');
      if (ctx && !cropBackupRef.current) {
        try {
          cropBackupRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {
          alert(
            'Cannot read this image for cropping (browser security). Try “Reset from original” or re-open after the image is stored as a data URL.'
          );
          setCropMode(false);
          return;
        }
      }
      const r0 = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      cropRectRef.current = r0;
      setCropDrag(r0);
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = p;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = clientToCanvas(canvas, e.clientX, e.clientY);
    if (cropMode && cropStartRef.current && cropBackupRef.current) {
      const s = cropStartRef.current;
      const r = { x1: s.x, y1: s.y, x2: p.x, y2: p.y };
      cropRectRef.current = r;
      setCropDrag(r);
      redrawCropPreview(s.x, s.y, p.x, p.y);
      return;
    }
    if (!drawingRef.current || !lastPointRef.current) return;
    const last = lastPointRef.current;
    paintStroke(last, p);
    lastPointRef.current = p;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (cropMode) {
      cropStartRef.current = null;
      return;
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  /** Do not end crop drags when the pointer leaves the canvas (marquee would reset awkwardly). */
  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (cropMode) return;
    handlePointerUp(e);
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = cropRectRef.current ?? cropDrag;
    if (!drag) {
      alert('Drag a rectangle on the image first, then Apply crop.');
      return;
    }
    const fullW = canvas.width;
    const fullH = canvas.height;
    const { x1, y1, x2, y2 } = drag;
    let left = Math.max(0, Math.min(x1, x2));
    let top = Math.max(0, Math.min(y1, y2));
    let w = Math.abs(x2 - x1);
    let h = Math.abs(y2 - y1);
    left = Math.floor(left);
    top = Math.floor(top);
    w = Math.floor(Math.min(w, fullW - left));
    h = Math.floor(Math.min(h, fullH - top));
    if (w < 8 || h < 8) {
      alert('Crop area too small — drag a larger rectangle.');
      return;
    }

    const backup = cropBackupRef.current;
    let data: ImageData;
    if (backup && backup.width === fullW && backup.height === fullH) {
      try {
        data = copyImageDataRegion(backup, left, top, w, h);
      } catch {
        alert('Crop failed: could not read image region.');
        return;
      }
    } else {
      const ctxPrev = canvas.getContext('2d');
      if (!ctxPrev) return;
      if (backup) {
        ctxPrev.putImageData(backup, 0, 0);
      }
      try {
        data = ctxPrev.getImageData(left, top, w, h);
      } catch {
        alert('Crop failed: pixels could not be read. Try reloading the figure (fetch/CORS).');
        return;
      }
    }

    // Resizing the canvas resets the bitmap; always take a fresh context before putImageData.
    canvas.width = w;
    canvas.height = h;
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return;
    ctx2.putImageData(data, 0, 0);

    cropBackupRef.current = null;
    cropRectRef.current = null;
    setCropDrag(null);
    setCropMode(false);
    pushHistoryIfChanged();
  };

  const cancelCrop = () => {
    const canvas = canvasRef.current;
    const backup = cropBackupRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && backup) {
      ctx.putImageData(backup, 0, 0);
    }
    cropBackupRef.current = null;
    cropStartRef.current = null;
    cropRectRef.current = null;
    setCropDrag(null);
    setCropMode(false);
  };

  const handleReset = () => {
    drawImageToCanvas(imageUrl);
  };

  const handleAiApply = async () => {
    const canvas = canvasRef.current;
    if (!canvas || aiBusy) return;
    const trimmed = aiPrompt.trim();
    if (!trimmed) {
      alert('Describe what you want changed (e.g. “remove label A”, “thicker axes”).');
      return;
    }
    setAiBusy(true);
    try {
      pushHistoryIfChanged();
      let sourcePng: string;
      try {
        sourcePng = canvas.toDataURL('image/png');
      } catch {
        alert('Cannot read the canvas to send to AI (export blocked).');
        return;
      }
      const b64 = await editBankFigureWithUserPrompt(sourcePng, trimmed);
      const outUrl = `data:image/png;base64,${b64}`;
      restoreFromDataUrl(outUrl, undefined, () => {
        pushHistoryIfChanged();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`AI edit failed: ${msg}`);
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !questionId) return;
    setSaving(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch {
        alert(
          'Cannot export PNG (canvas blocked). Try “Reset from original” or ensure the image loaded via download, not a tainted remote URL.'
        );
        return;
      }
      await onSave(questionId, dataUrl);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/70 p-3 backdrop-blur-sm [color-scheme:light]">
      <div
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="figure-editor-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <h2 id="figure-editor-title" className="text-sm font-bold text-zinc-900">
            Edit figure
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800"
            aria-label="Close"
          >
            <iconify-icon icon="mdi:close" width="22" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Black pencil draws ink; white pencil erases. <strong>Crop</strong>: drag a rectangle, then{' '}
            <strong>Apply crop</strong>. <strong>AI edit</strong> sends the current picture with your prompt;
            use <strong>Undo</strong> if you do not like the result. Save writes PNG to the question row.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Tool</span>
            <button
              type="button"
              onClick={() => setPencil('black')}
              disabled={cropMode}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold ${
                pencil === 'black' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white'
              }`}
            >
              Black
            </button>
            <button
              type="button"
              onClick={() => setPencil('white')}
              disabled={cropMode}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold ${
                pencil === 'white' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white'
              }`}
            >
              White
            </button>
            <label className="ml-2 flex items-center gap-2 text-[10px] font-semibold text-zinc-700">
              Brush
              <input
                type="range"
                min={1}
                max={36}
                value={brushPx}
                onChange={(e) => setBrushPx(Number(e.target.value))}
                disabled={cropMode}
                className="w-28"
              />
              <span className="tabular-nums">{brushPx}px</span>
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Crop</span>
            {!cropMode ? (
              <button
                type="button"
                onClick={() => {
                  setCropMode(true);
                  cropBackupRef.current = null;
                  cropRectRef.current = null;
                  setCropDrag(null);
                }}
                disabled={loading || !!loadError}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-bold text-sky-900 hover:bg-sky-100"
              >
                Select region
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={applyCrop}
                  className="rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700"
                >
                  Apply crop
                </button>
                <button
                  type="button"
                  onClick={cancelCrop}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold text-zinc-700"
                >
                  Cancel crop
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="ml-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-950 hover:bg-amber-100"
            >
              Reset from original
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-violet-700">
                AI edit
              </span>
              <button
                type="button"
                onClick={() => void handleAiApply()}
                disabled={loading || !!loadError || aiBusy || cropMode}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {aiBusy ? 'Working…' : 'Apply prompt'}
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo || loading || !!loadError || aiBusy || cropMode}
                className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[10px] font-bold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
              >
                Undo last
              </button>
            </div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={loading || !!loadError || aiBusy || cropMode}
              rows={2}
              placeholder="e.g. Remove the arrow from cell to nucleus; keep labels legible."
              className="mt-2 w-full resize-y rounded-lg border border-violet-200/80 bg-white px-2.5 py-2 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300 disabled:opacity-50"
            />
          </div>

          <div className="relative mt-3 flex min-h-[12rem] justify-center overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 p-2">
            {/* Canvas must stay mounted while loading so img.onload can draw into it (was unmounting before = blank editor). */}
            <canvas
              ref={canvasRef}
              className={`max-h-[min(60vh,520px)] w-auto max-w-full touch-none bg-white ${
                cropMode ? 'cursor-crosshair' : 'cursor-crosshair'
              } ${loading ? 'pointer-events-none opacity-40' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-100/80 text-sm font-medium text-zinc-600">
                Loading image…
              </div>
            )}
            {loadError && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-4 text-center text-sm text-rose-700">
                {loadError}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading || !!loadError || !questionId}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to bank'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FigureEditorModal;
