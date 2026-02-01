import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGoalHistory,
  calculateReadingGoalStats,
  checkGoalCelebration,
  enrichGoalHistory,
} from "@/lib/reading";
import type { CheckGoalCelebrationParams } from "@/lib/reading/reading-goal-utils";
import { createMockStorage } from "@/lib/test-utils";
import type {
  BooksFinishedByYear,
  EnrichedGoalHistoryEntry,
  GoalHistoryEntry,
  ReadingGoalHistoryEntry,
} from "@/lib/types";

const mockDate = new Date("2026-01-15T12:00:00");
const currentYear = 2026;

describe("readingGoalUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("calculateReadingGoalStats", () => {
    describe("booksReadThisYear", () => {
      it("should calculate booksReadThisYear from books with finishedAt in current year", () => {
        const result = calculateReadingGoalStats(
          [
            { year: currentYear - 1, count: 5 },
            { year: currentYear, count: 4 },
          ],
          0,
        );

        expect(result.booksReadThisYear).toEqual(4);
      });

      it("should return 0 when no books finished in current year", () => {
        const noEntryForCurrentYear = calculateReadingGoalStats(
          [{ year: currentYear - 1, count: 3 }],
          0,
        );
        expect(noEntryForCurrentYear.booksReadThisYear).toEqual(0);

        const zeroEntryForCurrentYear = calculateReadingGoalStats(
          [{ year: currentYear, count: 0 }],
          0,
        );
        expect(zeroEntryForCurrentYear.booksReadThisYear).toEqual(0);
      });

      it("should return 0 when booksFinishedByYear is empty", () => {
        const result = calculateReadingGoalStats([], 0);
        expect(result.booksReadThisYear).toEqual(0);
      });
    });
    describe("progressPercentage", () => {
      it("should calculate progressPercentage as rounded percentage of goal", () => {
        const goal = 3;
        const readThisYear = 2;

        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: readThisYear }],
          goal,
        );

        expect(result.progressPercentage).toEqual(67);
      });

      it("should return 0 for progressPercentage when goal is 0", () => {
        const result = calculateReadingGoalStats([], 0);

        expect(result.progressPercentage).toEqual(0);
      });

      it("should return 0 for progressPercentage when goal is null", () => {
        const result = calculateReadingGoalStats([], null);

        expect(result.progressPercentage).toEqual(0);
      });

      it("should allow progressPercentage over 100 when exceeding goal", () => {
        const goal = 1;
        const readThisYear = 2;

        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: readThisYear }],
          goal,
        );
        expect(result.progressPercentage).toEqual(200);
      });
    });
    describe("booksRemaining", () => {
      it("should calculate booksRemaining correctly", () => {
        const goal = 2;
        const readThisYear = 1;

        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: readThisYear }],
          goal,
        );

        expect(result.booksRemaining).toEqual(1);
      });

      it("should never return negative booksRemaining", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 10 }],
          5,
        );
        expect(result.booksRemaining).toEqual(0);
      });
    });
    describe("isOnTrack", () => {
      it("should set isOnTrack true when books read >= expected at this point in year", () => {
        const goal = 2;
        const readThisYear = 1;

        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: readThisYear }],
          goal,
        );
        expect(result.isOnTrack).toEqual(true);
      });

      it("should set isOnTrack false when behind expected pace", () => {
        const goal = 400;
        const readThisYear = 1;

        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: readThisYear }],
          goal,
        );

        expect(result.isOnTrack).toEqual(false);
      });
    });
    describe("expectedAtThisPoint", () => {
      it("should calculate expectedAtThisPoint based on day-of-year", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 0 }],
          365,
          new Date("2026-01-01"),
        );

        expect(result.expectedAtThisPoint).toEqual(1);
      });

      it("should return expectedAtThisPoint of 0 when goal is 0", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 0 }],
          0,
        );
        expect(result.expectedAtThisPoint).toEqual(0);
      });
    });
    describe("paceMessage", () => {
      it("should return encouraging paceMessage when on track", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 1 }],
          1,
        );
        expect(result.paceMessage).toEqual("On pace, keep going!");
      });

      it("should return 'behind' paceMessage with correct count when behind", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 1 }],
          365,
        );
        expect(result.paceMessage).toEqual(
          "14 books behind, time to pick it up!",
        );
      });

      it("should use correct pluralization in paceMessage ('1 book' vs '2 books')", () => {
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 14 }],
          365,
        );
        expect(result.paceMessage).toEqual(
          "1 book behind, time to pick it up!",
        );
      });
    });
    describe("currentGoal", () => {
      it("should return the goal value when provided", () => {
        const goal = 1;
        const result = calculateReadingGoalStats(
          [{ year: currentYear, count: 0 }],
          goal,
        );
        expect(result.currentGoal).toEqual(goal);
      });

      it("should return 0 when goal is null", () => {
        const result = calculateReadingGoalStats([
          { year: currentYear, count: 0 },
        ]);
        expect(result.currentGoal).toEqual(0);
      });
    });
  });
  describe("buildGoalHistory", () => {
    it("should combine goal history with actual book counts per year", () => {
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { goal: 1, year: currentYear },
      ];
      const booksFinishedByYear: BooksFinishedByYear[] = [
        { count: 1, year: currentYear },
      ];
      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });

      expect(result[0]).toEqual({
        actual: 1,
        goal: 1,
        year: currentYear,
      } satisfies GoalHistoryEntry);
    });

    it("should return 0 for actual count when no books finished that year", () => {
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { goal: 1, year: currentYear },
      ];
      const booksFinishedByYear: BooksFinishedByYear[] = [
        { count: 0, year: currentYear },
      ];
      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });

      expect(result[0].actual).toEqual(0);
    });

    it("should return empty array when readingGoalHistory is null", () => {
      const booksFinishedByYear = [{ count: 0, year: currentYear }];
      const result = buildGoalHistory({
        readingGoalHistory: null,
        booksFinishedByYear,
      });
      expect(result).toEqual([]);
    });

    it("should return empty array when readingGoalHistory is empty", () => {
      const booksFinishedByYear = [{ count: 0, year: currentYear }];
      const result = buildGoalHistory({
        readingGoalHistory: [],
        booksFinishedByYear,
      });
      expect(result).toEqual([]);
    });

    it("should preserve order from readingGoalHistory", () => {
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { goal: 1, year: currentYear - 1 },
        { goal: 1, year: currentYear },
      ];
      const booksFinishedByYear: BooksFinishedByYear[] = [
        { count: 0, year: currentYear },
      ];
      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });

      expect(result[0].year).toEqual(currentYear - 1);
      expect(result[1].year).toEqual(currentYear);
    });

    it("should return 0 for actual count when year is missing from booksFinishedByYear", () => {
      const booksFinishedByYear = [{ count: 1, year: currentYear - 1 }];
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { year: currentYear, goal: 0 },
      ];
      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });
      expect(
        result.find((entry) => entry.year === currentYear)?.actual,
      ).toEqual(0);
    });

    it("should handle empty booksFinishedByYear array with non-empty readingGoalHistory", () => {
      const booksFinishedByYear: BooksFinishedByYear[] = [];
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { year: currentYear, goal: 0 },
      ];
      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });
      expect(
        result.find((entry) => entry.year === currentYear)?.actual,
      ).toEqual(0);
    });

    it("should handle multiple years where some have book counts and others don't", () => {
      const readingGoalHistory: ReadingGoalHistoryEntry[] = [
        { year: currentYear - 2, goal: 1 },
        { year: currentYear - 1, goal: 1 },
        { year: currentYear, goal: 1 },
      ];
      const booksFinishedByYear: BooksFinishedByYear[] = [
        { year: currentYear - 2, count: 2 },
        { year: currentYear, count: 1 },
      ];

      const result = buildGoalHistory({
        readingGoalHistory,
        booksFinishedByYear,
      });

      expect(result).toEqual([
        { year: currentYear - 2, goal: 1, actual: 2 },
        { year: currentYear - 1, goal: 1, actual: 0 },
        { year: currentYear, goal: 1, actual: 1 },
      ] satisfies GoalHistoryEntry[]);
    });
  });
  describe("checkGoalCelebration", () => {
    it("should celebrate when reaching goal for the first time", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 10,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(true);
      expect(result.celebratedGoal).toEqual(10);
    });

    it("should not celebrate while data is loading", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: true,
        booksReadThisYear: 10,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(false);
      expect(result.celebratedGoal).toBeNull();
      expect(onCelebrate).not.toHaveBeenCalled();
    });

    it("should not celebrate when below goal", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 5,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(false);
      expect(onCelebrate).not.toHaveBeenCalled();
    });

    it("should not celebrate when goal is 0 (no goal set)", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 10,
        currentGoal: 0,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(false);
      expect(onCelebrate).not.toHaveBeenCalled();
    });

    it("should not celebrate duplicate for same goal (storage check)", () => {
      const mockStorage = createMockStorage("10");
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 10,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(false);
      expect(onCelebrate).not.toHaveBeenCalled();
    });

    it("should celebrate again when goal is increased and reached again", () => {
      const mockStorage = createMockStorage("10");
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 15,
        currentGoal: 15,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(true);
      expect(onCelebrate).toHaveBeenCalledWith(15);
    });

    it("should call onCelebrate callback with goal when celebrating", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      const result = checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 10,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(result.shouldCelebrate).toEqual(true);
      expect(onCelebrate).toHaveBeenCalledWith(10);
    });

    it("should update storage when celebrating", () => {
      const mockStorage = createMockStorage(null);
      const onCelebrate = vi.fn();

      checkGoalCelebration({
        isLoading: false,
        booksReadThisYear: 10,
        currentGoal: 10,
        year: currentYear,
        storage: mockStorage,
        onCelebrate,
      } satisfies CheckGoalCelebrationParams);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        `goal-celebration-${currentYear}`,
        "10",
      );
    });
  });
  describe("enrichGoalHistory", () => {
    it("should return empty array when given empty input", () => {
      const result = enrichGoalHistory([]);
      expect(result).toEqual([]);
    });

    it("should calculate progressPercentage as rounded percentage (actual/goal * 100)", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 3, actual: 2 },
      ];

      const result = enrichGoalHistory(input);

      expect(result[0].progressPercentage).toEqual(67);
    });

    it("should return null for progressPercentage when goal is 0", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 0, actual: 5 },
      ];

      const result = enrichGoalHistory(input);

      expect(result[0].progressPercentage).toBeNull();
    });

    it("should calculate difference as actual - goal", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 10, actual: 12 },
      ];

      const result = enrichGoalHistory(input);

      expect(result[0].difference).toEqual(2);
    });

    it("should return null for differenceFromPrevious for the oldest year", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 10, actual: 5 },
        { year: currentYear - 1, goal: 10, actual: 8 },
      ];

      const result = enrichGoalHistory(input);

      const oldestEntry = result.find((e) => e.year === currentYear - 1);
      expect(oldestEntry?.differenceFromPrevious).toBeNull();
    });

    it("should calculate differenceFromPrevious as current actual minus previous year's actual", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 10, actual: 12 },
        { year: currentYear - 1, goal: 10, actual: 8 },
      ];

      const result = enrichGoalHistory(input);

      const newestEntry = result.find((e) => e.year === currentYear);
      expect(newestEntry?.differenceFromPrevious).toEqual(4);
    });

    it("should preserve input order (newest-first in, newest-first out)", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 10, actual: 5 },
        { year: currentYear - 1, goal: 10, actual: 8 },
        { year: currentYear - 2, goal: 10, actual: 3 },
      ];

      const result = enrichGoalHistory(input);

      expect(result[0].year).toEqual(currentYear);
      expect(result[1].year).toEqual(currentYear - 1);
      expect(result[2].year).toEqual(currentYear - 2);
    });

    it("should handle single entry correctly (oldest year case)", () => {
      const input: GoalHistoryEntry[] = [
        { year: currentYear, goal: 10, actual: 7 },
      ];

      const result = enrichGoalHistory(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        year: currentYear,
        goal: 10,
        actual: 7,
        progressPercentage: 70,
        difference: -3,
        differenceFromPrevious: null,
      } satisfies EnrichedGoalHistoryEntry);
    });
  });
});
