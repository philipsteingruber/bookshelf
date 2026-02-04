import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeBook,
  createFakeReadingGoal,
  createFakeUser,
  createMockCaller,
} from "@/lib/test-utils";
import { userRouter } from "@/trpc/routers/user";

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
});
