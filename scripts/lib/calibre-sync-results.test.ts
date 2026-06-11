import { describe, expect, it } from "vitest";

import type { CalibreBookSync } from "./calibre-sync-reader";
import { computeResults } from "./calibre-sync-results";
import type { BookshelfBook } from "./calibre-sync-results";

function makeCalibре(overrides: Partial<CalibreBookSync> = {}): CalibreBookSync {
  return {
    calibreId: 1,
    title: "Blood Pact",
    author: "Dan Abnett",
    seriesName: "Gaunt's Ghosts",
    seriesIndex: 8,
    goodreadsId: null,
    isbn: null,
    publishedYear: null,
    summary: null,
    rating: null,
    coverPath: null,
    bookFilePath: null,
    readStatus: 0,
    readPercent: null,
    datestarted: null,
    dnf: false,
    isReadNext: false,
    ...overrides,
  };
}

function makeBookshelf(overrides: Partial<BookshelfBook> = {}): BookshelfBook {
  return {
    id: 100,
    title: "Blood Pact",
    author: "Dan Abnett",
    status: "TO_READ",
    progress: 0,
    startedAt: null,
    finishedAt: null,
    series: { name: "Gaunt's Ghosts" },
    seriesIndex: 8,
    isbn: null,
    publishedYear: null,
    summary: null,
    rating: null,
    ...overrides,
  };
}

describe("computeResults — book creation", () => {
  it("adds a Calibre book not in the bookshelf to toCreate", () => {
    const { toCreate } = computeResults([makeCalibре()], []);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0]!.title).toBe("Blood Pact");
  });

  it("does not add a matched book to toCreate", () => {
    const { toCreate } = computeResults([makeCalibре()], [makeBookshelf()]);
    expect(toCreate).toHaveLength(0);
  });
});

describe("computeResults — ISBN matching", () => {
  it("matches a book by ISBN even when the composite key would not match", () => {
    const calibre = makeCalibре({ isbn: "9780000000001", title: "Blood Pact (New Edition)" });
    const bookshelf = makeBookshelf({ isbn: "9780000000001", title: "Blood Pact" });
    const { toCreate } = computeResults([calibre], [bookshelf]);
    expect(toCreate).toHaveLength(0);
  });
});

describe("computeResults — status updates", () => {
  it("produces a bookUpdate when Calibre status is higher priority than bookshelf", () => {
    const calibre = makeCalibре({ readStatus: 2 }); // READING > TO_READ
    const bookshelf = makeBookshelf({ status: "TO_READ" });
    const { bookUpdates } = computeResults([calibre], [bookshelf]);
    expect(bookUpdates).toHaveLength(1);
    expect(bookUpdates[0]!.newStatus).toBe("READING");
  });

  it("does not produce a bookUpdate when Calibre status is lower priority", () => {
    const calibre = makeCalibре({ readStatus: 0, readPercent: null }); // TO_READ
    // finishedAt must be set — otherwise the sync backfills it for READ books
    const bookshelf = makeBookshelf({ status: "READ", finishedAt: new Date("2023-01-01") });
    const { bookUpdates } = computeResults([calibre], [bookshelf]);
    expect(bookUpdates).toHaveLength(0);
  });

  it("sets newFinishedAt when a book transitions to READ and had no finishedAt", () => {
    const calibre = makeCalibре({ readStatus: 1 }); // READ
    const bookshelf = makeBookshelf({ status: "READING", finishedAt: null });
    const { bookUpdates } = computeResults([calibre], [bookshelf]);
    expect(bookUpdates[0]!.newFinishedAt).toBeInstanceOf(Date);
  });

  it("does not set newFinishedAt when the book already has a finishedAt", () => {
    const calibre = makeCalibре({ readStatus: 1 });
    const bookshelf = makeBookshelf({ status: "READ", finishedAt: new Date("2023-01-01") });
    const { bookUpdates } = computeResults([calibre], [bookshelf]);
    expect(bookUpdates).toHaveLength(0);
  });

  it("sets newStartedAt when Calibre has datestarted and bookshelf does not", () => {
    const started = new Date("2024-01-15");
    const calibre = makeCalibре({ readStatus: 2, datestarted: started });
    const bookshelf = makeBookshelf({ status: "TO_READ", startedAt: null });
    const { bookUpdates } = computeResults([calibre], [bookshelf]);
    expect(bookUpdates[0]!.newStartedAt).toEqual(started);
  });
});

describe("computeResults — progress updates", () => {
  it("adds to progressUpdates when Calibre readPercent exceeds bookshelf progress", () => {
    const calibre = makeCalibре({ readPercent: 60 });
    const bookshelf = makeBookshelf({ progress: 50 });
    const { progressUpdates } = computeResults([calibre], [bookshelf]);
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]!.newProgress).toBe(60);
  });

  it("adds to progressSkips when Calibre readPercent is present but not greater", () => {
    const calibre = makeCalibре({ readPercent: 40 });
    const bookshelf = makeBookshelf({ progress: 50 });
    const { progressSkips, progressUpdates } = computeResults([calibre], [bookshelf]);
    expect(progressSkips).toHaveLength(1);
    expect(progressUpdates).toHaveLength(0);
  });

  it("does not skip when readPercent is null", () => {
    const calibre = makeCalibре({ readPercent: null });
    const bookshelf = makeBookshelf({ progress: 50 });
    const { progressSkips, progressUpdates } = computeResults([calibre], [bookshelf]);
    expect(progressSkips).toHaveLength(0);
    expect(progressUpdates).toHaveLength(0);
  });
});

