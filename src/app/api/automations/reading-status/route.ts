import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveAutomationUser } from "@/lib/automations/auth";
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
 * Deliberately reuses the same Prisma model and business logic the
 * app's own tRPC procedures use (a widened variant of
 * `bookRouter.getDashBoardBooks`' reading-books query, `userRouter.getUserStats`'
 * streak validation) rather than hand-rolling simplified versions, and returns
 * one merged `books` list — any book currently being read, or with a
 * progress log in the last 24h — instead of two separately-shaped
 * lists.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await resolveAutomationUser(req, "reading-status");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const timer = performanceLogger("Automation reading-status query", 1000, logger);
  timer.start();

  // Recency gate for progressBefore below — a book whose most-recent row
  // falls outside this window has no "recent" delta to show, no matter
  // how many older rows it has (see the progressBefore comment below for
  // why this gate exists at all).
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [statsRow, booksRaw] = await Promise.all([
    prisma.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    // Every book that's either currently being read, or had a progress
    // log in the last 24h regardless of status (e.g. one that was just
    // finished and so is no longer "READING") — merged into one query so
    // a book doesn't need two separate code paths depending on which
    // side of that status line it's on.
    // take: 50 covers both OR arms: the READING arm alone would never need
    // a cap this high (reading lists are small), but a bulk Calibre import
    // (scripts/sync-calibre.ts creates a ReadingProgress row dated "now" for
    // every newly-imported book) can put many books into the recent-activity
    // arm at once, and this widget is sized for a handful of rows, not a
    // whole import burst — unlike the old take: 10, which was only ever
    // justified for the smaller reading-list case.
    prisma.book.findMany({
      where: {
        userId: user.id,
        OR: [{ status: "READING" }, { readingProgresses: { some: { createdAt: { gte: recentCutoff } } } }],
      },
      take: 50,
      select: {
        id: true,
        title: true,
        author: true,
        progress: true,
        // take: 2: [0] is the most-recent entry (used below to decide
        // recency), [1] is the second-most-recent, which feeds
        // progressBefore.
        readingProgresses: {
          take: 2,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, progress: true },
        },
      },
    }),
  ]);

  timer.end({ bookCount: booksRaw.length });

  const books = booksRaw.map(({ id, title, author, progress, readingProgresses }) => {
    // progressBefore only means anything if the book was actually
    // touched recently — a book whose most-recent row is from weeks ago
    // still has a "second-most-recent row" mathematically, but showing
    // it as a bright "recent" segment would be actively misleading
    // (looked live: "Vengeful Spirit" showed a bright delta segment
    // despite its last log being 4 days old).
    const mostRecent = readingProgresses[0];
    const hasRecentActivity = mostRecent !== undefined && mostRecent.createdAt >= recentCutoff;
    // readingProgresses[1]?.progress ?? 0, not ?? null: a book with
    // exactly one ReadingProgress row ever, logged inside the cutoff,
    // has nothing to diff against — but that single log IS the recent
    // activity, so the whole current progress should read as "recent"
    // (progressBefore=0), not fall back to "no recent activity"
    // (progressBefore=null).
    return {
      id,
      title,
      author,
      progress,
      progressBefore: hasRecentActivity ? (readingProgresses[1]?.progress ?? 0) : null,
    };
  });

  return NextResponse.json({
    books,
    streak: {
      current: validateCurrentStreak(statsRow, user.timezone),
      longest: statsRow.longestStreak,
      lastReadingDate: statsRow.lastReadingDate?.toISOString() ?? null,
    },
  });
}
