import { subDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadStatus } from "@/generated/prisma/enums";
import { createAuthorSort, createTitleSort } from "@/lib/book";
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
      const updatedBook = createFakeBook({
        status: "READING",
        id: fakeBook.id,
      });

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
      const updatedBook = createFakeBook({
        status: "READING",
        id: fakeBook.id,
      });
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

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { bookId: fakeBook.id },
      });
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

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { bookId: fakeBook.id },
      });
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
      skip: 0,
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
        ...baseQuery,
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
        ...baseQuery,
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
        ...baseQuery,
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
        ...baseQuery,
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
        ...baseQuery,
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
        ...baseQuery,
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

    it("should return totalCount alongside books", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook();

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook]);
      vi.mocked(mockDb.book.count).mockResolvedValue(42);

      const result = await caller.getBooks();

      expect(result.totalCount).toEqual(42);
      expect(mockDb.book.count).toHaveBeenCalledWith({
        where: { userId: fakeBook.userId },
      });
    });

    it("should calculate skip from page parameter", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook();

      vi.mocked(mockDb.book.findMany).mockResolvedValue([fakeBook]);
      vi.mocked(mockDb.book.count).mockResolvedValue(50);

      await caller.getBooks({ page: 3, limit: 10 });

      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it("should default to skip 0 when no page provided", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(0);

      await caller.getBooks();

      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
        }),
      );
    });

    it("should sort by series with multi-column orderBy", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(0);

      await caller.getBooks({ sortBy: "series" });

      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { series: { sort: "asc", nulls: "last" } },
            { seriesIndex: "asc" },
            { titleSort: "asc" },
          ],
        }),
      );
    });

    it("should filter by rating with gte operator", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(0);

      await caller.getBooks({ rating: 4 });

      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rating: { gte: 4 },
          }),
        }),
      );
    });
  });

  describe("getSeriesList", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return grouped series data with book counts", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const groupByResult = [
        { series: "Horus Heresy", _count: { series: 3 } },
        { series: "Gaunt's Ghosts", _count: { series: 2 } },
      ];

      const heresyBooks = [
        createFakeBook({ id: 1, series: "Horus Heresy", seriesIndex: 1 }),
        createFakeBook({ id: 2, series: "Horus Heresy", seriesIndex: 2 }),
        createFakeBook({ id: 3, series: "Horus Heresy", seriesIndex: 3 }),
      ];
      const gauntBooks = [
        createFakeBook({ id: 4, series: "Gaunt's Ghosts", seriesIndex: 1 }),
        createFakeBook({ id: 5, series: "Gaunt's Ghosts", seriesIndex: 2 }),
      ];

      vi.mocked(mockDb.book.groupBy).mockResolvedValue(groupByResult as never);
      vi.mocked(mockDb.book.findMany)
        .mockResolvedValueOnce(heresyBooks)
        .mockResolvedValueOnce(gauntBooks);

      const result = await caller.getSeriesList();

      expect(result.seriesData).toHaveLength(2);
      expect(result.seriesData[0].name).toEqual("Horus Heresy");
      expect(result.seriesData[0].bookCount).toEqual(3);
      expect(result.seriesData[0].books).toEqual(heresyBooks);
      expect(result.seriesData[1].name).toEqual("Gaunt's Ghosts");
      expect(result.seriesData[1].bookCount).toEqual(2);
      expect(result.seriesData[1].books).toEqual(gauntBooks);
    });

    it("should return empty array when no series exist", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.groupBy).mockResolvedValue([]);

      const result = await caller.getSeriesList();

      expect(result.seriesData).toEqual([]);
    });

    it("should filter out null series entries from groupBy results", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const groupByResult = [
        { series: null, _count: { series: 5 } },
        { series: "Real Series", _count: { series: 2 } },
      ];

      const seriesBooks = [
        createFakeBook({ id: 1, series: "Real Series", seriesIndex: 1 }),
      ];

      vi.mocked(mockDb.book.groupBy).mockResolvedValue(groupByResult as never);
      vi.mocked(mockDb.book.findMany).mockResolvedValue(seriesBooks);

      const result = await caller.getSeriesList();

      expect(result.seriesData).toHaveLength(1);
      expect(result.seriesData[0].name).toEqual("Real Series");
    });

    it("should limit books per series to 5", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const groupByResult = [
        { series: "Big Series", _count: { series: 10 } },
      ];

      vi.mocked(mockDb.book.groupBy).mockResolvedValue(groupByResult as never);
      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);

      await caller.getSeriesList();

      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        }),
      );
    });

    it("should only query books for the current user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(bookRouter);

      const groupByResult = [
        { series: "Test Series", _count: { series: 1 } },
      ];

      vi.mocked(mockDb.book.groupBy).mockResolvedValue(groupByResult as never);
      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);

      await caller.getSeriesList();

      expect(mockDb.book.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id, series: { not: null } },
        }),
      );
      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id, series: "Test Series" },
        }),
      );
    });
  });

  describe("getDashBoardBooks", () => {
    beforeEach(() => vi.clearAllMocks());

    it("should return reading books ordered by updatedAt desc", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const readingBook = createFakeBook({
        status: "READING",
        updatedAt: new Date(),
      });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([readingBook]);
      vi.mocked(mockDb.book.count).mockResolvedValue(1);

      const result = await caller.getDashBoardBooks();

      expect(result.readingBooks).toEqual([readingBook]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "READING" }),
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
      );
    });

    it("should return correct readingBooksCount from count query", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(25);

      const result = await caller.getDashBoardBooks();

      expect(result.readingBooksCount).toEqual(25);
      expect(mockDb.book.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "READING" }),
        }),
      );
    });

    it("should return read next books ordered by updatedAt desc", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const readNextBook = createFakeBook({
        status: "READ_NEXT",
        updatedAt: new Date(),
      });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([readNextBook]);
      vi.mocked(mockDb.book.count).mockResolvedValue(1);

      const result = await caller.getDashBoardBooks();

      expect(result.readNextBooks).toEqual([readNextBook]);
    });

    it("should return correct readNextBooksCount from count query", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(15);

      const result = await caller.getDashBoardBooks();

      expect(result.readNextBooksCount).toEqual(15);
    });

    it("should return recently finished books within 2 weeks", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const recentBook = createFakeBook({
        status: "READ",
        finishedAt: subDays(new Date(), 3),
      });

      vi.mocked(mockDb.book.findMany).mockResolvedValue([recentBook]);
      vi.mocked(mockDb.book.count).mockResolvedValue(0);

      const result = await caller.getDashBoardBooks();

      expect(result.recentlyReadBooks).toEqual([recentBook]);
      expect(mockDb.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "READ",
            finishedAt: { gte: expect.any(Date) },
          }),
          orderBy: { finishedAt: "desc" },
          take: 10,
        }),
      );
    });

    it("should scope all queries to current user", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.book.count).mockResolvedValue(0);

      await caller.getDashBoardBooks();

      // All 5 calls (3 findMany + 2 count) should include userId
      const findManyCalls = vi.mocked(mockDb.book.findMany).mock.calls;
      const countCalls = vi.mocked(mockDb.book.count).mock.calls;

      findManyCalls.forEach((call) => {
        expect(call[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ userId: mockUser.id }),
          }),
        );
      });
      countCalls.forEach((call) => {
        expect(call[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ userId: mockUser.id }),
          }),
        );
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

    it("should update book fields successfully", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        title: "Original Title",
        summary: "Original Summary",
        series: "Original Series",
        pageCount: 100,
      });

      const updateData = {
        title: "Updated Title",
        summary: "Updated Summary",
        series: "Updated Series",
        pageCount: 200,
      };
      const updatedBook = createFakeBook(updateData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateBook({
        bookId: fakeBook.id,
        data: updateData,
      });

      expect(result.book.title).toEqual(updateData.title);
      expect(result.book.summary).toEqual(updateData.summary);
      expect(result.book.series).toEqual(updateData.series);
      expect(result.book.pageCount).toEqual(updateData.pageCount);
    });

    it("should recalculate titleSort when title is updated", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        title: "The Original Title",
      });

      const newTitle = "The Updated Title";
      const newTitleSort = createTitleSort(newTitle);
      const updateData = {
        title: newTitle,
      };
      const updatedBook = createFakeBook(updateData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      await caller.updateBook({
        bookId: fakeBook.id,
        data: updateData,
      });

      expect(mockDb.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: newTitle,
            titleSort: newTitleSort,
          }),
        }),
      );
    });

    it("should recalculate authorSort when author is updated", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        author: "Original Author",
      });

      const newAuthor = "Updated Author";
      const newAuthorSort = createAuthorSort(newAuthor);
      const updateData = {
        author: newAuthor,
      };
      const updatedBook = createFakeBook(updateData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      await caller.updateBook({
        bookId: fakeBook.id,
        data: updateData,
      });

      expect(mockDb.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            author: newAuthor,
            authorSort: newAuthorSort,
          }),
        }),
      );
    });

    it("should detect duplicate series position (excluding self)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        id: 1,
        series: "Test Series",
        seriesIndex: 1,
      });

      const conflictingBook = createFakeBook({
        id: 2,
        series: "Test Series",
        seriesIndex: 2,
        title: "Conflicting Book",
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.findFirst).mockResolvedValue(conflictingBook);

      await expect(
        caller.updateBook({
          bookId: fakeBook.id,
          data: { seriesIndex: 2 },
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("should detect duplicate ISBN (excluding self)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({
        id: 1,
        isbn: "9781789993448",
      });

      const conflictingBook = createFakeBook({
        id: 2,
        isbn: "9780316769488",
        title: "Conflicting Book",
      });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.findFirst).mockResolvedValue(conflictingBook);

      await expect(
        caller.updateBook({
          bookId: fakeBook.id,
          data: { isbn: "9780316769488" },
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("should delete old cover from UploadThing when cover URL changes", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const oldFileKey = "old-cover-key.jpg";
      const fakeBook = createFakeBook({
        coverUrl: `https://utfs.io/f/${oldFileKey}`,
      });

      const newCoverUrl = "https://utfs.io/f/new-cover-key.jpg";
      const updatedBook = createFakeBook({ coverUrl: newCoverUrl });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);
      mockDeleteFiles.mockResolvedValue({ success: true });

      await caller.updateBook({
        bookId: fakeBook.id,
        data: { coverUrl: newCoverUrl },
      });

      expect(mockDeleteFiles).toHaveBeenCalledWith(oldFileKey);
    });

    it("should throw NOT_FOUND when book doesn't exist", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(
        caller.updateBook({
          bookId: 999,
          data: { title: "New Title" },
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("should throw FORBIDDEN when user doesn't own book", async () => {
      const { mockDb, caller, mockLogger } = createMockCaller(bookRouter);

      const fakeBook = createFakeBook({ userId: "other-user" });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);

      await expect(
        caller.updateBook({
          bookId: fakeBook.id,
          data: { title: "New Title" },
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("updateRating", () => {
    it("should set a rating successfully", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const book = createFakeBook({ id: 1, userId: "test-user-123", rating: null });
      const updatedBook = createFakeBook({ ...book, rating: 4 });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateRating({ bookId: 1, rating: 4 });

      expect(mockDb.book.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rating: 4 },
      });
      expect(result.book.rating).toBe(4);
    });

    it("should clear a rating by setting null", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const book = createFakeBook({ id: 1, userId: "test-user-123", rating: 4 });
      const updatedBook = createFakeBook({ ...book, rating: null });

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateRating({ bookId: 1, rating: null });

      expect(mockDb.book.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { rating: null },
      });
      expect(result.book.rating).toBeNull();
    });

    it("should throw FORBIDDEN when book belongs to another user", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      const book = createFakeBook({ id: 1, userId: "other-user-456" });
      vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);

      await expect(
        caller.updateRating({ bookId: 1, rating: 3 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("should throw NOT_FOUND when book does not exist", async () => {
      const { caller, mockDb } = createMockCaller(bookRouter);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

      await expect(
        caller.updateRating({ bookId: 999, rating: 3 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("should reject a rating below 1", async () => {
      const { caller } = createMockCaller(bookRouter);

      await expect(
        caller.updateRating({ bookId: 1, rating: 0 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("should reject a rating above 5", async () => {
      const { caller } = createMockCaller(bookRouter);

      await expect(
        caller.updateRating({ bookId: 1, rating: 6 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
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
