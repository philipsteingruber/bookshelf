"use client";

import type { TRPCClientErrorLike } from "@trpc/client";

import type { Book } from "@/generated/prisma/client";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseDashBoardDataReturns {
  readingBooks: Book[];
  readingBooksCount: number;
  readNextBooks: Book[];
  readNextBooksCount: number;
  recentlyReadBooks: Book[];
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
