import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import type { PrismaClient, User, UserStats } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  calculateStreakDetails,
  getQualifyingDays,
} from "@/lib/reading/reading-stats-utils";

const DEFAULT_TIMEZONE = "UTC";

/**
 * Helper to parse a date key (YYYY-MM-DD) into a Date object (UTC midnight).
 */
const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

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

export const recalculateUserStreaks = async (
  db: TransactionClient | PrismaClient,
  user: User,
): Promise<void> => {
  const allProgress = await db.readingProgress.findMany({
    where: { userId: user.id },
    include: { book: { select: { pageCount: true, id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });

  const streakDetails = calculateStreakDetails(
    allProgress,
    user.minimumPagesForStreak,
    user.timezone,
  );

  const qualifyingDayKeys = getQualifyingDays(
    allProgress,
    user.minimumPagesForStreak,
    user.timezone,
  );
  const lastQualifyingReadingDate =
    qualifyingDayKeys.length > 0
      ? parseDateKey(qualifyingDayKeys[qualifyingDayKeys.length - 1])
      : null;

  // Calculate lastReadingDate from progress entries (most recent reading date)
  const lastReadingDate =
    allProgress.length > 0
      ? allProgress[allProgress.length - 1].createdAt
      : null;

  await db.userStats.update({
    where: { userId: user.id },
    data: {
      currentStreak: streakDetails.currentStreak,
      longestStreak: streakDetails.longestStreak,
      lastReadingDate,
      lastQualifyingReadingDate,
    },
  });
};
