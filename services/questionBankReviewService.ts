import { supabase } from '../supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';

function formatSupabaseErr(err: PostgrestError | { message?: string } | null): string {
  if (!err) return 'Unknown error';
  const m = (err as PostgrestError).message;
  if (m) return m;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export type ReviewMarkInput = {
  wrong: boolean;
  outOfSyllabus: boolean;
  latexIssue: boolean;
  figureIssue: boolean;
  notes: string;
};

/**
 * Persist review flags for the current user against a hub question (RPC; RLS-safe).
 */
export async function upsertQuestionBankReviewMark(questionId: string, input: ReviewMarkInput): Promise<void> {
  const { error } = await supabase.rpc('upsert_question_bank_review_mark', {
    p_question_id: questionId,
    p_wrong: input.wrong,
    p_out_of_syllabus: input.outOfSyllabus,
    p_latex_issue: input.latexIssue,
    p_figure_issue: input.figureIssue,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw new Error(formatSupabaseErr(error));
}

export async function fetchReviewMarkForQuestion(
  questionId: string
): Promise<ReviewMarkInput & { id: string | null }> {
  const { data, error } = await supabase
    .from('question_bank_review_marks')
    .select(
      'id, mark_wrong, mark_out_of_syllabus, mark_latex_issue, mark_figure_issue, notes'
    )
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseErr(error));
  if (!data) {
    return {
      id: null,
      wrong: false,
      outOfSyllabus: false,
      latexIssue: false,
      figureIssue: false,
      notes: '',
    };
  }
  return {
    id: data.id as string,
    wrong: !!data.mark_wrong,
    outOfSyllabus: !!data.mark_out_of_syllabus,
    latexIssue: !!data.mark_latex_issue,
    figureIssue: !!data.mark_figure_issue,
    notes: (data.notes as string) || '',
  };
}
