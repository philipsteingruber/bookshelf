import { describe, expect, it } from "vitest";

import type { AbsBookSync } from "./abs-sync-reader";
import { computeAbsResults } from "./abs-sync-results";
import type { BookshelfBookForAbs } from "./abs-sync-results";

function makeAbs(overrides: Partial<AbsBookSync> = {}): AbsBookSync {
  return {
    absLibraryItemId: "li_1",
    title: "Blood Pact",
    author: "Dan Abnett",
    isbn: null,
    progressPercent: 0,
    isFinished: false,
    startedAt: null,
    finishedAt: null,
    progressUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeBookshelf(overrides: Partial<BookshelfBookForAbs> = {}): BookshelfBookForAbs {
  return {
    id: 100,
    title: "Blood Pact",
    author: "Dan Abnett",
    status: "TO_READ",
    progress: 0,
    startedAt: null,
    finishedAt: null,
    dnfAt: null,
    resetAt: null,
    previousFinishedAt: [],
    rereadAt: null,
    isbn: null,
    ...overrides,
  };
}

describe("computeAbsResults — matching", () => {
  it("reports an ABS item with no bookshelf match under notInBookshelf", () => {
    const { notInBookshelf } = computeAbsResults([makeAbs()], []);
    expect(notInBookshelf).toHaveLength(1);
  });

  it("matches by ISBN even when titles differ", () => {
    const abs = makeAbs({ isbn: "9780000000001", title: "Blood Pact (Unabridged)" });
    const bookshelf = makeBookshelf({ isbn: "9780000000001", title: "Blood Pact" });
    const { notInBookshelf } = computeAbsResults([abs], [bookshelf]);
    expect(notInBookshelf).toHaveLength(0);
  });

  it("falls back to title/author matching when ISBN is absent", () => {
    const { notInBookshelf, progressSkips, progressUpdates } = computeAbsResults(
      [makeAbs()],
      [makeBookshelf()],
    );
    expect(notInBookshelf).toHaveLength(0);
    expect(progressSkips).toHaveLength(0);
    expect(progressUpdates).toHaveLength(0);
  });

  it("matches a series book by title/author even though ABS never reports series data", () => {
    // Regression: the bookshelf side used to key on its real series/index,
    // which ABS (no series data at all) could never match against.
    const abs = makeAbs({ title: "Time to Play", author: "Erin Ampersand" });
    const bookshelf = makeBookshelf({ title: "Time to Play", author: "Erin Ampersand" });
    const { notInBookshelf } = computeAbsResults([abs], [bookshelf]);
    expect(notInBookshelf).toHaveLength(0);
  });

  it("matches when both sides have a subtitle but the wording differs", () => {
    // Regression: stripSubtitle was only applied when registering the
    // bookshelf-side keys, not when looking up the ABS title, so two titles
    // sharing the same base but different subtitle wording never matched.
    const abs = makeAbs({ title: "Ghazghkull Thraka: Prophet Waaagh!", author: "Nate Crowley" });
    const bookshelf = makeBookshelf({
      title: "Ghazghkull Thraka: Prophet of the Waaagh!",
      author: "Nate Crowley",
    });
    const { notInBookshelf } = computeAbsResults([abs], [bookshelf]);
    expect(notInBookshelf).toHaveLength(0);
  });

  it("matches when the bookshelf title has a subtitle ABS's title omits", () => {
    // Regression: ABS/Audible and hand-entered ebook titles frequently
    // disagree on whether to include a subtitle.
    const abs = makeAbs({ title: "Hoops & Heartstrings", author: "Eliza Lentzski" });
    const bookshelf = makeBookshelf({
      title: "Hoops & Heartstrings: A Rivals-to-Lovers Sapphic Romance",
      author: "Eliza Lentzski",
    });
    const { notInBookshelf } = computeAbsResults([abs], [bookshelf]);
    expect(notInBookshelf).toHaveLength(0);
  });
});

describe("computeAbsResults — progress", () => {
  it("logs progress when ABS percent exceeds bookshelf progress", () => {
    const abs = makeAbs({ progressPercent: 60 });
    const bookshelf = makeBookshelf({ progress: 40 });
    const { progressUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]!.newProgress).toBe(60);
  });

  it("skips logging when ABS percent is not higher than bookshelf progress", () => {
    const abs = makeAbs({ progressPercent: 30 });
    const bookshelf = makeBookshelf({ progress: 50 });
    const { progressUpdates, progressSkips } = computeAbsResults([abs], [bookshelf]);
    expect(progressUpdates).toHaveLength(0);
    expect(progressSkips).toHaveLength(1);
  });

  it("does not skip-log when ABS progress is 0", () => {
    const abs = makeAbs({ progressPercent: 0 });
    const bookshelf = makeBookshelf({ progress: 0 });
    const { progressSkips } = computeAbsResults([abs], [bookshelf]);
    expect(progressSkips).toHaveLength(0);
  });
});

describe("computeAbsResults — status", () => {
  it("upgrades TO_READ to READING when ABS reports partial progress", () => {
    const abs = makeAbs({ progressPercent: 25 });
    const bookshelf = makeBookshelf({ status: "TO_READ" });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]!.newStatus).toBe("READING");
  });

  it("upgrades to READ and uses ABS's finishedAt timestamp when available", () => {
    const finishedAt = new Date("2026-01-01T00:00:00Z");
    const abs = makeAbs({ isFinished: true, progressPercent: 100, finishedAt });
    const bookshelf = makeBookshelf({ status: "READING" });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates[0]!.newStatus).toBe("READ");
    expect(statusUpdates[0]!.newFinishedAt).toEqual(finishedAt);
  });

  it("does not downgrade an existing READ status", () => {
    const abs = makeAbs({ progressPercent: 40 });
    const bookshelf = makeBookshelf({
      status: "READ",
      progress: 100,
      finishedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(0);
  });

  it("backfills a missing finishedAt on an already-READ book without changing status", () => {
    const abs = makeAbs({ progressPercent: 40 });
    const bookshelf = makeBookshelf({ status: "READ", progress: 100, finishedAt: null });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]!.newStatus).toBeNull();
    expect(statusUpdates[0]!.newFinishedAt).not.toBeNull();
  });

  it("does not touch startedAt when bookshelf already has one", () => {
    const existingStart = new Date("2025-06-01T00:00:00Z");
    const abs = makeAbs({ progressPercent: 10, startedAt: new Date("2026-01-01T00:00:00Z") });
    const bookshelf = makeBookshelf({ status: "TO_READ", startedAt: existingStart });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates[0]!.newStartedAt).toBeNull();
  });
});

