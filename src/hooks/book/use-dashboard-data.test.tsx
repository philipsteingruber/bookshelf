import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashBoardData } from "@/hooks/book/use-dashboard-data";
import { createFakeBook, createMockUseQueryReturn } from "@/lib/test-utils";
import { trpc } from "@/trpc/client";

// Mock the trpc client
vi.mock("@/trpc/client", () => ({
  trpc: {
    book: {
      getDashBoardBooks: {
        useQuery: vi.fn().mockReturnValue({
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

describe("useDashBoardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default empty state
    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({ data: undefined }),
    );
  });

  it("should return empty arrays when data is undefined", () => {
    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.readingBooks).toEqual([]);
    expect(result.current.readNextBooks).toEqual([]);
    expect(result.current.recentlyReadBooks).toEqual([]);
    expect(result.current.readingBooksCount).toBe(0);
    expect(result.current.readNextBooksCount).toBe(0);
  });

  it("should return reading books from data", () => {
    const fakeReadingBooks = [
      createFakeBook({ id: 1, title: "Reading Book 1" }),
      createFakeBook({ id: 2, title: "Reading Book 2" }),
    ];

    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({
        data: {
          readingBooks: fakeReadingBooks,
          readingBooksCount: 5,
          readNextBooks: [],
          readNextBooksCount: 0,
          recentlyReadBooks: [],
        },
      }),
    );

    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.readingBooks).toEqual(fakeReadingBooks);
    expect(result.current.readingBooksCount).toBe(5);
  });

  it("should return read next books from data", () => {
    const fakeReadNextBooks = [
      createFakeBook({ id: 3, title: "Read Next Book 1" }),
    ];

    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({
        data: {
          readingBooks: [],
          readingBooksCount: 0,
          readNextBooks: fakeReadNextBooks,
          readNextBooksCount: 3,
          recentlyReadBooks: [],
        },
      }),
    );

    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.readNextBooks).toEqual(fakeReadNextBooks);
    expect(result.current.readNextBooksCount).toBe(3);
  });

  it("should return recently read books from data", () => {
    const fakeRecentlyReadBooks = [
      createFakeBook({ id: 4, title: "Recently Read Book" }),
    ];

    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({
        data: {
          readingBooks: [],
          readingBooksCount: 0,
          readNextBooks: [],
          readNextBooksCount: 0,
          recentlyReadBooks: fakeRecentlyReadBooks,
        },
      }),
    );

    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.recentlyReadBooks).toEqual(fakeRecentlyReadBooks);
  });

  it("should pass through isPending from query", () => {
    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({
        data: undefined,
        isPending: true,
      }),
    );

    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.isPending).toBe(true);
  });

  it("should pass through isError and error from query", () => {
    const mockError = new Error("Test error");

    vi.mocked(trpc.book.getDashBoardBooks.useQuery).mockReturnValue(
      createMockUseQueryReturn({
        data: undefined,
        isError: true,
        error: mockError,
      }),
    );

    const { result } = renderHook(() => useDashBoardData());

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual(mockError);
  });
});
