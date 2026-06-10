import type { ReadStatus } from "@/generated/prisma/enums";

import { buildCompositeKey } from "./normalizer";
import { deriveStatus, shouldLogProgress, shouldUpdateStatus } from "./sync-utils";
import type { CalibreBookSync } from "./calibre-sync-reader";

export interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  status: ReadStatus;
  progress: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  series: { name: string } | null;
  seriesIndex: number | null;
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
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

export interface SyncResults {
  toCreate: CalibreBookSync[];
  bookUpdates: BookUpdate[];
  progressUpdates: ProgressUpdate[];
  progressSkips: ProgressSkip[];
  metadataUpdates: MetadataUpdate[];
  notInCalibre: BookshelfBook[];
  readNextRemovals: CalibreBookSync[];
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
    notInCalibre: [],
    readNextRemovals: [],
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

    const newStatus = shouldUpdateStatus(bookshelfBook.status, derived) ? derived : null;
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

    if (shouldLogProgress(calibreBook.readPercent, bookshelfBook.progress)) {
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
  }

  for (const b of bookshelfBooks) {
    if (!matchedIds.has(b.id)) results.notInCalibre.push(b);
  }

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.isReadNext) continue;
    const base = deriveStatus(calibreBook.readStatus, calibreBook.readPercent, calibreBook.dnf);
    if (base !== "TO_READ") results.readNextRemovals.push(calibreBook);
  }

  return results;
}
