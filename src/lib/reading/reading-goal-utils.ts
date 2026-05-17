import { getDayOfYear, getDaysInYear } from "date-fns";

import type {
  BooksFinishedByYear,
  BuildGoalHistoryOptions,
  EnrichedGoalHistoryEntry,
  GoalHistoryEntry,
  ReadingGoalStats,
} from "@/lib/types/goals";

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
  pagesFinishedByYear,
}: BuildGoalHistoryOptions): GoalHistoryEntry[] {
  if (!readingGoalHistory) return [];

  return readingGoalHistory.map((entry) => ({
    year: entry.year,
    goal: entry.goal,
    actual: booksFinishedByYear.find((b) => b.year === entry.year)?.count ?? 0,
    pages: pagesFinishedByYear.find((p) => p.year === entry.year)?.pages ?? 0,
  }));
}

export interface CheckGoalCelebrationParams {
  isLoading: boolean;
  booksReadThisYear: number;
  currentGoal: number;
  year?: number;
  storage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  onCelebrate?: (goal: number) => void;
}

export interface CheckGoalCelebrationResult {
  shouldCelebrate: boolean;
  celebratedGoal: number | null;
}

/**
 * Checks whether a goal celebration should be triggered and handles the side effects.
 *
 * The celebration logic:
 * 1. Skip if data is still loading
 * 2. Skip if user hasn't reached their goal yet
 * 3. Skip if we've already celebrated this goal (or a higher one) this year
 * 4. Otherwise, trigger celebration and record it
 *
 * @param params.isLoading - Whether goal data is still being fetched
 * @param params.booksReadThisYear - Number of books the user has finished this year
 * @param params.currentGoal - The user's reading goal for the year
 * @param params.year - The year to check (defaults to current year)
 * @param params.storage - Storage interface for persistence (defaults to localStorage)
 * @param params.onCelebrate - Callback to trigger when celebration should happen
 * @returns Object indicating whether celebration was triggered and for which goal
 */
export function checkGoalCelebration({
  isLoading,
  booksReadThisYear,
  currentGoal,
  year = new Date().getFullYear(),
  storage = typeof window !== "undefined"
    ? localStorage
    : { getItem: () => null, setItem: () => {} },
  onCelebrate,
}: CheckGoalCelebrationParams): CheckGoalCelebrationResult {
  // Don't celebrate while data is loading
  if (isLoading) {
    return { shouldCelebrate: false, celebratedGoal: null };
  }

  // Don't celebrate if goal not reached
  if (booksReadThisYear < currentGoal) {
    return { shouldCelebrate: false, celebratedGoal: null };
  }

  // Don't celebrate if goal is 0 (no goal set)
  if (currentGoal <= 0) {
    return { shouldCelebrate: false, celebratedGoal: null };
  }

  const storageKey = `goal-celebration-${year}`;
  const highestCelebrated = parseInt(storage.getItem(storageKey) || "0", 10);

  // Only celebrate if this is a new higher goal
  if (currentGoal > highestCelebrated) {
    storage.setItem(storageKey, currentGoal.toString());
    onCelebrate?.(currentGoal);
    return { shouldCelebrate: true, celebratedGoal: currentGoal };
  }

  return { shouldCelebrate: false, celebratedGoal: null };
}

export const enrichGoalHistory = (
  goalHistory: GoalHistoryEntry[],
  referenceDate: Date = new Date(),
): EnrichedGoalHistoryEntry[] => {
  if (goalHistory.length === 0) {
    return [];
  }

  const currentYear = referenceDate.getFullYear();
  const reversed = goalHistory.toReversed();
  const result = reversed.map((entry, index) => {
    const expectedAtThisPoint =
      entry.year === currentYear && entry.goal > 0
        ? Math.round(
            (entry.goal / getDaysInYear(referenceDate)) *
              getDayOfYear(referenceDate),
          )
        : null;

    return {
      ...entry,
      progressPercentage:
        entry.goal === 0
          ? null
          : Math.round((entry.actual / entry.goal) * 100),
      difference: entry.actual - entry.goal,
      differenceFromPrevious:
        index === 0 ? null : entry.actual - reversed[index - 1].actual,
      expectedAtThisPoint,
    };
  });

  return result.toReversed();
};
