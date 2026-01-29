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

    it("should delete reading progress entry successfully", async () => {
      const { mockDb, caller } = createMockCaller(readingProgressRouter);

      const fakeBook = createFakeBook();
      const fakeReadingProgress = createFakeReadingProgressWithBook({
        bookId: fakeBook.id,
        book: fakeBook,
      });

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      const mockDelete = vi.fn().mockResolvedValue(fakeReadingProgress);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: mockDelete,
            findFirst: vi.fn().mockResolvedValue(null),
          },
          book: {
            update: vi.fn().mockResolvedValue(fakeBook),
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
          },
          book: {
            update: mockUpdate,
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

      vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
        fakeReadingProgress,
      );

      const mockUpdate = vi.fn().mockResolvedValue({ ...fakeBook, progress: 0 });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            delete: vi.fn().mockResolvedValue(fakeReadingProgress),
            findFirst: vi.fn().mockResolvedValue(null), // No remaining entries
          },
          book: {
            update: mockUpdate,
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
          },
          book: {
            update: mockUpdate,
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
