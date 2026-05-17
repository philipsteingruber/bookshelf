export interface ReadingGoalStats {
  currentGoal: number;
  booksReadThisYear: number;
  progressPercentage: number;
  booksRemaining: number;
  isOnTrack: boolean;
  paceMessage: string;
  expectedAtThisPoint: number;
}

export interface GoalHistoryEntry {
  year: number;
  goal: number;
  actual: number;
  pages: number;
}

export interface BooksFinishedByYear {
  year: number;
  count: number;
}

export interface ReadingGoalHistoryEntry {
  year: number;
  goal: number;
}
export interface EnrichedGoalHistoryEntry extends GoalHistoryEntry {
  progressPercentage: number | null;
  difference: number;
  differenceFromPrevious: number | null;
  expectedAtThisPoint: number | null;
}

export interface BuildGoalHistoryOptions {
  readingGoalHistory: ReadingGoalHistoryEntry[] | null;
  booksFinishedByYear: BooksFinishedByYear[];
  pagesFinishedByYear: { year: number; pages: number }[];
}
