import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { performanceLogger, logger } from "@/lib/common/logger";
import { resolveAutomationUser } from "@/lib/automations/auth";
import prisma from "@/lib/prisma";

/**
 * Read-only "when did I last read each book" list for external personal-app
 * widgets — currently just Nucleus's /reading-companions sidebar, which uses
 * it to float the handful of most-recently-read companions to the top (it
 * matches on title + author, since it only knows books by filename).
 *
 * Deliberately a separate route from reading-status rather than more fields
 * on it: that endpoint is scoped to "currently READING or logged in the last
 * 24h" and capped at 50, which is exactly the wrong shape here — a companion
 * for a book finished six months ago still needs a date.
 */

// Generous relative to any realistic consumer (Nucleus has ~19 companion
// files) while keeping the response bounded — four small fields per row.
const MAX_BOOKS = 300;

type RecencyEntry = { id: number; title: string; author: string; lastReadAt: string };

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await resolveAutomationUser(req, "book-recency");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const timer = performanceLogger("Automation book-recency query", 1000, logger);
  timer.start();

  const [progressGroups, unloggedBooks] = await Promise.all([
    // groupBy + orderBy _max, not findMany with a nested take:1 — ordering
    // by "the newest progress row per book" has to happen in the database
    // for the LIMIT to be correct. A JS-side sort after a bounded findMany
    // would silently drop a recently-read book whose scalar columns
    // (finishedAt/updatedAt) sort it out of the window.
    prisma.readingProgress.groupBy({
      by: ["bookId"],
      where: { userId: user.id },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: MAX_BOOKS,
    }),
    // Fallback arm: a book imported as already-finished can have real read
    // dates but no ReadingProgress rows at all, so the query above can't
    // see it. `readingProgresses: { none: {} }` keeps the two arms disjoint
    // — no book is counted twice.
    prisma.book.findMany({
      where: {
        userId: user.id,
        readingProgresses: { none: {} },
        OR: [{ finishedAt: { not: null } }, { startedAt: { not: null } }],
      },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
      take: MAX_BOOKS,
      select: { id: true, title: true, author: true, finishedAt: true, startedAt: true },
    }),
  ]);

  // groupBy returns bookIds only — a second query resolves the titles.
  const loggedBooks = await prisma.book.findMany({
    where: { id: { in: progressGroups.map((group) => group.bookId) } },
    select: { id: true, title: true, author: true },
  });
  const byId = new Map(loggedBooks.map((book) => [book.id, book]));

  const entries: RecencyEntry[] = [];
  for (const group of progressGroups) {
    const book = byId.get(group.bookId);
    const lastReadAt = group._max.createdAt;
    if (!book || !lastReadAt) continue;
    entries.push({ id: book.id, title: book.title, author: book.author, lastReadAt: lastReadAt.toISOString() });
  }
  for (const book of unloggedBooks) {
    // Both can be set; the later one is the better "last read" signal.
    const lastRead = [book.finishedAt, book.startedAt]
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!lastRead) continue;
    entries.push({ id: book.id, title: book.title, author: book.author, lastReadAt: lastRead.toISOString() });
  }

  entries.sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt));
  const books = entries.slice(0, MAX_BOOKS);

  timer.end({ bookCount: books.length });

  return NextResponse.json({ books });
}
