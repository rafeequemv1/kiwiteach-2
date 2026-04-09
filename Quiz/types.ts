import '../types';
import React from 'react';

export type QuestionType = 
  | 'mcq' 
  | 'reasoning' 
  | 'matching' 
  | 'statements';

export interface Question {
  id: string;
  originalId?: string;
  type: QuestionType;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  figurePrompt?: string;
  sourceImageIndex?: number;
  figureDataUrl?: string;
  sourceFigureDataUrl?: string;
  figure_url?: string;
  source_figure_url?: string;
  figureDimensions?: { width: number; height: number; };
  pdfImageIndex?: number;
  columnA?: string[];
  columnB?: string[];
  column_a?: string[];
  column_b?: string[];
  correctMatches?: number[];
  sourceChapterId?: string;
  sourceChapterName?: string;
  sourceSubjectName?: string;
  /** Branch discriminator from `chapters.biology_branch`: Botany vs Zoology section labels (field name is historical). */
  sourceBiologyBranch?: 'botany' | 'zoology' | null;
  pageNumber?: number | string;
  // Metadata for syllabus alignment
  topic_tag?: string;
}

export interface LayoutConfig {
  forcedBreaks: string[];
  showIntroPage: boolean;
  showChapterListOnCover: boolean;
  includeExplanations: boolean;
  groupBySubject: boolean;
  showDifficulty: boolean;
  viewMode?: 'scroll' | 'grid';
  figureSizes?: Record<string, 'small' | 'medium' | 'large'>;
}

export interface QuizState {
  questions: Question[];
  status: 'idle' | 'loading' | 'generated' | 'error';
  topic: string;
  error?: string;
}

export interface BrandingConfig {
  name: string;
  logo: string | null;
  showOnTest: boolean;
  showOnOmr: boolean;
  show_on_test?: boolean;
  show_on_omr?: boolean;
}

export interface TypeDistribution {
  mcq: number;
  reasoning: number;
  matching: number;
  statements: number;
}

export interface SelectedChapter {
  id: string;
  name: string;
  subjectName: string;
  /** From `chapters.biology_branch`: distinguishes Botany vs Zoology when building papers (also set for Botany/Zoology subject rows). */
  biology_branch?: 'botany' | 'zoology' | null;
  className: string;
  count: number;
  figureCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Global';
  source: 'ai' | 'db' | 'upload';
  content?: string;
  typeDistribution?: Record<string, number>;
  useManualCounts?: boolean;
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  useStyleMix?: boolean;
  styleCounts?: Record<string, number>;
  selectionMode?: 'count' | 'percent';
  isPending?: boolean; 
  selectedFigures?: Record<number, number>; // Map of image index to desired frequency
  visualMode?: 'image' | 'text';
}

export interface MultiChapterAIOptions {
  topic: string;
  chapters: SelectedChapter[];
  useGlobalDifficulty: boolean;
  globalDifficultyMix: { easy: number; medium: number; hard: number };
  globalTypeMix: TypeDistribution;
  testDate?: string;
  questionType?: QuestionType;
  isNeet?: boolean;
  manualQuestions?: Question[];
  globalFigureCount?: number;
  totalQuestions?: number;
  useSmiles?: boolean;
  useAsIsFigures?: boolean;
  selectionMode?: 'auto' | 'manual';
  targetClassId?: string | null;
  /** Org class id when "New test" was started from a class-filtered dashboard; used on Sync so `tests.class_ids` matches the class pill. */
  assignedOrgClassId?: string | null;
  /** Knowledge base used in Test Creator (for syllabus + topic exclusions). */
  knowledgeBaseId?: string | null;
  allowPastQuestions?: boolean;
  includeUsedQuestionIds?: string[];
}

export interface CreateTestOptions extends MultiChapterAIOptions {
  mode: 'multi-ai';
  totalQuestions: number;
}