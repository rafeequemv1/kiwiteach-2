/* global importScripts */
let cvReady = false;
let cvRef = null;

try {
  importScripts('https://docs.opencv.org/4.8.0/opencv.js');
} catch (err) {
  self.postMessage({ type: 'error', message: `OpenCV worker load failed: ${String(err)}` });
}

const waitForCvReady = () =>
  new Promise((resolve) => {
    const check = () => {
      const cv = self.cv;
      if (cv && cv.Mat) {
        cvRef = cv;
        cvReady = true;
        resolve();
        return;
      }
      setTimeout(check, 30);
    };
    check();
  });

waitForCvReady()
  .then(() => self.postMessage({ type: 'ready' }))
  .catch((err) => self.postMessage({ type: 'error', message: String(err) }));

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const detectCornerAlignment = (imageData, targetW, targetH) => {
  if (!cvReady || !cvRef) {
    return {
      aligned: false,
      points: [],
      confidence: 0,
      cornerMatches: { TL: false, TR: false, BL: false, BR: false },
    };
  }
  const cv = cvRef;
  let src;
  let gray;
  let thresh;
  let contours;
  let hierarchy;

  try {
    src = cv.matFromImageData(imageData);
    gray = new cv.Mat();
    thresh = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 7);
    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = targetW * targetH;
    const markers = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imageArea * 0.00015 || area > imageArea * 0.04) continue;
      const rect = cv.boundingRect(cnt);
      const aspect = rect.width / Math.max(1, rect.height);
      if (aspect < 0.5 || aspect > 2) continue;
      markers.push({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        w: rect.width,
        h: rect.height,
      });
    }
    if (markers.length < 4) {
      return {
        aligned: false,
        points: [],
        confidence: 0,
        cornerMatches: { TL: false, TR: false, BL: false, BR: false },
      };
    }

    const sortedBySum = [...markers].sort((a, b) => a.x + a.y - (b.x + b.y));
    const tl = sortedBySum[0];
    const br = sortedBySum[sortedBySum.length - 1];
    const sortedByDiff = [...markers].sort((a, b) => a.x - a.y - (b.x - b.y));
    const bl = sortedByDiff[0];
    const tr = sortedByDiff[sortedByDiff.length - 1];

    const guideLeft = targetW * 0.05;
    const guideRight = targetW * 0.95;
    const guideTop = targetH * 0.08;
    const guideBottom = targetH * 0.92;
    const tol = 96;

    const dist = (p, ex, ey) => Math.hypot(p.x - ex, p.y - ey);
    const dTL = dist(tl, guideLeft, guideTop);
    const dTR = dist(tr, guideRight, guideTop);
    const dBL = dist(bl, guideLeft, guideBottom);
    const dBR = dist(br, guideRight, guideBottom);
    const meanDist = (dTL + dTR + dBL + dBR) / 4;
    const confidence = clamp01(1 - meanDist / (tol * 1.4));

    const points = [
      { label: 'TL', xPct: (tl.x / targetW) * 100, yPct: (tl.y / targetH) * 100, wPct: (tl.w / targetW) * 100, hPct: (tl.h / targetH) * 100 },
      { label: 'TR', xPct: (tr.x / targetW) * 100, yPct: (tr.y / targetH) * 100, wPct: (tr.w / targetW) * 100, hPct: (tr.h / targetH) * 100 },
      { label: 'BL', xPct: (bl.x / targetW) * 100, yPct: (bl.y / targetH) * 100, wPct: (bl.w / targetW) * 100, hPct: (bl.h / targetH) * 100 },
      { label: 'BR', xPct: (br.x / targetW) * 100, yPct: (br.y / targetH) * 100, wPct: (br.w / targetW) * 100, hPct: (br.h / targetH) * 100 },
    ];

    const aligned = dTL <= tol && dTR <= tol && dBL <= tol && dBR <= tol;
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
  } catch (_err) {
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

const zoneAdaptiveThreshold = (cv, grayMat) => {
  const out = new cv.Mat(grayMat.rows, grayMat.cols, cv.CV_8UC1);
  const zones = [
    { y0: 0, y1: Math.floor(grayMat.rows * 0.33), C: 12 },
    { y0: Math.floor(grayMat.rows * 0.33), y1: Math.floor(grayMat.rows * 0.67), C: 15 },
    { y0: Math.floor(grayMat.rows * 0.67), y1: grayMat.rows, C: 18 },
  ];
  zones.forEach((z) => {
    const h = Math.max(1, z.y1 - z.y0);
    const srcRoi = grayMat.roi(new cv.Rect(0, z.y0, grayMat.cols, h));
    const dstRoi = out.roi(new cv.Rect(0, z.y0, grayMat.cols, h));
    const tmp = new cv.Mat();
    cv.adaptiveThreshold(srcRoi, tmp, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 101, z.C);
    tmp.copyTo(dstRoi);
    srcRoi.delete();
    dstRoi.delete();
    tmp.delete();
  });
  return out;
};

const evaluateSheet = (imageData, questions) => {
  const cv = cvRef;
  let src;
  let gray;
  let blurred;
  let thresh;
  let contours;
  let hierarchy;
  let warped;
  let warpedGray;
  let warpedThresh;
  let M;
  let pts1;
  let pts2;
  try {
    src = cv.matFromImageData(imageData);
    if (!src || src.empty()) throw new Error('Image unavailable');

    gray = new cv.Mat();
    blurred = new cv.Mat();
    thresh = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 71, 7);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = src.cols * src.rows;
    const candidateMarkers = [];
    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * 0.0001 || area > imgArea * 0.04) continue;
      const rect = cv.boundingRect(cnt);
      const aspect = rect.width / Math.max(1, rect.height);
      if (aspect < 0.5 || aspect > 2.0) continue;
      candidateMarkers.push({ center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
    }
    if (candidateMarkers.length < 4) throw new Error('Need 4 corner markers');

    const sortedBySum = [...candidateMarkers].sort(
      (a, b) => a.center.x + a.center.y - (b.center.x + b.center.y)
    );
    const tl = sortedBySum[0];
    const br = sortedBySum[sortedBySum.length - 1];
    const sortedByDiff = [...candidateMarkers].sort(
      (a, b) => a.center.x - a.center.y - (b.center.x - b.center.y)
    );
    const bl = sortedByDiff[0];
    const tr = sortedByDiff[sortedByDiff.length - 1];

    const topW = Math.hypot(tr.center.x - tl.center.x, tr.center.y - tl.center.y);
    const botW = Math.hypot(br.center.x - bl.center.x, br.center.y - bl.center.y);
    const leftH = Math.hypot(bl.center.x - tl.center.x, bl.center.y - tl.center.y);
    const rightH = Math.hypot(br.center.x - tr.center.x, br.center.y - tr.center.y);
    const horizRatio = Math.min(topW, botW) / Math.max(topW, botW, 1);
    const vertRatio = Math.min(leftH, rightH) / Math.max(leftH, rightH, 1);
    const warpConfidence = clamp01((horizRatio + vertRatio) / 2);
    if (warpConfidence < 0.55) throw new Error('Low warp quality');

    pts1 = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.center.x,
      tl.center.y,
      tr.center.x,
      tr.center.y,
      bl.center.x,
      bl.center.y,
      br.center.x,
      br.center.y,
    ]);
    const width = 1680;
    const height = 2376;
    const offX = (4.5 / 210) * width;
    const offY = (4.5 / 297) * height;
    pts2 = cv.matFromArray(4, 1, cv.CV_32FC2, [
      offX,
      offY,
      width - offX,
      offY,
      offX,
      height - offY,
      width - offX,
      height - offY,
    ]);

    M = cv.getPerspectiveTransform(pts1, pts2);
    warped = new cv.Mat();
    cv.warpPerspective(src, warped, M, new cv.Size(width, height));
    warpedGray = new cv.Mat();
    cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY, 0);
    warpedThresh = zoneAdaptiveThreshold(cv, warpedGray);

    const radius = Math.round((0.9 / 210) * width);
    const startX = (60 / 210) * width;
    const startY = (32 / 297) * height;
    const colWidth = (35 / 210) * width;
    const rowHeight = (4.2 / 297) * height;
    const bubbleHeaderOffset = (5 / 297) * height;
    const bubbleSpacingX = (4 / 210) * width;
    const startBubbleXOffset = (14 / 210) * width;

    let score = 0;
    let ambiguousCount = 0;
    const detectedAnswers = [];

    for (let q = 0; q < questions.length; q++) {
      const colIdx = Math.floor(q / 50);
      const rowIdx = q % 50;
      const colX = startX + colIdx * colWidth;
      const estRowY = startY + bubbleHeaderOffset + rowIdx * rowHeight;
      let selected = -1;
      let ambiguous = false;
      const densities = [];

      for (let opt = 0; opt < 4; opt++) {
        const bx = Math.round(colX + startBubbleXOffset + opt * bubbleSpacingX);
        const by = Math.round(estRowY + rowHeight / 2);
        const rect = new cv.Rect(bx - radius, by - radius, radius * 2, radius * 2);
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) {
          densities.push(0);
          continue;
        }
        const roi = warpedThresh.roi(rect);
        const density = cv.countNonZero(roi) / (rect.width * rect.height);
        densities.push(density);
        roi.delete();
      }

      const sorted = [...densities].sort((a, b) => b - a);
      const highest = sorted[0] || 0;
      const second = sorted[1] || 0;
      if (highest > 0.4 && highest - second > 0.1) selected = densities.indexOf(highest);
      else if (highest > 0.34 && highest - second <= 0.1) {
        selected = -1;
        ambiguous = true;
        ambiguousCount += 1;
      }
      const isCorrect = selected === questions[q].correctIndex;
      if (isCorrect) score++;
      detectedAnswers.push({ questionIndex: q, selectedIndex: selected, isCorrect, ambiguous });
    }

    const readConfidence = clamp01(1 - ambiguousCount / Math.max(questions.length, 1));
    const scanConfidence = clamp01(0.45 * warpConfidence + 0.55 * readConfidence);
    return {
      score,
      totalQuestions: questions.length,
      detectedAnswers,
      warpConfidence,
      readConfidence,
      scanConfidence,
    };
  } catch (e) {
    return {
      score: 0,
      totalQuestions: Array.isArray(questions) ? questions.length : 0,
      detectedAnswers: [],
      scanConfidence: 0,
      warpConfidence: 0,
      readConfidence: 0,
      error: e && e.message ? e.message : 'Evaluation failed',
    };
  } finally {
    [src, gray, blurred, thresh, hierarchy, contours, pts1, pts2, M, warped, warpedGray, warpedThresh].forEach((m) => {
      if (m && typeof m.delete === 'function') m.delete();
    });
  }
};

self.onmessage = (event) => {
  const message = event.data || {};
  if (!cvReady) {
    self.postMessage({ type: 'error', message: 'OpenCV worker not ready' });
    return;
  }
  const { width, height, buffer } = message;
  if (!buffer || !width || !height) return;
  const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);

  if (message.type === 'detect') {
    const payload = detectCornerAlignment(imageData, width, height);
    self.postMessage({ type: 'detectResult', payload });
    return;
  }
  if (message.type === 'evaluate') {
    const questions = Array.isArray(message.questions) ? message.questions : [];
    const payload = evaluateSheet(imageData, questions);
    self.postMessage({ type: 'evaluateResult', reqId: message.reqId, payload });
  }
};

