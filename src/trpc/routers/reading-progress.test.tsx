import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient, ReadingProgress } from "@/generated/prisma/client";
import {
  createFakeBook,
  createFakeReadingProgress,
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
});
