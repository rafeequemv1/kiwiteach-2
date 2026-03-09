import React from 'react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

type BlockType = 'cover-page' | 'question-core' | 'explanation-box' | 'subject-header' | 'answer-key';

interface Question {
  id: string;
  type: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  columnA?: string[];
  columnB?: string[];
  column_a?: string[];
  column_b?: string[];
}

interface ExportQuizBlock {
  type: BlockType;
  question?: Question;
  globalIndex?: number;
  content?: string;
}

interface ExportPageLayout {
  leftCol: ExportQuizBlock[];
  rightCol: ExportQuizBlock[];
  isCover?: boolean;
}

interface BrandingConfig {
  name: string;
}

interface ApiBody {
  topic: string;
  questions: Question[];
  pages: ExportPageLayout[];
  brandConfig: BrandingConfig;
}

interface ApiRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', padding: 20, fontFamily: 'Times-Roman' },
  coverWrap: { flex: 1, borderWidth: 1, borderColor: '#000', padding: 12, justifyContent: 'space-between' },
  coverTitle: { fontSize: 16, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase' },
  coverSub: { marginTop: 8, fontSize: 10, textAlign: 'center', textTransform: 'uppercase' },
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

const QuestionBlock: React.FC<{ block: ExportQuizBlock }> = ({ block }) => {
  const q = block.question;
  if (!q) return null;
  const colA = q.columnA || q.column_a;
  const colB = q.columnB || q.column_b;

  if (block.type === 'explanation-box') {
    return (
      <View style={styles.expBox}>
        <Text style={styles.expAns}>Ans: ({(q.correctIndex ?? 0) + 1})</Text>
        <Text style={styles.expText}>{htmlToText(block.content || q.explanation)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.qBlock}>
      <View style={styles.qHeader}>
        <Text style={styles.qNum}>{(block.globalIndex ?? 0) + 1}.</Text>
        <Text style={styles.qText}>{htmlToText(q.text)}</Text>
      </View>
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
    </View>
  );
};

const QuizPdfDocument: React.FC<{
  topic: string;
  pages: ExportPageLayout[];
  questions: Question[];
  brandConfig: BrandingConfig;
}> = ({ topic, pages, questions, brandConfig }) => (
  <Document>
    {pages.map((p, idx) => {
      const isAnswerKeyPage = p.leftCol[0]?.type === 'answer-key';
      if (p.isCover) {
        return (
          <Page key={`cover-${idx}`} size="A4" style={styles.page}>
            <View style={styles.coverWrap}>
              <View>
                <Text style={styles.coverTitle}>{brandConfig.name || 'Assessment'}</Text>
                <Text style={styles.coverSub}>{topic}</Text>
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
                  <QuestionBlock key={`left-b-${idx}-${blockIdx}`} block={block} />
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
                  <QuestionBlock key={`right-b-${idx}-${blockIdx}`} block={block} />
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

const normalizeBody = (raw: unknown): ApiBody | null => {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Partial<ApiBody>;
  if (!body.topic || !Array.isArray(body.questions) || !Array.isArray(body.pages) || !body.brandConfig) return null;
  return {
    topic: String(body.topic),
    questions: body.questions as Question[],
    pages: body.pages as ExportPageLayout[],
    brandConfig: body.brandConfig as BrandingConfig,
  };
};

async function readJsonBody(req: ApiRequest): Promise<unknown> {
  if (req.body) return req.body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk as Uint8Array);
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  return JSON.parse(text);
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const rawBody = await readJsonBody(req);
    const body = normalizeBody(rawBody);
    if (!body) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid payload' }));
      return;
    }

    const doc = (
      <QuizPdfDocument
        topic={body.topic}
        pages={body.pages}
        questions={body.questions}
        brandConfig={body.brandConfig}
      />
    );
    const pdfBuffer = await pdf(doc).toBuffer();
    const safeName = body.topic.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80) || 'quiz-paper';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.end(pdfBuffer);
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error?.message || 'Failed to generate PDF' }));
  }
}

