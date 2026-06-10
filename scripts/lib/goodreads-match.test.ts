import { describe, expect, it } from "vitest";

import type { CalibreBook } from "./calibre-reader";
import { buildGoodreadsUrl, matchGoodreadsUrls } from "./goodreads-match";
import type { BookshelfBookForGoodreads } from "./goodreads-match";

function makeCalibre(overrides: Partial<CalibreBook> = {}): CalibreBook {
  return {
    id: 1,
    title: "Blood Pact",
    author: "Dan Abnett",
    seriesName: "Gaunt's Ghosts",
    seriesIndex: 8,
    goodreadsId: "12345",
    ...overrides,
  };
}

function makeBookshelf(overrides: Partial<BookshelfBookForGoodreads> = {}): BookshelfBookForGoodreads {
  return {
    id: 100,
    title: "Blood Pact",
    author: "Dan Abnett",
    seriesIndex: 8,
    goodreadsUrl: null,
    series: { name: "Gaunt's Ghosts" },
    ...overrides,
  };
}

describe("buildGoodreadsUrl", () => {
  it("builds a URL from a Goodreads ID", () => {
    expect(buildGoodreadsUrl("12345")).toBe("https://www.goodreads.com/book/show/12345");
  });
});

describe("matchGoodreadsUrls", () => {
  it("adds a matched book without a goodreadsUrl to toUpdate", () => {
    const results = matchGoodreadsUrls([makeCalibre()], [makeBookshelf()]);
    expect(results.toUpdate).toHaveLength(1);
    expect(results.toUpdate[0]!.bookshelfId).toBe(100);
  });

  it("adds a matched book that already has a goodreadsUrl to alreadyEnriched", () => {
    const results = matchGoodreadsUrls(
      [makeCalibre()],
      [makeBookshelf({ goodreadsUrl: "https://www.goodreads.com/book/show/12345" })],
    );
    expect(results.alreadyEnriched).toHaveLength(1);
    expect(results.toUpdate).toHaveLength(0);
  });

  it("adds a Calibre book with no matching bookshelf book to notInBookshelf", () => {
    const results = matchGoodreadsUrls([makeCalibre()], []);
    expect(results.notInBookshelf).toHaveLength(1);
  });

  it("adds a Calibre book with no goodreadsId to noGoodreadsId", () => {
    const results = matchGoodreadsUrls([makeCalibre({ goodreadsId: null })], [makeBookshelf()]);
    expect(results.noGoodreadsId).toHaveLength(1);
    expect(results.toUpdate).toHaveLength(0);
  });

  it("adds a Calibre book whose goodreadsId appears on multiple Calibre books to duplicateCalibreId", () => {
    const books = [
      makeCalibre({ id: 1, title: "Book A" }),
      makeCalibre({ id: 2, title: "Book B" }),
    ];
    const results = matchGoodreadsUrls(books, [makeBookshelf()]);
    expect(results.duplicateCalibreId).toHaveLength(2);
    expect(results.toUpdate).toHaveLength(0);
  });

  it("adds a Calibre book to ambiguous when multiple bookshelf books share the same key", () => {
    const bookshelfs = [
      makeBookshelf({ id: 100 }),
      makeBookshelf({ id: 101 }),
    ];
    const results = matchGoodreadsUrls([makeCalibre()], bookshelfs);
    expect(results.ambiguous).toHaveLength(1);
    expect(results.toUpdate).toHaveLength(0);
  });

  it("uses the composite key (title + author + series + index) for matching", () => {
    const calibre = makeCalibre({ seriesIndex: 8 });
    const wrongIndex = makeBookshelf({ seriesIndex: 9 });
    const results = matchGoodreadsUrls([calibre], [wrongIndex]);
    expect(results.notInBookshelf).toHaveLength(1);
  });

  it("matches a book without series when Calibre and bookshelf both have no series", () => {
    const calibre = makeCalibre({ seriesName: null, seriesIndex: null });
    const bookshelf = makeBookshelf({ series: null, seriesIndex: null });
    const results = matchGoodreadsUrls([calibre], [bookshelf]);
    expect(results.toUpdate).toHaveLength(1);
  });
});
