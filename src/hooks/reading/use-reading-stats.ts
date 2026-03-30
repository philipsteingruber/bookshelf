import { useMemo } from "react";

import { useTimezone } from "@/hooks/ui";
import { calculateDailyStats, calculateWeeklyStats } from "@/lib/reading";
import type { DailyStats, WeeklyStats } from "@/lib/types";
import { trpc } from "@/trpc/client";

interface UseReadingStatsReturn {
  isPending: boolean;
  isError: boolean;
  currentStreak: number;
  longestStreak: number;
  isStreakActive: boolean;
  totalPagesRead: number;
  activeDays: number;
  pagesToday: number;
  pagesYesterday: number;
  avgPagesPerDay: number;
  pagesThisWeek: number;
  pagesLastWeek: number;
  avgPagesPerWeek: number;
}

const defaultDailyStats: DailyStats = {
  pagesToday: 0,
  pagesYesterday: 0,
  averagePagesPerDay: 0,
};
const defaultWeeklyStats: WeeklyStats = {
  pagesThisWeek: 0,
  pagesLastWeek: 0,
};

export const useReadingStats = (): UseReadingStatsReturn => {
  const statsQuery = trpc.user.getUserStats.useQuery();
  const recentProgressQuery =
    trpc.readingProgress.getRecentReadingProgress.useQuery({ sinceDays: 90 });
  const timezone = useTimezone();

  const { daily, weekly } = useMemo(() => {
    if (!recentProgressQuery.data) {
      return {
        daily: defaultDailyStats,
        weekly: defaultWeeklyStats,
      };
    }

    return {
      daily: calculateDailyStats(recentProgressQuery.data, timezone),
      weekly: calculateWeeklyStats(recentProgressQuery.data, timezone),
    };
  }, [recentProgressQuery.data, timezone]);

  const avgPagesPerWeek = useMemo(() => {
    if (!statsQuery.data) return 0;
    const { totalPagesRead, totalActiveDays } = statsQuery.data;
    if (totalActiveDays === 0) return 0;
    const estimatedWeeks = Math.max(1, Math.ceil(totalActiveDays / 7));
    return Math.round(totalPagesRead / estimatedWeeks);
  }, [statsQuery.data]);

  return {
    isPending: statsQuery.isPending || recentProgressQuery.isPending,
    isError: statsQuery.isError || recentProgressQuery.isError,
    currentStreak: statsQuery.data?.currentStreak ?? 0,
    longestStreak: statsQuery.data?.longestStreak ?? 0,
    isStreakActive: statsQuery.data?.isActiveToday ?? false,
    totalPagesRead: statsQuery.data?.totalPagesRead ?? 0,
    activeDays: statsQuery.data?.totalActiveDays ?? 0,
    pagesToday: daily.pagesToday ?? 0,
    pagesYesterday: daily.pagesYesterday ?? 0,
    avgPagesPerDay: Math.round(daily.averagePagesPerDay ?? 0),
    avgPagesPerWeek,
    pagesThisWeek: weekly.pagesThisWeek ?? 0,
    pagesLastWeek: weekly.pagesLastWeek ?? 0,
  };
};
