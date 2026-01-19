import { subDays, subHours } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  aggregateByDay,
  calculateTrendline,
  estimateCompletion,
} from "@/lib/chart-utils";
import {
  createFakeChartDataPoint,
  createFakeReadingProgressWithProgressSinceLast,
} from "@/lib/test-utils";

const mockDate = new Date("2026-01-15T12:00:00");

describe("chartUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("aggregateByDay", () => {
    it("should return empty array when given empty input", () => {
      const result = aggregateByDay([]);

      expect(result.length).toEqual(0);
    });

    it("should return single entry when only one entry exists", () => {
      const readingProgressWithProgressSinceLast =
        createFakeReadingProgressWithProgressSinceLast();

      const result = aggregateByDay([readingProgressWithProgressSinceLast]);

      expect(result.length).toEqual(1);
    });

    it("should keep latest entry when multiple entries exist on same day", () => {
      const firstReadingProgress =
        createFakeReadingProgressWithProgressSinceLast({
          createdAt: subHours(new Date(), 1),
          progress: 10,
          progressSinceLast: 10,
        });
      const secondReadingProgress =
        createFakeReadingProgressWithProgressSinceLast({
          createdAt: new Date(),
          progress: 20,
          progressSinceLast: 10,
        });

      const result = aggregateByDay([
        firstReadingProgress,
        secondReadingProgress,
      ]);

      expect(result[0].progress).toEqual(20);
      expect(result.length).toEqual(1);
    });

    it("should sort entries by date (oldest to newest)", () => {
      const firstReadingProgress =
        createFakeReadingProgressWithProgressSinceLast({
          createdAt: subDays(new Date(), 1),
        });
      const secondReadingProgress =
        createFakeReadingProgressWithProgressSinceLast({
          createdAt: new Date(),
        });

      const result = aggregateByDay([
        secondReadingProgress,
        firstReadingProgress,
      ]);

      expect(result[0].createdAt.getTime()).toBeLessThan(
        result[1].createdAt.getTime(),
      );
      expect(result.length).toEqual(2);
    });
  });

  describe("calculateTrendline", () => {
    it("should return zero slope when fewer than 2 data points", () => {
      const emptyResult = calculateTrendline([]);
      expect(emptyResult.slope).toEqual(0);
      expect(emptyResult.trendlineData).toEqual([]);

      const singlePoint = createFakeChartDataPoint({ progress: 50 });
      const singleResult = calculateTrendline([singlePoint]);
      expect(singleResult.slope).toEqual(0);
      expect(singleResult.trendlineData).toEqual([]);
    });

    it("should calculate correct slope for 2 data points", () => {
      const firstPoint = createFakeChartDataPoint({
        progress: 25,
        progressSinceLast: 25,
        date: subDays(new Date(), 1),
      });
      const secondPoint = createFakeChartDataPoint({
        progress: 50,
        progressSinceLast: 25,
      });

      const result = calculateTrendline([firstPoint, secondPoint]);

      expect(result.slope).toEqual((50 - 25) / 1);
    });

    it("should calculate slope using calendar days (not elapsed time)", () => {
      /* Both points are on the same calendar day (1 hour apart).
      Since calculateTrendline uses startOfDay(), both get x=0,
      causing division by zero in the slope formula, resulting in NaN.
      If it used elapsed time instead, slope would be 50/hour.*/
      const firstPoint = createFakeChartDataPoint({
        date: subHours(new Date(), 1),
        progress: 0,
      });
      const secondPoint = createFakeChartDataPoint({
        date: new Date(),
        progress: 50,
      });

      const result = calculateTrendline([firstPoint, secondPoint]);

      expect(result.slope).toBeNaN();
    });

    it("should extend trendline to 100% for unfinished books", () => {
      const firstPoint = createFakeChartDataPoint({
        date: subDays(new Date(), 1),
        progress: 0,
      });
      const secondPoint = createFakeChartDataPoint({
        date: new Date(),
        progress: 50,
      });

      const result = calculateTrendline([firstPoint, secondPoint]);

      expect(result.trendlineData.length).toEqual(3);
      expect(result.trendlineData[2].trend).toEqual(100);
    });

    it("should not extend trendline when book is finished (100% progress)", () => {
      const firstPoint = createFakeChartDataPoint({
        date: subDays(new Date(), 1),
        progress: 0,
      });
      const secondPoint = createFakeChartDataPoint({
        date: new Date(),
        progress: 100,
      });

      const result = calculateTrendline([firstPoint, secondPoint]);

      expect(result.trendlineData.length).toEqual(2);
    });
  });

  describe("estimateCompletion", () => {
    it("should return null when slope is zero or negative", () => {
      const zeroSlopeResult = estimateCompletion(50, 0, new Date());
      expect(zeroSlopeResult).toEqual({
        estimatedDate: null,
        daysRemaining: null,
      });

      const negativeSlopeResult = estimateCompletion(50, -1, new Date());
      expect(negativeSlopeResult).toEqual({
        estimatedDate: null,
        daysRemaining: null,
      });
    });

    it("should return null when progress is already 100%", () => {
      const result = estimateCompletion(100, 20, new Date());
      expect(result).toEqual({ estimatedDate: null, daysRemaining: null });
    });

    it("should calculate correct days remaining based on slope", () => {
      const result = estimateCompletion(50, 10, new Date());
      expect(result.daysRemaining).toEqual(5);
    });

    it("should calculate estimated date from last update date", () => {
      const lastUpdate = new Date("2026-01-15");

      const result = estimateCompletion(50, 10, lastUpdate);
      expect(result.estimatedDate).toEqual(new Date("2026-01-20"));
    });
  });
});
