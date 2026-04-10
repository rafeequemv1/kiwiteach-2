import { Question, BrandingConfig } from '../types';
import { jsPDF } from 'jspdf';
import { matchingRowLetter, ROMAN_ROW_SUFFIX } from '../../utils/matchingPaperColumns';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

export interface AnswerKeyPaperStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  marginX: number;
  marginY: number;
}

export interface AnswerKeyConfig {
  topic: string;
  questions: Question[];
  brandConfig?: BrandingConfig;
  filename?: string;
  /** When true, answer line + explanation body use the same HTML path as the test paper (`parsePseudoLatexAndMath` + `.math-content`). */
  includeExplanations?: boolean;
  /** Match live paper typography and margins (defaults if omitted). */
  paperStyle?: AnswerKeyPaperStyle;
}

const PAGE_W = 210;
const MM_TO_PX = 96 / 25.4;
/** Same factor as ResultScreen question pages. */
const QUESTION_PAGE_TOP_MARGIN_FRAC = 0.35;

const DEFAULT_PAPER_STYLE: AnswerKeyPaperStyle = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: 11,
  lineHeight: 1.15,
  marginX: 12,
  marginY: 12,
};

function formatCorrectAnswerShort(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    const parts = q.correctMatches.map((bIdx, aIdx) => {
      const r = ROMAN_ROW_SUFFIX[bIdx] ?? String(bIdx + 1);
      return `${matchingRowLetter(aIdx)}→${r}`;
    });
    return parts.join(', ');
  }
  const idx = Math.max(0, Math.min(25, q.correctIndex ?? 0));
  return `(${String.fromCharCode(65 + idx)})`;
}

/** Compact key row: numeric option index on paper answer key page; matching uses letter map. */
function answerDisplayForCompactRow(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    return formatCorrectAnswerShort(q);
  }
  return String((q.correctIndex ?? 0) + 1);
}

/** Same header line as pagination `explanation-box` (ResultScreen). */
function explanationAnswerHeaderLine(q: Question): string {
  if (q.type === 'matching' && Array.isArray(q.correctMatches) && q.correctMatches.length) {
    return `Ans: ${formatCorrectAnswerShort(q)}`;
  }
  return `Ans: (${(q.correctIndex ?? 0) + 1})`;
}

function mergePaperStyle(s?: AnswerKeyPaperStyle): AnswerKeyPaperStyle {
  return { ...DEFAULT_PAPER_STYLE, ...s };
}

