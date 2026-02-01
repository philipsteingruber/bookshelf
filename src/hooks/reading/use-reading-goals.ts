"use client";

import { useCallback, useEffect, useMemo } from "react";

import { toast } from "sonner";

import type { Book } from "@/generated/prisma/client";
import { READING_GOAL_DEFAULT_THRESHOLD } from "@/lib/constants";
import {
  buildGoalHistory,
  calculateReadingGoalStats,
  calculateYearlyStats,
  checkGoalCelebration,
  enrichGoalHistory,
} from "@/lib/reading";
import type { EnrichedGoalHistoryEntry } from "@/lib/types";
import { trpc } from "@/trpc/client";

interface UseReadingGoalsReturn {
  currentGoal: number;
  booksReadThisYear: number;

  progressPercentage: number;
  booksRemaining: number;
  isOnTrack: boolean;
  paceMessage: string;
  pageCountThreshold: number;
  expectedAtThisPoint: number;

  goalHistory: EnrichedGoalHistoryEntry[];

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
    () => buildGoalHistory({ readingGoalHistory, booksFinishedByYear }),
    [readingGoalHistory, booksFinishedByYear],
  );

  const enrichedGoalHistory = useMemo(
    () => enrichGoalHistory(goalHistory),
    [goalHistory],
  );

  const {
    currentGoal,
    isOnTrack,
    booksReadThisYear,
    paceMessage,
    progressPercentage,
    booksRemaining,
    expectedAtThisPoint,
  } = useMemo(
    () => calculateReadingGoalStats(booksFinishedByYear, readingGoal),
    [booksFinishedByYear, readingGoal],
  );

  useEffect(() => {
    checkGoalCelebration({
      isLoading: fetchingReadingGoal || fetchingReadingGoalHistory,
      booksReadThisYear,
      currentGoal,
      onCelebrate: (goal) => {
        toast.success("Congratulations!", {
          description: `You've reached your reading goal of ${goal} books!`,
          duration: 10000,
          position: "bottom-right",
        });
      },
    });
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
    expectedAtThisPoint,
    paceMessage,
    pageCountThreshold: defaultReadingThreshold,

    goalHistory: enrichedGoalHistory,

    setGoal: setReadingGoal,
    isSettingGoal,
    setThreshold,
    isSettingThreshold,

    isPending: fetchingReadingGoal || fetchingReadingGoalHistory,
    isError: isReadingGoalError || isReadingGoalHistoryError,
  };
};
