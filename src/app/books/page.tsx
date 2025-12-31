"use client";

import BookCard from "@/components/books/book-card";
import LoadingState from "@/components/loading-state";
import { useBooks } from "@/hooks/use-books";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

const Page = () => {
  const { isSignedIn } = useAuth();
  const { books, isPending, isError, error } = useBooks();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (isError) {
    return <div>Error loading books: {error?.message}</div>;
  }

  if (!books || isPending) {
    return <LoadingState />;
  }

  return (
    <div className="flex w-full justify-center">
      <div className="grid w-5/6 grid-cols-5 items-center gap-x-8 gap-y-4 pt-4">
        {books.map((book) => (
          <BookCard
            book={book}
            key={book.id}
            showStatusButton
            orientation="vertical"
          />
        ))}
      </div>
    </div>
  );
};

export default Page;