/** Build DOM in `doc` (e.g. iframe) so html2canvas never inherits host Tailwind/shadcn `oklch()` variables. */
function buildExportRoot(
  config: AnswerKeyConfig,
  paper: AnswerKeyPaperStyle,
  doc: Document
): HTMLElement {
  const { topic, questions, brandConfig, includeExplanations } = config;
  const padTop = paper.marginY * QUESTION_PAGE_TOP_MARGIN_FRAC;
  const padX = paper.marginX;
  const padBottom = paper.marginY;

  const root = doc.createElement('div');
  root.className = 'answer-key-pdf-export-root';
  root.setAttribute('data-answer-key-export', '1');
  root.style.cssText = [
    'box-sizing:border-box',
    'width:210mm',
    'min-height:297mm',
    'background:#ffffff',
    'color:#000000',
    `font-family:${paper.fontFamily}`,
    `font-size:${paper.fontSize}pt`,
    `line-height:${paper.lineHeight}`,
    'color-scheme:light',
  ].join(';');

  const style = doc.createElement('style');
  style.textContent = `
    .answer-key-pdf-export-root .math-content .katex { font-size: 1em !important; }
    .answer-key-pdf-export-root .math-content .katex-display { margin: 0.2em 0 !important; }
    .answer-key-pdf-export-root .math-content { word-break: break-word; overflow-wrap: anywhere; }
  `;
  root.appendChild(style);

  const inner = doc.createElement('div');
  inner.style.cssText = [
    'box-sizing:border-box',
    'width:100%',
    'min-height:100%',
    `padding:${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm`,
  ].join(';');

  if (includeExplanations) {
    const head = doc.createElement('div');
    head.style.cssText =
      'text-align:center;border-bottom:0.5pt solid #000;padding-bottom:8px;margin-bottom:16px;color:#000';
    head.innerHTML = `
      <div style="font-size:11pt;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">Answer key & explanations</div>
      <div style="margin-top:6px;font-size:7pt;font-weight:800;text-transform:uppercase;color:#52525b;display:flex;justify-content:center;gap:24px;flex-wrap:wrap">
        <span style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${escapeAttr(topic)}</span>
        <span>Questions: ${questions.length}</span>
      </div>
    `;
    inner.appendChild(head);

    const list = doc.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:12px;color:#000';

    questions.forEach((q, i) => {
      const block = doc.createElement('div');
      block.style.cssText =
        'break-inside:avoid;page-break-inside:avoid;margin-bottom:4px;color:#000;border-bottom:0.25pt dotted #e5e7eb;padding-bottom:10px';
      const ansLine = doc.createElement('div');
      ansLine.style.cssText =
        'color:#000;font-size:0.9em;font-weight:700;margin-bottom:4px;font-family:inherit';
      ansLine.textContent = `${i + 1}. ${explanationAnswerHeaderLine(q)}`;

      const box = doc.createElement('div');
      box.className = 'math-content';
      box.style.cssText = [
        'padding:6px 8px',
        'background-color:#fcfcfc',
        'border:0.4pt solid #e5e7eb',
        'border-radius:2px',
        'color:#000',
        'font-size:0.95em',
        'line-height:1.3',
        'font-family:inherit',
      ].join(';');
      box.innerHTML = parsePseudoLatexAndMath(q.explanation || '');

      block.appendChild(ansLine);
      block.appendChild(box);
      list.appendChild(block);
    });
    inner.appendChild(list);
  } else {
    const head = doc.createElement('div');
    head.style.cssText =
      'text-align:center;border-bottom:0.5pt solid #000;padding-bottom:8px;margin-bottom:20px;color:#000';
    const brand = brandConfig?.name ? escapeAttr(brandConfig.name) : '';
    head.innerHTML = `
      <div style="font-size:11pt;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;">Official Answer Key</div>
      <div style="margin-top:6px;font-size:7pt;font-weight:800;text-transform:uppercase;color:#52525b;display:flex;justify-content:center;gap:24px;flex-wrap:wrap">
        <span style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${escapeAttr(topic)}</span>
        <span>Questions: ${questions.length}</span>
        <span>Max Marks: ${questions.length * 4}</span>
      </div>
      ${brand ? `<div style="margin-top:4px;font-size:7pt;font-weight:700;color:#000">${brand}</div>` : ''}
    `;
    inner.appendChild(head);

    const numColumns = 5;
    const itemsPerColumn = Math.ceil(questions.length / numColumns);
    const columns = Array.from({ length: numColumns }, (_, colIndex) => {
      const start = colIndex * itemsPerColumn;
      return questions.slice(start, start + itemsPerColumn);
    });

    const grid = doc.createElement('div');
    grid.style.cssText = 'display:flex;gap:8mm;flex:1;align-items:flex-start;color:#000';

    columns.forEach((col, colIndex) => {
      const c = doc.createElement('div');
      c.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0';
      const colStart = colIndex * itemsPerColumn;
      col.forEach((q, j) => {
        const globalIdx = colStart + j;
        const row = doc.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px dotted #d4d4d8;color:#000';
        const num = doc.createElement('span');
        num.style.cssText = 'font-weight:700;font-size:7.5pt;color:#71717a;width:20px';
        num.textContent = `${globalIdx + 1}.`;
        const val = doc.createElement('span');
        val.style.cssText = 'font-weight:900;font-size:8pt;color:#18181b;padding-right:2px';
        val.textContent = answerDisplayForCompactRow(q);
        row.appendChild(num);
        row.appendChild(val);
        c.appendChild(row);
      });
      grid.appendChild(c);
    });
    inner.appendChild(grid);

    const foot = doc.createElement('div');
    foot.style.cssText =
      'margin-top:16px;padding-top:8px;border-top:0.5pt solid #000;display:flex;justify-content:space-between;align-items:flex-end;font-size:5pt;color:#a1a1aa;text-transform:uppercase;font-weight:800';
    foot.innerHTML = `
      <span>ID: ${Math.random().toString(36).substring(7).toUpperCase()}</span>
      <span style="text-align:right;font-size:7pt;font-weight:700;color:#000;text-transform:none">${brandConfig?.name ? escapeAttr(brandConfig.name) : 'KiwiTeach'}</span>
    `;
    inner.appendChild(foot);
  }

  const footNote = doc.createElement('div');
  footNote.style.cssText = 'margin-top:14px;font-size:7pt;color:#a1a1aa;font-style:italic;text-align:center';
  footNote.textContent = `Generated by ${brandConfig?.name || 'KiwiTeach'}`;
  inner.appendChild(footNote);

  root.appendChild(inner);
  return root;
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same KaTeX major as package.json — loaded only inside the export iframe (no host `oklch` CSS). */
const KATEX_CSS_HREF = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

async function domToPdf(config: AnswerKeyConfig, paper: AnswerKeyPaperStyle, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-9999px;top:0;width:210mm;min-height:297mm;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  if (!idoc) {
    iframe.remove();
    throw new Error('Cannot create isolated document for PDF export');
  }

  idoc.open();
  idoc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light">' +
      '<style>html,body{margin:0;background:#fff;color:#000;}</style></head><body></body></html>'
  );
  idoc.close();

  await new Promise<void>((resolve) => {
    const link = idoc.createElement('link');
    link.rel = 'stylesheet';
    link.href = KATEX_CSS_HREF;
    link.crossOrigin = 'anonymous';
    const done = () => resolve();
    link.onload = done;
    link.onerror = done;
    idoc.head.appendChild(link);
  });

  const root = buildExportRoot(config, paper, idoc);
  idoc.body.appendChild(root);

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  try {
    if (idoc.fonts?.ready) await idoc.fonts.ready;
  } catch {
    /* ignore */
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const windowWidth = Math.max(600, Math.round(PAGE_W * MM_TO_PX));

  /** jsPDF moves the clone onto the host `document.body`; host Tailwind/shadcn use `oklch()` which html2canvas cannot parse. */
  const hack = document.createElement('style');
  hack.id = 'kiwi-answer-key-pdf-hack';
  hack.textContent = `
    .html2pdf__overlay, .html2pdf__overlay * {
      color: #000000 !important;
    }
  `;
  document.head.appendChild(hack);

  try {
    await doc.html(root, {
      x: 0,
      y: 0,
      margin: 0,
      autoPaging: 'text',
      width: PAGE_W,
      windowWidth,
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const s = clonedDoc.createElement('style');
          s.textContent = `
            :root, :host {
              --background: #ffffff;
              --foreground: #000000;
              --border: #e5e7eb;
              --muted-foreground: #71717a;
              --card: #ffffff;
              --card-foreground: #000000;
            }
          `;
          clonedDoc.documentElement.insertBefore(s, clonedDoc.documentElement.firstChild);
        },
      },
    });
    doc.save(filename);
  } finally {
    hack.remove();
    iframe.remove();
  }
}

export async function generateAnswerKeyPDF(config: AnswerKeyConfig): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('Answer key PDF export requires a browser environment');
  }
  const paper = mergePaperStyle(config.paperStyle);
  const safeName =
    config.filename ||
    `${config.topic.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_')}_Answer_Key${config.includeExplanations ? '_Explained' : ''}.pdf`;
  await domToPdf(config, paper, safeName);
}
