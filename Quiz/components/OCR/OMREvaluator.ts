import { Question } from '../../types';

declare var cv: any;

export interface EvaluationResult {
  score: number;
  totalQuestions: number;
  detectedAnswers: Array<{ questionIndex: number; selectedIndex: number; isCorrect: boolean; ambiguous?: boolean }>;
  rollNumber?: string;
  testBookletNumber?: string;
  processedImageUrl?: string;
  scanConfidence?: number;
  warpConfidence?: number;
  readConfidence?: number;
  markerCount?: number;
  markerGeometryScore?: number;
  error?: string;
}

export const evaluateOMRSheet = async (
  imageSource: HTMLImageElement | HTMLCanvasElement,
  questions: Question[]
): Promise<EvaluationResult> => {
  return new Promise((resolve) => {
    if (typeof cv === 'undefined' || !cv.Mat) {
       resolve({ score: 0, totalQuestions: questions.length, detectedAnswers: [], error: 'OpenCV not ready' });
       return;
    }

    let src: any, gray: any, blurred: any, thresh: any, contours: any, hierarchy: any, warped: any, warpedThresh: any, warpedGray: any, M: any, pts1: any, pts2: any;

    try {
      src = cv.imread(imageSource);
      
      // Check if image is loaded correctly
      if (src.empty()) {
          throw new Error("Failed to load image source");
      }

      gray = new cv.Mat();
      blurred = new cv.Mat();
      thresh = new cv.Mat();
      
      // 1. Enhanced Preprocessing
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 71, 7);

      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
      kernel.delete();

      // 2. Robust Corner Marker Detection
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let candidateMarkers: { center: { x: number, y: number }, area: number }[] = [];
      const imgArea = src.cols * src.rows;

      const findMarkersInContours = () => {
          const found = [];
          for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            // Relaxed area constraints slightly to handle diverse resolutions
            if (area < imgArea * 0.0001 || area > imgArea * 0.04) continue;
            
            const rect = cv.boundingRect(cnt);
            const aspectRatio = rect.width / rect.height;
            if (aspectRatio < 0.5 || aspectRatio > 2.0) continue;
            
            const hull = new cv.Mat();
            cv.convexHull(cnt, hull);
            const hullArea = cv.contourArea(hull);
            const solidity = area / hullArea;
            hull.delete();
            
            if (solidity < 0.7) continue; // Slightly relaxed solidity
            
            found.push({ 
              center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
              area: area
            });
          }
          return found;
      };

      candidateMarkers = findMarkersInContours();
      
      // Fallback: try different threshold if markers not found
      if (candidateMarkers.length < 4) {
          cv.threshold(gray, thresh, 120, 255, cv.THRESH_BINARY_INV);
          contours.delete();
          contours = new cv.MatVector();
          cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
          candidateMarkers = findMarkersInContours();
      }

      if (candidateMarkers.length < 4) {
        throw new Error(`Found ${candidateMarkers.length} markers. Need 4. Ensure all 4 corner squares are clearly visible.`);
      }

      // Sort markers to find TL, TR, BL, BR
      const sortedBySum = [...candidateMarkers].sort((a, b) => (a.center.x + a.center.y) - (b.center.x + b.center.y));
      const tl = sortedBySum[0];
      const br = sortedBySum[sortedBySum.length - 1];
      const sortedByDiff = [...candidateMarkers].sort((a, b) => (a.center.x - a.center.y) - (b.center.x - b.center.y));
      const bl = sortedByDiff[0];
      const tr = sortedByDiff[sortedByDiff.length - 1];
      
      pts1 = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.center.x, tl.center.y,
        tr.center.x, tr.center.y,
        bl.center.x, bl.center.y,
        br.center.x, br.center.y
      ]);

      // --- HIGH RESOLUTION ANALYSIS ---
      // We double the resolution to ensure we have enough pixels for the "inner circle" check
      const width = 1680;  // ~200 DPI
      const height = 2376;
      
      // Match the 2mm offset + 2.5mm half-size of the 5mm marker
      const offX = (4.5 / 210) * width;
      const offY = (4.5 / 297) * height;

      pts2 = cv.matFromArray(4, 1, cv.CV_32FC2, [
        offX, offY,
        width - offX, offY,
        offX, height - offY,
        width - offX, height - offY
      ]);

      M = cv.getPerspectiveTransform(pts1, pts2);
      warped = new cv.Mat();
      cv.warpPerspective(src, warped, M, new cv.Size(width, height));
      
      warpedGray = new cv.Mat();
      cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY, 0);
      
      // Advanced Thresholding for Warped Image
      // Using a larger block size for adaptive threshold to handle shading better across the page
      warpedThresh = new cv.Mat();
      cv.adaptiveThreshold(warpedGray, warpedThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 101, 15);

      // Detection Radius: 
      // Generator radius is 1.3mm. 
      // We want to sample the INNER core to avoid the border.
      // Target radius ~0.9mm.
      const radius = Math.round((0.9 / 210) * width); 
      // Visual Radius (for drawing debug circles): ~1.3mm
      const visualRadius = Math.round((1.3 / 210) * width);

      /**
       * DRIFT CORRECTION (Bubble Snapping)
       * Instead of trusting the rigid grid blindly, search the local area for the bubble centroid.
       */
      const refineBubbleCenter = (estX: number, estY: number): { x: number, y: number } => {
          // Search window size: +/- 2.5mm (roughly half the distance between bubbles)
          const searchWin = Math.round((2.5 / 210) * width);
          
          const startX = Math.max(0, estX - searchWin);
          const startY = Math.max(0, estY - searchWin);
          const w = Math.min(width - startX, searchWin * 2);
          const h = Math.min(height - startY, searchWin * 2);
          
          const roiRect = new cv.Rect(startX, startY, w, h);
          const roi = warpedThresh.roi(roiRect);
          
          const localContours = new cv.MatVector();
          const localHier = new cv.Mat();
          cv.findContours(roi, localContours, localHier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          let bestX = estX;
          let bestY = estY;
          let maxArea = 0;
          
          // Bubble area expectations (in pixels)
          // Radius ~1.3mm -> Area ~ 5.3mm^2
          // At 1680px width (210mm), 1mm = 8px. Area ~ pi * (1.3*8)^2 ~ 340px
          // Allow range 100px - 800px
          const minArea = 100; 
          const maxBubbleArea = 1200;

          for (let i = 0; i < localContours.size(); ++i) {
              const cnt = localContours.get(i);
              const area = cv.contourArea(cnt);
              
              if (area > minArea && area < maxBubbleArea) {
                  // Check circularity
                  const perimeter = cv.arcLength(cnt, true);
                  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
                  
                  if (circularity > 0.6) { // It's somewhat circular
                      const moments = cv.moments(cnt, false);
                      const cx = moments.m10 / moments.m00;
                      const cy = moments.m01 / moments.m00;
                      
                      // Prioritize the blob closest to estimated center if multiple found?
                      // For now, largest area usually wins for filled bubbles.
                      if (area > maxArea) {
                          maxArea = area;
                          bestX = startX + cx;
                          bestY = startY + cy;
                      }
                  }
              }
          }
          
          localContours.delete();
          localHier.delete();
          roi.delete();
          
          return { x: bestX, y: bestY };
      };

      // --- Helper: Scan a Digit Grid (Roll No / Booklet No) ---
      const scanDigitGrid = (baseMmY: number): string => {
        const SIDEBAR_X_MM = 13; // 10mm margin + 3mm offset
        const GRID_START_X_MM = SIDEBAR_X_MM + 3; // +3mm inside sidebar
        const BUBBLE_CENTER_OFFSET_MM = 1.5;
        const GRID_START_Y_MM = baseMmY + 15; // +6mm header + 9mm padding
        
        const COL_GAP_MM = 4.2;
        const ROW_GAP_MM = 4.3;

        let resultString = "";

        for (let col = 0; col < 9; col++) {
          const colX = ((GRID_START_X_MM + (col * COL_GAP_MM) + BUBBLE_CENTER_OFFSET_MM) / 210) * width;
          
          let selectedDigit = -1;
          let maxDensity = 0;
          let secondMaxDensity = 0;

          const densities: number[] = [];
          const centers: {x:number, y:number}[] = [];

          for (let row = 0; row < 10; row++) {
             const rowY = ((GRID_START_Y_MM + (row * ROW_GAP_MM)) / 297) * height;
             
             // Snap to the actual bubble!
             const snapped = refineBubbleCenter(Math.round(colX), Math.round(rowY));
             centers.push(snapped);
             
             const rect = new cv.Rect(snapped.x - radius, snapped.y - radius, radius * 2, radius * 2);
             
             if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) {
                densities.push(0);
                continue;
             }

             const roi = warpedThresh.roi(rect);
             const count = cv.countNonZero(roi);
             const density = count / (rect.width * rect.height);
             densities.push(density);
             roi.delete();
          }

          const sortedDensities = [...densities].sort((a, b) => b - a);
          maxDensity = sortedDensities[0];
          secondMaxDensity = sortedDensities[1];

          // Use similar threshold logic as questions
          if (maxDensity > 0.45 && (maxDensity - secondMaxDensity > 0.10)) {
            selectedDigit = densities.indexOf(maxDensity);
          }

          if (selectedDigit !== -1) {
            // Map index to digit: 0->1, ... 8->9, 9->0
            const digitChar = selectedDigit === 9 ? '0' : String(selectedDigit + 1);
            resultString += digitChar;

            // Draw feedback at the SNAP point
            const center = centers[selectedDigit];
            cv.circle(warped, new cv.Point(center.x, center.y), visualRadius, [0, 200, 200, 255], 2);
          } else {
            resultString += "_";
          }
        }
        return resultString;
      };

      // --- 3. Grid Analysis (Questions) ---
      const startX = (60 / 210) * width;
      const startY = (32 / 297) * height; 
      const colWidth = (35 / 210) * width;
      const rowHeight = (4.2 / 297) * height;
      const bubbleHeaderOffset = (5 / 297) * height;
      const bubbleSpacingX = (4 / 210) * width;
      const startBubbleXOffset = (14 / 210) * width;

      // Scan Sidebars first
      // Sidebar Y is 32mm. Roll No starts there.
      // Booklet No starts at 32 + 70 = 102mm.
      const detectedRollNo = scanDigitGrid(32);
      const detectedBookletNo = scanDigitGrid(32 + 70);

      const detectedAnswers: any[] = [];
      let score = 0;

      for (let q = 0; q < questions.length; q++) {
          const colIdx = Math.floor(q / 50);
          const rowIdx = q % 50;
          
          const colX = startX + (colIdx * colWidth);
          const estRowY = startY + bubbleHeaderOffset + (rowIdx * rowHeight);

          let selected = -1;
          const densities: number[] = [];
          const centers: {x:number, y:number}[] = [];

          for (let opt = 0; opt < 4; opt++) {
              const estBX = Math.round(colX + startBubbleXOffset + (opt * bubbleSpacingX));
              const estBY = Math.round(estRowY + (rowHeight / 2));
              
              // DRIFT CORRECTION
              const snapped = refineBubbleCenter(estBX, estBY);
              centers.push(snapped);

              const rect = new cv.Rect(snapped.x - radius, snapped.y - radius, radius * 2, radius * 2);
              
              // Boundary check
              if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) {
                  densities.push(0);
                  continue;
              }
              
              const roi = warpedThresh.roi(rect);
              const count = cv.countNonZero(roi);
              const density = count / (rect.width * rect.height);
              densities.push(density);
              roi.delete();
          }

          const sortedDensities = [...densities].sort((a, b) => b - a);
          const highest = sortedDensities[0];
          const secondHighest = sortedDensities[1];

          if (highest > 0.40 && (highest - secondHighest > 0.10)) {
              selected = densities.indexOf(highest);
          }

          const isCorrect = selected === questions[q].correctIndex;
          if (isCorrect) score++;

          detectedAnswers.push({ questionIndex: q, selectedIndex: selected, isCorrect });

          const drawBubble = (idx: number, color: number[], thickness: number, r: number) => {
              const center = centers[idx];
              cv.circle(warped, new cv.Point(center.x, center.y), r, color, thickness);
          };

          // Draw Debug Info on 'warped' image
          if (selected !== -1) {
              // Draw filled circle for detected answer
              drawBubble(selected, isCorrect ? [0, 200, 0, 255] : [220, 0, 0, 255], 3, visualRadius + 2);
          }
          
          // Always show correct answer with a thin green ring if user got it wrong
          if (selected !== questions[q].correctIndex) {
               // We might need to recalc snap for the correct index if we didn't store it, 
               // but we stored all 4 centers in `centers` array.
              drawBubble(questions[q].correctIndex, [0, 180, 0, 200], 2, visualRadius);
          }
      }

      const dstCanvas = document.createElement('canvas');
      // Downscale for display to save memory/speed after processing is done
      const displayScale = 0.5;
      const displayWidth = Math.round(width * displayScale);
      const displayHeight = Math.round(height * displayScale);
      
      const resized = new cv.Mat();
      cv.resize(warped, resized, new cv.Size(displayWidth, displayHeight));
      
      cv.imshow(dstCanvas, resized);
      const processedImageUrl = dstCanvas.toDataURL('image/jpeg', 0.85);

      resized.delete();

      resolve({ 
        score, 
        totalQuestions: questions.length, 
        detectedAnswers, 
        rollNumber: detectedRollNo, 
        testBookletNumber: detectedBookletNo,
        processedImageUrl 
      });

    } catch (e: any) {
        console.error("OMR Evaluation Error:", e);
        resolve({ 
          score: 0, 
          totalQuestions: questions.length, 
          detectedAnswers: [], 
          error: e.message || 'Failed to evaluate OMR sheet.' 
        });
    } finally {
        [src, gray, blurred, thresh, hierarchy, contours, pts1, pts2, M, warped, warpedGray, warpedThresh].forEach(m => {
            if (m && typeof m.delete === 'function' && !m.isDeleted()) m.delete();
        });
    }
  });
};