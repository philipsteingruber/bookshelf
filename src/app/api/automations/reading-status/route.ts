import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveAutomationUser } from "@/lib/automations/auth";
import { getProgressBefore } from "@/lib/automations/progress-before";
import { getRecentCutoff, isRecentWindow, RECENT_WINDOWS } from "@/lib/automations/recent-cutoff";
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
 * progress log inside the recent window (below) — instead of two separately-shaped
 * lists.
 *
 * `?window=` picks the "recent" window: `24h` (rolling, the default) or
 * `today` (since midnight in the user's time zone). Nucleus's Bookshelf
 * widget toggles between the two.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await resolveAutomationUser(req, "reading-status");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const recentWindow = req.nextUrl.searchParams.get("window") ?? "24h";
  if (!isRecentWindow(recentWindow)) {
    return NextResponse.json({ error: `window must be one of: ${RECENT_WINDOWS.join(", ")}` }, { status: 400 });
  }

  const timer = performanceLogger("Automation reading-status query", 1000, logger);
  timer.start();

  // Start of the "recent" window: gates which books count as recently
  // active, and is the point progressBefore measures from.
  const recentCutoff = getRecentCutoff(recentWindow, user.timezone);

  const [statsRow, booksRaw] = await Promise.all([
    prisma.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    // Every book that's either currently being read, or had a progress
    // log inside the window regardless of status (e.g. one that was just
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
        // status and isbn are for Concordance (the CWA/ABS position sync),
        // which only writes positions for books Bookshelf has as READING —
        // the OR arm below also returns books finished or DNF'd inside the
        // recent window, so list membership alone can't answer that.
        status: true,
        isbn: true,
        // resetAt/rereadAt bound which rows can anchor progressBefore —
        // see getProgressBefore.
        resetAt: true,
        rereadAt: true,
        // take: 1: only the most-recent entry, used to decide recency.
        // progressBefore's anchor row is fetched separately.
        readingProgresses: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, progress: true },
        },
      },
    }),
  ]);

  // progressBefore is null unless the book was touched since the cutoff —
  // a book whose last log is weeks old still has older rows, but showing a
  // bright "recent" segment for it would be misleading (looked live:
  // "Vengeful Spirit" showed one despite its last log being 4 days old).
  // One small query per recently active book, usually a handful.
  const books = await Promise.all(
    booksRaw.map(async ({ id, title, author, progress, status, isbn, resetAt, rereadAt, readingProgresses }) => ({
      id,
      title,
      author,
      progress,
      status,
      isbn,
      progressBefore: await getProgressBefore(
        prisma,
        { id, resetAt, rereadAt, latestProgressAt: readingProgresses[0]?.createdAt },
        recentCutoff,
      ),
    })),
  );

  timer.end({ window: recentWindow, bookCount: books.length });

  return NextResponse.json({
    books,
    streak: {
      current: validateCurrentStreak(statsRow, user.timezone),
      longest: statsRow.longestStreak,
      lastReadingDate: statsRow.lastReadingDate?.toISOString() ?? null,
    },
  });
}
