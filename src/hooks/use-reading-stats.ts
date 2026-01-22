import { useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";

import type { ReadingStats } from "@/lib/reading-stats-utils";
import { calculateReadingStats } from "@/lib/reading-stats-utils";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseReadingStatsReturn {
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | null;
  readingStats: ReadingStats | null;
  pagesToday: number;
  avgPagesPerDay: number;
  avgPagesPerWeek: number;
  currentStreak: number;
  isStreakActive: boolean;
  pagesThisWeek: number;
  pagesLastWeek: number;
  totalPagesRead: number;
  activeDays: number;
}

export const useReadingStats = (): UseReadingStatsReturn => {
  const { data, isPending, isError, error } =
    trpc.readingProgress.getAllReadingProgress.useQuery(undefined, {
      refetchOnMount: true,
    });

  const readingStats = useMemo(() => {
    return !!data?.allProgress
      ? calculateReadingStats(data?.allProgress)
      : null;
  }, [data?.allProgress]);

  return {
    isPending,
    isError,
    error,
    readingStats,
    pagesToday: readingStats?.daily.pagesToday ?? 0,
    avgPagesPerDay: Math.round(readingStats?.daily.averagePagesPerDay ?? 0),
    avgPagesPerWeek: Math.round(readingStats?.overall.averagePagesPerWeek ?? 0),
    currentStreak: readingStats?.streak.currentStreak ?? 0,
    isStreakActive: readingStats?.streak.isActiveToday ?? false,
    pagesThisWeek: readingStats?.weekly.pagesThisWeek ?? 0,
    pagesLastWeek: readingStats?.weekly.pagesLastWeek ?? 0,
    totalPagesRead: readingStats?.overall.totalPagesRead ?? 0,
    activeDays: readingStats?.overall.activeDays ?? 0,
  };
};
