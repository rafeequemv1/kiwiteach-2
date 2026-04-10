import { supabase } from '../../supabase/client';
import type { Question } from '../types';
import { topicTagIsExcluded } from '../../services/syllabusService';
import { questionHasFigure } from './topicSpreadPick';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value?: string | null): value is string =>
  !!value && UUID_RE.test(value);

const mapBankRowToQuestion = (bq: any): Question => ({
  id: bq.id,
  originalId: bq.id,
  text: bq.question_text,
  type: (bq.question_type || 'mcq') as any,
  difficulty: bq.difficulty as any,
  options: bq.options,
  correctIndex: bq.correct_index,
  explanation: bq.explanation,
  figureDataUrl: bq.figure_url,
  sourceFigureDataUrl: bq.source_figure_url,
  columnA: bq.column_a,
  columnB: bq.column_b,
  correctMatches: bq.correct_matches,
  sourceChapterId: bq.chapter_id,
  sourceSubjectName: bq.subject_name,
  sourceBiologyBranch:
    bq.biology_branch === 'botany' || bq.biology_branch === 'zoology' ? bq.biology_branch : undefined,
  sourceChapterName: bq.chapter_name,
  pageNumber: bq.page_number,
  topic_tag: bq.topic_tag,
});

interface EligibleInput {
  classId?: string | null;
  chapterId: string;
  difficulty?: string | null;
  /** When set, only this question_type is returned (still uses class usage RPC when classId is set). */
  questionType?: string | null;
  /** When true, only rows with a non-empty figure_url (RPC / direct query). */
  requireFigure?: boolean;
  excludeIds?: string[];
  limit?: number;
  allowRepeats?: boolean;
  includeUsedQuestionIds?: string[];
  /** Normalized (trim + lower) topic labels — questions whose topic_tag matches are dropped. */
  excludedTopicLabelsNormalized?: string[];
}

function applyTopicExclusion(rows: Question[], excludedNormalized?: string[] | null): Question[] {
  const ex = excludedNormalized || [];
  return ex.length ? rows.filter((q) => !topicTagIsExcluded(q.topic_tag, ex)) : rows;
}

/** Direct bank query — no class usage filter (no class or RPC unavailable). */
async function fetchEligibleQuestionsDirect(input: EligibleInput): Promise<Question[]> {
  const limit = Math.max(1, input.limit ?? 20);
  const excludeIds = (input.excludeIds || []).filter(isUuid);
  let query = supabase.from('question_bank_neet').select('*').eq('chapter_id', input.chapterId);
  if (input.questionType) query = query.eq('question_type', input.questionType);
  if (input.difficulty) query = query.eq('difficulty', input.difficulty);
  if (input.requireFigure) query = query.not('figure_url', 'is', null);
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  let rows = (data || []).map(mapBankRowToQuestion);
  if (input.requireFigure) rows = rows.filter(questionHasFigure);
  return applyTopicExclusion(rows, input.excludedTopicLabelsNormalized);
}

export async function fetchEligibleQuestions(input: EligibleInput): Promise<Question[]> {
  const limit = Math.max(1, input.limit ?? 20);
  const excludeIds = (input.excludeIds || []).filter(isUuid);
  const includeUsedQuestionIds = (input.includeUsedQuestionIds || []).filter(isUuid);
  const typeFilter = input.questionType?.trim() || null;

  if (input.classId && isUuid(input.classId)) {
    const { data, error } = await supabase.rpc('get_eligible_questions_for_class', {
      target_class_id: input.classId,
      target_chapter_id: input.chapterId,
      target_difficulty: input.difficulty || null,
      exclude_question_ids: excludeIds,
      row_limit: limit,
      allow_repeats: !!input.allowRepeats,
      include_used_question_ids: includeUsedQuestionIds,
      target_question_type: typeFilter,
      require_figure: !!input.requireFigure,
    });
    if (!error && Array.isArray(data)) {
      let mapped = data.map(mapBankRowToQuestion);
      if (input.requireFigure) mapped = mapped.filter(questionHasFigure);
      return applyTopicExclusion(mapped, input.excludedTopicLabelsNormalized);
    }
    if (error) {
      console.warn('get_eligible_questions_for_class failed; falling back to direct bank query', error);
    }
  }

  return fetchEligibleQuestionsDirect({ ...input, questionType: typeFilter });
}

export async function fetchUsedQuestionsForClass(
  classId?: string | null,
  chapterId?: string | null,
  limit = 100
): Promise<Question[]> {
  if (!classId || !isUuid(classId)) return [];
  const { data, error } = await supabase.rpc('get_used_questions_for_class', {
    target_class_id: classId,
    target_chapter_id: chapterId || null,
    row_limit: Math.max(1, limit),
  });
  if (error || !Array.isArray(data)) return [];
  return data.map(mapBankRowToQuestion);
}

export async function recordQuestionUsageForTest(params: {
  testId?: string | null;
  classIds?: string[];
  questionIds?: string[];
}) {
  const testId = params.testId;
  const classIds = (params.classIds || []).filter(isUuid);
  const questionIds = (params.questionIds || []).filter(isUuid);
  if (!testId || !isUuid(testId) || classIds.length === 0 || questionIds.length === 0) return;

  const { error } = await supabase.rpc('record_question_usage_for_test', {
    target_test_id: testId,
    target_class_ids: classIds,
    target_question_ids: questionIds,
  });
  if (error) {
    throw new Error(`record_question_usage_for_test: ${error.message}`);
  }
}
