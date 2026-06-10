import type { CalibreBook } from "./calibre-reader";
import { buildCompositeKey } from "./normalizer";

export const GOODREADS_BASE_URL = "https://www.goodreads.com/book/show";

export interface BookshelfBookForGoodreads {
  id: number;
  title: string;
  author: string;
  seriesIndex: number | null;
  goodreadsUrl: string | null;
  series: { name: string } | null;
}

export interface MatchResult {
  calibreBook: CalibreBook;
  bookshelfId: number;
}

export interface GoodreadsMatchResults {
  toUpdate: MatchResult[];
  alreadyEnriched: MatchResult[];
  notInBookshelf: CalibreBook[];
  noGoodreadsId: CalibreBook[];
  ambiguous: CalibreBook[];
  duplicateCalibreId: CalibreBook[];
}

export function buildGoodreadsUrl(goodreadsId: string): string {
  return `${GOODREADS_BASE_URL}/${goodreadsId}`;
}

export function matchGoodreadsUrls(
  calibreBooks: CalibreBook[],
  bookshelfBooks: BookshelfBookForGoodreads[],
): GoodreadsMatchResults {
  const bookshelfByKey = new Map<string, BookshelfBookForGoodreads[]>();

  for (const book of bookshelfBooks) {
    const key = buildCompositeKey(
      book.title,
      book.author,
      book.series?.name ?? null,
      book.series !== null ? book.seriesIndex : null,
    );
    const existing = bookshelfByKey.get(key) ?? [];
    existing.push(book);
    bookshelfByKey.set(key, existing);
  }

  const goodreadsIdCounts = new Map<string, number>();
  for (const book of calibreBooks) {
    if (book.goodreadsId) {
      goodreadsIdCounts.set(book.goodreadsId, (goodreadsIdCounts.get(book.goodreadsId) ?? 0) + 1);
    }
  }
  const duplicateGoodreadsIds = new Set(
    [...goodreadsIdCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );

  const results: GoodreadsMatchResults = {
    toUpdate: [],
    alreadyEnriched: [],
    notInBookshelf: [],
    noGoodreadsId: [],
    ambiguous: [],
    duplicateCalibreId: [],
  };

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.goodreadsId) {
      results.noGoodreadsId.push(calibreBook);
      continue;
    }

    if (duplicateGoodreadsIds.has(calibreBook.goodreadsId)) {
      results.duplicateCalibreId.push(calibreBook);
      continue;
    }

    const key = buildCompositeKey(
      calibreBook.title,
      calibreBook.author,
      calibreBook.seriesName,
      calibreBook.seriesIndex,
    );

    const matches = bookshelfByKey.get(key) ?? [];

    if (matches.length === 0) {
      results.notInBookshelf.push(calibreBook);
    } else if (matches.length > 1) {
      results.ambiguous.push(calibreBook);
    } else {
      const bookshelfBook = matches[0]!;
      if (bookshelfBook.goodreadsUrl) {
        results.alreadyEnriched.push({ calibreBook, bookshelfId: bookshelfBook.id });
      } else {
        results.toUpdate.push({ calibreBook, bookshelfId: bookshelfBook.id });
      }
    }
  }

  return results;
}
