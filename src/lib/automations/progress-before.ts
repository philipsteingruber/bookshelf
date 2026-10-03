import type { PrismaClient } from "@/generated/prisma/client";

export type ProgressBeforeBook = {
  id: number;
  resetAt: Date | null;
  rereadAt: Date | null;
  // createdAt of the book's most-recent ReadingProgress row, if it has any.
  latestProgressAt: Date | undefined;
};

/**
 * Progress as it stood at `cutoff`, for the "read in the last 24h" split of
 * Nucleus's progress bars — or null when the book has no activity since
 * `cutoff` and so nothing recent to split out.
 *
 * Anchored to the newest row *older than the cutoff*, not to the
 * second-most-recent row: that only meant "24h ago" while the syncs ran
 * once a night. Since they went hourly (2026-10-03) a single evening can
 * leave several rows, and the second-most-recent one is about an hour old.
 *
 * Rows from before the book's latest reset or reread belong to an earlier
 * read-through (often at 100%), so they're never the anchor — otherwise a
 * reread started today would show all of today's reading as old.
 * No qualifying row means everything logged in this read-through falls
 * inside the window, so the whole current progress counts as recent (0).
 */
export const getProgressBefore = async (
  db: PrismaClient,
  book: ProgressBeforeBook,
  cutoff: Date,
): Promise<number | null> => {
  if (book.latestProgressAt === undefined || book.latestProgressAt < cutoff) return null;

  const boundaries = [book.resetAt, book.rereadAt].filter((d): d is Date => d !== null);
  const boundary = boundaries.length > 0 ? new Date(Math.max(...boundaries.map((d) => d.getTime()))) : undefined;

  const anchor = await db.readingProgress.findFirst({
    where: {
      bookId: book.id,
      createdAt: { lt: cutoff, ...(boundary ? { gte: boundary } : {}) },
    },
    orderBy: { createdAt: "desc" },
    select: { progress: true },
  });

  return anchor?.progress ?? 0;
};
