import { useMemo } from "react";

import { calculateReadingStats } from "@/lib/reading-stats-utils";
import { trpc } from "@/trpc/client";

export const useReadingStats = () => {
  const { data, isPending, isError, error } =
    trpc.readingProgress.getAllReadingProgress.useQuery();

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
    totalPagesRead: readingStats?.overall.totalPagesRead ?? 0,
    activeDays: readingStats?.overall.activeDays ?? 0,
  };
};
