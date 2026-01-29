import { subDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadStatus } from "@/generated/prisma/enums";
import { VALIDATION_LIMITS } from "@/lib/constants";
import {
  createFakeBook,
  createFakeReadingProgress,
  createFakeUser,
  createMockCaller,
} from "@/lib/test-utils";

import { bookRouter } from "./book";

const { mockDeleteFiles } = vi.hoisted(() => ({ mockDeleteFiles: vi.fn() }));
vi.mock("uploadthing/server", () => {
  return {
    UTApi: class {
      deleteFiles = mockDeleteFiles;
    },
  };
});

describe("bookRouter", () => {
  describe("createBook", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should create book successfully with valid data", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const fakeBookData = {
        title: "Test Book",
        author: "Test Author",
        publishedYear: 2026,
      };

      const createdBook = createFakeBook(fakeBookData);

      vi.mocked(mockDb.book.create).mockResolvedValue(createdBook);
      vi.mocked(mockDb.book.findFirst).mockResolvedValue(null);

      const result = await caller.createBook(fakeBookData);

      expect(result.book).toEqual(createdBook);
    });

    it("should detect duplicate series book (same series+index+user)", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const prevBookData = {
        series: "Test Series",
        seriesIndex: 1,
      };
      const prevBook = createFakeBook(prevBookData);

      const newBookData = {
        title: "New Book 2",
        author: "Test Author",
        publishedYear: 2026,
        series: prevBookData.series,
        seriesIndex: prevBookData.seriesIndex,
      };

      vi.mocked(mockDb.book.findFirst).mockResolvedValue(prevBook);

      await expect(caller.createBook(newBookData)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("should detect duplicate ISBN (same ISBN + user)", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const prevBookData = {
        isbn: "9781789993448",
      };
      const prevBook = createFakeBook(prevBookData);

      const newBookData = {
        title: "New Book 2",
        author: "Test Author",
        publishedYear: 2026,
        isbn: "9781789993448",
      };

      vi.mocked(mockDb.book.findFirst).mockResolvedValue(prevBook);

      await expect(caller.createBook(newBookData)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });
  describe("updateReadingStatus", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should update status to READ (and set finishedAt and progress to 100)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBook = createFakeBook({
        status: "READING" as ReadStatus,
        finishedAt: null,
        progress: 50,
      });
      const updatedBook = createFakeBook({
        status: "READ" as ReadStatus,
        finishedAt: new Date(),
        progress: 100,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: "READ",
      });

      expect(result.updatedBook.status).toEqual("READ");
      expect(result.updatedBook.finishedAt).toBeInstanceOf(Date);
      expect(result.updatedBook.progress).toEqual(100);
    });

    it("should update status to READING (and set startedAt)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBook = createFakeBook({
        status: "TO_READ" as ReadStatus,
        startedAt: null,
      });
      const updatedBook = createFakeBook({
        status: "READING" as ReadStatus,
        startedAt: new Date(),
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: "READING",
      });

      expect(result.updatedBook.status).toEqual("READING");
      expect(result.updatedBook.startedAt).toBeInstanceOf(Date);
    });

    it("should create initial 0% ReadingProgress entry when status changes to READING", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ status: "TO_READ" });
      const updatedBook = createFakeBook({ status: "READING", id: fakeBook.id });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      const mockCreate = vi.fn();
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: mockCreate,
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      await caller.updateReadingStatus({
        bookId: fakeBook.id,
        newStatus: "READING",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: { bookId: fakeBook.id, userId: expect.any(String), progress: 0 },
      });
    });

    it("should not create duplicate 0% ReadingProgress entry if one already exists", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ status: "TO_READ" });
      const updatedBook = createFakeBook({ status: "READING", id: fakeBook.id });
      const zeroReadingProgress = createFakeReadingProgress({
        bookId: fakeBook.id,
        progress: 0,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      const mockCreate = vi.fn();
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            findFirst: vi.fn().mockResolvedValue(zeroReadingProgress),
            create: mockCreate,
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      await caller.updateReadingStatus({
        bookId: fakeBook.id,
        newStatus: "READING",
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should update status to TO_READ (resets progress/startedAt/finishedAt)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBook = createFakeBook({
        status: "READING" as ReadStatus,
        progress: 25,
        startedAt: new Date(),
      });
      const updatedBook = createFakeBook({
        status: "TO_READ" as ReadStatus,
        progress: 0,
        startedAt: null,
        finishedAt: null,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: "TO_READ",
      });

      expect(result.updatedBook.status).toEqual("TO_READ");
      expect(result.updatedBook.startedAt).toEqual(null);
      expect(result.updatedBook.progress).toEqual(0);
    });

    it("should delete all ReadingProgress entries when status changes to TO_READ", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ status: "READING", progress: 50 });
      const updatedBook = createFakeBook({ status: "TO_READ", progress: 0 });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            deleteMany: mockDeleteMany,
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      await caller.updateReadingStatus({
        bookId: fakeBook.id,
        newStatus: "TO_READ",
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { bookId: fakeBook.id } });
    });

    it("should delete all ReadingProgress entries when status changes to READ_NEXT", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ status: "READING", progress: 50 });
      const updatedBook = createFakeBook({ status: "READ_NEXT", progress: 0 });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        const fakeTxClient = {
          readingProgress: {
            deleteMany: mockDeleteMany,
          },
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      await caller.updateReadingStatus({
        bookId: fakeBook.id,
        newStatus: "READ_NEXT",
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { bookId: fakeBook.id } });
    });

    it("should throw error when book not found", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(
        caller.updateReadingStatus({ bookId: 999, newStatus: "READ" }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("should throw error when user doesn't own book", async () => {
      const fakeOwner = createFakeUser({ id: "1" });
      const fakeRequester = createFakeUser({ id: "2" });
      const { mockDb, caller } = createMockCaller(bookRouter, {
        userId: fakeRequester.id,
      });

      const fakeBook = createFakeBook({ userId: fakeOwner.id });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.updateReadingStatus({
          bookId: fakeBook.id,
          newStatus: "READING",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
  describe("updatePageCount", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should update page count successfully", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBookData = { pageCount: 100 };
      const originalBook = createFakeBook(originalBookData);

      const updatedBookData = { pageCount: 200 };
      const updatedBook = createFakeBook(updatedBookData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updatePageCount({
        bookId: originalBook.id,
        newPageCount: updatedBook.pageCount,
      });

      expect(result.pageCount).toEqual(updatedBook.pageCount);
      expect(mockDb.book.update).toHaveBeenCalledWith({
        data: { pageCount: updatedBook.pageCount },
        where: { id: originalBook.id },
      });
    });

    it("should throw error when book not found", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(
        caller.updatePageCount({ bookId: 1, newPageCount: 100 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("should throw an error when user doesn't own book", async () => {
      const fakeOwner = createFakeUser({ id: "1" });
      const fakeRequester = createFakeUser({ id: "2" });

      const { mockDb, caller, mockLogger } = createMockCaller(bookRouter, {
        userId: fakeRequester.id,
      });

      const fakeBook = createFakeBook({ userId: fakeOwner.id });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.updatePageCount({ bookId: fakeBook.id, newPageCount: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
  describe("getBook", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return book when user owns it", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook();

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      const result = await caller.getBook(fakeBook.id);

      expect(result.book).toEqual(fakeBook);
    });
    it("should throw FORBIDDEN when user doesn't own book", async () => {
      const fakeOwner = createFakeUser({ id: "1" });
      const fakeRequester = createFakeUser({ id: "2" });
      const { mockDb, caller, mockLogger } = createMockCaller(bookRouter, {
        userId: fakeRequester.id,
      });

      const fakeBook = createFakeBook({ userId: fakeOwner.id });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(caller.getBook(fakeBook.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    it("should throw NOT_FOUND when book doesn't exist", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(caller.getBook(1)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
  describe("getBooks", () => {
    const baseQuery = {
      orderBy: { title: "asc" },
      take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
    };

    beforeEach(() => vi.clearAllMocks());

    it("should return all books when no filters applied", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1Data = {
        title: "Book 1",
      };
      const fakeBook2Data = {
        title: "Book 2",
      };
      const fakeBook1 = createFakeBook(fakeBook1Data);
      const fakeBook2 = createFakeBook(fakeBook2Data);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook1, fakeBook2]);

      const result = await caller.getBooks();

      expect(result.books).toEqual([fakeBook1, fakeBook2]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook1.userId },
        ...baseQuery,
      });
    });

    it("should filter by status (READING, READ, TO_READ)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ status: "READING" });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook1]);

      const result = await caller.getBooks({ status: "READING" });

      expect(result.books).toEqual([fakeBook1]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: {
          userId: fakeBook1.userId,
          status: "READING",
        },
        ...baseQuery,
      });
    });

    it("should filter by search term", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        title: "The filter should pick up this book",
      });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook]);

      const result = await caller.getBooks({ search: "filter" });

      expect(result.books).toEqual([fakeBook]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: {
          userId: fakeBook.userId,
          OR: [
            { title: { contains: "filter", mode: "insensitive" } },
            { author: { contains: "filter", mode: "insensitive" } },
            { series: { contains: "filter", mode: "insensitive" } },
            { isbn: { contains: "filter", mode: "insensitive" } },
          ],
        },
        ...baseQuery,
      });
    });

    it("should sort by title ascending", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ title: "Book 1" });
      const fakeBook2 = createFakeBook({ title: "Book 2" });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook1, fakeBook2]);

      const result = await caller.getBooks({
        sortBy: "title",
        sortDirection: "asc",
      });

      expect(result.books).toEqual([fakeBook1, fakeBook2]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook1.userId },
        take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
        orderBy: { title: "asc" },
      });
    });

    it("should sort by title descending", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ title: "Book 1" });
      const fakeBook2 = createFakeBook({ title: "Book 2" });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook2, fakeBook1]);

      const result = await caller.getBooks({
        sortBy: "title",
        sortDirection: "desc",
      });

      expect(result.books).toEqual([fakeBook2, fakeBook1]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook1.userId },
        take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
        orderBy: { title: "desc" },
      });
    });

    it("should sort by createdAt ascending", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ createdAt: subDays(new Date(), 1) });
      const fakeBook2 = createFakeBook({ createdAt: new Date() });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook1, fakeBook2]);

      const result = await caller.getBooks({
        sortBy: "createdAt",
        sortDirection: "asc",
      });

      expect(result.books).toEqual([fakeBook1, fakeBook2]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook1.userId },
        take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
        orderBy: { createdAt: "asc" },
      });
    });

    it("should sort by createdAt descending", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ createdAt: subDays(new Date(), 1) });
      const fakeBook2 = createFakeBook({ createdAt: new Date() });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook2, fakeBook1]);

      const result = await caller.getBooks({
        sortBy: "createdAt",
        sortDirection: "desc",
      });

      expect(result.books).toEqual([fakeBook2, fakeBook1]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook1.userId },
        take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
        orderBy: { createdAt: "desc" },
      });
    });

    it("should respect limit parameter", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook();

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook]);

      const limit = 1;
      const result = await caller.getBooks({ limit });

      expect(result.books).toEqual([fakeBook]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: fakeBook.userId },
        take: limit,
        orderBy: { title: "asc" },
      });
    });

    it("should combine filters and sorting correctly", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook1 = createFakeBook({ title: "Book 1" });
      const fakeBook2 = createFakeBook({ title: "Book 2" });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook2, fakeBook1]);

      const result = await caller.getBooks({
        search: "book",
        sortBy: "title",
        sortDirection: "desc",
      });

      expect(result.books).toEqual([fakeBook2, fakeBook1]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: {
          userId: fakeBook1.userId,
          OR: [
            { title: { contains: "book", mode: "insensitive" } },
            { author: { contains: "book", mode: "insensitive" } },
            { series: { contains: "book", mode: "insensitive" } },
            { isbn: { contains: "book", mode: "insensitive" } },
          ],
        },
        orderBy: { title: "desc" },
        take: VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
      });
    });

    it("should return empty array when no matches found", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);

      const result = await caller.getBooks();

      expect(result.books).toEqual([]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        ...baseQuery,
      });
    });
  });
  describe("deleteBook", () => {
    beforeEach(() => {
      mockDeleteFiles.mockClear();
      vi.clearAllMocks();
    });

    it("should delete book successfully when user owns it", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook();

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.delete).mockResolvedValue(fakeBook);

      await caller.deleteBook(fakeBook.id);

      expect(mockDb.book.delete).toHaveBeenCalledWith({
        where: { id: fakeBook.id },
      });
    });

    it("should delete associated cover image from UploadThing when book has cover", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fileKey = "abc123-cover.jpg";
      const fakeBook = createFakeBook({
        coverUrl: `https://utfs.io/f/${fileKey}`,
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      mockDeleteFiles.mockResolvedValue({ success: true });

      await caller.deleteBook(fakeBook.id);

      expect(mockDeleteFiles).toHaveBeenCalledWith(fileKey);
    });

    it("should throw NOT_FOUND when book doesn't exist", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(caller.deleteBook(1)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("should throw FORBIDDEN when user doesn't own book", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ userId: "other-user" });
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(caller.deleteBook(1)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("updateBook", () => {
    beforeEach(() => vi.clearAllMocks());

    it.skip("should update book fields successfully", async () => {});

    it.skip("should recalculate titleSort when title is updated", async () => {});

    it.skip("should recalculate authorSort when author is updated", async () => {});

    it.skip("should detect duplicate series position (excluding self)", async () => {});

    it.skip("should detect duplicate ISBN (excluding self)", async () => {});

    it.skip("should delete old cover from UploadThing when cover URL changes", async () => {});

    it.skip("should throw NOT_FOUND when book doesn't exist", async () => {});

    it.skip("should throw FORBIDDEN when user doesn't own book", async () => {});
  });

  describe("Edge Cases", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should handle books with special characters in title/author", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const specialCharacterBook = {
        title: "The Hitchhiker's — Guide: Vol. 1",
        author: "J.R.R. Tolkien & C. Tolkien",
        publishedYear: 2026,
      };

      const createdBook = createFakeBook(specialCharacterBook);

      vi.mocked(mockDb.book.create).mockResolvedValue(createdBook);
      vi.mocked(mockDb.book.findFirst).mockResolvedValue(null);

      const result = await caller.createBook(specialCharacterBook);

      expect(result.book.title).toEqual(specialCharacterBook.title);
      expect(result.book.author).toEqual(specialCharacterBook.author);
      expect(mockDb.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: specialCharacterBook.title,
          author: specialCharacterBook.author,
        }),
      });
    });

    it("should handle concurrent updates to same book (transaction safety)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ status: "READING", progress: 50 });
      const updatedBook = createFakeBook({ status: "READ", progress: 100 });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      let transactionCallCount = 0;
      vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
        transactionCallCount++;
        const fakeTxClient = {
          book: {
            update: vi.fn().mockResolvedValue(updatedBook),
          },
        } as unknown as typeof mockDb;
        return callback(fakeTxClient);
      });

      const [result1, result2] = await Promise.all([
        caller.updateReadingStatus({ bookId: fakeBook.id, newStatus: "READ" }),
        caller.updateReadingStatus({ bookId: fakeBook.id, newStatus: "READ" }),
      ]);

      expect(result1.updatedBook.status).toEqual("READ");
      expect(result2.updatedBook.status).toEqual("READ");
      expect(transactionCallCount).toBe(2);
    });
  });
});
