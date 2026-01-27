import { subDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient, ReadingProgress } from "@/generated/prisma/client";
import {
  createFakeBook,
  createFakeReadingProgress,
  createFakeReadingProgressWithBook,
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

    it.todo("should delete reading progress entry successfully");

    it.todo(
      "should recalculate book progress to highest remaining entry after deletion",
    );

    it.todo("should set book progress to 0 when last entry is deleted");

    it.todo("should throw NOT_FOUND when progress entry doesn't exist");

    it.todo("should throw FORBIDDEN when user doesn't own the book");
  });

  describe("updateReadingProgressInstance", () => {
    beforeEach(() => vi.clearAllMocks());

    it.todo("should update progress entry successfully");

    it.todo("should update comments without changing progress");

    it.todo("should update book progress when editing the most recent entry");

    it.todo("should not update book progress when editing an older entry");

    it.todo("should reject progress below previous entry's progress");

    it.todo("should reject progress above next entry's progress");

    it.todo("should throw NOT_FOUND when progress entry doesn't exist");

    it.todo("should throw FORBIDDEN when user doesn't own the book");
  });

  describe("Edge Cases", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should handle very large page counts (>10000 pages)", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const largePageCountBook = createFakeBook({
        progress: 0,
        pageCount: 15000,
      });

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
});
