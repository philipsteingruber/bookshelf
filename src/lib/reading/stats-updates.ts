import type { PrismaClient, User } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

import { calculateOverallStats, calculateStreakDetails, getQualifyingDays } from "./reading-stats-utils";

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Derives all UserStats fields from the full reading progress history and writes
 * them back in a single upsert. Supersedes the incremental update path and the
 * old recalculateUserStreaks function, ensuring both create and delete produce
 * identical, consistent results.
 */
export const recalculateAllUserStats = async (
  db: TransactionClient | PrismaClient,
  user: User,
): Promise<void> => {
  const allProgress = await db.readingProgress.findMany({
    where: { userId: user.id },
    include: { book: { select: { pageCount: true, id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });

  const streakDetails = calculateStreakDetails(allProgress, user.minimumPagesForStreak, user.timezone);
  const overallStats = calculateOverallStats(allProgress, user.timezone);
  const qualifyingDayKeys = getQualifyingDays(allProgress, user.minimumPagesForStreak, user.timezone);
  const lastQualifyingReadingDate =
    qualifyingDayKeys.length > 0 ? parseDateKey(qualifyingDayKeys[qualifyingDayKeys.length - 1]) : null;

  const lastReadingDate = allProgress.length > 0 ? allProgress[allProgress.length - 1].createdAt : null;

  await db.userStats.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentStreak: streakDetails.currentStreak,
      longestStreak: streakDetails.longestStreak,
      lastReadingDate,
      lastQualifyingReadingDate,
      totalPagesRead: overallStats.totalPagesRead,
      totalActiveDays: overallStats.activeDays,
    },
    update: {
      currentStreak: streakDetails.currentStreak,
      longestStreak: streakDetails.longestStreak,
      lastReadingDate,
      lastQualifyingReadingDate,
      totalPagesRead: overallStats.totalPagesRead,
      totalActiveDays: overallStats.activeDays,
    },
  });

};
