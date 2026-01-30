import { useCallback, useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";
import { useDebounce } from "use-debounce";

import type { Book } from "@/generated/prisma/client";
import { ReadStatus } from "@/generated/prisma/enums";
import type { BookFilters } from "@/lib/types";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseBooksReturn {
  books: Book[];
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | null;
  isEmpty: boolean;
  hasBooks: boolean;
  hasFilters: boolean;
  count: number;
  readBooks: Book[];
  readBooksCount: number;
  toReadBooks: Book[];
  toReadBooksCount: number;
  readingBooks: Book[];
  readingBooksCount: number;
  dnfBooks: Book[];
  dnfBooksCount: number;
  readNextBooks: Book[];
  readNextBooksCount: number;
  booksByStatus: Book[][];
  finishedThisYearBooks: Book[];
  finishedThisYearBooksCount: number;
  totalReadPageCount: number;
  findBookById: (id: number) => Book | null;
  getBooksByAuthor: (authorName: string) => Book[];
}

export const useBooks = (
  options?: BookFilters & { enabled?: boolean },
): UseBooksReturn => {
  const {
    status,
    rating,
    search,
    sortBy = "title",
    sortDirection = "asc",
    limit = 50,
    enabled = true,
  } = options || {};

  const hasFilters = !!(status || rating || search);

  const [debouncedSearch] = useDebounce(search, 300);

  const { data, isLoading, isError, error } = trpc.book.getBooks.useQuery(
    {
      status,
      rating,
      search: debouncedSearch,
      sortBy:
        sortBy === "title"
          ? "titleSort"
          : sortBy === "author"
            ? "authorSort"
            : sortBy,
      sortDirection,
      limit,
    },
    { enabled },
  );

  const books: Book[] = useMemo(() => data?.books || [], [data?.books]);

  const isEmpty = books.length === 0 && !isLoading;
  const count = books.length;
  const hasBooks = count > 0;

  const readBooks = useMemo(
    () => books.filter((book) => book.status === ReadStatus.READ),
    [books],
  );
  const readBooksCount = readBooks.length;

  const toReadBooks = useMemo(
    () => books.filter((book) => book.status === ReadStatus.TO_READ),
    [books],
  );
  const toReadBooksCount = toReadBooks.length;

  const readingBooks = useMemo(
    () => books.filter((book) => book.status === ReadStatus.READING),
    [books],
  );
  const readingBooksCount = readingBooks.length;

  const dnfBooks = useMemo(
    () => books.filter((book) => book.status === ReadStatus.DNF),
    [books],
  );
  const dnfBooksCount = dnfBooks.length;

  const readNextBooks = useMemo(
    () => books.filter((book) => book.status === ReadStatus.READ_NEXT),
    [books],
  );
  const readNextBooksCount = readNextBooks.length;

  const booksByStatus = [
    readBooks,
    toReadBooks,
    readingBooks,
    dnfBooks,
    readNextBooks,
  ];

  const currentYear = new Date().getFullYear();
  const finishedThisYearBooks = useMemo(
    () =>
      books.filter((book) => book.finishedAt?.getFullYear() === currentYear),
    [books, currentYear],
  );
  const finishedThisYearBooksCount = finishedThisYearBooks.length;

  const totalReadPageCount = useMemo(
    () => readBooks.reduce((sum, book) => sum + book.pageCount, 0),
    [readBooks],
  );

  const findBookById = useCallback(
    (id: number) => {
      return books.find((book) => book.id === id) || null;
    },
    [books],
  );

  const getBooksByAuthor = useCallback(
    (authorName: string) => {
      return books.filter((book) =>
        book.author.toLowerCase().includes(authorName.toLowerCase()),
      );
    },
    [books],
  );

  return {
    books,
    isPending: isLoading,
    isError,
    error,
    isEmpty,
    hasBooks,
    hasFilters,
    count,
    readBooks,
    readBooksCount,
    toReadBooks,
    toReadBooksCount,
    readingBooks,
    readingBooksCount,
    dnfBooks,
    dnfBooksCount,
    readNextBooks,
    readNextBooksCount,
    booksByStatus,
    finishedThisYearBooks,
    finishedThisYearBooksCount,
    totalReadPageCount,
    findBookById,
    getBooksByAuthor,
  } satisfies UseBooksReturn;
};
