import { describe, expect, it } from "vitest";

import { computePagesRead, type PagesReadRow } from "./pages-read";

const options = { from: "2026-01-01", to: "2026-01-03", timeZone: "Europe/Stockholm", windowDays: 2 };

const row = (overrides: Partial<PagesReadRow>): PagesReadRow => ({
  bookId: 1,
  progress: 0,
  createdAt: new Date("2026-01-01T12:00:00Z"),
  title: "Book",
  pageCount: 200,
  ...overrides,
});

describe("computePagesRead", () => {
  it("converts a progress increase into pages using the book's page count", () => {
    const result = computePagesRead([row({ progress: 10 })], options);

    expect(result.days[0].pages).toBe(20);
  });

  it("measures a book's first in-range row from its last row before the range", () => {
    const rows = [
      row({ progress: 50, createdAt: new Date("2025-12-30T12:00:00Z") }),
      row({ progress: 60, createdAt: new Date("2026-01-01T12:00:00Z") }),
    ];

    const result = computePagesRead(rows, options);

    expect(result.days[0].pages).toBe(20);
  });

  it("counts nothing for a drop and measures the next increase from the lower value", () => {
    const rows = [
      row({ progress: 80, createdAt: new Date("2025-12-30T12:00:00Z") }),
      row({ progress: 0, createdAt: new Date("2026-01-01T12:00:00Z") }),
      row({ progress: 5, createdAt: new Date("2026-01-02T12:00:00Z") }),
    ];

    const result = computePagesRead(rows, options);

    expect(result.days.map((d) => d.pages)).toEqual([0, 10, 0]);
  });

  it("skips books with no page count", () => {
    const result = computePagesRead([row({ progress: 10, pageCount: null })], options);

    expect(result.days[0].pages).toBe(0);
  });

  it("assigns a row to the calendar day in the given time zone, not UTC", () => {
    // 23:30 UTC on 1 Jan is already 2 Jan in Stockholm.
    const result = computePagesRead([row({ progress: 10, createdAt: new Date("2026-01-01T23:30:00Z") })], options);

    expect(result.days.map((d) => d.pages)).toEqual([0, 20, 0]);
  });

  it("emits a zero-page entry for every day in the range without reading", () => {
    const result = computePagesRead([], options);

    expect(result.days.map((d) => d.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("averages over the trailing window once enough days exist", () => {
    const rows = [
      row({ progress: 10, createdAt: new Date("2026-01-01T12:00:00Z") }),
      row({ progress: 30, createdAt: new Date("2026-01-02T12:00:00Z") }),
    ];

    const result = computePagesRead(rows, options);

    expect(result.days.map((d) => d.rollingAverage)).toEqual([20, 30, 20]);
  });

  it("splits a day's pages per book, largest first", () => {
    const rows = [row({ bookId: 1, title: "Short", progress: 5 }), row({ bookId: 2, title: "Long", progress: 50 })];

    const result = computePagesRead(rows, options);

    expect(result.days[0].books).toEqual([
      { title: "Long", pages: 100 },
      { title: "Short", pages: 10 },
    ]);
  });

  it("reports the range's average pages per day across every day, reading or not", () => {
    const result = computePagesRead([row({ progress: 15 })], options);

    expect(result.averagePerDay).toBe(10);
  });
});
