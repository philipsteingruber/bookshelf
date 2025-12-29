import { trpc } from "@/trpc/client";
import { useMemo } from "react";

export const useBooks = () => {
  const { data, isLoading, isError } = trpc.book.getBooks.useQuery();
  const books = useMemo(() => data?.books || [], [data?.books]);

  const isEmpty = books.length === 0 && !isLoading;
  const count = books.length;

  const readBooks = books.filter((book) => book.status === "READ");
  const toReadBooks = books.filter((book) => book.status === "TO_READ");
  const readingBooks = books.filter((book) => book.status === "READING");
  const dnfBooks = books.filter((book) => book.status === "DNF");

  return {
    books,
    isPending: isLoading,
    isError,
    isEmpty,
    count,
    readBooks,
    toReadBooks,
    readingBooks,
    dnfBooks,
  };
};
