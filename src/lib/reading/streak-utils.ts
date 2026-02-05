import { startOfDay, subDays } from "date-fns";

import type { PrismaClient, User, UserStats } from "@/generated/prisma/client";
import { calculateStreakDetails } from "@/lib/reading/reading-stats-utils";

/**
 * A Prisma client that can be either the full PrismaClient or
 * a transaction client (which lacks $transaction, $connect, etc.)
 */
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export const isToday = (date: Date): boolean => {
  return startOfDay(date).getTime() === startOfDay(new Date()).getTime();
};

export const isYesterday = (date: Date): boolean => {
  return (
    startOfDay(date).getTime() === startOfDay(subDays(new Date(), 1)).getTime()
  );
};

export const calculateStreakUpdate = (
  lastReadingDate: Date | null,
  currentStreak: number,
): { newStreak: number; shouldUpdate: boolean } => {
  if (lastReadingDate === null) {
    return { newStreak: 1, shouldUpdate: true };
  }
  if (isToday(lastReadingDate)) {
    return { newStreak: currentStreak, shouldUpdate: false };
  }
  if (isYesterday(lastReadingDate)) {
    return { newStreak: currentStreak + 1, shouldUpdate: true };
  }
  return { newStreak: 1, shouldUpdate: true };
};

export const validateCurrentStreak = (stats: UserStats): number => {
  if (!stats.lastReadingDate) {
    return 0;
  }
  if (isToday(stats.lastReadingDate) || isYesterday(stats.lastReadingDate)) {
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
  );

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
    },
  });
};
