import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadStatus } from "@/generated/prisma/enums";
import { VALIDATION_LIMITS } from "@/lib/constants";
import {
  createFakeBook,
  createFakeUser,
  createMockCaller,
} from "@/lib/test-utils";

import { bookRouter } from "./book";

describe("bookRouter", () => {
  describe("createBook", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });
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
      expect(result.book.title).toBe(fakeBookData.title);
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
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should update status to READ (and set finishedAt and progress to 100)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBookData = {
        status: "READING" as ReadStatus,
        finishedAt: null,
        progress: 50,
      };
      const originalBook = createFakeBook(originalBookData);

      const updatedBookData = {
        status: "READ" as ReadStatus,
        finishedAt: new Date(),
        progress: 100,
      };
      const updatedBook = createFakeBook(updatedBookData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: updatedBookData.status,
      });

      expect(result.status).toEqual("READ");
      expect(result.finishedAt).toBeInstanceOf(Date);
      expect(result.progress).toEqual(100);
      expect(mockDb.book.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "READ",
          progress: VALIDATION_LIMITS.PROGRESS_COMPLETE,
          finishedAt: expect.any(Date),
        }),
        where: { id: originalBook.id },
      });
    });

    it("should update status to READING (and set startedAt)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBookData = {
        status: "TO_READ" as ReadStatus,
        startedAt: null,
      };
      const originalBook = createFakeBook(originalBookData);

      const updatedBookData = {
        status: "READING" as ReadStatus,
        startedAt: new Date(),
      };
      const updatedBook = createFakeBook(updatedBookData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: updatedBook.status,
      });

      expect(result.status).toEqual("READING");
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(mockDb.book.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "READING",
          startedAt: expect.any(Date),
        }),
        where: { id: originalBook.id },
      });
    });

    it("should update status to TO_READ (and reset startedAt and progress to 0)", async () => {
      const { mockDb, caller } = createMockCaller(bookRouter);

      const originalBookData = {
        status: "READING" as ReadStatus,
        progress: 25,
        startedAt: new Date(),
      };
      const originalBook = createFakeBook(originalBookData);

      const updatedBookData = {
        status: "TO_READ" as ReadStatus,
        progress: 0,
        startedAt: null,
      };
      const updatedBook = createFakeBook(updatedBookData);

      vi.mocked(mockDb.book.findUnique).mockResolvedValue(originalBook);
      vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

      const result = await caller.updateReadingStatus({
        bookId: originalBook.id,
        newStatus: updatedBook.status,
      });

      expect(result.status).toEqual("TO_READ");
      expect(result.startedAt).toEqual(null);
      expect(result.progress).toEqual(0);
      expect(mockDb.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "TO_READ", startedAt: null, progress: 0 },
          where: { id: originalBook.id },
        }),
      );
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
      const { mockDb, caller, mockLogger } = createMockCaller(bookRouter, {
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
      expect(mockLogger.warn).toBeCalled();
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
});