describe("computeAbsResults — DNF resume gating", () => {
  // ABS has no DNF concept of its own, so a DNF book can only ever be cleared
  // via this timestamp check — there's no equivalent of Calibre's checkbox to
  // keep ABS's own state in sync.
  it("clears DNF when ABS progress is newer than the DNF decision", () => {
    const abs = makeAbs({
      progressPercent: 40,
      progressUpdatedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "DNF", dnfAt: new Date("2026-06-01T00:00:00Z") });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates[0]!.newStatus).toBe("READING");
  });

  it("does not clear DNF when ABS's progress timestamp predates the DNF decision", () => {
    const abs = makeAbs({
      progressPercent: 40,
      progressUpdatedAt: new Date("2026-05-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "DNF", dnfAt: new Date("2026-06-01T00:00:00Z") });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(0);
  });

  it("does not clear DNF when dnfAt is unknown", () => {
    const abs = makeAbs({
      progressPercent: 40,
      progressUpdatedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "DNF", dnfAt: null });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(0);
  });
});

describe("computeAbsResults — reset-below resume gating", () => {
  // Regression coverage for the "Discount Dan" bug: a book reset to TO_READ by
  // mark-abandoned-books.ts's --reset-below branch has its bookshelf progress
  // wiped, but ABS itself still reports whatever progress it always had. That
  // stale ABS signal must not silently promote the book straight back to
  // READING on the very next sync.
  it("promotes a reset TO_READ book to READING when ABS progress is newer than the reset", () => {
    const abs = makeAbs({
      progressPercent: 3,
      progressUpdatedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "TO_READ", resetAt: new Date("2026-06-01T00:00:00Z") });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates[0]!.newStatus).toBe("READING");
  });

  it("does not promote a reset TO_READ book when ABS's progress timestamp predates the reset", () => {
    const abs = makeAbs({
      progressPercent: 3,
      progressUpdatedAt: new Date("2026-05-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "TO_READ", resetAt: new Date("2026-06-01T00:00:00Z") });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates).toHaveLength(0);
  });

  it("promotes an unreset TO_READ book to READING regardless of ABS's progress timestamp", () => {
    const abs = makeAbs({
      progressPercent: 3,
      progressUpdatedAt: new Date("2026-05-01T00:00:00Z"),
    });
    const bookshelf = makeBookshelf({ status: "TO_READ", resetAt: null });
    const { statusUpdates } = computeAbsResults([abs], [bookshelf]);
    expect(statusUpdates[0]!.newStatus).toBe("READING");
  });
});

describe("computeAbsResults — reread detection", () => {
  const finishedAt = new Date("2026-06-01");
  const afterFinish = new Date("2026-07-01");

  it("routes a detected reread to rereadStarts and NOT to statusUpdates or progressUpdates", () => {
    const abs = makeAbs({ progressPercent: 5, isFinished: false, progressUpdatedAt: afterFinish });
    const bookshelf = makeBookshelf({ status: "READ", progress: 100, finishedAt });
    const { rereadStarts, statusUpdates, progressUpdates } = computeAbsResults([abs], [bookshelf]);

    expect(rereadStarts).toHaveLength(1);
    expect(rereadStarts[0]!.newProgress).toBe(5);
    expect(statusUpdates).toHaveLength(0);
    expect(progressUpdates).toHaveLength(0);
  });

  it("does not detect a reread for an ordinary in-progress item", () => {
    const abs = makeAbs({ progressPercent: 40, isFinished: false, progressUpdatedAt: afterFinish });
    const bookshelf = makeBookshelf({ status: "READING", progress: 20 });
    const { rereadStarts } = computeAbsResults([abs], [bookshelf]);
    expect(rereadStarts).toHaveLength(0);
  });
});
