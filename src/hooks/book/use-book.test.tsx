import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBook } from "@/hooks/book";
import { createFakeBook, createMockUseQueryReturn } from "@/lib/test-utils";
import { trpc } from "@/trpc/client";

// Hoist mockGetData so it can be controlled per test
const mockGetData = vi.fn();

// Mock the trpc client
vi.mock("@/trpc/client", () => ({
  trpc: {
    book: {
      getBook: {
        useQuery: vi.fn().mockReturnValue({
          data: null,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
    useUtils: vi.fn(() => ({
      book: {
        getBooks: {
          getData: mockGetData,
        },
      },
    })),
  },
}));

describe("useBook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockGetData to return undefined (no cache) by default
    mockGetData.mockReturnValue(undefined);
    // Reset useQuery to default "no data" state
    vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
      createMockUseQueryReturn({ data: null, isPending: false }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Data fetching", () => {
    it("should attempt to use cached data from getBooks query first", () => {
      const cachedBook = createFakeBook();
      vi.mocked(mockGetData).mockReturnValue({ books: [cachedBook] });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: cachedBook },
          isPending: false,
          isError: false,
        }),
      );

      renderHook(() => useBook(cachedBook.id.toString()));

      expect(trpc.book.getBook.useQuery).toHaveBeenCalledWith(
        cachedBook.id,
        expect.objectContaining({ initialData: { book: cachedBook } }),
      );
    });

    it("should fetch from API if not in cache", () => {
      const fakeBook = createFakeBook();
      vi.mocked(mockGetData).mockReturnValue(undefined);
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
          isError: false,
        }),
      );

      renderHook(() => useBook(fakeBook.id.toString()));

      expect(trpc.book.getBook.useQuery).toHaveBeenCalledWith(
        fakeBook.id,
        expect.objectContaining({ initialData: undefined }),
      );
    });

    it("should return book data when found", () => {
      const fakeBook = createFakeBook();
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
          isError: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.book).toEqual(fakeBook);
    });
  });

  describe("Status flags", () => {
    it("should set isReading true when status is READING", () => {
      const fakeBook = createFakeBook({ status: "READING" });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.isReading).toEqual(true);
      expect(result.result.current.isRead).toEqual(false);
      expect(result.result.current.isToRead).toEqual(false);
      expect(result.result.current.isDNF).toEqual(false);
      expect(result.result.current.isReadNext).toEqual(false);
    });

    it("should set isRead true when status is READ", () => {
      const fakeBook = createFakeBook({ status: "READ" });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.isRead).toEqual(true);
      expect(result.result.current.isReading).toEqual(false);
    });

    it("should set isToRead true when status is TO_READ", () => {
      const fakeBook = createFakeBook({ status: "TO_READ" });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.isToRead).toEqual(true);
      expect(result.result.current.isReading).toEqual(false);
    });

    it("should set isDNF true when status is DNF", () => {
      const fakeBook = createFakeBook({ status: "DNF" });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.isDNF).toEqual(true);
      expect(result.result.current.isReading).toEqual(false);
    });

    it("should set isReadNext true when status is READ_NEXT", () => {
      const fakeBook = createFakeBook({ status: "READ_NEXT" });
      vi.mocked(trpc.book.getBook.useQuery).mockReturnValue(
        createMockUseQueryReturn({
          data: { book: fakeBook },
          isPending: false,
        }),
      );

      const result = renderHook(() => useBook(fakeBook.id.toString()));

      expect(result.result.current.isReadNext).toEqual(true);
      expect(result.result.current.isReading).toEqual(false);
    });
  });
});
