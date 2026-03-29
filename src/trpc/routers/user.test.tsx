import { subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeBook,
  createFakeReadingGoal,
  createFakeUser,
  createFakeUserStats,
  createMockCaller,
} from "@/lib/test-utils";
import { userRouter } from "@/trpc/routers/user";

const mockDate = new Date("2026-01-15T12:00:00Z");

describe("userRouter", () => {
  beforeEach(() => vi.clearAllMocks());
  describe("setReadingGoal", () => {
    it("should upsert reading goal with correct userId and year", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeGoal = createFakeReadingGoal();
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      await caller.setReadingGoal(1);

      expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_year: {
              userId: mockUser.id,
              year: new Date().getFullYear(),
            },
          },
        }),
      );
    });

    it("should reject non-positive numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoal(-1)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should reject non-integer numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoal(0.5)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should use user local year, not UTC year, when setting reading goal", async () => {
      // 1 AM UTC Jan 1 2026 = Dec 31 2025 in UTC-5 (America/New_York)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));

      const mockUser = createFakeUser({ timezone: "America/New_York" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      const fakeGoal = createFakeReadingGoal({ year: 2025 });
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      await caller.setReadingGoal(12);

      expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_year: {
              userId: mockUser.id,
              year: 2025, // local year in EST, not 2026 (UTC year)
            },
          },
        }),
      );

      vi.useRealTimers();
    });
  });

  describe("getReadingGoal", () => {
    it("should upsert reading goal with correct userId and year", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeGoal = createFakeReadingGoal();
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      await caller.getReadingGoal();

      expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_year: {
              userId: mockUser.id,
              year: new Date().getFullYear(),
            },
          },
        }),
      );
    });

    it("should return defaultReadingThreshold from user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeGoal = createFakeReadingGoal();
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      const result = await caller.getReadingGoal();

      expect(result.defaultReadingThreshold).toEqual(
        mockUser.defaultReadingThreshold,
      );
    });
  });

  describe("getReadingGoalHistory", () => {
    it("should query goals with correct userId and orderBy", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingGoal.findMany).mockResolvedValue([]);

      await caller.getReadingGoalHistory();

      expect(mockDb.readingGoal.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        orderBy: { year: "desc" },
      });
    });
  });

  describe("setReadingGoalThreshold", () => {
    it("should update user's defaultReadingThreshold", async () => {
      const { mockDb, caller } = createMockCaller(userRouter);

      const newThreshold = 10;
      await caller.setReadingGoalThreshold(newThreshold);

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { defaultReadingThreshold: newThreshold },
      });
    });

    it("should reject negative numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoalThreshold(-1)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should reject non-integer numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoalThreshold(0.5)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should accept zero", async () => {
      const { mockDb, caller } = createMockCaller(userRouter);

      const result = await caller.setReadingGoalThreshold(0);

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { defaultReadingThreshold: 0 },
      });
      expect(result.newThreshold).toEqual(0);
    });
  });

  describe("getYearlyBookStats", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return booksFinishedByYear grouped by year", async () => {
      const { mockDb, caller } = createMockCaller(userRouter);

      const books = [
        createFakeBook({
          finishedAt: new Date("2025-06-15"),
          pageCount: 300,
        }),
        createFakeBook({
          finishedAt: new Date("2025-09-01"),
          pageCount: 250,
        }),
        createFakeBook({
          finishedAt: new Date("2024-03-10"),
          pageCount: 400,
        }),
      ];

      vi.mocked(mockDb.book.findMany).mockResolvedValue(books);

      const result = await caller.getYearlyBookStats();

      expect(result.booksFinishedByYear).toEqual([
        { year: 2025, count: 2 },
        { year: 2024, count: 1 },
      ]);
    });

    it("should assign a book to local year when finishedAt crosses UTC year boundary", async () => {
      // Book finished at 2025-01-01T03:00:00Z = Dec 31 2024 in America/New_York
      const mockUser = createFakeUser({ timezone: "America/New_York" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      const books = [
        createFakeBook({
          finishedAt: new Date("2025-01-01T03:00:00Z"),
          pageCount: 300,
        }),
      ];

      vi.mocked(mockDb.book.findMany).mockResolvedValue(books);

      const result = await caller.getYearlyBookStats();

      expect(result.booksFinishedByYear).toEqual([{ year: 2024, count: 1 }]);
    });

    it("should filter out books below page count threshold", async () => {
      const mockUser = createFakeUser({ defaultReadingThreshold: 200 });
      const { mockDb, caller } = createMockCaller(userRouter, {
        mockUser,
      });

      const books = [
        createFakeBook({
          finishedAt: new Date("2025-06-15"),
          pageCount: 300,
        }),
        createFakeBook({
          finishedAt: new Date("2025-09-01"),
          pageCount: 50,
        }),
      ];

      vi.mocked(mockDb.book.findMany).mockResolvedValue(books);

      const result = await caller.getYearlyBookStats();

      expect(result.booksFinishedByYear).toEqual([
        { year: 2025, count: 1 },
      ]);
    });

    it("should return empty array when no finished books exist", async () => {
      const { mockDb, caller } = createMockCaller(userRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);

      const result = await caller.getYearlyBookStats();

      expect(result.booksFinishedByYear).toEqual([]);
    });

    it("should use user's defaultReadingThreshold", async () => {
      const customThreshold = 100;
      const mockUser = createFakeUser({
        defaultReadingThreshold: customThreshold,
      });
      const { mockDb, caller } = createMockCaller(userRouter, {
        mockUser,
      });

      const books = [
        createFakeBook({
          finishedAt: new Date("2025-06-15"),
          pageCount: 150,
        }),
        createFakeBook({
          finishedAt: new Date("2025-09-01"),
          pageCount: 50,
        }),
      ];

      vi.mocked(mockDb.book.findMany).mockResolvedValue(books);

      const result = await caller.getYearlyBookStats();

      // 150 >= 100 threshold, 50 < 100 threshold
      expect(result.booksFinishedByYear).toEqual([
        { year: 2025, count: 1 },
      ]);
    });

    it("should only query finished books for current user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);

      await caller.getYearlyBookStats();

      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, finishedAt: { not: null } },
      });
    });
  });

  describe("getUserStats", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return UserStats for current user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 5,
        longestStreak: 10,
        lastReadingDate: mockDate,
        lastQualifyingReadingDate: mockDate,
        totalPagesRead: 1000,
        totalActiveDays: 30,
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.currentStreak).toBe(5);
      expect(result.longestStreak).toBe(10);
      expect(result.totalPagesRead).toBe(1000);
      expect(result.totalActiveDays).toBe(30);
    });

    it("should create UserStats with defaults if it doesn't exist", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({ userId: mockUser.id });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      await caller.getUserStats();

      expect(mockDb.userStats.upsert).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        create: { userId: mockUser.id },
        update: {},
      });
    });

    it("should return currentStreak as-is when lastQualifyingReadingDate is today", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 7,
        lastQualifyingReadingDate: mockDate,
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.currentStreak).toBe(7);
    });

    it("should return currentStreak as-is when lastQualifyingReadingDate is yesterday", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 7,
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.currentStreak).toBe(7);
    });

    it("should return currentStreak as 0 when lastQualifyingReadingDate is older than yesterday", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 7,
        lastQualifyingReadingDate: subDays(mockDate, 2),
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.currentStreak).toBe(0);
    });

    it("should return isActiveToday true only when lastReadingDate is today", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        lastReadingDate: mockDate,
        lastQualifyingReadingDate: mockDate,
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.isActiveToday).toBe(true);
    });

    it("should return isActiveToday false when lastReadingDate is yesterday", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        lastReadingDate: subDays(mockDate, 1),
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.isActiveToday).toBe(false);
    });

    it("should return correct longestStreak regardless of current streak validity", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 5,
        longestStreak: 20,
        lastQualifyingReadingDate: subDays(mockDate, 5), // Streak is broken
      });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.currentStreak).toBe(0); // Streak is broken
      expect(result.longestStreak).toBe(20); // longestStreak preserved
    });

    it("should return streakThreshold from user", async () => {
      const mockUser = createFakeUser({ minimumPagesForStreak: 25 });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      const fakeStats = createFakeUserStats({ userId: mockUser.id });
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeStats);

      const result = await caller.getUserStats();

      expect(result.streakThreshold).toBe(25);
    });
  });

  describe("setStreakThreshold", () => {
    it("should update user's minimumPagesForStreak", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      await caller.setStreakThreshold(50);

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { minimumPagesForStreak: 50 },
      });
    });

    it("should reject negative values", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setStreakThreshold(-1)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should reject values over 1000", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setStreakThreshold(1001)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should accept 0", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      const result = await caller.setStreakThreshold(0);

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { minimumPagesForStreak: 0 },
      });
      expect(result.success).toBe(true);
    });

    it("should trigger streak recalculation after update", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      await caller.setStreakThreshold(30);

      // recalculateUserStreaks queries readingProgress and updates userStats
      expect(mockDb.readingProgress.findMany).toHaveBeenCalled();
      expect(mockDb.userStats.update).toHaveBeenCalled();
    });

    it("should return success on valid input", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      const result = await caller.setStreakThreshold(100);

      expect(result).toEqual({ success: true });
    });
  });

  describe("setTimezone", () => {
    it("should update user's timezone when it has changed", async () => {
      const mockUser = createFakeUser({ timezone: "UTC" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      await caller.setTimezone("America/New_York");

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { timezone: "America/New_York" },
      });
    });

    it("should not update user's timezone when it hasn't changed", async () => {
      const mockUser = createFakeUser({ timezone: "America/New_York" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      await caller.setTimezone("America/New_York");

      expect(mockDb.user.update).not.toHaveBeenCalled();
    });

    it("should trigger streak recalculation when timezone changes", async () => {
      const mockUser = createFakeUser({ timezone: "UTC" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      await caller.setTimezone("Europe/Paris");

      expect(mockDb.readingProgress.findMany).toHaveBeenCalled();
      expect(mockDb.userStats.update).toHaveBeenCalled();
    });

    it("should reject empty strings", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setTimezone("")).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should return success on valid input", async () => {
      const mockUser = createFakeUser({ timezone: "UTC" });
      const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(
        createFakeUserStats({ userId: mockUser.id }),
      );

      const result = await caller.setTimezone("Asia/Tokyo");

      expect(result).toEqual({ success: true });
    });
  });

  describe("getTimezone", () => {
    it("should return user's timezone", async () => {
      const mockUser = createFakeUser({ timezone: "America/Los_Angeles" });
      const { caller } = createMockCaller(userRouter, { mockUser });

      const result = await caller.getTimezone();

      expect(result.timezone).toBe("America/Los_Angeles");
    });
  });
});
