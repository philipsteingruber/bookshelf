import { subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeUserStats } from "@/lib/test-utils";

import { isToday, isYesterday, validateCurrentStreak } from "./streak-utils";

const mockDate = new Date("2026-01-15T12:00:00Z");

describe("streak-utils", () => {
  describe("isToday", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return true for dates on the same day in UTC", () => {
      const date = new Date("2026-01-15T08:00:00Z");
      expect(isToday(date, "UTC")).toBe(true);
    });

    it("should return false for yesterday in UTC", () => {
      const date = subDays(mockDate, 1);
      expect(isToday(date, "UTC")).toBe(false);
    });

    it("should return false for tomorrow in UTC", () => {
      const date = new Date("2026-01-16T08:00:00Z");
      expect(isToday(date, "UTC")).toBe(false);
    });

    it("should handle timezone correctly - date that is today in UTC but yesterday in UTC-5", () => {
      // 2026-01-15T02:00:00Z is still Jan 14 in UTC-5 (America/New_York)
      const date = new Date("2026-01-15T02:00:00Z");
      expect(isToday(date, "UTC")).toBe(true);
      expect(isToday(date, "America/New_York")).toBe(false);
    });

    it("should handle timezone correctly - date that is yesterday in UTC but today in UTC+5", () => {
      // 2026-01-14T22:00:00Z is Jan 15 in UTC+5 (Asia/Karachi)
      const date = new Date("2026-01-14T22:00:00Z");
      expect(isToday(date, "UTC")).toBe(false);
      expect(isToday(date, "Asia/Karachi")).toBe(true);
    });

    it("should use UTC as default timezone", () => {
      const date = new Date("2026-01-15T08:00:00Z");
      expect(isToday(date)).toBe(true);
    });
  });

  describe("isYesterday", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return true for dates on yesterday in UTC", () => {
      const date = new Date("2026-01-14T12:00:00Z");
      expect(isYesterday(date, "UTC")).toBe(true);
    });

    it("should return false for today in UTC", () => {
      expect(isYesterday(mockDate, "UTC")).toBe(false);
    });

    it("should return false for two days ago in UTC", () => {
      const date = subDays(mockDate, 2);
      expect(isYesterday(date, "UTC")).toBe(false);
    });

    it("should handle timezone correctly - date that is yesterday in UTC but today in another timezone", () => {
      // 2026-01-14T22:00:00Z is Jan 14 in UTC, but Jan 15 in UTC+5
      const date = new Date("2026-01-14T22:00:00Z");
      expect(isYesterday(date, "UTC")).toBe(true);
      expect(isYesterday(date, "Asia/Karachi")).toBe(false);
    });

    it("should use UTC as default timezone", () => {
      const date = new Date("2026-01-14T12:00:00Z");
      expect(isYesterday(date)).toBe(true);
    });
  });

  describe("validateCurrentStreak", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return 0 when lastQualifyingReadingDate is null", () => {
      const stats = createFakeUserStats({
        currentStreak: 10,
        lastQualifyingReadingDate: null,
      });

      expect(validateCurrentStreak(stats, "UTC")).toBe(0);
    });

    it("should return currentStreak when lastQualifyingReadingDate is today", () => {
      const stats = createFakeUserStats({
        currentStreak: 5,
        lastQualifyingReadingDate: mockDate,
      });

      expect(validateCurrentStreak(stats, "UTC")).toBe(5);
    });

    it("should return currentStreak when lastQualifyingReadingDate is yesterday", () => {
      const stats = createFakeUserStats({
        currentStreak: 5,
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });

      expect(validateCurrentStreak(stats, "UTC")).toBe(5);
    });

    it("should return 0 when lastQualifyingReadingDate is 2+ days ago", () => {
      const stats = createFakeUserStats({
        currentStreak: 10,
        lastQualifyingReadingDate: subDays(mockDate, 2),
      });

      expect(validateCurrentStreak(stats, "UTC")).toBe(0);
    });

    it("should respect timezone when validating streak", () => {
      // 2026-01-14T22:00:00Z is Jan 14 in UTC (yesterday), but Jan 15 in UTC+5 (today)
      const date = new Date("2026-01-14T22:00:00Z");
      const stats = createFakeUserStats({
        currentStreak: 5,
        lastQualifyingReadingDate: date,
      });

      // In UTC, this is yesterday, so streak is valid
      expect(validateCurrentStreak(stats, "UTC")).toBe(5);

      // In UTC+5, this is today, so streak is also valid
      expect(validateCurrentStreak(stats, "Asia/Karachi")).toBe(5);
    });

    it("should invalidate streak based on timezone", () => {
      // 2026-01-13T22:00:00Z is Jan 13 in UTC (2 days ago), but Jan 14 in UTC+5 (yesterday)
      const date = new Date("2026-01-13T22:00:00Z");
      const stats = createFakeUserStats({
        currentStreak: 5,
        lastQualifyingReadingDate: date,
      });

      // In UTC, this is 2 days ago, so streak is broken
      expect(validateCurrentStreak(stats, "UTC")).toBe(0);

      // In UTC+5, this is yesterday, so streak is valid
      expect(validateCurrentStreak(stats, "Asia/Karachi")).toBe(5);
    });

    it("should use UTC as default timezone", () => {
      const stats = createFakeUserStats({
        currentStreak: 5,
        lastQualifyingReadingDate: mockDate,
      });

      expect(validateCurrentStreak(stats)).toBe(5);
    });
  });
});
