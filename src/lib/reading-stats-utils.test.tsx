import { startOfDay, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DailyStats,
  OverallStats,
  ReadingStats,
  StreakDetails,
  WeeklyStats,
} from "./reading-stats-utils";
import {
  calculateDailyStats,
  calculateOverallStats,
  calculateReadingStats,
  calculateStreakDetails,
  calculateWeeklyStats,
} from "./reading-stats-utils";
import {
  createFakeBook,
  createFakeReadingProgressWithBook,
} from "./test-utils";

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
      const readingProgress = createFakeReadingProgressWithBook();

      const result = calculateReadingStats([readingProgress]);

      expect(result).toMatchObject({
        daily: {
          pagesToday: expect.any(Number),
          averagePagesPerDay: expect.any(Number),
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
          streakStart: expect.any(Date),
        } satisfies StreakDetails,
      } satisfies ReadingStats);
    });
  });
});
