
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
  figureDimensions?: { width: number; height: number; };
  pdfImageIndex?: number;
  columnA?: string[];
  columnB?: string[];
  correctMatches?: number[];
  sourceChapterId?: string;
  sourceChapterName?: string;
  sourceSubjectName?: string;
  pageNumber?: number | string;
}

export interface LayoutConfig {
  forcedBreaks: string[];
  showIntroPage: boolean;
  showChapterListOnCover: boolean;
  includeExplanations: boolean;
  groupBySubject: boolean;
  showDifficulty: boolean;
  viewMode?: 'scroll' | 'grid';
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
}

export interface CreateTestOptions extends MultiChapterAIOptions {
  mode: 'multi-ai';
  totalQuestions: number;
}
