"use client";

import ReadStatusButton from "@/components/books/readstatus-button";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Progress } from "@/components/ui/progress";
import { useBook } from "@/hooks/use-book";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { TRPCError } from "@trpc/server";
import { BookIcon, PenIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { book, isPending, isForbidden, isNotFound, error, isReading } =
    useBook(bookId);
  const coverUrl = book?.coverUrl || BOOK_COVER_PLACEHOLDER_URL;

  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (isPending) {
    return <LoadingState />;
  }

  if (isForbidden || isNotFound) {
    const err = error as TRPCError;
    return <ErrorState code={err.code} />;
  }
  if (isNotFound || !book) {
    return <ErrorState code="NOT_FOUND" />;
  }

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-2/3 justify-center gap-x-4">
        <div className="flex flex-col gap-y-4">
          <Link href={coverUrl} target="_blank">
            <Image
              src={coverUrl}
              alt={`${book.title} cover`}
              width={400}
              height={600}
              className="rounded-[6px]"
            />
          </Link>
          <ReadStatusButton book={book} className="w-full rounded-[5px]" />
        </div>
        <div className="flex w-2/3 flex-col gap-y-2">
          {book.series && book.seriesIndex && (
            <p className="font-sm font-serif font-light italic">{`${book.series} #${book.seriesIndex}`}</p>
          )}
          <Link
            href={`https://www.goodreads.com/search?utf8=%E2%9C%93&q=${book.title}+${book.author}&search_type=books&search%5Bfield%5D=on`}
            target="_blank"
          >
            <span className="font-serif text-4xl font-semibold">
              {book.title}
            </span>
          </Link>
          <span className="font-serif text-xl">{book.author}</span>
          <div className="text-primary flex items-center gap-x-4">
            <div className="group flex items-center gap-x-1 text-sm font-semibold">
              <BookIcon className="size-3" />
              <span className="group-hover:underline">
                {book.pageCount ? book.pageCount : "Pages not set"}
              </span>
              <PenIcon className="size-3" />
            </div>
            <span className="text-secondary">•</span>
            <span className="text-sm">Published {book.publishedYear}</span>
          </div>
          {isReading && (
            <div className="relative w-3/4">
              <Progress value={book.progress} className="h-6 rounded-xs" />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-white">
                {book.progress}%
              </span>
            </div>
          )}
          <div className="w-3/4 text-xs leading-5 font-semibold text-pretty whitespace-pre-line">
            {book.summary || ""}
          </div>
        </div>
      </div>
    </div>
  );
}