describe("computeResults — metadata updates", () => {
  it("adds to metadataUpdates when title has changed in Calibre", () => {
    // ISBN must be provided so the books match despite having different titles
    const calibre = makeCalibре({ isbn: "9780000000001", title: "Blood Pact: Updated Edition" });
    const bookshelf = makeBookshelf({ isbn: "9780000000001", title: "Blood Pact" });
    const { metadataUpdates } = computeResults([calibre], [bookshelf]);
    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0]!.newTitle).toBe("Blood Pact: Updated Edition");
  });

  it("adds to metadataUpdates when ISBN is present in Calibre but missing in bookshelf", () => {
    const calibre = makeCalibре({ isbn: "9780000000001" });
    const bookshelf = makeBookshelf({ isbn: null });
    const { metadataUpdates } = computeResults([calibre], [bookshelf]);
    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0]!.newIsbn).toBe("9780000000001");
  });

  it("does not add to metadataUpdates when bookshelf already has the ISBN", () => {
    const calibre = makeCalibре({ isbn: "9780000000001" });
    const bookshelf = makeBookshelf({ isbn: "9780000000001" });
    const { metadataUpdates } = computeResults([calibre], [bookshelf]);
    expect(metadataUpdates).toHaveLength(0);
  });

  it("adds to metadataUpdates when summary differs", () => {
    const calibre = makeCalibре({ summary: "New summary." });
    const bookshelf = makeBookshelf({ summary: "Old summary." });
    const { metadataUpdates } = computeResults([calibre], [bookshelf]);
    expect(metadataUpdates[0]!.newSummary).toBe("New summary.");
  });

  it("does not produce a metadataUpdate when nothing has changed", () => {
    const { metadataUpdates } = computeResults([makeCalibре()], [makeBookshelf()]);
    expect(metadataUpdates).toHaveLength(0);
  });
});

describe("computeResults — notInCalibre", () => {
  it("adds bookshelf books with no matching Calibre book to notInCalibre", () => {
    const bookshelf = makeBookshelf({ title: "Orphan Book" });
    const { notInCalibre } = computeResults([], [bookshelf]);
    expect(notInCalibre).toHaveLength(1);
    expect(notInCalibre[0]!.title).toBe("Orphan Book");
  });

  it("does not include matched books in notInCalibre", () => {
    const { notInCalibre } = computeResults([makeCalibре()], [makeBookshelf()]);
    expect(notInCalibre).toHaveLength(0);
  });
});

describe("computeResults — rating updates", () => {
  it("produces a ratingUpdate when Calibre has a rating and bookshelf has none", () => {
    const calibre = makeCalibре({ rating: 8 }); // 4★ in Calibre
    const bookshelf = makeBookshelf({ rating: null });
    const { ratingUpdates } = computeResults([calibre], [bookshelf]);
    expect(ratingUpdates).toHaveLength(1);
    expect(ratingUpdates[0]!.newRating).toBe(4);
  });

  it("produces a ratingUpdate when Calibre rating differs from bookshelf rating", () => {
    const calibre = makeCalibре({ rating: 10 }); // 5★
    const bookshelf = makeBookshelf({ rating: 3 });
    const { ratingUpdates } = computeResults([calibre], [bookshelf]);
    expect(ratingUpdates).toHaveLength(1);
    expect(ratingUpdates[0]!.newRating).toBe(5);
  });

  it("does not produce a ratingUpdate when Calibre and bookshelf ratings are the same", () => {
    const calibre = makeCalibре({ rating: 8 }); // 4★
    const bookshelf = makeBookshelf({ rating: 4 });
    const { ratingUpdates } = computeResults([calibre], [bookshelf]);
    expect(ratingUpdates).toHaveLength(0);
  });

  it("does not produce a ratingUpdate when Calibre has no rating", () => {
    const calibre = makeCalibре({ rating: null });
    const bookshelf = makeBookshelf({ rating: 5 });
    const { ratingUpdates } = computeResults([calibre], [bookshelf]);
    expect(ratingUpdates).toHaveLength(0);
  });
});

describe("computeResults — Read Next removals", () => {
  it("adds to readNextRemovals when a book is on Read Next shelf but has progress", () => {
    const calibre = makeCalibре({ isReadNext: true, readPercent: 50 }); // READING, not TO_READ
    const { readNextRemovals } = computeResults([calibre], []);
    expect(readNextRemovals).toHaveLength(1);
  });

  it("does not add to readNextRemovals when a book is on Read Next with no other signals", () => {
    const calibre = makeCalibре({ isReadNext: true, readStatus: 0, readPercent: null });
    const { readNextRemovals } = computeResults([calibre], []);
    expect(readNextRemovals).toHaveLength(0);
  });
});
