import "dotenv/config";

import prisma from "@/lib/prisma";
import {
  calculateOverallStats,
  calculateStreakDetails,
  getQualifyingDays,
} from "@/lib/reading";

/**
 * Helper to parse a date key (YYYY-MM-DD) into a Date object (UTC midnight).
 */
const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const backfillUserStats = async (): Promise<void> => {
  const users = await prisma.user.findMany({
    select: { id: true, minimumPagesForStreak: true, timezone: true },
  });

  console.log(`Backfilling stats for ${users.length} users...`);

  for (const user of users) {
    const progress = await prisma.readingProgress.findMany({
      where: { userId: user.id },
      include: { book: { select: { pageCount: true, id: true, title: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (progress.length === 0) {
      await prisma.userStats.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
    } else {
      const streakDetails = calculateStreakDetails(
        progress,
        user.minimumPagesForStreak,
        user.timezone,
      );
      const { totalPagesRead, activeDays: totalActiveDays } =
        calculateOverallStats(progress, user.timezone);

      const lastReadingDate = progress[progress.length - 1].createdAt;

      const qualifyingDayKeys = getQualifyingDays(
        progress,
        user.minimumPagesForStreak,
        user.timezone,
      );
      const lastQualifyingReadingDate =
        qualifyingDayKeys.length > 0
          ? parseDateKey(qualifyingDayKeys[qualifyingDayKeys.length - 1])
          : null;

      await prisma.userStats.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          currentStreak: streakDetails.currentStreak,
          longestStreak: streakDetails.longestStreak,
          lastReadingDate,
          lastQualifyingReadingDate,
          totalPagesRead,
          totalActiveDays,
        },
        update: {
          currentStreak: streakDetails.currentStreak,
          longestStreak: streakDetails.longestStreak,
          lastReadingDate,
          lastQualifyingReadingDate,
          totalPagesRead,
          totalActiveDays,
        },
      });
    }
    console.log(`Backfilled user ${user.id}`);
  }
  console.log("Backfill complete");
};

backfillUserStats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
