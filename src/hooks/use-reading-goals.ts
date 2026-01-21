"use client";

import { useCallback, useEffect, useMemo } from "react";

import { toast } from "sonner";

import type { Book } from "@/generated/prisma/client";
import { READING_GOAL_DEFAULT_THRESHOLD } from "@/lib/constants";
import {
  buildGoalHistory,
  calculateReadingGoalStats,
} from "@/lib/reading-goal-utils";
import { calculateYearlyStats } from "@/lib/reading-stats-utils";
import { trpc } from "@/trpc/client";

interface UseReadingGoalsReturn {
  currentGoal: number;
  booksReadThisYear: number;

  progressPercentage: number;
  booksRemaining: number;
  isOnTrack: boolean;
  paceMessage: string;
  pageCountThreshold: number;

  goalHistory: Array<{
    year: number;
    goal: number;
    actual: number;
  }>;

  setGoal: (newGoal: number) => Promise<void>;
  isSettingGoal: boolean;
  setThreshold: (newThreshold: number) => Promise<void>;
  isSettingThreshold: boolean;

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

  const { mutateAsync: setReadingGoalAsync, isPending: isSettingGoal } =
    trpc.user.setReadingGoal.useMutation({
      onSuccess: () => {
        trpcUtils.user.getReadingGoal.invalidate();
        trpcUtils.user.getReadingGoalHistory.invalidate();
      },
    });
  const setReadingGoal = useCallback(
    async (newGoal: number): Promise<void> => {
      await setReadingGoalAsync(newGoal);
    },
    [setReadingGoalAsync],
  );

  const { mutateAsync: setThresholdAsync, isPending: isSettingThreshold } =
    trpc.user.setReadingGoalThreshold.useMutation({
      onSuccess: () => {
        trpcUtils.user.getReadingGoal.invalidate();
      },
    });
  const setThreshold = useCallback(
    async (newThreshold: number): Promise<void> => {
      await setThresholdAsync(newThreshold);
    },
    [setThresholdAsync],
  );

  const readingGoal = readingGoalData?.readingGoal?.goal ?? null;
  const defaultReadingThreshold =
    readingGoalData?.defaultReadingThreshold ?? READING_GOAL_DEFAULT_THRESHOLD;
  const readingGoalHistory = readingGoalHistoryData?.readingGoalHistory ?? null;

  const booksFinishedByYear = useMemo(() => {
    return calculateYearlyStats(books, defaultReadingThreshold)
      .booksFinishedByYear;
  }, [books, defaultReadingThreshold]);

  const goalHistory = useMemo(
    () => buildGoalHistory(readingGoalHistory, booksFinishedByYear),
    [readingGoalHistory, booksFinishedByYear],
  );

  const {
    currentGoal,
    isOnTrack,
    booksReadThisYear,
    paceMessage,
    progressPercentage,
    booksRemaining,
  } = useMemo(
    () => calculateReadingGoalStats(booksFinishedByYear, readingGoal),
    [booksFinishedByYear, readingGoal],
  );

  useEffect(() => {
    if (fetchingReadingGoal || fetchingReadingGoalHistory) {
      return;
    }
    if (booksReadThisYear < currentGoal) {
      return;
    }

    const currentYear = new Date().getFullYear();
    const storageKey = `goal-celebration-${currentYear}`;
    const highestCelebrated = parseInt(
      localStorage.getItem(storageKey) || "0",
      10,
    );

    if (booksReadThisYear >= currentGoal && currentGoal > highestCelebrated) {
      toast.success("Congratulations!", {
        description: `You've reached your reading goal of ${currentGoal} books!`,
        duration: 10000,
        position: "bottom-right",
      });

      localStorage.setItem(storageKey, currentGoal.toString());
    }
  }, [
    booksReadThisYear,
    currentGoal,
    fetchingReadingGoal,
    fetchingReadingGoalHistory,
  ]);

  return {
    currentGoal,
    booksReadThisYear,

    progressPercentage,
    booksRemaining,
    isOnTrack,
    paceMessage,
    pageCountThreshold: defaultReadingThreshold,

    goalHistory,

    setGoal: setReadingGoal,
    isSettingGoal,
    setThreshold,
    isSettingThreshold,

    isPending: fetchingReadingGoal || fetchingReadingGoalHistory,
    isError: isReadingGoalError || isReadingGoalHistoryError,
  };
};
