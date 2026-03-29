export type ExamType = 'mcq' | 'descriptive' | 'mixed';
export type MixMode = 'percent' | 'count';

export interface ExamPaperProfileRow {
  id: string;
  created_at: string;
  updated_at: string;
  knowledge_base_id: string;
  name: string;
  description: string | null;
  exam_type: ExamType;
  total_questions: number;
  figure_question_count: number;
  style_mode: MixMode;
  style_mix: Record<string, number>;
  subject_mode: MixMode;
  subject_mix: Record<string, number>;
  chapter_mode: MixMode;
  chapter_mix: Record<string, number>;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
}

export const STYLE_KEYS = ['mcq', 'reasoning', 'matching', 'statements'] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export const STYLE_LABELS: Record<StyleKey, string> = {
  mcq: 'MCQ',
  reasoning: 'Reasoning',
  matching: 'Matching',
  statements: 'Statements',
};
