import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBooks } from "@/hooks/book";
import { DEBOUNCE_INTERVAL } from "@/lib/constants";
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
    it("should debounce search term", async () => {
      const { useDebounce } = await import("use-debounce");

      renderHook(() => useBooks({ search: "test query" }));

      expect(useDebounce).toHaveBeenCalledWith("test query", DEBOUNCE_INTERVAL);
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

  });
});
