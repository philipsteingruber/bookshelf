"use client";

import { useCallback, useMemo } from "react";

import { getDayOfYear, getDaysInYear } from "date-fns";

import type { Book } from "@/generated/prisma/client";
import { calculateYearlyStats } from "@/lib/reading-stats-utils";
import { trpc } from "@/trpc/client";

interface UseReadingGoalsReturn {
  currentGoal: number;
  booksReadThisYear: number;

  progressPercentage: number;
  booksRemaining: number;
  isOnTrack: boolean;
  paceMessage: string;

  goalHistory: Array<{
    year: number;
    goal: number;
    actual: number;
  }>;

  setGoal: (newGoal: number) => Promise<void>;
  isSettingGoal: boolean;

  isPending: boolean;
  isError: boolean;
}

export const useReadingGoals = (books: Book[]): UseReadingGoalsReturn => {
  const trpcUtils = trpc.useUtils();

  const {
    data: readingGoalData,
    isPending: fetchingReadingGoal,
    isError: isReadingGoalError,
  } = trpc.user.getReadingGoal.useQuery();
  const {
    data: readingGoalHistoryData,
    isPending: fetchingReadingGoalHistory,
    isError: isReadingGoalHistoryError,
  } = trpc.user.getReadingGoalHistory.useQuery();

  const { mutateAsync, isPending: isSettingGoal } =
    trpc.user.setReadingGoal.useMutation({
      onSuccess: () => {
        trpcUtils.user.getReadingGoal.invalidate();
        trpcUtils.user.getReadingGoalHistory.invalidate();
      },
    });
  const setReadingGoal = useCallback(
    async (newGoal: number): Promise<void> => {
      await mutateAsync(newGoal);
    },
    [mutateAsync],
  );

  const readingGoal = readingGoalData?.readingGoal ?? null;
  const readingGoalHistory = readingGoalHistoryData?.readingGoalHistory ?? null;
  const booksFinishedByYear = useMemo(() => {
    return calculateYearlyStats(books).booksFinishedByYear;
  }, [books]);

  const goalHistory = useMemo(() => {
    if (!readingGoalHistory) return [];
    return readingGoalHistory.map((entry) => ({
      year: entry.year,
      goal: entry.goal,
      actual:
        booksFinishedByYear.find((b) => b.year === entry.year)?.count ?? 0,
    }));
  }, [readingGoalHistory, booksFinishedByYear]);

  const {
    currentGoal,
    isOnTrack,
    booksReadThisYear,
    paceMessage,
    progressPercentage,
    booksRemaining,
  } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentGoal = readingGoal?.goal ?? 0;
    const booksReadThisYear =
      booksFinishedByYear.find((b) => b.year === currentYear)?.count ?? 0;
    const expectedAtThisPoint = Math.round(
      (currentGoal / getDaysInYear(new Date())) * getDayOfYear(new Date()),
    );
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
      isOnTrack,
      booksReadThisYear,
      paceMessage,
      progressPercentage,
      booksRemaining,
    };
  }, [booksFinishedByYear, readingGoal?.goal]);

  return {
    currentGoal,
    booksReadThisYear,

    progressPercentage,
    booksRemaining,
    isOnTrack,
    paceMessage,

    goalHistory,

    setGoal: setReadingGoal,
    isSettingGoal,

    isPending: fetchingReadingGoal || fetchingReadingGoalHistory,
    isError: isReadingGoalError || isReadingGoalHistoryError,
  };
};
