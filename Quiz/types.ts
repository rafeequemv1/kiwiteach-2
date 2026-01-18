
import '../types';
import React;

export type QuestionType = 
  | 'mcq' 
  | 'reasoning' 
  | 'matching' 
  | 'statements' 
  | 'statement_combo' 
  | 'true_false';

export interface Question {
  id: string;
  // organization_id removed
  originalId?: string; // Reference to the DB source ID
  type: QuestionType;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  figurePrompt?: string;
  sourceImageIndex?: number; // New: Index of source image to edit
  figureDataUrl?: string;
  figureDimensions?: { width: number; height: number; };
  pdfImageIndex?: number;
  // Matching specific fields
  columnA?: string[];
  columnB?: string[];
  correctMatches?: number[]; // indices of B corresponding to A
  sourceChapterId?: string;
  sourceChapterName?: string;
  sourceSubjectName?: string;
  pageNumber?: number | string; // Source page number from DB
}

export interface LayoutConfig {
  forcedBreaks: string[]; // IDs of questions forced to next column
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
  className: string; // Renamed from levelName
  count: number;
  figureCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Global';
  source: 'ai' | 'db' | 'upload';
  content?: string; // Raw text content for uploaded files
  typeDistribution?: Record<string, number>;
  // Manual breakdown
  useManualCounts?: boolean;
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  // Style breakdown
  useStyleMix?: boolean;
  styleCounts?: Record<string, number>;
  // UI State
  selectionMode?: 'count' | 'percent';
}

export interface MultiChapterAIOptions {
  topic: string;
  chapters: SelectedChapter[];
  useGlobalDifficulty: boolean;
  globalDifficultyMix: { easy: number; medium: number; hard: number };
  globalTypeMix?: TypeDistribution;
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
  // organization_id removed
}
