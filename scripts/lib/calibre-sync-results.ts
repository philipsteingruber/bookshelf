import type { ReadStatus } from "@/generated/prisma/enums";

import { buildCompositeKey } from "./normalizer";
import { deriveStatus, isRereadStart, shouldLogProgress, shouldUpdateStatus } from "./sync-utils";
import type { CalibreBookSync } from "./calibre-sync-reader";

const REREAD_MIN_PRIOR_PROGRESS = 90;
const REREAD_DROP_THRESHOLD = 50;

export interface BookshelfBook {
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
  series: { name: string } | null;
  seriesIndex: number | null;
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
  rating: number | null; // bookshelf scale: 1–5
}

export interface BookUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newStatus: ReadStatus | null;
  newStartedAt: Date | null;
  newFinishedAt: Date | null;
}

export interface ProgressUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newProgress: number;
}

export interface ProgressSkip {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
}

export interface MetadataUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newTitle: string | null;
  newAuthor: string | null;
  newIsbn: string | null;
  newPublishedYear: number | null;
  newSummary: string | null;
}

export interface RatingUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newRating: number; // bookshelf scale: 1–5
}

export interface RereadStart {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newProgress: number; // sourceProgress, already confirmed non-null by isRereadStart
  newStartedAt: Date | null; // the source's own start date — see computeResults below
}

export interface SyncResults {
  toCreate: CalibreBookSync[];
  bookUpdates: BookUpdate[];
  progressUpdates: ProgressUpdate[];
  progressSkips: ProgressSkip[];
  metadataUpdates: MetadataUpdate[];
  ratingUpdates: RatingUpdate[];
  notInCalibre: BookshelfBook[];
  readNextRemovals: CalibreBookSync[];
  rereadStarts: RereadStart[];
}

export function computeResults(
  calibreBooks: CalibreBookSync[],
  bookshelfBooks: BookshelfBook[],
): SyncResults {
  const bookshelfByIsbn = new Map<string, BookshelfBook>();
  const bookshelfByKey = new Map<string, BookshelfBook>();
  for (const b of bookshelfBooks) {
    if (b.isbn) bookshelfByIsbn.set(b.isbn, b);
    bookshelfByKey.set(buildCompositeKey(b.title, b.author, b.series?.name ?? null, b.seriesIndex), b);
  }

  const matchedIds = new Set<number>();
  const results: SyncResults = {
    toCreate: [],
    bookUpdates: [],
    progressUpdates: [],
    progressSkips: [],
    metadataUpdates: [],
    ratingUpdates: [],
    notInCalibre: [],
    readNextRemovals: [],
    rereadStarts: [],
  };

  for (const calibreBook of calibreBooks) {
    const bookshelfBook =
      (calibreBook.isbn ? bookshelfByIsbn.get(calibreBook.isbn) : undefined) ??
      bookshelfByKey.get(
        buildCompositeKey(
          calibreBook.title,
          calibreBook.author,
          calibreBook.seriesName,
          calibreBook.seriesIndex,
        ),
      );

    if (!bookshelfBook) {
      results.toCreate.push(calibreBook);
      continue;
    }

    matchedIds.add(bookshelfBook.id);

    const derived = deriveStatus(
      calibreBook.readStatus,
      calibreBook.readPercent,
      calibreBook.dnf,
      calibreBook.isReadNext,
    );

    if (
      isRereadStart(
        bookshelfBook,
        derived,
        calibreBook.readPercent,
        calibreBook.progressUpdatedAt,
        REREAD_MIN_PRIOR_PROGRESS,
        REREAD_DROP_THRESHOLD,
      )
    ) {
      results.rereadStarts.push({
        calibreBook,
        bookshelfBook,
        newProgress: calibreBook.readPercent!, // non-null: isRereadStart requires it
        newStartedAt: calibreBook.datestarted,
      });
      continue;
    }

    const newStatus = shouldUpdateStatus(
      bookshelfBook.status,
      derived,
      bookshelfBook.dnfAt,
      bookshelfBook.resetAt,
      bookshelfBook.rereadAt,
      calibreBook.progressUpdatedAt,
    )
      ? derived
      : null;
    const effectiveStatus = newStatus ?? bookshelfBook.status;

    const newStartedAt =
      bookshelfBook.startedAt === null && calibreBook.datestarted !== null
        ? calibreBook.datestarted
        : null;

    const newFinishedAt =
      bookshelfBook.finishedAt === null && effectiveStatus === "READ"
        ? new Date()
        : null;

    if (newStatus !== null || newStartedAt !== null || newFinishedAt !== null) {
      results.bookUpdates.push({
        calibreBook,
        bookshelfBook,
        newStatus,
        newStartedAt,
        newFinishedAt,
      });
    }

    if (
      shouldLogProgress(
        calibreBook.readPercent,
        bookshelfBook.progress,
        bookshelfBook.rereadAt,
        calibreBook.progressUpdatedAt,
      )
    ) {
      results.progressUpdates.push({
        calibreBook,
        bookshelfBook,
        newProgress: calibreBook.readPercent!,
      });
    } else if (
      calibreBook.readPercent !== null &&
      calibreBook.readPercent > 0 &&
      bookshelfBook.progress < 100
    ) {
      results.progressSkips.push({ calibreBook, bookshelfBook });
    }

    const newTitle = calibreBook.title !== bookshelfBook.title ? calibreBook.title : null;
    const newAuthor = calibreBook.author !== bookshelfBook.author ? calibreBook.author : null;
    const newIsbn = bookshelfBook.isbn === null && calibreBook.isbn !== null ? calibreBook.isbn : null;
    const newPublishedYear =
      bookshelfBook.publishedYear === null && calibreBook.publishedYear !== null
        ? calibreBook.publishedYear
        : null;
    const newSummary =
      calibreBook.summary !== null && bookshelfBook.summary !== calibreBook.summary
        ? calibreBook.summary
        : null;

    if (
      newTitle !== null ||
      newAuthor !== null ||
      newIsbn !== null ||
      newPublishedYear !== null ||
      newSummary !== null
    ) {
      results.metadataUpdates.push({
        calibreBook,
        bookshelfBook,
        newTitle,
        newAuthor,
        newIsbn,
        newPublishedYear,
        newSummary,
      });
    }

    // Bookshelf wins: it's the source of truth for ratings now (reviewed via
    // review-ratings.ts). Calibre only seeds a rating when Bookshelf has none
    // yet — it can never overwrite a rating already set in Bookshelf.
    if (calibreBook.rating !== null && bookshelfBook.rating === null) {
      const calibreStars = calibreBook.rating / 2;
      results.ratingUpdates.push({ calibreBook, bookshelfBook, newRating: calibreStars });
    }
  }

  for (const b of bookshelfBooks) {
    if (!matchedIds.has(b.id)) results.notInCalibre.push(b);
  }

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.isReadNext) continue;
    const base = deriveStatus(calibreBook.readStatus, calibreBook.readPercent, calibreBook.dnf);
    if (base !== "TO_READ") results.readNextRemovals.push(calibreBook);
  }

  // Two source rows can resolve to the same bookshelf book (a Calibre
  // duplicate, or a cron rerun after a partial prior failure) — dedupe by
  // bookshelfBook.id so a rerun/duplicate can't double-append the same
  // finish date via previousFinishedAt's `set` write in applyRereadStarts.
  const seenRereadIds = new Set<number>();
  results.rereadStarts = results.rereadStarts.filter((r) => {
    if (seenRereadIds.has(r.bookshelfBook.id)) return false;
    seenRereadIds.add(r.bookshelfBook.id);
    return true;
  });

  return results;
}
