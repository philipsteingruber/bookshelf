"use client";

import { use } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { TRPCError } from "@trpc/server";

import { EditBookForm } from "@/components/books/edit-form/edit-form";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { useBook } from "@/hooks/book";

const Page = ({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): React.ReactElement => {
  const { bookId } = use(params);

  const { book, error, isNotFound, isPending, isForbidden } = useBook(bookId);
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded || isPending) {
    return <LoadingState />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }
  if (isForbidden || isNotFound) {
    const err = error as TRPCError;
    return <ErrorState code={err.code} />;
  }
  if (isNotFound || !book) {
    return <ErrorState code="NOT_FOUND" />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <EditBookForm book={book} />
    </div>
  );
};

export default Page;
