import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import { logger, performanceLogger } from "@/lib/common/logger";
import prisma from "@/lib/prisma";
import { validateCurrentStreak } from "@/lib/reading";

/**
 * Read-only status for external personal-app widgets — currently just
 * Nucleus's dashboard (see its docs/kb/nucleus.md for the full design
 * discussion on why this exists instead of Nucleus reading Postgres
 * directly). Bearer-token auth against AUTOMATION_API_KEY, not Clerk —
 * there's no browser session for a server-to-server caller. Same shape
 * as the assumed Momentum automation contract elsewhere in this
 * ecosystem (Bearer token, /api/automations/* path).
 *
 * Deliberately reuses the same Prisma queries and business logic the
 * app's own tRPC procedures use (bookRouter.getDashBoardBooks' reading-
 * books query/sort, userRouter.getUserStats' streak validation,
 * readingProgressRouter.getRecentReadingProgress' shape) rather than
 * hand-rolling simplified versions — the whole point of this endpoint
 * existing (vs. an external app reading Postgres directly) is that
 * Bookshelf's own interpretation of its data stays authoritative,
 * including edge cases like a stale cached streak (validateCurrentStreak
 * zeroes it if the last qualifying day wasn't today/yesterday) that a
 * naive raw-column read would get wrong.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = req.headers.get("authorization");
  const expected = env.AUTOMATION_API_KEY;
  if (!expected || auth !== `Bearer ${expected}`) {
    logger.warn("Automation reading-status: unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = env.CALIBRE_SYNC_USER_EMAIL;
  if (!userEmail) {
    logger.error("Automation reading-status: CALIBRE_SYNC_USER_EMAIL not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    logger.error({ userEmail }, "Automation reading-status: configured user not found");
    return NextResponse.json({ error: "User not found" }, { status: 500 });
  }

  const timer = performanceLogger("Automation reading-status query", 1000, logger);
  timer.start();

  const [statsRow, readingBooksRaw, recentProgress] = await Promise.all([
    prisma.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    prisma.book.findMany({
      where: { status: "READING", userId: user.id },
      take: 10,
      select: {
        id: true,
        title: true,
        author: true,
        progress: true,
        // take: 2, not 1 — [0] is the most-recent entry (used for sorting
        // below, unchanged), [1] is the second-most-recent, which becomes
        // progressBefore below: the "before last sync" boundary for the
        // dashboard widget's two-segment progress bar. No extra query —
        // this nested fetch already ran for the sort.
        readingProgresses: {
          take: 2,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, progress: true },
        },
      },
    }),
    prisma.readingProgress.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: { book: { select: { id: true, title: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  timer.end({ readingCount: readingBooksRaw.length, recentProgressCount: recentProgress.length });

  // Same "most recently active first" sort as getDashBoardBooks.
  const currentlyReading = [...readingBooksRaw]
    .sort((a, b) => {
      const aDate = a.readingProgresses[0]?.createdAt ?? null;
      const bDate = b.readingProgresses[0]?.createdAt ?? null;
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return bDate.getTime() - aDate.getTime();
    })
    .map(({ id, title, author, progress, readingProgresses }) => ({
      id,
      title,
      author,
      progress,
      progressBefore: readingProgresses[1]?.progress ?? null,
    }));

  return NextResponse.json({
    currentlyReading,
    streak: {
      current: validateCurrentStreak(statsRow, user.timezone),
      longest: statsRow.longestStreak,
      lastReadingDate: statsRow.lastReadingDate?.toISOString() ?? null,
    },
    recentProgress: recentProgress.map((rp) => ({
      bookId: rp.bookId,
      title: rp.book.title,
      progress: rp.progress,
      loggedAt: rp.createdAt.toISOString(),
    })),
  });
}
