import React from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import html2canvas from 'html2canvas';
import { BrandingConfig, Question } from '../types';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

type BlockType = 'cover-page' | 'question-core' | 'explanation-box' | 'subject-header' | 'answer-key';

export interface ExportQuizBlock {
  type: BlockType;
  question?: Question & { column_a?: string[]; column_b?: string[] };
  globalIndex?: number;
  content?: string;
}

export interface ExportPageLayout {
  leftCol: ExportQuizBlock[];
  rightCol: ExportQuizBlock[];
  isCover?: boolean;
}

export interface PdfProgress {
  percent: number;
  label: string;
}

interface ExportQuizPdfOptions {
  topic: string;
  questions: Question[];
  pages: ExportPageLayout[];
  brandConfig: BrandingConfig;
  onProgress?: (progress: PdfProgress) => void;
}

type RichAssetMap = Record<string, string>;

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', padding: 20, fontFamily: 'Times-Roman' },
  coverWrap: { flex: 1, borderWidth: 1, borderColor: '#000', padding: 12, justifyContent: 'space-between' },
  coverTop: { alignItems: 'center' },
  coverTitle: { fontSize: 18, fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' },
  coverSub: { marginTop: 8, fontSize: 11, textTransform: 'uppercase', textAlign: 'center' },
  coverBrand: { marginTop: 6, fontSize: 10, color: '#444', textAlign: 'center' },
  coverStats: { marginTop: 10, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#000', paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between' },
  statCol: { width: '33%', alignItems: 'center' },
  statLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase' },
  statValue: { fontSize: 10, fontWeight: 700 },
  topRule: { height: 0.5, backgroundColor: '#000', marginBottom: 8 },
  bottomRule: { height: 0.5, backgroundColor: '#000', marginTop: 8 },
  columnsWrap: { flex: 1, flexDirection: 'row', gap: 10 },
  col: { width: '50%' },
  sectionHeader: {
    marginTop: 2,
    marginBottom: 4,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#000',
    paddingVertical: 1.5,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
  qBlock: { marginBottom: 4 },
  qHeader: { flexDirection: 'row' },
  qNum: { width: 14, fontSize: 9, fontWeight: 700 },
  qText: { flex: 1, fontSize: 9, lineHeight: 1.35 },
  optionLine: { marginLeft: 14, fontSize: 8.5, lineHeight: 1.3 },
  expBox: {
    marginTop: 2,
    marginBottom: 5,
    borderWidth: 0.4,
    borderColor: '#d1d5db',
    backgroundColor: '#fafafa',
    padding: 4,
  },
  expAns: { fontSize: 8, fontWeight: 700, marginBottom: 2 },
  expText: { fontSize: 8, lineHeight: 1.3 },
  figure: { marginLeft: 14, marginTop: 3, marginBottom: 3, objectFit: 'contain', maxHeight: 90 },
  footer: {
    marginTop: 6,
    borderTopWidth: 0.5,
    borderColor: '#ddd',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: { fontSize: 7, color: '#666', textTransform: 'uppercase' },
  footerCenter: { fontSize: 8, color: '#111', fontStyle: 'italic' },
  keyTitle: { fontSize: 13, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', marginBottom: 8 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  keyCell: {
    width: '18.5%',
    borderWidth: 0.4,
    borderColor: '#ddd',
    paddingVertical: 3,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keyQuestion: { fontSize: 8, color: '#666' },
  keyAnswer: { fontSize: 8, fontWeight: 800 },
});

const htmlToText = (input?: string): string => {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const seemsMathHeavy = (input?: string): boolean => {
  if (!input) return false;
  return /\\[a-zA-Z]+|\$[^$]+\$|\\\(|\\\[|\^|_/.test(input);
};

const blockAssetKey = (block: ExportQuizBlock): string | null => {
  const qid = block.question?.id;
  if (!qid) return null;
  if (block.type === 'question-core') return `${qid}::core`;
  if (block.type === 'explanation-box') return `${qid}::exp`;
  return null;
};

const buildQuestionCoreHtml = (block: ExportQuizBlock): string | null => {
  const q = block.question;
  if (!q) return null;

  const contentParts: string[] = [];
  const qNumber = (block.globalIndex ?? 0) + 1;
  contentParts.push(
    `<div style="display:flex;gap:6px;align-items:flex-start;">
      <span style="font-weight:700;">${qNumber}.</span>
      <span>${parsePseudoLatexAndMath(q.text || '')}</span>
    </div>`
  );

  const colA = q.columnA || q.column_a;
  const colB = q.columnB || q.column_b;
  if (q.type === 'matching' && colA && colA.length > 0) {
    const rows = colA
      .map((left, i) => {
        const right = colB?.[i] || '';
        return `<div style="margin-left:20px;line-height:1.35;">(${String.fromCharCode(65 + i)}) ${parsePseudoLatexAndMath(left)} &nbsp;&nbsp; (${['i', 'ii', 'iii', 'iv', 'v'][i] || i + 1}) ${parsePseudoLatexAndMath(right)}</div>`;
      })
      .join('');
    contentParts.push(`<div style="margin-top:3px;">${rows}</div>`);
  }

  if (q.options?.length) {
    const options = q.options
      .map(
        (option, idx) =>
          `<div style="margin-left:20px;line-height:1.35;">(${idx + 1}) ${parsePseudoLatexAndMath(option)}</div>`
      )
      .join('');
    contentParts.push(`<div style="margin-top:3px;">${options}</div>`);
  }

  return contentParts.join('');
};

const buildExplanationHtml = (block: ExportQuizBlock): string | null => {
  const q = block.question;
  if (!q) return null;
  const explanation = block.content || q.explanation || '';
  return `
    <div style="border:0.4pt solid #d1d5db;background:#fafafa;padding:6px;border-radius:2px;">
      <div style="font-weight:700;margin-bottom:3px;">Ans: (${(q.correctIndex ?? 0) + 1})</div>
      <div style="line-height:1.35;">${parsePseudoLatexAndMath(explanation)}</div>
    </div>
  `;
};

const renderHtmlToPngDataUrl = async (html: string, widthPx = 760): Promise<string> => {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${widthPx}px`;
  host.style.padding = '0';
  host.style.margin = '0';
  host.style.background = '#ffffff';
  host.style.color = '#000000';
  host.style.fontFamily = "'Times New Roman', Times, serif";
  host.style.fontSize = '15px';
  host.style.lineHeight = '1.35';
  host.style.zIndex = '-1';
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    if ('fonts' in document) {
      try {
        await (document as any).fonts.ready;
      } catch {
        // no-op
      }
    }
    const canvas = await html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, Math.min(3, window.devicePixelRatio || 1)),
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
    });
    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(host);
  }
};

const collectRichMathAssets = async (
  pages: ExportPageLayout[],
  onProgress?: (progress: PdfProgress) => void
): Promise<RichAssetMap> => {
  const assets: RichAssetMap = {};
  const candidates: Array<{ key: string; html: string }> = [];

  for (const page of pages) {
    for (const block of [...page.leftCol, ...page.rightCol]) {
      const key = blockAssetKey(block);
      if (!key || assets[key]) continue;

      if (block.type === 'question-core') {
        const q = block.question;
        if (!q) continue;
        const inputs = [
          q.text,
          ...(q.options || []),
          ...(q.columnA || q.column_a || []),
          ...(q.columnB || q.column_b || []),
        ];
        if (!inputs.some((entry) => seemsMathHeavy(entry))) continue;
        const html = buildQuestionCoreHtml(block);
        if (html) candidates.push({ key, html });
      } else if (block.type === 'explanation-box') {
        const source = `${block.content || ''} ${block.question?.explanation || ''}`;
        if (!seemsMathHeavy(source)) continue;
        const html = buildExplanationHtml(block);
        if (html) candidates.push({ key, html });
      }
    }
  }

  if (candidates.length === 0) return assets;

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    onProgress?.({
      percent: 10 + Math.floor(((i + 1) / candidates.length) * 30),
      label: `Preparing math ${i + 1}/${candidates.length}`,
    });
    assets[item.key] = await renderHtmlToPngDataUrl(item.html);
  }

  return assets;
};

const QuestionBlock: React.FC<{ block: ExportQuizBlock; richAssetMap: RichAssetMap }> = ({ block, richAssetMap }) => {
  const q = block.question;
  if (!q) return null;
  const key = blockAssetKey(block);
  const richImage = key ? richAssetMap[key] : undefined;
  const colA = q.columnA || q.column_a;
  const colB = q.columnB || q.column_b;
  const qText = htmlToText(q.text);

  if (block.type === 'explanation-box') {
    if (richImage) {
      return <Image src={richImage} style={{ width: '100%', marginTop: 2, marginBottom: 5, objectFit: 'contain' }} />;
    }
    const explanationText = htmlToText(block.content || q.explanation);
    return (
      <View style={styles.expBox}>
        <Text style={styles.expAns}>Ans: ({(q.correctIndex ?? 0) + 1})</Text>
        <Text style={styles.expText}>{explanationText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.qBlock}>
      {richImage ? (
        <Image src={richImage} style={{ width: '100%', objectFit: 'contain' }} />
      ) : (
        <>
      <View style={styles.qHeader}>
        <Text style={styles.qNum}>{(block.globalIndex ?? 0) + 1}.</Text>
        <Text style={styles.qText}>{qText}</Text>
      </View>

      {q.figureDataUrl ? <Image src={q.figureDataUrl} style={styles.figure} /> : null}

      {q.type === 'matching' && colA && colA.length > 0 ? (
        <View style={{ marginTop: 2, marginLeft: 14 }}>
          {colA.map((left, i) => (
            <Text key={`${q.id}-m-${i}`} style={styles.optionLine}>
              ({String.fromCharCode(65 + i)}) {htmlToText(left)}    ({['i', 'ii', 'iii', 'iv', 'v'][i] || i + 1}) {htmlToText(colB?.[i] || '')}
            </Text>
          ))}
        </View>
      ) : null}

      {q.options?.length ? (
        <View style={{ marginTop: 2 }}>
          {q.options.map((option, i) => (
            <Text key={`${q.id}-o-${i}`} style={styles.optionLine}>
              ({i + 1}) {htmlToText(option)}
            </Text>
          ))}
        </View>
      ) : null}
        </>
      )}
    </View>
  );
};

const QuizPdfDocument: React.FC<{
  topic: string;
  pages: ExportPageLayout[];
  questions: Question[];
  brandConfig: BrandingConfig;
  richAssetMap: RichAssetMap;
}> = ({ topic, pages, questions, brandConfig, richAssetMap }) => {
  return (
    <Document>
      {pages.map((p, idx) => {
        const isAnswerKeyPage = p.leftCol[0]?.type === 'answer-key';
        if (p.isCover) {
          return (
            <Page key={`cover-${idx}`} size="A4" style={styles.page}>
              <View style={styles.coverWrap}>
                <View style={styles.coverTop}>
                  <Text style={styles.coverTitle}>{brandConfig.name || 'Assessment'}</Text>
                  <Text style={styles.coverSub}>{topic}</Text>
                  <Text style={styles.coverBrand}>Authorized Assessment</Text>
                </View>
                <View style={styles.coverStats}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Items</Text>
                    <Text style={styles.statValue}>{questions.length}</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Duration</Text>
                    <Text style={styles.statValue}>180 MINS</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Max Marks</Text>
                    <Text style={styles.statValue}>{questions.length * 4}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.footer}>
                <Text style={styles.footerText}>{topic}</Text>
                <Text style={styles.footerCenter}>integrated assessment engine</Text>
                <Text style={styles.footerText}>Page {idx + 1} / {pages.length}</Text>
              </View>
            </Page>
          );
        }

        if (isAnswerKeyPage) {
          return (
            <Page key={`answer-key-${idx}`} size="A4" style={styles.page}>
              <Text style={styles.keyTitle}>Official Answer Key</Text>
              <View style={styles.keyGrid}>
                {questions.map((q, qIdx) => (
                  <View key={`key-${q.id || qIdx}`} style={styles.keyCell}>
                    <Text style={styles.keyQuestion}>{qIdx + 1}</Text>
                    <Text style={styles.keyAnswer}>{(q.correctIndex ?? 0) + 1}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.footer}>
                <Text style={styles.footerText}>{topic}</Text>
                <Text style={styles.footerCenter}>integrated assessment engine</Text>
                <Text style={styles.footerText}>Page {idx + 1} / {pages.length}</Text>
              </View>
            </Page>
          );
        }

        return (
          <Page key={`quiz-${idx}`} size="A4" style={styles.page}>
            <View style={styles.topRule} />
            <View style={styles.columnsWrap}>
              <View style={styles.col}>
                {p.leftCol.map((block, blockIdx) =>
                  block.type === 'subject-header' ? (
                    <Text key={`left-sh-${idx}-${blockIdx}`} style={styles.sectionHeader}>
                      PART: {htmlToText(block.content)}
                    </Text>
                  ) : (
                    <QuestionBlock key={`left-b-${idx}-${blockIdx}`} block={block} richAssetMap={richAssetMap} />
                  )
                )}
              </View>
              <View style={{ width: 0.5, backgroundColor: '#000' }} />
              <View style={styles.col}>
                {p.rightCol.map((block, blockIdx) =>
                  block.type === 'subject-header' ? (
                    <Text key={`right-sh-${idx}-${blockIdx}`} style={styles.sectionHeader}>
                      PART: {htmlToText(block.content)}
                    </Text>
                  ) : (
                    <QuestionBlock key={`right-b-${idx}-${blockIdx}`} block={block} richAssetMap={richAssetMap} />
                  )
                )}
              </View>
            </View>
            <View style={styles.bottomRule} />
            <View style={styles.footer}>
              <Text style={styles.footerText}>{topic}</Text>
              <Text style={styles.footerCenter}>integrated assessment engine</Text>
              <Text style={styles.footerText}>Page {idx + 1} / {pages.length}</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const exportQuizPdfWithReactPdf = async (opts: ExportQuizPdfOptions): Promise<void> => {
  const { topic, questions, pages, brandConfig, onProgress } = opts;
  const emit = (percent: number, label: string) => onProgress?.({ percent, label });

  emit(8, 'Preparing pages');
  const richAssetMap = await collectRichMathAssets(pages, onProgress);

  const safeTitle = (topic || 'quiz-paper')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  emit(45, 'Composing PDF layout');
  const instance = pdf(
    <QuizPdfDocument
      topic={topic}
      pages={pages}
      questions={questions}
      brandConfig={brandConfig}
      richAssetMap={richAssetMap}
    />
  );

  emit(78, 'Rendering document');
  const blob = await instance.toBlob();

  emit(95, 'Downloading file');
  triggerDownload(blob, `${safeTitle}.pdf`);
  emit(100, 'Done');
};

