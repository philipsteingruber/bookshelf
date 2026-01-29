import { renderHook } from "@testing-library/react";
import { subYears } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBooks } from "@/hooks/book";
import { createFakeBook, createMockUseQueryReturn } from "@/lib/test-utils";
import { trpc } from "@/trpc/client";

// Mock the trpc client
vi.mock("@/trpc/client", () => ({
  trpc: {
    book: {
      getBooks: {
        useQuery: vi.fn().mockReturnValue({
          data: { books: [] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

// Mock use-debounce
vi.mock("use-debounce", () => ({
  useDebounce: vi.fn((value) => [value]),
}));

const mockDate = new Date("2026-01-15T12:00:00");

describe("useBooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
    vi.clearAllMocks();
    // Reset mock to default empty state
    vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({ data: { books: [] } }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Search and filtering", () => {
    it("should debounce search term (300ms delay)", async () => {
      const { useDebounce } = await import("use-debounce");

      renderHook(() => useBooks({ search: "test query" }));

      expect(useDebounce).toHaveBeenCalledWith("test query", 300);
    });

    it("should filter books by status correctly", () => {
      const readingBook = createFakeBook({ id: 1, status: "READING" });
      const readBook = createFakeBook({ id: 2, status: "READ" });
      const toReadBook = createFakeBook({ id: 3, status: "TO_READ" });
      const dnfBook = createFakeBook({ id: 4, status: "DNF" });
      const readNextBook = createFakeBook({ id: 5, status: "READ_NEXT" });
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: {
            books: [readingBook, readBook, toReadBook, dnfBook, readNextBook],
          },
        }),
      );

      const result = renderHook(() => useBooks());

      expect(result.result.current.readingBooks).toEqual([readingBook]);
      expect(result.result.current.readingBooksCount).toEqual(1);
      expect(result.result.current.readBooks).toEqual([readBook]);
      expect(result.result.current.readBooksCount).toEqual(1);
      expect(result.result.current.toReadBooks).toEqual([toReadBook]);
      expect(result.result.current.toReadBooksCount).toEqual(1);
      expect(result.result.current.dnfBooks).toEqual([dnfBook]);
      expect(result.result.current.dnfBooksCount).toEqual(1);
      expect(result.result.current.readNextBooks).toEqual([readNextBook]);
      expect(result.result.current.readNextBooksCount).toEqual(1);
    });

    it("should map sort fields (title -> titleSort, author -> authorSort)", () => {
      renderHook(() => useBooks({ sortBy: "title" }));
      expect(trpc.book.getBooks.useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "titleSort" }),
        expect.anything(),
      );
      renderHook(() => useBooks({ sortBy: "author" }));
      expect(trpc.book.getBooks.useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "authorSort" }),
        expect.anything(),
      );
    });
  });

  describe("Derived metrics", () => {
    it("should calculate isEmpty correctly (no books at all)", () => {
      const result = renderHook(() => useBooks());
      expect(result.result.current.isEmpty).toEqual(true);

      const fakeBook = createFakeBook();
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [fakeBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      result.rerender();
      expect(result.result.current.isEmpty).toEqual(false);

      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [] },
          isLoading: true,
          isError: false,
          error: null,
        }),
      );
      result.rerender();
      expect(result.result.current.isEmpty).toEqual(false);
    });

    it("should calculate hasBooks correctly", () => {
      const result = renderHook(() => useBooks());
      expect(result.result.current.hasBooks).toEqual(false);

      const fakeBook = createFakeBook();
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [fakeBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      result.rerender();
      expect(result.result.current.hasBooks).toEqual(true);
    });

    it("should calculate hasFilters when filters are applied", () => {
      const result = renderHook(() => useBooks());
      expect(result.result.current.hasFilters).toEqual(false);

      const withStatus = renderHook(() => useBooks({ status: "DNF" }));
      expect(withStatus.result.current.hasFilters).toEqual(true);

      const withRating = renderHook(() => useBooks({ rating: 5 }));
      expect(withRating.result.current.hasFilters).toEqual(true);

      const withSearch = renderHook(() => useBooks({ search: "test" }));
      expect(withSearch.result.current.hasFilters).toEqual(true);
    });

    it("should calculate count as total book count", () => {
      const result = renderHook(() => useBooks());
      expect(result.result.current.count).toEqual(0);

      const fakeBook = createFakeBook();
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [fakeBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      result.rerender();
      expect(result.result.current.count).toEqual(1);
    });
  });

  describe("Helper functions", () => {
    it("should find book by ID with findBookById()", () => {
      const fakeBook = createFakeBook();
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [fakeBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      const result = renderHook(() => useBooks());
      expect(result.result.current.findBookById(fakeBook.id)).toEqual(fakeBook);
      expect(result.result.current.findBookById(999)).toEqual(null);
    });

    it("should filter books by author with getBooksByAuthor()", () => {
      const firstBook = createFakeBook({ id: 1, author: "Author 1" });
      const secondBook = createFakeBook({ id: 2, author: "Author 2" });
      const thirdBook = createFakeBook({ id: 3, author: "Author 2" });
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [firstBook, secondBook, thirdBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      const result = renderHook(() => useBooks());
      expect(result.result.current.getBooksByAuthor("auth")).toEqual([
        firstBook,
        secondBook,
        thirdBook,
      ]);
      expect(result.result.current.getBooksByAuthor("2")).toEqual([
        secondBook,
        thirdBook,
      ]);
    });

    it("should calculate finishedThisYear correctly", () => {
      const firstBook = createFakeBook({
        id: 1,
        finishedAt: subYears(new Date(), 1),
      });
      const secondBook = createFakeBook({
        id: 2,
        finishedAt: new Date(),
      });
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [firstBook, secondBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      const result = renderHook(() => useBooks());

      expect(result.result.current.finishedThisYearBooks).toEqual([secondBook]);
      expect(result.result.current.finishedThisYearBooksCount).toEqual(1);
    });

    it("should calculate totalPagesRead for READ books", () => {
      const firstBook = createFakeBook({
        id: 1,
        status: "READ",
        pageCount: 100,
      });
      const secondBook = createFakeBook({
        id: 2,
        status: "READ",
        pageCount: 200,
      });
      const thirdBook = createFakeBook({
        id: 3,
        status: "READING",
        pageCount: 50,
      });

      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [firstBook, secondBook, thirdBook] },
          isLoading: false,
          isError: false,
          error: null,
        }),
      );
      const result = renderHook(() => useBooks());

      expect(result.result.current.totalReadPageCount).toEqual(
        firstBook.pageCount + secondBook.pageCount,
      );
    });
  });

  describe("Query state pass-through", () => {
    it("should pass through isPending from query", () => {
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [] },
          isLoading: true,
          isError: false,
          error: null,
        }),
      );
      const result = renderHook(() => useBooks());

      expect(result.result.current.isPending).toEqual(true);
    });

    it("should pass through isError and error from query", () => {
      const error = new Error("error");
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { books: [] },
          isLoading: false,
          isError: true,
          error,
        }),
      );
      const result = renderHook(() => useBooks());

      expect(result.result.current.isError).toEqual(true);
      expect(result.result.current.error).toEqual(error);
    });
  });

  describe("Options", () => {
    it("should respect enabled option (disable query when false)", () => {
      renderHook(() => useBooks({ enabled: false }));
      expect(trpc.book.getBooks.useQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false }),
      );
    });

    it("should compose booksByStatus array in correct order", () => {
      const readBook = createFakeBook({ id: 1, status: "READ" });
      const toReadBook = createFakeBook({ id: 2, status: "TO_READ" });
      const readingBook = createFakeBook({ id: 3, status: "READING" });
      const dnfBook = createFakeBook({ id: 4, status: "DNF" });
      const readNextBook = createFakeBook({ id: 5, status: "READ_NEXT" });
      vi.mocked(trpc.book.getBooks.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: {
            books: [readBook, toReadBook, readingBook, dnfBook, readNextBook],
          },
        }),
      );

      const result = renderHook(() => useBooks());

      expect(result.result.current.booksByStatus).toEqual([
        [readBook],
        [toReadBook],
        [readingBook],
        [dnfBook],
        [readNextBook],
      ]);
    });
  });
});
