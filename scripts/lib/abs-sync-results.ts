import type { ReadStatus } from "@/generated/prisma/enums";

import { buildCompositeKey, stripSubtitle } from "./normalizer";
import { deriveAbsStatus, isRereadStart, shouldLogProgress, shouldUpdateStatus } from "./sync-utils";
import type { AbsBookSync } from "./abs-sync-reader";

const REREAD_MIN_PRIOR_PROGRESS = 90;
const REREAD_DROP_THRESHOLD = 50;

export interface BookshelfBookForAbs {
  id: number;
  title: string;
  author: string;
  status: ReadStatus;
  progress: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  dnfAt: Date | null;
  resetAt: Date | null;
  previousFinishedAt: Date[];
  rereadAt: Date | null;
  isbn: string | null;
}

export interface RereadStart {
  absBook: AbsBookSync;
  bookshelfBook: BookshelfBookForAbs;
  newProgress: number;
  newStartedAt: Date | null;
}

export interface AbsStatusUpdate {
  absBook: AbsBookSync;
  bookshelfBook: BookshelfBookForAbs;
  newStatus: ReadStatus | null;
  newStartedAt: Date | null;
  newFinishedAt: Date | null;
}

export interface AbsProgressUpdate {
  absBook: AbsBookSync;
  bookshelfBook: BookshelfBookForAbs;
  newProgress: number;
}

export interface AbsProgressSkip {
  absBook: AbsBookSync;
  bookshelfBook: BookshelfBookForAbs;
}

export interface AbsSyncResults {
  statusUpdates: AbsStatusUpdate[];
  progressUpdates: AbsProgressUpdate[];
  progressSkips: AbsProgressSkip[];
  notInBookshelf: AbsBookSync[];
  rereadStarts: RereadStart[];
}

export function computeAbsResults(
  absBooks: AbsBookSync[],
  bookshelfBooks: BookshelfBookForAbs[],
  thresholds: { minPriorProgress: number; dropThreshold: number } = {
    minPriorProgress: REREAD_MIN_PRIOR_PROGRESS,
    dropThreshold: REREAD_DROP_THRESHOLD,
  },
): AbsSyncResults {
  const bookshelfByIsbn = new Map<string, BookshelfBookForAbs>();
  const bookshelfByKey = new Map<string, BookshelfBookForAbs>();
  for (const b of bookshelfBooks) {
    if (b.isbn) bookshelfByIsbn.set(b.isbn, b);
    // ABS never supplies series data, so the key never includes it. Register
    // both the full title and a subtitle-stripped variant, since ABS and
    // Bookshelf titles often come from different metadata sources that
    // disagree on whether to include a subtitle.
    bookshelfByKey.set(buildCompositeKey(b.title, b.author, null, null), b);
    const stripped = stripSubtitle(b.title);
    if (stripped !== b.title) {
      bookshelfByKey.set(buildCompositeKey(stripped, b.author, null, null), b);
    }
  }

  const results: AbsSyncResults = {
    statusUpdates: [],
    progressUpdates: [],
    progressSkips: [],
    notInBookshelf: [],
    rereadStarts: [],
  };

  for (const absBook of absBooks) {
    const strippedAbsTitle = stripSubtitle(absBook.title);
    const bookshelfBook =
      (absBook.isbn ? bookshelfByIsbn.get(absBook.isbn) : undefined) ??
      bookshelfByKey.get(buildCompositeKey(absBook.title, absBook.author, null, null)) ??
      (strippedAbsTitle !== absBook.title
        ? bookshelfByKey.get(buildCompositeKey(strippedAbsTitle, absBook.author, null, null))
        : undefined);

    if (!bookshelfBook) {
      results.notInBookshelf.push(absBook);
      continue;
    }

    const derived = deriveAbsStatus(absBook.progressPercent, absBook.isFinished);

    if (
      isRereadStart(
        bookshelfBook,
        derived,
        absBook.progressPercent,
        absBook.progressUpdatedAt,
        thresholds.minPriorProgress,
        thresholds.dropThreshold,
      )
    ) {
      results.rereadStarts.push({
        absBook,
        bookshelfBook,
        newProgress: absBook.progressPercent,
        newStartedAt: absBook.startedAt,
      });
      continue;
    }

    const newStatus = shouldUpdateStatus(
      bookshelfBook.status,
      derived,
      bookshelfBook.dnfAt,
      bookshelfBook.resetAt,
      bookshelfBook.rereadAt,
      absBook.progressUpdatedAt,
    )
      ? derived
      : null;
    const effectiveStatus = newStatus ?? bookshelfBook.status;

    const newStartedAt =
      bookshelfBook.startedAt === null && absBook.startedAt !== null ? absBook.startedAt : null;

    const newFinishedAt =
      bookshelfBook.finishedAt === null && effectiveStatus === "READ"
        ? (absBook.finishedAt ?? new Date())
        : null;

    if (newStatus !== null || newStartedAt !== null || newFinishedAt !== null) {
      results.statusUpdates.push({ absBook, bookshelfBook, newStatus, newStartedAt, newFinishedAt });
    }

    if (
      shouldLogProgress(
        absBook.progressPercent,
        bookshelfBook.progress,
        bookshelfBook.rereadAt,
        absBook.progressUpdatedAt,
      )
    ) {
      results.progressUpdates.push({
        absBook,
        bookshelfBook,
        newProgress: absBook.progressPercent,
      });
    } else if (absBook.progressPercent > 0 && bookshelfBook.progress < 100) {
      results.progressSkips.push({ absBook, bookshelfBook });
    }
  }

  const seenRereadIds = new Set<number>();
  results.rereadStarts = results.rereadStarts.filter((r) => {
    if (seenRereadIds.has(r.bookshelfBook.id)) return false;
    seenRereadIds.add(r.bookshelfBook.id);
    return true;
  });

  return results;
}
