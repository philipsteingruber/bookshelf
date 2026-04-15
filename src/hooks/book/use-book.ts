import type { TRPCClientErrorLike } from "@trpc/client";

import { ReadStatus } from "@/generated/prisma/enums";
import type { BookWithSeries } from "@/lib/types/book";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseBookReturn {
  book: BookWithSeries | null;
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | Error | null;
  isReading: boolean;
  isToRead: boolean;
  isRead: boolean;
  isReadNext: boolean;
  isDNF: boolean;
  isForbidden: boolean;
  isNotFound: boolean;
}

export const useBook = (bookId: string): UseBookReturn => {
  const utils = trpc.useUtils();

  const getCachedBook = (): BookWithSeries | undefined => {
    const allBooksQueries = utils.book.getBooks.getData();

    if (allBooksQueries?.books) {
      return (
        allBooksQueries.books.find((book) => book.id === parseInt(bookId)) ??
        undefined
      );
    }
  };

  const { data, isPending, isError, error } = trpc.book.getBook.useQuery(
    parseInt(bookId),
    { initialData: getCachedBook() ? { book: getCachedBook()! } : undefined },
  );

  const book = data?.book ?? null;
  const isForbidden = error?.data?.code === "FORBIDDEN";
  const isNotFound = error?.data?.code === "NOT_FOUND";

  if (isPending) {
    return {
      book: null,
      isPending: true,
      isError: false,
      error: null,
      isReading: false,
      isToRead: false,
      isRead: false,
      isReadNext: false,
      isDNF: false,
      isForbidden: false,
      isNotFound: false,
    };
  }

  if (isError || !book) {
    return {
      book: null,
      isPending: false,
      isError: true,
      error: error || new Error("Failed to load book."),
      isReading: false,
      isToRead: false,
      isRead: false,
      isReadNext: false,
      isDNF: false,
      isForbidden,
      isNotFound,
    };
  }

  const isReading = book.status === ReadStatus.READING;
  const isToRead = book.status === ReadStatus.TO_READ;
  const isRead = book.status === ReadStatus.READ;
  const isReadNext = book.status === ReadStatus.READ_NEXT;
  const isDNF = book.status === ReadStatus.DNF;

  return {
    book,
    isReading,
    isToRead,
    isRead,
    isReadNext,
    isDNF,
    isPending: false,
    isError: false,
    error: null,
    isForbidden: false,
    isNotFound: false,
  };
};
