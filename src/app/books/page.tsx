"use client";

import BookCard from "@/components/books/book-card";
import { useBooks } from "@/hooks/use-books";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

const Page = () => {
  const { isSignedIn } = useAuth();
  const { books, isPending, isError } = useBooks();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (isError) {
    return <div>Failed to load books.</div>;
  }

  if (!books || isPending) {
    return <div>Loading books...</div>;
  }

  return (
    <div className="flex w-full justify-center">
      <div className="grid w-5/6 grid-cols-5 items-center gap-x-8 gap-y-4 pt-4">
        {books.map((book) => (
          <BookCard book={book} key={book.id} />
        ))}
      </div>
    </div>
  );
};

export default Page;
