import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import type { UserStats } from "@/generated/prisma/client";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

export const isToday = (
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const dateKey = formatInTimeZone(date, timezone, "yyyy-MM-dd");
  const todayKey = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  return dateKey === todayKey;
};

export const isYesterday = (
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
): boolean => {
  const dateKey = formatInTimeZone(date, timezone, "yyyy-MM-dd");
  const yesterdayKey = formatInTimeZone(
    subDays(new Date(), 1),
    timezone,
    "yyyy-MM-dd",
  );
  return dateKey === yesterdayKey;
};

export const calculateStreakUpdate = (
  lastReadingDate: Date | null,
  currentStreak: number,
  timezone: string = DEFAULT_TIMEZONE,
): { newStreak: number; shouldUpdate: boolean } => {
  if (lastReadingDate === null) {
    return { newStreak: 1, shouldUpdate: true };
  }
  if (isToday(lastReadingDate, timezone)) {
    return { newStreak: currentStreak, shouldUpdate: false };
  }
  if (isYesterday(lastReadingDate, timezone)) {
    return { newStreak: currentStreak + 1, shouldUpdate: true };
  }
  return { newStreak: 1, shouldUpdate: true };
};

export const validateCurrentStreak = (
  stats: UserStats,
  timezone: string = DEFAULT_TIMEZONE,
): number => {
  if (!stats.lastQualifyingReadingDate) {
    return 0;
  }
  if (
    isToday(stats.lastQualifyingReadingDate, timezone) ||
    isYesterday(stats.lastQualifyingReadingDate, timezone)
  ) {
    return stats.currentStreak;
  }

  return 0;
};

