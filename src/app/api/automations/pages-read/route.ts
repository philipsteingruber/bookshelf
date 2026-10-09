import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { performanceLogger, logger } from "@/lib/common/logger";
import { resolveAutomationUser } from "@/lib/automations/auth";
import { computePagesRead } from "@/lib/automations/pages-read";
import prisma from "@/lib/prisma";

/**
 * Read-only year-to-date pages-read-per-day series, with a 7-day rolling
 * average, for Nucleus's dashboard chart. The derivation (progress deltas ×
 * page count) lives in src/lib/automations/pages-read.ts.
 *
 * Computed on every request rather than snapshotted by a cron job: it's a
 * single pass over a few hundred rows, so it stays as current as the last
 * sync with nothing scheduled that could quietly stop running.
 */

const WINDOW_DAYS = 7;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await resolveAutomationUser(req, "pages-read");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const timer = performanceLogger("Automation pages-read query", 1000, logger);
  timer.start();

  // Calendar days in the user's own time zone (synced from the browser),
  // so "today" and the 1 Jan boundary match what they'd see in the app.
  const timeZone = user.timezone;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const from = `${today.slice(0, 4)}-01-01`;

  // Every row, not just this year's: a book's first row of the year is
  // measured against its last row from before 1 Jan.
  const progresses = await prisma.readingProgress.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      bookId: true,
      progress: true,
      createdAt: true,
      book: { select: { title: true, pageCount: true } },
    },
  });

  const series = computePagesRead(
    progresses.map((p) => ({
      bookId: p.bookId,
      progress: p.progress,
      createdAt: p.createdAt,
      title: p.book.title,
      pageCount: p.book.pageCount,
    })),
    { from, to: today, timeZone, windowDays: WINDOW_DAYS },
  );

  timer.end({ rowCount: progresses.length, dayCount: series.days.length });

  return NextResponse.json({ windowDays: WINDOW_DAYS, ...series });
}
