import "dotenv/config";

import prisma from "@/lib/prisma";
import { calculateOverallStats, calculateStreakDetails } from "@/lib/reading";

const backfillUserStats = async (): Promise<void> => {
  const users = await prisma.user.findMany({
    select: { id: true, minimumPagesForStreak: true },
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
      );
      const { totalPagesRead, activeDays: totalActiveDays } =
        calculateOverallStats(progress);

      const lastReadingDate = progress[progress.length - 1].createdAt;

      await prisma.userStats.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          currentStreak: streakDetails.currentStreak,
          longestStreak: streakDetails.longestStreak,
          lastReadingDate,
          totalPagesRead,
          totalActiveDays,
        },
        update: {
          currentStreak: streakDetails.currentStreak,
          longestStreak: streakDetails.longestStreak,
          lastReadingDate,
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
