import { getDayOfYear, getDaysInYear } from "date-fns";

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
}

export interface BooksFinishedByYear {
  year: number;
  count: number;
}

export interface ReadingGoalHistoryEntry {
  year: number;
  goal: number;
}

export interface BuildGoalHistoryOptions {
  readingGoalHistory: ReadingGoalHistoryEntry[] | null;
  booksFinishedByYear: BooksFinishedByYear[];
}

/**
 * Calculates reading goal statistics based on books finished and current goal.
 *
 * @param booksFinishedByYear - Array of yearly book counts from calculateYearlyStats
 * @param readingGoal - The user's current reading goal (number of books), or null if not set
 * @param referenceDate - Optional date to use for calculations (defaults to current date, useful for testing)
 * @returns Calculated statistics including progress, pace, and messaging
 */
export function calculateReadingGoalStats(
  booksFinishedByYear: BooksFinishedByYear[],
  readingGoal?: number | null,
  referenceDate: Date = new Date(),
): ReadingGoalStats {
  const currentYear = referenceDate.getFullYear();
  const currentGoal = readingGoal ?? 0;
  const booksReadThisYear =
    booksFinishedByYear.find((b) => b.year === currentYear)?.count ?? 0;

  const expectedAtThisPoint =
    currentGoal > 0
      ? Math.round(
          (currentGoal / getDaysInYear(referenceDate)) *
            getDayOfYear(referenceDate),
        )
      : 0;

  const isOnTrack = booksReadThisYear >= expectedAtThisPoint;
  const behind = expectedAtThisPoint - booksReadThisYear;
  const paceMessage = isOnTrack
    ? "On pace, keep going!"
    : `${behind} ${behind === 1 ? "book" : "books"} behind, time to pick it up!`;

  const progressPercentage =
    currentGoal > 0 ? Math.round((booksReadThisYear / currentGoal) * 100) : 0;
  const booksRemaining = Math.max(0, currentGoal - booksReadThisYear);

  return {
    currentGoal,
    booksReadThisYear,
    progressPercentage,
    booksRemaining,
    isOnTrack,
    paceMessage,
    expectedAtThisPoint,
  };
}

/**
 * Builds goal history by combining reading goal history with actual book counts.
 *
 * @param options.readingGoalHistory - Array of historical reading goals from the database
 * @param options.booksFinishedByYear - Array of yearly book counts from calculateYearlyStats
 * @returns Combined history with goal targets and actual counts per year
 */
export function buildGoalHistory({
  readingGoalHistory,
  booksFinishedByYear,
}: BuildGoalHistoryOptions): GoalHistoryEntry[] {
  if (!readingGoalHistory) return [];

  return readingGoalHistory.map((entry) => ({
    year: entry.year,
    goal: entry.goal,
    actual: booksFinishedByYear.find((b) => b.year === entry.year)?.count ?? 0,
  }));
}
