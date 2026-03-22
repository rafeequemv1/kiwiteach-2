import { supabase } from '../../supabase/client';
import type { Question } from '../types';

/** Strip correct answers before sending exam to the client (teachers keep full rows in DB). */
export function sanitizeQuestionsForStudentExam(questions: Question[]): Question[] {
  return (questions || []).map((q) => ({
    ...q,
    correctIndex: -1,
    explanation: '',
    correctMatches: undefined,
  }));
}

export type SubmitAttemptResult = {
  attempt_id: string;
  score: number;
  max_score: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  attempted_count: number;
  question_count: number;
};

export async function submitTestAttempt(
  testId: string,
  answersByIndex: Record<number, number | undefined>,
  questionCount: number,
  durationSeconds?: number | null
): Promise<SubmitAttemptResult> {
  const payload: Record<string, number | null> = {};
  const n = Math.max(0, questionCount);
  for (let i = 0; i < n; i++) {
    const v = answersByIndex[i];
    payload[String(i)] = v === undefined || v === null ? null : v;
  }

  const { data, error } = await supabase.rpc('submit_test_attempt', {
    p_test_id: testId,
    p_answers: payload,
    p_duration_seconds: durationSeconds ?? null,
  });

  if (error) throw new Error(error.message || 'Failed to save exam result');
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.attempt_id !== 'string') {
    throw new Error('Invalid response from submit_test_attempt');
  }

  return {
    attempt_id: row.attempt_id as string,
    score: Number(row.score ?? 0),
    max_score: Number(row.max_score ?? 0),
    correct_count: Number(row.correct_count ?? 0),
    wrong_count: Number(row.wrong_count ?? 0),
    unanswered_count: Number(row.unanswered_count ?? 0),
    attempted_count: Number(row.attempted_count ?? 0),
    question_count: Number(row.question_count ?? 0),
  };
}

export async function setStudentClass(classId: string): Promise<void> {
  const { error } = await supabase.rpc('set_student_class', { p_class_id: classId });
  if (error) throw new Error(error.message || 'Could not save class');
}
