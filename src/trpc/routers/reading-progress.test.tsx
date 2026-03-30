import { subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient, ReadingProgress } from "@/generated/prisma/client";
import {
  createFakeBook,
  createFakeReadingProgress,
  createFakeReadingProgressWithBook,
  createFakeUser,
  createFakeUserStats,
  createMockCaller,
} from "@/lib/test-utils";

import { readingProgressRouter } from "./reading-progress";

describe("readingProgressRouter", () => {
  describe("createReadingProgressInstance", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });
    it("should create reading progress when book exists and user owns it", async () => {
      const { caller, mockDb } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({
        id: 1,
        userId: "test-user-123",
        progress: 50,
      });
      const fakeReadingProgress = createFakeReadingProgress({
        bookId: 1,
        progress: 80,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 80 }),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });
      // Mock UserStats operations (called after transaction)
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: 1,
        newProgress: 80,
      });

      expect(result.readingProgress.progress).toBe(80);
      expect(result.updatedBook.progress).toBe(80);
      expect(mockDb.book.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("should throw error when book does not exist", async () => {
      const { caller, mockDb, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(
        caller.createReadingProgressInstance({ bookId: 999, newProgress: 80 }),
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should throw error when user does not own the book", async () => {
      const { caller, mockDb, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const bookOwnedByOther = createFakeBook({
        id: 1,
        userId: "other-user", // Different user!
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(bookOwnedByOther);

      await expect(
        caller.createReadingProgressInstance({
          bookId: 1,
          newProgress: 55,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should calculate progress from newPagesRead when provided", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 100 });
      const fakeUserStats = createFakeUserStats();

      const pagesRead = 50;
      const calculatedProgress = Math.floor(
        (pagesRead / fakeBook.pageCount) * 100,
      );

      const fakeReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: calculatedProgress,
      });
      const updatedBook = createFakeBook({
        ...fakeBook,
        progress: calculatedProgress,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newPagesRead: pagesRead,
      });

      expect(result.readingProgress.progress).toBe(50);
      expect(result.updatedBook.progress).toBe(50);
    });

    it("should use newProgress directly when provided", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 0 });
      const fakeUserStats = createFakeUserStats();

      const fakeReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: 50,
      });
      const updatedBook = createFakeBook({
        ...fakeBook,
        progress: 50,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(result.readingProgress.progress).toBe(50);
      expect(result.updatedBook.progress).toBe(50);
    });

    it("should prefer newProgress over newPagesRead when both provided", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 100 });
      const fakeUserStats = createFakeUserStats();

      const newProgress = 50;
      const newPagesRead = 75;
      const calculatedProgress = Math.floor(
        (newPagesRead / fakeBook.pageCount) * 100,
      ); // 75

      const updatedBook = createFakeBook({
        ...fakeBook,
        progress: newProgress,
      });
      const fakeReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: newProgress,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.$transaction).mockImplementation((callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as PrismaClient;

        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress,
        newPagesRead,
      });

      expect(result.readingProgress.progress).toBe(newProgress);
      expect(result.readingProgress.progress).not.toBe(calculatedProgress);
      expect(result.updatedBook.progress).toBe(newProgress);
      expect(result.updatedBook.progress).not.toBe(calculatedProgress);
    });

    it("should throw error when neither newProgress nor newPagesRead provided", async () => {
      const { caller, mockLogger } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook();

      await expect(
        caller.createReadingProgressInstance({ bookId: fakeBook.id }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should throw error when new progress <= current book progress", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const currentProgress = 50;
      const fakeBook = createFakeBook({ progress: currentProgress });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.createReadingProgressInstance({
          bookId: fakeBook.id,
          newProgress: currentProgress,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockLogger.warn).toHaveBeenCalled();

      vi.clearAllMocks();
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.createReadingProgressInstance({
          bookId: fakeBook.id,
          newProgress: currentProgress - 1,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should update book status to READ and set finishedAt when progress reaches 100", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({
        status: "READING",
        progress: 50,
        finishedAt: null,
      });
      const updatedBook = createFakeBook({
        status: "READ",
        progress: 100,
        finishedAt: new Date(),
      });
      const fakeReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: 100,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      let fakeTxClient;
      vi.mocked(mockDb.$transaction).mockImplementation((callback) => {
        fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as PrismaClient;

        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 100,
      });

      expect(result.updatedBook.progress).toBe(100);
      expect(result.updatedBook.status).toBe("READ");
      expect(result.updatedBook.finishedAt).toBeInstanceOf(Date);
      expect(fakeTxClient!.book.update).toHaveBeenCalledWith({
        data: { progress: 100, status: "READ", finishedAt: expect.any(Date) },
        where: { id: fakeBook.id },
      });
    });

    it("should use user timezone when querying today's progress for streak calculation", async () => {
      // 3 AM UTC on Jan 15 = 10 PM EST on Jan 14. The user's "today" in EST is Jan 14.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T03:00:00Z"));

      const mockUser = createFakeUser({ timezone: "America/New_York" });
      const { mockDb, caller } = createMockCaller(readingProgressRouter, { mockUser });

      const fakeBook = createFakeBook({ userId: mockUser.id });
      const fakeReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: 50,
      });
      const fakeReadingProgressWithBook = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
        book: fakeBook,
        progress: 50,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([fakeReadingProgressWithBook]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      // At 3 AM UTC (= 10 PM EST Jan 14), user's "today" in EST is Jan 14.
      // Start of Jan 14 EST = midnight EST Jan 14 = 2026-01-14T05:00:00.000Z
      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: new Date("2026-01-14T05:00:00.000Z") },
          }),
        }),
      );

      vi.useRealTimers();
    });
  });
  describe("getProgressHistory", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return all progress entries for a book owned by user in chronological order", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook();
      const fakeReadingProgress = createFakeReadingProgress();
      const expectedResult = [fakeReadingProgress];

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue(
        expectedResult,
      );

      const result = await caller.getProgressHistory(fakeBook.id);

      expect(result.readingProgressHistory).toEqual(expectedResult);
      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith({
        where: { bookId: fakeBook.id, userId: mockUser.id },
        orderBy: { createdAt: "asc" },
      });
    });

    it("should throw an error when book not found", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(caller.getProgressHistory(1)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("should throw error when user doesn't own book", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ userId: "other-user" });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.getProgressHistory(fakeBook.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should return empty array when no progress recorded yet", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook();

      const expectedResult: ReadingProgress[] = [];

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue(
        expectedResult,
      );

      const result = await caller.getProgressHistory(fakeBook.id);

      expect(result.readingProgressHistory).toEqual(expectedResult);
    });
  });
  describe("getAllReadingProgress", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return all reading progress entries for authenticated user", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeReadingProgress = createFakeReadingProgress();
      const fakeReadingProgress2 = createFakeReadingProgress();

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
        fakeReadingProgress2,
      ]);

      const result = await caller.getAllReadingProgress();

      expect(result.allProgress).toEqual([
        fakeReadingProgress,
        fakeReadingProgress2,
      ]);
    });
    it("should include book data (page count) with each progress entry", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeReadingProgressWithBook = createFakeReadingProgressWithBook();

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgressWithBook,
      ]);

      const result = await caller.getAllReadingProgress();

      expect(result.allProgress[0].book).toMatchObject({
        pageCount: expect.any(Number),
        id: expect.any(Number),
        title: expect.any(String),
      });
    });
    it("should return entries in chronological order (oldest to newest)", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const olderFakeReadingProgress = createFakeReadingProgress({
        createdAt: subDays(new Date(), 1),
      });
      const newerFakeReadingProgress = createFakeReadingProgress({
        createdAt: new Date(),
      });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        olderFakeReadingProgress,
        newerFakeReadingProgress,
      ]);

      const result = await caller.getAllReadingProgress();

      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        include: expect.any(Object),
        orderBy: { createdAt: "asc" },
      });
      expect(result.allProgress).toEqual([
        olderFakeReadingProgress,
        newerFakeReadingProgress,
      ]);
    });
    it("should return empty array for users with no reading history", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      const result = await caller.getAllReadingProgress();

      expect(result.allProgress).toEqual([]);
    });
    it("should only return progress entries owned by requesting user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const ownedReadingProgress = createFakeReadingProgress({
        userId: mockUser.id,
      });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        ownedReadingProgress,
      ]);

      const result = await caller.getAllReadingProgress();

      expect(result.allProgress).toEqual([ownedReadingProgress]);
      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUser.id } }),
      );
    });
    it("should include progress from all books (not just one book)", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ id: 1 });
      const otherBook = createFakeBook({ id: 2 });

      const readingProgress = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
      });
      const otherReadingProgress = createFakeReadingProgressWithBook({
        bookId: otherBook.id,
      });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        readingProgress,
        otherReadingProgress,
      ]);

      const result = await caller.getAllReadingProgress();

      expect(result.allProgress).toHaveLength(2);
      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        include: expect.any(Object),
        orderBy: expect.any(Object),
      });
    });
  });
  describe("deleteReadingProgressInstance", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should delete reading progress entry successfully", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook();
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      const mockDelete = vi.fn().mockResolvedValue(fakeReadingProgress);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: mockDelete,
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
          },
          book: {
            update: vi.fn().mockResolvedValue(fakeBook),
          },
          userStats: {
            update: vi.fn().mockResolvedValue(fakeUserStats),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance(fakeReadingProgress.id);

      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: fakeReadingProgress.id },
      });
    });

    it("should recalculate book progress to highest remaining entry after deletion", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50 });
      const firstReadingProgress = createFakeReadingProgressWithBook({
        progress: 25,
        createdAt: subDays(new Date(), 1),
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const secondReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        createdAt: new Date(),
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        secondReadingProgress,
      );

      const mockUpdate = vi
        .fn()
        .mockResolvedValue({ ...fakeBook, progress: 25 });
      vi.mocked(mockDb.$transaction).mockImplementation((callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(secondReadingProgress),
            findFirst: vi.fn().mockResolvedValue(firstReadingProgress),
            count: vi.fn().mockResolvedValue(1),
            findMany: vi.fn().mockResolvedValue([firstReadingProgress]),
          },
          book: {
            update: mockUpdate,
          },
          userStats: {
            update: vi.fn().mockResolvedValue(fakeUserStats),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance(secondReadingProgress.id);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: fakeBook.id },
        data: { progress: 25 },
      });
    });

    it("should set book progress to 0 when last entry is deleted", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50, status: "READ" });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      const mockUpdate = vi
        .fn()
        .mockResolvedValue({ ...fakeBook, progress: 0 });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(fakeReadingProgress),
            findFirst: vi.fn().mockResolvedValue(null), // No remaining entries
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
          },
          book: {
            update: mockUpdate,
          },
          userStats: {
            update: vi.fn().mockResolvedValue(fakeUserStats),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance(fakeReadingProgress.id);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: fakeBook.id },
        data: { progress: 0 },
      });
    });

    it("should set status to TO_READ when last entry is deleted (if book status is not DNF or READ)", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50, status: "READING" });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      const mockUpdate = vi
        .fn()
        .mockResolvedValue({ ...fakeBook, progress: 0, status: "TO_READ" });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(fakeReadingProgress),
            findFirst: vi.fn().mockResolvedValue(null), // No remaining entries
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
          },
          book: {
            update: mockUpdate,
          },
          userStats: {
            update: vi.fn().mockResolvedValue(fakeUserStats),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance(fakeReadingProgress.id);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: fakeBook.id },
        data: { progress: 0, status: "TO_READ" },
      });
    });

    it("should throw NOT_FOUND when progress entry doesn't exist", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(null);

      await expect(
        caller.deleteReadingProgressInstance("nonexistent-id"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should throw FORBIDDEN when user doesn't own the book", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ userId: "other-user" });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      await expect(
        caller.deleteReadingProgressInstance(fakeReadingProgress.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should use user timezone when counting same-day entries during deletion", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

      const mockUser = createFakeUser({ timezone: "America/New_York" });
      const { mockDb, caller } = createMockCaller(readingProgressRouter, { mockUser });

      const fakeBook = createFakeBook({ userId: mockUser.id });
      // createdAt = 4 AM UTC Jan 15 = 11 PM EST Jan 14
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        createdAt: new Date("2026-01-15T04:00:00Z"),
        bookId: fakeBook.id,
        book: fakeBook,
        progress: 50,
      });
      const fakeUserStats = createFakeUserStats();

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(fakeReadingProgress);

      const mockCount = vi.fn().mockResolvedValue(1);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(fakeReadingProgress),
            findFirst: vi.fn().mockResolvedValue(null),
            count: mockCount,
            findMany: vi.fn().mockResolvedValue([]),
          },
          book: { update: vi.fn().mockResolvedValue(fakeBook) },
          userStats: { update: vi.fn().mockResolvedValue(fakeUserStats) },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance(fakeReadingProgress.id);

      // Entry is on Jan 14 in EST. Day boundaries in EST:
      // dayStart = Jan 14 midnight EST = 2026-01-14T05:00:00.000Z
      // dayEnd   = Jan 15 midnight EST = 2026-01-15T05:00:00.000Z
      expect(mockCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date("2026-01-14T05:00:00.000Z"),
              lt: new Date("2026-01-15T05:00:00.000Z"),
            },
          }),
        }),
      );

      vi.useRealTimers();
    });
  });

  describe("updateReadingProgressInstance", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should update progress entry successfully", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const updatedReadingProgress = { ...fakeReadingProgress, progress: 75 };

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );
      vi.mocked(mockDb.readingProgress.findFirst).mockResolvedValue(null); // No previous or next

      const mockUpdate = vi.fn().mockResolvedValue(updatedReadingProgress);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            update: mockUpdate,
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 75 }),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.updateReadingProgressInstance({
        progressId: fakeReadingProgress.id,
        newProgress: 75,
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: fakeReadingProgress.id },
        data: { progress: 75, comments: undefined },
      });
    });

    it("should update comments without changing progress", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const updatedReadingProgress = {
        ...fakeReadingProgress,
        comments: "Updated comment",
      };

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );
      vi.mocked(mockDb.readingProgress.findFirst).mockResolvedValue(null);

      const mockUpdate = vi.fn().mockResolvedValue(updatedReadingProgress);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            update: mockUpdate,
          },
          book: {
            update: vi.fn().mockResolvedValue(fakeBook),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.updateReadingProgressInstance({
        progressId: fakeReadingProgress.id,
        newProgress: 50,
        comments: "Updated comment",
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: fakeReadingProgress.id },
        data: { progress: 50, comments: "Updated comment" },
      });
    });

    it("should update book progress when editing the most recent entry", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 50 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );
      // No next entry means this is the most recent
      vi.mocked(mockDb.readingProgress.findFirst).mockResolvedValue(null);

      const mockBookUpdate = vi
        .fn()
        .mockResolvedValue({ ...fakeBook, progress: 75 });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            update: vi
              .fn()
              .mockResolvedValue({ ...fakeReadingProgress, progress: 75 }),
          },
          book: {
            update: mockBookUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.updateReadingProgressInstance({
        progressId: fakeReadingProgress.id,
        newProgress: 75,
      });

      expect(mockBookUpdate).toHaveBeenCalledWith({
        where: { id: fakeBook.id },
        data: { progress: 75 },
      });
    });

    it("should not update book progress when editing an older entry", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 75 });
      const olderReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        createdAt: subDays(new Date(), 1),
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const newerReadingProgress = createFakeReadingProgress({
        progress: 75,
        createdAt: new Date(),
        bookId: fakeBook.id,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        olderReadingProgress,
      );
      vi.mocked(mockDb.readingProgress.findFirst)
        .mockResolvedValueOnce(null) // No previous entry
        .mockResolvedValueOnce(newerReadingProgress); // Has next entry

      const mockBookUpdate = vi.fn();
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            update: vi
              .fn()
              .mockResolvedValue({ ...olderReadingProgress, progress: 60 }),
          },
          book: {
            update: mockBookUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.updateReadingProgressInstance({
        progressId: olderReadingProgress.id,
        newProgress: 60,
      });

      expect(mockBookUpdate).not.toHaveBeenCalled();
    });

    it("should reject progress below previous entry's progress", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ progress: 75 });
      const previousReadingProgress = createFakeReadingProgress({
        progress: 50,
        createdAt: subDays(new Date(), 1),
        bookId: fakeBook.id,
      });
      const currentReadingProgress = createFakeReadingProgressWithBook({
        progress: 75,
        createdAt: new Date(),
        bookId: fakeBook.id,
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        currentReadingProgress,
      );
      vi.mocked(mockDb.readingProgress.findFirst)
        .mockResolvedValueOnce(previousReadingProgress) // Previous entry
        .mockResolvedValueOnce(null); // No next entry

      await expect(
        caller.updateReadingProgressInstance({
          progressId: currentReadingProgress.id,
          newProgress: 40, // Below previous entry's 50
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should reject progress above next entry's progress", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ progress: 75 });
      const currentReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        createdAt: subDays(new Date(), 1),
        bookId: fakeBook.id,
        book: fakeBook,
      });
      const nextReadingProgress = createFakeReadingProgress({
        progress: 75,
        createdAt: new Date(),
        bookId: fakeBook.id,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        currentReadingProgress,
      );
      vi.mocked(mockDb.readingProgress.findFirst)
        .mockResolvedValueOnce(null) // No previous entry
        .mockResolvedValueOnce(nextReadingProgress); // Has next entry

      await expect(
        caller.updateReadingProgressInstance({
          progressId: currentReadingProgress.id,
          newProgress: 80, // Above next entry's 75
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should throw NOT_FOUND when progress entry doesn't exist", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(null);

      await expect(
        caller.updateReadingProgressInstance({
          progressId: "nonexistent-id",
          newProgress: 50,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should throw FORBIDDEN when user doesn't own the book", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ userId: "other-user" });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      await expect(
        caller.updateReadingProgressInstance({
          progressId: fakeReadingProgress.id,
          newProgress: 50,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should handle very large page counts (>10000 pages)", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const largePageCountBook = createFakeBook({
        progress: 0,
        pageCount: 15000,
      });
      const fakeUserStats = createFakeUserStats();

      const pagesRead = 1500; // 10% of a 15,000 page book
      const expectedProgress = Math.floor(
        (pagesRead / largePageCountBook.pageCount) * 100,
      ); // 10

      const fakeReadingProgress = createFakeReadingProgress({
        bookId: largePageCountBook.id,
        progress: expectedProgress,
      });
      const updatedBook = createFakeBook({
        ...largePageCountBook,
        progress: expectedProgress,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(largePageCountBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

      const result = await caller.createReadingProgressInstance({
        bookId: largePageCountBook.id,
        newPagesRead: pagesRead,
      });

      expect(result.readingProgress.progress).toBe(expectedProgress);
      expect(result.updatedBook.progress).toBe(expectedProgress);
    });

    it("should handle progress updates happening rapidly in succession", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 100 });
      const fakeUserStats = createFakeUserStats();

      // Each rapid update should succeed because we're mocking the database
      // and updating the mock state between calls
      const progressValues = [25, 50, 75];

      for (const progress of progressValues) {
        const currentBook = createFakeBook({
          ...fakeBook,
          progress: progress - 25, // Previous progress
        });
        const fakeReadingProgress = createFakeReadingProgress({
          bookId: fakeBook.id,
          progress,
        });
        const updatedBook = createFakeBook({ ...fakeBook, progress });

        vi.mocked(mockDb.book.findUnique).mockResolvedValue(currentBook);
        vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
          const fakeTxClient = {
            readingProgress: {
              create: vi.fn().mockResolvedValue(fakeReadingProgress),
            },
            book: {
              update: vi.fn().mockResolvedValue(updatedBook),
            },
          } as unknown as PrismaClient;
          return callback(fakeTxClient);
        });
        vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
        vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
        vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

        const result = await caller.createReadingProgressInstance({
          bookId: fakeBook.id,
          newProgress: progress,
        });

        expect(result.readingProgress.progress).toBe(progress);
        expect(result.updatedBook.progress).toBe(progress);
      }

      // Verify all three updates were processed
      expect(mockDb.$transaction).toHaveBeenCalledTimes(3);
    });

    it("should throw error when newPagesRead exceeds book pageCount (resulting in >100% progress)", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ progress: 0, pageCount: 100 });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      // Trying to record 150 pages read on a 100-page book (150% progress)
      await expect(
        caller.createReadingProgressInstance({
          bookId: fakeBook.id,
          newPagesRead: 150,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("createReadingProgressInstance - UserStats updates", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should set currentStreak to 1 and lastReadingDate to today on first ever reading progress", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 0,
        lastReadingDate: null,
        lastQualifyingReadingDate: null,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      // findMany is called AFTER create, so it includes the new entry
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        currentStreak: 1,
        lastReadingDate: mockDate,
        lastQualifyingReadingDate: mockDate,
        totalActiveDays: 1,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: {
          currentStreak: 1,
          longestStreak: 1,
          lastReadingDate: expect.any(Date),
          lastQualifyingReadingDate: expect.any(Date),
          totalActiveDays: 1,
        },
      });
    });

    it("should increment currentStreak and update lastReadingDate when lastReadingDate is yesterday", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 5,
        lastReadingDate: subDays(mockDate, 1),
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        currentStreak: 6,
        lastReadingDate: mockDate,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: {
          currentStreak: 6,
          longestStreak: expect.any(Number),
          lastReadingDate: expect.any(Date),
          lastQualifyingReadingDate: expect.any(Date),
          totalActiveDays: 1,
        },
      });
    });

    it("should not change currentStreak when lastReadingDate is already today", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const existingProgress = createFakeReadingProgressWithBook({
        progress: 25,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 7,
        lastReadingDate: mockDate,
        lastQualifyingReadingDate: mockDate,
        totalActiveDays: 10,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        existingProgress,
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn();

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      // Should not call update for streak (already today)
      expect(mockStatsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStreak: expect.any(Number),
            lastReadingDate: expect.any(Date),
          }),
        }),
      );
      // But should still update totalPagesRead
      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalPagesRead: { increment: expect.any(Number) } },
      });
    });

    it("should reset currentStreak to 1 when lastReadingDate is older than yesterday", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 10,
        lastReadingDate: subDays(mockDate, 5),
        lastQualifyingReadingDate: subDays(mockDate, 5),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        currentStreak: 1,
        lastReadingDate: mockDate,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: {
          currentStreak: 1,
          longestStreak: expect.any(Number),
          lastReadingDate: expect.any(Date),
          lastQualifyingReadingDate: expect.any(Date),
          totalActiveDays: 1,
        },
      });
    });

    it("should update longestStreak when currentStreak exceeds it", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgress({
        progress: 50,
        bookId: fakeBook.id,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 9,
        longestStreak: 9,
        lastReadingDate: subDays(mockDate, 1),
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        currentStreak: 10,
        longestStreak: 10,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: expect.objectContaining({
          longestStreak: 10,
        }),
      });
    });

    it("should not decrease longestStreak when streak resets", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgress({
        progress: 50,
        bookId: fakeBook.id,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 5,
        longestStreak: 20,
        lastReadingDate: subDays(mockDate, 5),
        lastQualifyingReadingDate: subDays(mockDate, 5),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        currentStreak: 1,
        longestStreak: 20,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: expect.objectContaining({
          longestStreak: 20,
        }),
      });
    });

    it("should create UserStats record if it doesn't exist", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgress({
        progress: 50,
        bookId: fakeBook.id,
      });
      const newUserStats = createFakeUserStats({
        userId: mockUser.id,
        currentStreak: 0,
        lastReadingDate: null,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      const mockStatsUpsert = vi.fn().mockResolvedValue(newUserStats);

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockImplementation(mockStatsUpsert);
      vi.mocked(mockDb.userStats.update).mockResolvedValue(newUserStats);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpsert).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        create: { userId: mockUser.id },
        update: {},
      });
    });

    it("should increment totalPagesRead by pages from new progress entry", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 25, pageCount: 200 });
      const existingProgress = createFakeReadingProgressWithBook({
        progress: 25,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        totalPagesRead: 100,
        lastReadingDate: mockDate,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        existingProgress,
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        totalPagesRead: 150,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      // Progress delta is 50% - 25% = 25% of 200 pages = 50 pages
      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalPagesRead: { increment: 50 } },
      });
    });

    it("should increment totalActiveDays when first entry of a new day", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 0, pageCount: 200 });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 5,
        totalActiveDays: 10,
        lastReadingDate: subDays(mockDate, 1),
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn().mockResolvedValue({
        ...fakeUserStats,
        totalActiveDays: 11,
      });

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: expect.objectContaining({
          totalActiveDays: 11,
        }),
      });
    });

    it("should not increment totalActiveDays when another entry exists for same day", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({ progress: 25, pageCount: 200 });
      const existingProgress = createFakeReadingProgressWithBook({
        progress: 25,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 7,
        totalActiveDays: 15,
        lastReadingDate: mockDate,
        lastQualifyingReadingDate: mockDate,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        existingProgress,
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn();

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 50,
      });

      // Should not include totalActiveDays in streak update (already reading today)
      expect(mockStatsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalActiveDays: expect.any(Number),
            currentStreak: expect.any(Number),
          }),
        }),
      );
      // But should still update totalPagesRead
      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalPagesRead: { increment: expect.any(Number) } },
      });
    });

    it("should not update streak when pages read today is below threshold", async () => {
      const mockDate = new Date("2026-01-15T12:00:00Z");
      vi.setSystemTime(mockDate);

      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
        {
          mockUser: createFakeUser({
            minimumPagesForStreak: 50,
          }),
        },
      );

      const fakeBook = createFakeBook({
        progress: 0,
        pageCount: 200,
        userId: mockUser.id,
      });
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        progress: 10, // Only 20 pages (10% of 200), below 50 threshold
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: mockDate,
      });
      const fakeUserStats = createFakeUserStats({
        currentStreak: 5,
        lastReadingDate: subDays(mockDate, 1),
        lastQualifyingReadingDate: subDays(mockDate, 1),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        fakeReadingProgress,
      ]);

      const mockStatsUpdate = vi.fn();

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 10 }),
          },
          readingProgress: {
            create: vi.fn().mockResolvedValue(fakeReadingProgress),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
      vi.mocked(mockDb.userStats.update).mockImplementation(mockStatsUpdate);

      await caller.createReadingProgressInstance({
        bookId: fakeBook.id,
        newProgress: 10,
      });

      // Should not update streak info when below threshold
      expect(mockStatsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStreak: expect.any(Number),
          }),
        }),
      );
      // But should still update totalPagesRead
      expect(mockStatsUpdate).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        data: { totalPagesRead: { increment: 20 } },
      });
    });
  });

  describe("deleteReadingProgressInstance - UserStats updates", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should not recalculate streak when deleting non-sole entry for a day", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 75, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });
      const otherEntry = createFakeReadingProgress({
        progress: 75,
        bookId: fakeBook.id,
        createdAt: new Date(entryDate.getTime() + 3600000), // 1 hour later
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn();

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(otherEntry),
            count: vi.fn().mockResolvedValue(1), // Still has 1 entry that day
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 75 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Should not decrement totalActiveDays or recalculate streak
      expect(mockUserStatsUpdate).not.toHaveBeenCalled();
    });

    it("should recalculate streak when deleting sole entry for a day", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 50, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(
        createFakeUserStats({
          totalActiveDays: 9,
        }),
      );
      const mockReadingProgressFindMany = vi.fn().mockResolvedValue([]);

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0), // No entries left that day
            findMany: mockReadingProgressFindMany,
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 0 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Should decrement totalActiveDays
      expect(mockUserStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalActiveDays: { decrement: 1 } },
      });
      // Should trigger streak recalculation (findMany called)
      expect(mockReadingProgressFindMany).toHaveBeenCalled();
    });

    it("should correctly recalculate currentStreak after deletion breaks streak chain", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 50, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });

      const olderProgressWithBook = createFakeReadingProgressWithBook({
        progress: 30,
        bookId: fakeBook.id,
        userId: mockUser.id,
        book: fakeBook,
        createdAt: subDays(entryDate, 1),
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(
        createFakeUserStats({
          currentStreak: 0,
          lastReadingDate: subDays(entryDate, 1),
        }),
      );

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([olderProgressWithBook]),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 0 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Should have at least 2 calls (totalPagesRead, totalActiveDays, streak recalc)
      expect(mockUserStatsUpdate).toHaveBeenCalled();
      // One call should be to decrement totalActiveDays
      expect(mockUserStatsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalActiveDays: { decrement: 1 },
          }),
        }),
      );
    });

    it("should preserve longestStreak after deletion when reading history supports it", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const entryDate = new Date("2026-01-15T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 75, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 75,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });

      // Create a history of progress entries that would result in longestStreak
      const historicalProgress = Array.from({ length: 15 }, (_, i) =>
        createFakeReadingProgressWithBook({
          progress: 50,
          bookId: fakeBook.id,
          userId: mockUser.id,
          book: fakeBook,
          createdAt: subDays(entryDate, 20 + i),
        }),
      );

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const existingStats = createFakeUserStats({
        currentStreak: 1,
        longestStreak: 15,
      });

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(existingStats);

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue(historicalProgress),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
            findUnique: vi.fn().mockResolvedValue(existingStats),
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Verify that some update happened (streak recalculation)
      expect(mockUserStatsUpdate).toHaveBeenCalled();
    });

    it("should update lastReadingDate to most recent remaining entry date", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const todayDate = new Date("2026-01-15T10:00:00Z");
      const yesterdayDate = subDays(todayDate, 1);
      const fakeBook = createFakeBook({ progress: 75, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 75,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: todayDate,
      });
      const olderProgressWithBook = createFakeReadingProgressWithBook({
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: yesterdayDate,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(
        createFakeUserStats({
          lastReadingDate: yesterdayDate,
        }),
      );

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(olderProgressWithBook),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([olderProgressWithBook]),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Should have multiple update calls (totalPagesRead, totalActiveDays, streak recalc)
      expect(mockUserStatsUpdate).toHaveBeenCalled();
      // Verify totalActiveDays was decremented
      expect(mockUserStatsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalActiveDays: { decrement: 1 },
          }),
        }),
      );
    });

    it("should decrement totalPagesRead by pages from deleted entry", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 75, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 75, // This is the max progress
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });
      const remainingProgress = createFakeReadingProgress({
        progress: 50,
        bookId: fakeBook.id,
        createdAt: entryDate,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(
        createFakeUserStats({
          totalPagesRead: 100,
        }),
      );

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(remainingProgress),
            count: vi.fn().mockResolvedValue(1),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      // Should decrement by (75% - 50%) = 25% of 200 = 50 pages
      expect(mockUserStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalPagesRead: { decrement: 50 } },
      });
    });

    it("should decrement totalActiveDays when deleting sole entry for a day", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 50, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn().mockResolvedValue(
        createFakeUserStats({
          totalActiveDays: 9,
        }),
      );

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 0 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      expect(mockUserStatsUpdate).toHaveBeenCalledWith({
        where: { userId: expect.any(String) },
        data: { totalActiveDays: { decrement: 1 } },
      });
    });

    it("should not decrement totalActiveDays when other entries exist for same day", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const entryDate = new Date("2026-01-10T10:00:00Z");
      const fakeBook = createFakeBook({ progress: 75, pageCount: 200 });
      const progressToDelete = createFakeReadingProgressWithBook({
        id: "delete-me",
        progress: 50,
        bookId: fakeBook.id,
        book: fakeBook,
        createdAt: entryDate,
      });
      const otherEntry = createFakeReadingProgress({
        progress: 75,
        bookId: fakeBook.id,
        createdAt: new Date(entryDate.getTime() + 3600000),
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        progressToDelete,
      );

      const mockUserStatsUpdate = vi.fn();

      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(progressToDelete),
            findFirst: vi.fn().mockResolvedValue(otherEntry),
            count: vi.fn().mockResolvedValue(1),
          },
          book: {
            update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 75 }),
          },
          userStats: {
            update: mockUserStatsUpdate,
          },
        } as unknown as PrismaClient;
        return callback(fakeTxClient);
      });

      await caller.deleteReadingProgressInstance("delete-me");

      expect(mockUserStatsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalActiveDays: expect.any(Number),
          }),
        }),
      );
    });
  });

  describe("getRecentReadingProgress", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return only progress entries from last N days (default 14)", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      const fakeBook = createFakeBook();
      const recentProgress = [
        createFakeReadingProgressWithBook({
          book: fakeBook,
          createdAt: subDays(new Date(), 5),
        }),
        createFakeReadingProgressWithBook({
          book: fakeBook,
          createdAt: subDays(new Date(), 10),
        }),
      ];

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue(
        recentProgress,
      );

      await caller.getRecentReadingProgress({});

      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          createdAt: { gte: expect.any(Date) },
        },
        include: {
          book: { select: { id: true, title: true, pageCount: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    });

    it("should accept custom sinceDays parameter", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      await caller.getRecentReadingProgress({ sinceDays: 7 });

      const call = vi.mocked(mockDb.readingProgress.findMany).mock.calls[0][0];
      expect(call?.where?.userId).toBe(mockUser.id);
      expect(call?.where?.createdAt).toBeDefined();
    });

    it("should return empty array when no recent progress exists", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      const result = await caller.getRecentReadingProgress({});

      expect(result).toEqual([]);
    });

    it("should include book data with each entry", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook({
        id: 1,
        title: "Test Book",
        pageCount: 300,
      });
      const progressWithBook = createFakeReadingProgressWithBook({
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
        progressWithBook,
      ]);

      const result = await caller.getRecentReadingProgress({});

      expect(result[0].book).toBeDefined();
      expect(result[0].book.title).toBe("Test Book");
      expect(result[0].book.pageCount).toBe(300);
    });

    it("should order results by createdAt ascending", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      await caller.getRecentReadingProgress({});

      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "asc" },
        }),
      );
    });

    it("should only return entries for current user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(
        readingProgressRouter,
      );

      vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);

      await caller.getRecentReadingProgress({});

      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
          }),
        }),
      );
    });
  });
});
