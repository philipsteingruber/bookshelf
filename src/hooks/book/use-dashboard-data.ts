"use client";

import type { TRPCClientErrorLike } from "@trpc/client";

import type { BookWithSeries } from "@/lib/types/book";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseDashBoardDataReturns {
  readingBooks: BookWithSeries[];
  readingBooksCount: number;
  readNextBooks: BookWithSeries[];
  readNextBooksCount: number;
  recentlyReadBooks: BookWithSeries[];
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | null;
}

export const useDashBoardData = (): UseDashBoardDataReturns => {
  const { data, isPending, isError, error } =
    trpc.book.getDashBoardBooks.useQuery();

  return {
    readingBooks: data?.readingBooks ?? [],
    readingBooksCount: data?.readingBooksCount ?? 0,
    readNextBooks: data?.readNextBooks ?? [],
    readNextBooksCount: data?.readNextBooksCount ?? 0,
    recentlyReadBooks: data?.recentlyReadBooks ?? [],
    isPending,
    isError,
    error,
  };
};
