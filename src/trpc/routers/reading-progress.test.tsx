import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  createFakeBook,
  createFakeReadingProgress,
  createMockCaller,
} from "@/lib/test-utils";

import { readingProgressRouter } from "./reading-progress";

describe("readingProgressRouter", () => {
  describe("createReadingProgressInstance", () => {
    it("should create reading progress when book exists and user owns it", async () => {
      // Create the mock caller (auto-mocks user lookup)
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

      // Mock book lookup
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      // Mock the transaction
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

      // Act
      const result = await caller.createReadingProgressInstance({
        bookId: 1,
        newProgress: 80,
      });

      // Assert
      expect(result.readingProgress.progress).toBe(80);
      expect(result.updatedBook.progress).toBe(80);
      expect(mockDb.book.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("should throw error when book does not exist", async () => {
      const { caller, mockDb, mockLogger } = createMockCaller(readingProgressRouter);

      // Mock book not found
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        caller.createReadingProgressInstance({ bookId: 999, newProgress: 80 }),
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should throw error when user does not own the book", async () => {
      const { caller, mockDb, mockLogger } = createMockCaller(readingProgressRouter);

      const bookOwnedByOther = createFakeBook({
        id: 1,
        userId: "other-user", // Different user!
      });

      // Mock book owned by different user
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(bookOwnedByOther);

      // Act & Assert
      await expect(
        caller.createReadingProgressInstance({
          bookId: 1,
          newProgress: 55,
        }),
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          bookOwnerId: "other-user",
          attemptedBy: "test-user-123",
        }),
        expect.stringContaining("Permission denied"),
      );
    });
  });
});
