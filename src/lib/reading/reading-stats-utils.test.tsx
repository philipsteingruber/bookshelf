import { startOfDay, subDays, subYears } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { READING_GOAL_DEFAULT_THRESHOLD } from "@/lib/constants";
import {
  createFakeBook,
  createFakeReadingProgress,
  createFakeReadingProgressWithBook,
} from "@/lib/test-utils";
import type {
  DailyStats,
  OverallStats,
  ReadingStats,
  StreakDetails,
  WeeklyStats,
} from "@/lib/types";

import {
  calculateDailyStats,
  calculateOverallStats,
  calculateReadingStats,
  calculateStreakDetails,
  calculateWeeklyStats,
  calculateYearlyStats,
  getQualifyingDays,
  transformProgressHistory,
} from "./reading-stats-utils";

const mockDate = new Date("2026-01-15T12:00:00");

describe("reading-stats-utils", () => {
  describe("calculateStreakDetails", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it("should return zero streak when given an empty array", () => {
      const result = calculateStreakDetails([]);

      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        isActiveToday: false,
        streakStart: null,
      } satisfies StreakDetails);
    });

    it("should detect isActiveToday correctly", () => {
      const readingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([readingProgress]);

      expect(result.isActiveToday).toEqual(true);
    });

    it("should calculate current streak when active today", () => {
      const readingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([readingProgress]);

      expect(result.currentStreak).toEqual(1);
    });

    it("should calculate current streak when active yesterday", () => {
      const readingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
      });

      const result = calculateStreakDetails([readingProgress]);

      expect(result.currentStreak).toEqual(1);
      expect(result.isActiveToday).toEqual(false);
    });

    it("should return zero current streak when last activity was 2+ days ago", () => {
      const readingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 3),
      });

      const result = calculateStreakDetails([readingProgress]);

      expect(result.currentStreak).toEqual(0);
      expect(result.isActiveToday).toEqual(false);
    });

    it("should handle single day activity", () => {
      const readingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([readingProgress]);

      expect(result.currentStreak).toEqual(1);
      expect(result.longestStreak).toEqual(1);
    });

    it("should handle consecutive days correctly", () => {
      const firstReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 2),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
      });
      const thirdReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([
        firstReadingProgress,
        secondReadingProgress,
        thirdReadingProgress,
      ]);

      expect(result.currentStreak).toEqual(3);
      expect(result.longestStreak).toEqual(3);
      expect(result.isActiveToday).toEqual(true);
      expect(startOfDay(result.streakStart!)).toEqual(
        startOfDay(subDays(new Date(), 2)),
      );
    });

    it("should calculate longest streak correctly", () => {
      const firstOldReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 7),
      });
      const secondOldReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 6),
      });
      const thirdOldReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 5),
      });

      const firstNewReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
      });
      const secondNewReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([
        firstOldReadingProgress,
        secondOldReadingProgress,
        thirdOldReadingProgress,
        firstNewReadingProgress,
        secondNewReadingProgress,
      ]);

      expect(result.currentStreak).toEqual(2);
      expect(result.longestStreak).toEqual(3);
    });

    it("should handle gaps in reading activity", () => {
      const firstOldReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 7),
      });
      const secondOldReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 6),
      });

      const firstNewReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
      });
      const secondNewReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateStreakDetails([
        firstOldReadingProgress,
        secondOldReadingProgress,
        firstNewReadingProgress,
        secondNewReadingProgress,
      ]);

      expect(result.currentStreak).toEqual(2);
      expect(result.longestStreak).toEqual(2);
    });

    it("should respect minimumPagesForStreak threshold", () => {
      const fakeBook = createFakeBook({ pageCount: 100 });

      // First day: 10 pages (below 30 threshold)
      const firstProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 10,
        createdAt: subDays(new Date(), 2),
      });
      // Second day: 40 pages (above 30 threshold)
      const secondProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: subDays(new Date(), 1),
      });
      // Third day: 50 pages (above 30 threshold)
      const thirdProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
        createdAt: new Date(),
      });

      // With threshold of 30, only day 2 and 3 qualify
      const result = calculateStreakDetails(
        [firstProgress, secondProgress, thirdProgress],
        30,
      );

      expect(result.currentStreak).toEqual(2);
      expect(result.longestStreak).toEqual(2);
    });

    it("should handle timezone correctly for streak calculation", () => {
      // Test that dates near midnight are grouped correctly based on timezone
      const fakeBook = createFakeBook({ pageCount: 100 });

      // Progress at 2026-01-14T23:00:00Z
      // In UTC: Jan 14
      // In Europe/Paris (UTC+1): Jan 15
      const lateNightProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: new Date("2026-01-14T23:00:00Z"),
      });

      // Progress at 2026-01-15T01:00:00Z
      // In UTC: Jan 15
      // In Europe/Paris (UTC+1): Jan 15
      const earlyMorningProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
        createdAt: new Date("2026-01-15T01:00:00Z"),
      });

      // In UTC, these are on different days (Jan 14 and Jan 15)
      const resultUTC = calculateStreakDetails(
        [lateNightProgress, earlyMorningProgress],
        0,
        "UTC",
      );
      expect(resultUTC.longestStreak).toEqual(2);

      // In Europe/Paris, both are on Jan 15 (same day)
      const resultParis = calculateStreakDetails(
        [lateNightProgress, earlyMorningProgress],
        0,
        "Europe/Paris",
      );
      expect(resultParis.longestStreak).toEqual(1);
    });
  });

  describe("getQualifyingDays", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return empty array for empty progress", () => {
      const result = getQualifyingDays([], 0);
      expect(result).toEqual([]);
    });

    it("should return all days when threshold is 0", () => {
      const fakeBook = createFakeBook({ pageCount: 100 });

      const firstProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 10,
        createdAt: subDays(new Date(), 1),
      });
      const secondProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 20,
        createdAt: new Date(),
      });

      const result = getQualifyingDays([firstProgress, secondProgress], 0);
      expect(result.length).toEqual(2);
    });

    it("should filter out days below threshold", () => {
      const fakeBook = createFakeBook({ pageCount: 100 });

      // Day 1: 10 pages (below 20 threshold)
      const firstProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 10,
        createdAt: subDays(new Date(), 2),
      });
      // Day 2: 30 pages (above 20 threshold)
      const secondProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 40,
        createdAt: subDays(new Date(), 1),
      });
      // Day 3: 10 pages (below 20 threshold)
      const thirdProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: new Date(),
      });

      const result = getQualifyingDays(
        [firstProgress, secondProgress, thirdProgress],
        20,
      );
      expect(result.length).toEqual(1);
    });

    it("should return date keys in YYYY-MM-DD format sorted chronologically", () => {
      const fakeBook = createFakeBook({ pageCount: 100 });

      const firstProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: subDays(new Date(), 2),
      });
      const secondProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
        createdAt: new Date(),
      });

      const result = getQualifyingDays([firstProgress, secondProgress], 0);

      expect(result[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result[0] < result[1]).toBe(true);
    });

    it("should respect timezone when grouping days", () => {
      const fakeBook = createFakeBook({ pageCount: 100 });

      // Progress at 2026-01-14T23:00:00Z
      // In UTC: Jan 14
      // In Europe/Paris (UTC+1): Jan 15
      const progress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: new Date("2026-01-14T23:00:00Z"),
      });

      const resultUTC = getQualifyingDays([progress], 0, "UTC");
      expect(resultUTC[0]).toEqual("2026-01-14");

      const resultParis = getQualifyingDays([progress], 0, "Europe/Paris");
      expect(resultParis[0]).toEqual("2026-01-15");
    });
  });
  describe("calculateDailyStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it("should return zero stats when given empty array", () => {
      const result = calculateDailyStats([]);

      expect(result).toEqual({
        averagePagesPerDay: 0,
        pagesToday: 0,
        pagesYesterday: 0,
      } satisfies DailyStats);
    });

    it("should return zero stats when all entries have zero page count", () => {
      const fakeBook = createFakeBook({ pageCount: 0, progress: 0 });
      const readingProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
      });

      const result = calculateDailyStats([readingProgress]);

      expect(result).toEqual({
        averagePagesPerDay: 0,
        pagesToday: 0,
        pagesYesterday: 0,
      } satisfies DailyStats);
    });

    it("should calculate pages read today correctly for single book", () => {
      const fakeBook = createFakeBook();

      const firstReadingProgressWithBook = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 0,
      });
      const secondReadingProgressWithBook = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
      });

      const result = calculateDailyStats([
        firstReadingProgressWithBook,
        secondReadingProgressWithBook,
      ]);

      expect(result.pagesToday).toEqual(fakeBook.pageCount);
    });

    it("should calculate pages read today correctly for multiple books", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 100 });
      const secondBook = createFakeBook({ id: 2, pageCount: 200 });

      const firstReadingProgressBook1 = createFakeReadingProgressWithBook({
        book: firstBook,
        progress: 0,
      });
      const secondReadingProgressBook1 = createFakeReadingProgressWithBook({
        book: firstBook,
        progress: 100,
      });
      const firstReadingProgressBook2 = createFakeReadingProgressWithBook({
        book: secondBook,
        progress: 0,
      });
      const secondReadingProgressBook2 = createFakeReadingProgressWithBook({
        book: secondBook,
        progress: 100,
      });

      const result = calculateDailyStats([
        firstReadingProgressBook1,
        firstReadingProgressBook2,
        secondReadingProgressBook1,
        secondReadingProgressBook2,
      ]);

      expect(result.pagesToday).toEqual(
        firstBook.pageCount + secondBook.pageCount,
      );
    });

    it("should calculate average pages per day across multiple days", () => {
      const fakeBook = createFakeBook({ pageCount: 200, progress: 0 });

      const endProgress = 50;

      const firstProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
        book: fakeBook,
      });
      const secondProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
        progress: endProgress,
        book: fakeBook,
      });

      const totalPagesRead = (endProgress / 100) * fakeBook.pageCount;
      const activeDays = 2;

      const result = calculateDailyStats([firstProgress, secondProgress]);

      expect(result.averagePagesPerDay).toEqual(totalPagesRead / activeDays);
    });

    it("should handle books with zero page count (filter them out)", () => {
      const fakeBookWithPages = createFakeBook({
        id: 1,
        pageCount: 100,
        progress: 0,
      });
      const fakeBookWithoutPages = createFakeBook({
        id: 2,
        pageCount: 0,
        progress: 0,
      });

      const firstReadingProgressBook1 = createFakeReadingProgressWithBook({
        book: fakeBookWithPages,
        progress: 0,
      });
      const secondReadingProgressBook1 = createFakeReadingProgressWithBook({
        book: fakeBookWithPages,
        progress: 100,
      });
      const firstReadingProgressBook2 = createFakeReadingProgressWithBook({
        book: fakeBookWithoutPages,
        progress: 0,
      });
      const secondReadingProgressBook2 = createFakeReadingProgressWithBook({
        book: fakeBookWithoutPages,
        progress: 100,
      });

      const result = calculateDailyStats([
        firstReadingProgressBook1,
        firstReadingProgressBook2,
        secondReadingProgressBook1,
        secondReadingProgressBook2,
      ]);

      expect(result.pagesToday).toEqual(fakeBookWithPages.pageCount);
    });

    it("should handle multiple progress entries for same book on same day", () => {
      const startProgress = 0;
      const endProgress = 20;

      const fakeBook = createFakeBook({ pageCount: 200, progress: 0 });

      const totalPagesRead =
        ((endProgress - startProgress) / 100) * fakeBook.pageCount;

      const firstReadingProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: (endProgress + startProgress) / 2,
        createdAt: new Date(),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: endProgress,
        createdAt: new Date(),
      });

      const result = calculateDailyStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.pagesToday).toEqual(totalPagesRead);
    });

    it("should count pages from previous day's baseline when starting mid-book", () => {
      const fakeBook = createFakeBook({ progress: 50, pageCount: 200 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        book: fakeBook,
        createdAt: subDays(new Date(), 1),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: fakeBook,
        createdAt: new Date(),
      });

      const result = calculateDailyStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.pagesToday).toEqual(100);
    });
  });
  describe("calculateWeeklyStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return zero stats when given an empty array", () => {
      const result = calculateWeeklyStats([]);

      expect(result).toEqual({
        pagesLastWeek: 0,
        pagesThisWeek: 0,
      } satisfies WeeklyStats);
    });

    it("should calculate pages this week correctly", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 100, progress: 0 });
      const secondBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: firstBook,
        createdAt: subDays(new Date(), 1),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: secondBook,
        createdAt: new Date(),
      });

      const result = calculateWeeklyStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.pagesThisWeek).toEqual(
        firstBook.pageCount + secondBook.pageCount,
      );
    });

    it("should calculate pages last week correctly", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 100, progress: 0 });
      const secondBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: firstBook,
        createdAt: subDays(new Date(), 8),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: secondBook,
        createdAt: subDays(new Date(), 7),
      });

      const result = calculateWeeklyStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.pagesLastWeek).toEqual(
        firstBook.pageCount + secondBook.pageCount,
      );
    });

    it("should handle week boundaries correctly", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 100, progress: 0 });
      const secondBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: firstBook,
        createdAt: subDays(new Date(), 7),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: secondBook,
        createdAt: new Date(),
      });

      const result = calculateWeeklyStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.pagesLastWeek).toEqual(firstBook.pageCount);
      expect(result.pagesThisWeek).toEqual(secondBook.pageCount);
    });

    it("should use previous week's baseline for books continued into current week", () => {
      const fakeBook = createFakeBook({ pageCount: 200 });

      const lastWeekReadingProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 50,
        createdAt: subDays(new Date(), 7),
      });
      const newReadingProgress = createFakeReadingProgressWithBook({
        book: fakeBook,
        progress: 100,
        createdAt: new Date(),
      });

      const result = calculateWeeklyStats([
        lastWeekReadingProgress,
        newReadingProgress,
      ]);

      expect(result.pagesThisWeek).toEqual(
        ((newReadingProgress.progress - lastWeekReadingProgress.progress) /
          100) *
          fakeBook.pageCount,
      );
    });

    it("should handle books with zero page count (filter them out)", () => {
      const noPagesBook = createFakeBook({ id: 1, pageCount: 0, progress: 0 });
      const pagesBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const noPagesProgress = createFakeReadingProgressWithBook({
        book: noPagesBook,
        progress: 100,
      });
      const pageProgress = createFakeReadingProgressWithBook({
        book: pagesBook,
        progress: 100,
      });

      const result = calculateWeeklyStats([noPagesProgress, pageProgress]);

      expect(result.pagesThisWeek).toEqual(pagesBook.pageCount);
    });

    it("should assign Sunday reading to previous week (weekStartsOn: Monday)", () => {
      const sundayBook = createFakeBook({ id: 1, pageCount: 100, progress: 0 });
      const mondayBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const sundayProgress = createFakeReadingProgressWithBook({
        book: sundayBook,
        progress: 100,
        createdAt: new Date("2026-01-11T12:00:00"), // Sunday
      });
      const mondayProgress = createFakeReadingProgressWithBook({
        book: mondayBook,
        progress: 100,
        createdAt: new Date("2026-01-12T12:00:00"), // Monday (start of current week)
      });

      const result = calculateWeeklyStats([sundayProgress, mondayProgress]);

      expect(result.pagesLastWeek).toEqual(sundayBook.pageCount);
      expect(result.pagesThisWeek).toEqual(mondayBook.pageCount);
    });
  });
  describe("calculateYearlyStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return empty booksFinishedByYear array when given empty books array", () => {
      const result = calculateYearlyStats([], READING_GOAL_DEFAULT_THRESHOLD);

      expect(result.booksFinishedByYear.length).toEqual(0);
    });

    it("should return empty booksFinishedByYear array when no books have finishedAt", () => {
      const fakeBook = createFakeBook({ finishedAt: null });

      const result = calculateYearlyStats(
        [fakeBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(result.booksFinishedByYear.length).toEqual(0);
    });

    it("should correctly count books finished per year", () => {
      const lastYearBook = createFakeBook({
        finishedAt: subYears(new Date(), 1),
      });
      const thisYearBook = createFakeBook({ finishedAt: new Date() });

      const result = calculateYearlyStats(
        [lastYearBook, thisYearBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(
        result.booksFinishedByYear.find(
          (entry) => entry.year === new Date().getFullYear(),
        )?.count,
      ).toEqual(1);
      expect(
        result.booksFinishedByYear.find(
          (entry) => entry.year === subYears(new Date(), 1).getFullYear(),
        )?.count,
      ).toEqual(1);
    });

    it("should handle multiple books finished in the same year", () => {
      const firstBook = createFakeBook({ id: 1, finishedAt: new Date() });
      const secondBook = createFakeBook({ id: 2, finishedAt: new Date() });

      const result = calculateYearlyStats(
        [firstBook, secondBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(result.booksFinishedByYear.length).toEqual(1);
      expect(result.booksFinishedByYear[0].count).toEqual(2);
    });

    it("should sort by year descending", () => {
      const lastYearBook = createFakeBook({
        finishedAt: subYears(new Date(), 1),
      });
      const thisYearBook = createFakeBook({ finishedAt: new Date() });

      const result = calculateYearlyStats(
        [lastYearBook, thisYearBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(result.booksFinishedByYear[0].year).toBeGreaterThan(
        result.booksFinishedByYear[1].year,
      );
    });

    it("should filter out books below the threshold", () => {
      const fakeBook = createFakeBook({
        pageCount: READING_GOAL_DEFAULT_THRESHOLD - 1,
        finishedAt: new Date(),
      });

      const result = calculateYearlyStats(
        [fakeBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(result.booksFinishedByYear.length).toEqual(0);
    });

    it("should include books at exactly the threshold", () => {
      const fakeBook = createFakeBook({
        pageCount: READING_GOAL_DEFAULT_THRESHOLD,
        finishedAt: new Date(),
      });

      const result = calculateYearlyStats(
        [fakeBook],
        READING_GOAL_DEFAULT_THRESHOLD,
      );

      expect(result.booksFinishedByYear.length).toEqual(1);
    });

    it("should count all books when threshold is 0", () => {
      const fakeBook = createFakeBook({ finishedAt: new Date() });

      const result = calculateYearlyStats([fakeBook], 0);

      expect(result.booksFinishedByYear.length).toEqual(1);
      expect(result.booksFinishedByYear[0].count).toEqual(1);
    });
  });
  describe("calculateOverallStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return zero stats when given empty array", () => {
      const result = calculateOverallStats([]);

      expect(result).toEqual({
        activeDays: 0,
        averagePagesPerWeek: 0,
        totalPagesRead: 0,
        weeksActive: 0,
      } satisfies OverallStats);
    });

    it("should calculate total pages read across all books", () => {
      const firstBook = createFakeBook({ id: 1, progress: 0, pageCount: 100 });
      const secondBook = createFakeBook({ id: 2, progress: 0, pageCount: 200 });

      const newProgress = 50;
      const firstReadingProgress = createFakeReadingProgressWithBook({
        book: firstBook,
        progress: newProgress,
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        book: secondBook,
        progress: newProgress,
      });

      const totalPagesRead =
        (newProgress / 100) * firstBook.pageCount +
        (newProgress / 100) * secondBook.pageCount;

      const result = calculateOverallStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);
      expect(result.totalPagesRead).toEqual(totalPagesRead);
    });

    it("should count active days correctly", () => {
      const firstReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 1),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });
      const thirdReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
      });

      const result = calculateOverallStats([
        firstReadingProgress,
        secondReadingProgress,
        thirdReadingProgress,
      ]);

      expect(result.activeDays).toEqual(2);
    });

    it("should count active weeks correctly", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 100, progress: 0 });
      const secondBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: firstBook,
        createdAt: subDays(new Date(), 7),
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 100,
        book: secondBook,
        createdAt: new Date(),
      });

      const result = calculateOverallStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.weeksActive).toEqual(2);
    });

    it("should calculate average pages per week correctly", () => {
      const firstBook = createFakeBook({ id: 1, pageCount: 200, progress: 0 });
      const secondBook = createFakeBook({ id: 2, pageCount: 100, progress: 0 });

      const firstReadingProgress = createFakeReadingProgressWithBook({
        createdAt: subDays(new Date(), 7),
        book: firstBook,
        progress: 50,
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date(),
        book: secondBook,
        progress: 50,
      });

      const result = calculateOverallStats([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result.averagePagesPerWeek).toEqual(75);
    });

    it("should handle books with zero page count", () => {
      const noPagesBook = createFakeBook({ id: 1, pageCount: 0, progress: 0 });
      const pagesBook = createFakeBook({ id: 2, pageCount: 200, progress: 0 });

      const noPagesProgress = createFakeReadingProgressWithBook({
        book: noPagesBook,
        progress: 100,
      });
      const pageProgress = createFakeReadingProgressWithBook({
        book: pagesBook,
        progress: 100,
      });

      const result = calculateOverallStats([noPagesProgress, pageProgress]);

      expect(result.totalPagesRead).toEqual(pagesBook.pageCount);
    });
  });
  describe("calculateReadingStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
      vi.clearAllMocks();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return combined stats from all calculation functions", () => {
      const result = calculateReadingStats([]);

      expect(result).toMatchObject({
        daily: {
          pagesToday: expect.any(Number),
          averagePagesPerDay: expect.any(Number),
          pagesYesterday: expect.any(Number),
        } satisfies DailyStats,
        weekly: {
          pagesLastWeek: expect.any(Number),
          pagesThisWeek: expect.any(Number),
        } satisfies WeeklyStats,
        overall: {
          activeDays: expect.any(Number),
          averagePagesPerWeek: expect.any(Number),
          totalPagesRead: expect.any(Number),
          weeksActive: expect.any(Number),
        } satisfies OverallStats,
        streak: {
          currentStreak: expect.any(Number),
          isActiveToday: expect.any(Boolean),
          longestStreak: expect.any(Number),
          streakStart: expect.toSatisfy(
            (val) => val === null || val instanceof Date,
          ),
        } satisfies StreakDetails,
      } satisfies ReadingStats);
    });
  });
  describe("transformProgressHistory", () => {
    it("should handle empty history (return empty array)", () => {
      const result = transformProgressHistory([]);

      expect(result).toEqual([]);
    });

    it("should add progressSinceLast field to each entry", () => {
      const entry = createFakeReadingProgress({ progress: 25 });

      const result = transformProgressHistory([entry]);

      expect(result[0]).toHaveProperty("progressSinceLast");
    });

    it("should calculate first entry's progressSinceLast as its own progress", () => {
      const entry = createFakeReadingProgress({ progress: 25 });

      const result = transformProgressHistory([entry]);

      expect(result[0].progressSinceLast).toEqual(25);
    });

    it("should calculate subsequent entries correctly (current - previous)", () => {
      const firstEntry = createFakeReadingProgress({ id: "1", progress: 25 });
      const secondEntry = createFakeReadingProgress({ id: "2", progress: 50 });
      const thirdEntry = createFakeReadingProgress({ id: "3", progress: 75 });

      const result = transformProgressHistory([
        firstEntry,
        secondEntry,
        thirdEntry,
      ]);

      expect(result[0].progressSinceLast).toEqual(25);
      expect(result[1].progressSinceLast).toEqual(25);
      expect(result[2].progressSinceLast).toEqual(25);
    });
  });
});
