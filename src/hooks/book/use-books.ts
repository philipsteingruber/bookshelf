import { useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";
import { useDebounce } from "use-debounce";

import type { Book } from "@/generated/prisma/client";
import { DEBOUNCE_INTERVAL } from "@/lib/constants";
import type { BookFilters } from "@/lib/types";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseBooksReturn {
  books: Book[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | null;
  isEmpty: boolean;
  hasBooks: boolean;
  hasFilters: boolean;
  count: number;
}

export const useBooks = (options?: BookFilters & { enabled?: boolean }): UseBooksReturn => {
  const {
    status,
    rating,
    search,
    unrated,
    sortBy = "title",
    sortDirection = "asc",
    limit = 50,
    enabled = true,
    page = 1,
  } = options || {};

  const hasFilters = !!(status || rating || search || unrated);

  const [debouncedSearch] = useDebounce(search, DEBOUNCE_INTERVAL);

  const { data, isPending, isError, error } = trpc.book.getBooks.useQuery(
    {
      status,
      rating,
      search: debouncedSearch,
      sortBy: sortBy === "title" ? "titleSort" : sortBy === "author" ? "authorSort" : sortBy,
      sortDirection,
      limit,
      page,
      unrated,
    },
    { enabled, placeholderData: (prev) => prev },
  );

  const books: Book[] = useMemo(() => data?.books || [], [data?.books]);

  const isEmpty = books.length === 0 && !isPending;
  const count = books.length;
  const hasBooks = count > 0;

  return {
    books,
    totalCount: data?.totalCount ?? 0,
    totalPages: data?.totalCount ? Math.ceil(data.totalCount / limit) : 0,
    isPending,
    isError,
    error,
    isEmpty,
    hasBooks,
    hasFilters,
    count,
    currentPage: page,
  } satisfies UseBooksReturn;
};
