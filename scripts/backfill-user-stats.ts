import "dotenv/config";

import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";
import {
  calculateOverallStats,
  calculateStreakDetails,
  getQualifyingDays,
} from "@/lib/reading";

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
};

const datesMatch = (a: Date | null, b: Date | null): boolean => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
};

const backfillUserStats = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const apply = values.apply ?? false;

  const users = await prisma.user.findMany({
    select: { id: true, minimumPagesForStreak: true, timezone: true },
  });

  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== User Stats Backfill — ${mode} ===\n`);
  console.log(`Processing ${users.length} user(s)...`);

  let changesCount = 0;

  for (const user of users) {
    const progress = await prisma.readingProgress.findMany({
      where: { userId: user.id },
      include: { book: { select: { pageCount: true, id: true, title: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (progress.length === 0) {
      if (apply) {
        await prisma.userStats.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {},
        });
        console.log(`  ${user.id}: no progress — stats record ensured`);
      } else {
        const stored = await prisma.userStats.findUnique({ where: { userId: user.id } });
        if (!stored) {
          console.log(`  ${user.id}: WOULD CREATE stats record (no progress, no existing record)`);
          changesCount++;
        } else {
          console.log(`  ${user.id}: no progress, stats record already exists — skip`);
        }
      }
      continue;
    }

    const streakDetails = calculateStreakDetails(
      progress,
      user.minimumPagesForStreak,
      user.timezone,
    );
    const { totalPagesRead, activeDays: totalActiveDays } = calculateOverallStats(
      progress,
      user.timezone,
    );
    const lastReadingDate = progress[progress.length - 1]!.createdAt;
    const qualifyingDayKeys = getQualifyingDays(
      progress,
      user.minimumPagesForStreak,
      user.timezone,
    );
    const lastQualifyingReadingDate =
      qualifyingDayKeys.length > 0
        ? parseDateKey(qualifyingDayKeys[qualifyingDayKeys.length - 1]!)
        : null;

    if (apply) {
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
      console.log(`  ${user.id}: updated`);
    } else {
      const stored = await prisma.userStats.findUnique({ where: { userId: user.id } });
      const hasChanges =
        !stored ||
        stored.currentStreak !== streakDetails.currentStreak ||
        stored.longestStreak !== streakDetails.longestStreak ||
        stored.totalPagesRead !== totalPagesRead ||
        stored.totalActiveDays !== totalActiveDays ||
        !datesMatch(stored.lastReadingDate, lastReadingDate) ||
        !datesMatch(stored.lastQualifyingReadingDate, lastQualifyingReadingDate);

      if (hasChanges) {
        console.log(`  ${user.id}: WOULD UPDATE`);
        if (stored) {
          if (stored.currentStreak !== streakDetails.currentStreak)
            console.log(`    currentStreak: ${stored.currentStreak} → ${streakDetails.currentStreak}`);
          if (stored.longestStreak !== streakDetails.longestStreak)
            console.log(`    longestStreak: ${stored.longestStreak} → ${streakDetails.longestStreak}`);
          if (stored.totalPagesRead !== totalPagesRead)
            console.log(`    totalPagesRead: ${stored.totalPagesRead} → ${totalPagesRead}`);
          if (stored.totalActiveDays !== totalActiveDays)
            console.log(`    totalActiveDays: ${stored.totalActiveDays} → ${totalActiveDays}`);
        }
        changesCount++;
      } else {
        console.log(`  ${user.id}: up to date — skip`);
      }
    }
  }

  if (apply) {
    console.log("\nBackfill complete.");
  } else {
    if (changesCount === 0) {
      console.log("\nAll user stats are up to date.");
    } else {
      console.log(`\n${changesCount} user(s) have outdated stats.`);
      console.log("Run with --apply to write changes.");
    }
    console.log(`MAINTENANCE_RESULT: changes=${changesCount}`);
  }
};

backfillUserStats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
