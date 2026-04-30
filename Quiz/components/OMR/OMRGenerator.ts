
import { Question, BrandingConfig } from '../../types';
import { jsPDF } from 'jspdf';

interface OMRConfig {
  topic: string;
  questions?: Question[];
  markedAnswers?: number[]; // Array of selected indices (0-3) for each question. -1 for empty.
  candidateName?: string;
  rollNumber?: string;
  testBookletNumber?: string;
  filename?: string;
  brandConfig?: BrandingConfig;
  bottomNote?: string;
}

export const generateOMR = async ({ 
  topic, 
  questions = [], 
  markedAnswers = [],
  candidateName, 
  rollNumber,
  testBookletNumber,
  filename,
  brandConfig,
  bottomNote
}: OMRConfig): Promise<void> => {
  
  // Initialize PDF in A4 Portrait (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const THEME_COLOR = [233, 30, 99]; // Pink #E91E63
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];
  const LIGHT_PINK = [252, 228, 236]; // #FCE4EC

  const setPink = () => doc.setTextColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);
  const setBlack = () => doc.setTextColor(0, 0, 0);
  const setDrawPink = () => doc.setDrawColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);
  const setFillPink = () => doc.setFillColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);

  // --- Layout Constants ---
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN = 10;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
  
  // Draw Border
  setDrawPink();
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - (MARGIN * 2));
  
  // --- Header ---
  const HEADER_HEIGHT = 22;
  
  if (brandConfig && brandConfig.showOnOmr) {
      // Branding Enabled Header
      if (brandConfig.logo) {
          try {
              doc.addImage(brandConfig.logo, 'PNG', MARGIN + 5, MARGIN + 4, 12, 12);
          } catch(e) { console.error("Logo failed", e); }
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      setPink();
      doc.text(brandConfig.name.toUpperCase(), MARGIN + (brandConfig.logo ? 20 : 5), MARGIN + 10);
      
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("OMR ANSWER SHEET", MARGIN + (brandConfig.logo ? 20 : 5), MARGIN + 15);
  } else {
      // Default Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      setPink();
      doc.text("OMR ANSWER SHEET", MARGIN + 5, MARGIN + 12);
  }

  // Instructions (Right Aligned)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80); // Dark Gray
  
  const instructions = [
    "1. Use Blue/Black Ball Point Pen only.",
    "2. Darken the circle completely.",
    "3. Do not make stray marks."
  ];
  
  doc.text(instructions, PAGE_WIDTH - MARGIN - 5, MARGIN + 7, { align: 'right', lineHeightFactor: 1.4 });

  // --- Sidebar (Roll No, etc) ---
  const SIDEBAR_X = MARGIN + 3;
  const SIDEBAR_Y = MARGIN + HEADER_HEIGHT;
  const SIDEBAR_WIDTH = 45;
  
  // Helper to draw a digit grid (Roll No, Booklet No)
  const drawDigitGrid = (x: number, y: number, label: string, cols: number, value?: string) => {
      const headerH = 6;
      const gridH = 58; 

      // Header box
      doc.setFillColor(LIGHT_PINK[0], LIGHT_PINK[1], LIGHT_PINK[2]);
      setDrawPink();
      doc.setLineWidth(0.2);
      doc.rect(x, y, SIDEBAR_WIDTH, headerH, 'F');
      doc.rect(x, y, SIDEBAR_WIDTH, headerH, 'S'); // Border
      
      setPink();
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(label, x + (SIDEBAR_WIDTH / 2), y + 4.2, { align: 'center' });

      // Grid box
      doc.rect(x, y + headerH, SIDEBAR_WIDTH, gridH); // Grid container
      
      const startX = x + 3;
      const inputBoxY = y + headerH + 2;
      const bubbleStartY = y + headerH + 9;
      
      const colGap = 4.2;
      const rowGap = 4.3;

      // Draw input values at top if provided
      if (value) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          for(let c=0; c<Math.min(cols, value.length); c++) {
              doc.text(value[c], startX + (c * colGap) + 1.5, inputBoxY + 3, { align: 'center' });
          }
      }
      
      for(let c=0; c<cols; c++) {
          // Input box at top
          doc.setDrawColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);
          doc.setLineWidth(0.2);
          doc.rect(startX + (c * colGap), inputBoxY, 3, 4);
          
          const valDigit = value && c < value.length ? parseInt(value[c]) : -1;

          // Bubbles 0-9
          for(let r=0; r<10; r++) {
             const bx = startX + (c * colGap) + 1.5; // Center of bubble
             const by = bubbleStartY + (r * rowGap);
             const radius = 1.3;
             
             // Digits 1-9, then 0
             const digit = r === 9 ? 0 : r + 1;
             const isFilled = digit === valDigit;
             
             doc.setLineWidth(0.15); // Thin bubbles
             
             if (isFilled) {
                 doc.setFillColor(0, 0, 0);
                 doc.circle(bx, by, radius, 'F');
             } else {
                 setPink();
                 doc.circle(bx, by, radius, 'S');
                 doc.setFont("helvetica", "normal");
                 doc.setFontSize(5);
                 doc.text(digit.toString(), bx, by + 0.5, { align: 'center' });
             }
          }
      }
  };

  drawDigitGrid(SIDEBAR_X, SIDEBAR_Y, "ROLL NO.", 9, rollNumber);
  drawDigitGrid(SIDEBAR_X, SIDEBAR_Y + 70, "TEST BOOKLET NO.", 9, testBookletNumber);

  // Vertical Warning Text
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200); // Light gray
  doc.text("Candidate MUST NOT Carry ORIGINAL or OFFICE Copy", 8, 200, { angle: 90 });


  // --- Questions Grid ---
  const GRID_X = MARGIN + SIDEBAR_WIDTH + 5;
  const GRID_Y = SIDEBAR_Y;
  const GRID_WIDTH = CONTENT_WIDTH - SIDEBAR_WIDTH - 5;
  const COL_WIDTH = GRID_WIDTH / 4;
  
  const drawQuestionColumn = (x: number, y: number, startQ: number, count: number) => {
      // Column Header
      doc.setFillColor(LIGHT_PINK[0], LIGHT_PINK[1], LIGHT_PINK[2]);
      setDrawPink();
      doc.setLineWidth(0.2);
      doc.rect(x, y, COL_WIDTH, 5, 'F');
      doc.rect(x, y, COL_WIDTH, 5, 'S');
      
      setPink();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text("Q.No", x + 4, y + 3.5);
      doc.text("Response", x + 18, y + 3.5);

      // Rows
      const rowH = 4.2;
      const bubbleGap = 4;
      
      for(let i=0; i<count; i++) {
          const qIdx = startQ + i - 1; // 0-based index
          const qNum = startQ + i;
          const currY = y + 5 + (i * rowH);
          
          // Ghosting if template has fewer questions
          const isGhost = questions.length > 0 && qNum > questions.length;
          
          if(isGhost) {
              doc.setDrawColor(230, 230, 230);
              doc.setTextColor(230, 230, 230);
          } else {
              setDrawPink();
              setPink();
          }

          // Q Num Box
          doc.setLineWidth(0.1); // Extremely thin lines for the grid
          doc.setFillColor(LIGHT_PINK[0], LIGHT_PINK[1], LIGHT_PINK[2]);
          if(!isGhost) doc.rect(x, currY, 8, rowH, 'F');
          doc.rect(x, currY, 8, rowH, 'S'); // Border
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.text(qNum.toString(), x + 4, currY + 3, { align: 'center' });

          // Options Container
          doc.rect(x + 8, currY, COL_WIDTH - 8, rowH, 'S');
          
          // Bubbles (1, 2, 3, 4)
          const options = [1, 2, 3, 4];
          const startBubbleX = x + 14;
          
          const markedIndex = (!isGhost && markedAnswers && markedAnswers.length > qIdx) ? markedAnswers[qIdx] : -1;

          options.forEach((opt, idx) => {
              const bx = startBubbleX + (idx * bubbleGap);
              const by = currY + (rowH / 2);
              const radius = 1.3;
              
              const isFilled = idx === markedIndex;
              
              doc.setLineWidth(0.15); // Thin bubbles
              if (isFilled) {
                  // Fill full black circle, no text visible
                  doc.setFillColor(0, 0, 0);
                  doc.circle(bx, by, radius, 'F');
              } else {
                  if (isGhost) {
                      doc.setDrawColor(230, 230, 230);
                      doc.setTextColor(230, 230, 230);
                  } else {
                      setPink();
                  }
                  doc.circle(bx, by, radius, 'S');
                  doc.setFontSize(5);
                  doc.setFont("helvetica", "normal");
                  doc.text(opt.toString(), bx, by + 0.5, { align: 'center' });
              }
          });
      }
      // Column border
      setDrawPink();
      doc.setLineWidth(0.2);
      doc.rect(x, y, COL_WIDTH, 5 + (count * rowH), 'S');
  };

  drawQuestionColumn(GRID_X, GRID_Y, 1, 50);
  drawQuestionColumn(GRID_X + COL_WIDTH, GRID_Y, 51, 50);
  drawQuestionColumn(GRID_X + (COL_WIDTH * 2), GRID_Y, 101, 50);
  drawQuestionColumn(GRID_X + (COL_WIDTH * 3), GRID_Y, 151, 50);

  // --- Footer ---
  const FOOTER_Y = GRID_Y + (50 * 4.2) + 10;
  
  // Declaration Box
  setDrawPink();
  doc.setLineWidth(0.2);
  doc.rect(MARGIN + 5, FOOTER_Y, 80, 25);
  doc.setFontSize(6);
  setPink();
  doc.text("DECLARATION BY CANDIDATE", MARGIN + 45, FOOTER_Y + 4, { align: 'center' });
  doc.text("I declare that the particulars filled in this form are correct.", MARGIN + 8, FOOTER_Y + 8);
  
  // Signature Box
  doc.line(MARGIN + 5, FOOTER_Y + 18, MARGIN + 85, FOOTER_Y + 18);
  doc.text("Signature of Candidate", MARGIN + 45, FOOTER_Y + 22, { align: 'center' });

  // Name Box
  const NAME_BOX_X = MARGIN + 90;
  doc.rect(NAME_BOX_X, FOOTER_Y, CONTENT_WIDTH - 95, 10);
  doc.setFillColor(LIGHT_PINK[0], LIGHT_PINK[1], LIGHT_PINK[2]);
  doc.rect(NAME_BOX_X, FOOTER_Y, CONTENT_WIDTH - 95, 4, 'F');
  doc.setDrawColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);
  doc.rect(NAME_BOX_X, FOOTER_Y, CONTENT_WIDTH - 95, 4, 'S'); // Header border
  
  doc.setTextColor(0,0,0);
  doc.setFontSize(6);
  doc.text("CANDIDATE'S NAME (IN BLOCK LETTERS)", NAME_BOX_X + 50, FOOTER_Y + 2.5, { align: 'center' });
  
  if (candidateName) {
      doc.setFontSize(10);
      doc.text(candidateName.substring(0, 30).toUpperCase(), NAME_BOX_X + 50, FOOTER_Y + 8, { align: 'center' });
  }

  // Invigilator Box
  doc.rect(NAME_BOX_X, FOOTER_Y + 12, CONTENT_WIDTH - 95, 13);
  doc.setFillColor(LIGHT_PINK[0], LIGHT_PINK[1], LIGHT_PINK[2]);
  doc.rect(NAME_BOX_X, FOOTER_Y + 12, CONTENT_WIDTH - 95, 4, 'F');
  doc.setDrawColor(THEME_COLOR[0], THEME_COLOR[1], THEME_COLOR[2]);
  doc.rect(NAME_BOX_X, FOOTER_Y + 12, CONTENT_WIDTH - 95, 4, 'S');
  
  doc.setTextColor(0,0,0);
  doc.setFontSize(6);
  doc.text("INVIGILATOR SIGNATURE", NAME_BOX_X + 50, FOOTER_Y + 14.5, { align: 'center' });


  // --- Fiducial Markers (Dense Tracking Grid) ---
  // Keep the 4 canonical corner anchors + add extra edge markers for better mobile tracking stability.
  setBlack();
  const fiducialSize = 5;
  const fiducialOffset = 2;
  const drawFiducial = (x: number, y: number, size = fiducialSize) => {
    doc.rect(x, y, size, size, 'F');
  };

  // Canonical corner anchors (used for perspective solve)
  drawFiducial(fiducialOffset, fiducialOffset); // Top Left
  drawFiducial(PAGE_WIDTH - fiducialSize - fiducialOffset, fiducialOffset); // Top Right
  drawFiducial(fiducialOffset, PAGE_HEIGHT - fiducialSize - fiducialOffset); // Bottom Left
  drawFiducial(PAGE_WIDTH - fiducialSize - fiducialOffset, PAGE_HEIGHT - fiducialSize - fiducialOffset); // Bottom Right

  // Extra tracking anchors (edge/mid points) for better detection confidence on handheld camera scans
  const midTopX = (PAGE_WIDTH - fiducialSize) / 2;
  const midBottomX = (PAGE_WIDTH - fiducialSize) / 2;
  const midLeftY = (PAGE_HEIGHT - fiducialSize) / 2;
  const midRightY = (PAGE_HEIGHT - fiducialSize) / 2;
  drawFiducial(midTopX, fiducialOffset); // Top center
  drawFiducial(midBottomX, PAGE_HEIGHT - fiducialSize - fiducialOffset); // Bottom center
  drawFiducial(fiducialOffset, midLeftY); // Left center
  drawFiducial(PAGE_WIDTH - fiducialSize - fiducialOffset, midRightY); // Right center

  // Quarter-edge anchors to improve alignment lock before all corners are perfectly framed
  const quarterTopLeftX = PAGE_WIDTH * 0.24 - fiducialSize / 2;
  const quarterTopRightX = PAGE_WIDTH * 0.76 - fiducialSize / 2;
  const quarterLeftUpperY = PAGE_HEIGHT * 0.24 - fiducialSize / 2;
  const quarterLeftLowerY = PAGE_HEIGHT * 0.76 - fiducialSize / 2;
  drawFiducial(quarterTopLeftX, fiducialOffset); // Top 25%
  drawFiducial(quarterTopRightX, fiducialOffset); // Top 75%
  drawFiducial(quarterTopLeftX, PAGE_HEIGHT - fiducialSize - fiducialOffset); // Bottom 25%
  drawFiducial(quarterTopRightX, PAGE_HEIGHT - fiducialSize - fiducialOffset); // Bottom 75%
  drawFiducial(fiducialOffset, quarterLeftUpperY); // Left 25%
  drawFiducial(fiducialOffset, quarterLeftLowerY); // Left 75%
  drawFiducial(PAGE_WIDTH - fiducialSize - fiducialOffset, quarterLeftUpperY); // Right 25%
  drawFiducial(PAGE_WIDTH - fiducialSize - fiducialOffset, quarterLeftLowerY); // Right 75%

  // Brand Watermark
  setPink();
  if (bottomNote && bottomNote.trim()) {
    doc.setFontSize(5);
    doc.setTextColor(160, 160, 160);
    doc.text(bottomNote, PAGE_WIDTH / 2, PAGE_HEIGHT - 6, { align: 'center' });
  }
  doc.setFontSize(6);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generated by ${brandConfig && brandConfig.showOnOmr ? brandConfig.name : 'Prisma Quiz'}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 3, { align: 'center' });

  // Determine filename
  let finalFilename = filename;
  if (!finalFilename) {
      if (questions.length === 0) {
          finalFilename = 'Blank_OMR_Sheet.pdf';
      } else if (markedAnswers.length > 0) {
          finalFilename = `${topic.replace(/\s+/g, '_')}_Demo.pdf`;
      } else {
          finalFilename = `${topic.replace(/\s+/g, '_')}_Blank_OMR.pdf`;
      }
  }

  doc.save(finalFilename);
};
