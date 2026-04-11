/**
 * Split a raster image into 4 equal quadrants (2×2, row-major: top-left → top-right → bottom-left → bottom-right).
 * Used for batched figure generation (one API call → four separate question figures).
 *
 * Each crop uses a small **inset** on internal edges so accidental black “grid” strokes drawn on quadrant
 * boundaries by the image model are not included in the final cells.
 */
function insetPxFor2x2Cell(cw: number, ch: number): number {
  const m = Math.min(cw, ch);
  return Math.min(8, Math.max(2, Math.round(m * 0.012)));
}

export async function splitBase64ImageTo2x2Grid(
  base64: string,
  mimeType: string = 'image/png'
): Promise<string[]> {
  if (typeof document === 'undefined') {
    throw new Error('splitBase64ImageTo2x2Grid requires a browser environment');
  }
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, '');
  const url = `data:${mimeType};base64,${cleaned}`;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for 2×2 split'));
    img.src = url;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 4 || h < 4) {
    throw new Error(`Image too small for 2×2 split (${w}×${h})`);
  }

  const cw = Math.floor(w / 2);
  const ch = Math.floor(h / 2);
  const inset = insetPxFor2x2Cell(cw, ch);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const cells: string[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const sx = col * cw + (col > 0 ? inset : 0);
      const sy = row * ch + (row > 0 ? inset : 0);
      const sw = cw - (col > 0 ? inset : 0) - (col < 1 ? inset : 0);
      const sh = ch - (row > 0 ? inset : 0) - (row < 1 ? inset : 0);
      if (sw < 2 || sh < 2) {
        throw new Error(`2×2 split inset too large for cell (${sw}×${sh})`);
      }
      canvas.width = sw;
      canvas.height = sh;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      cells.push(b64);
    }
  }
  return cells;
}

/**
 * Split a raster image into 16 equal cells (4×4, row-major: top-left → bottom-right).
 * @deprecated Prefer {@link splitBase64ImageTo2x2Grid} for forge batching (4 figures per sheet).
 */

export async function splitBase64ImageTo4x4Grid(
  base64: string,
  mimeType: string = 'image/png'
): Promise<string[]> {
  if (typeof document === 'undefined') {
    throw new Error('splitBase64ImageTo4x4Grid requires a browser environment');
  }
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, '');
  const url = `data:${mimeType};base64,${cleaned}`;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for 4×4 split'));
    img.src = url;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 16 || h < 16) {
    throw new Error(`Image too small for 4×4 split (${w}×${h})`);
  }

  const cw = Math.floor(w / 4);
  const ch = Math.floor(h / 4);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const cells: string[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, col * cw, row * ch, cw, ch, 0, 0, cw, ch);
      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      cells.push(b64);
    }
  }
  return cells;
}
