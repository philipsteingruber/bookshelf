"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { PenIcon } from "lucide-react";

import DeleteBookDialog from "@/components/books/book-details/delete-book-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Book } from "@/generated/prisma/client";

const BookDetailsHeader = ({
  book,
  className,
}: {
  book: Book;
  className?: string;
}): React.ReactElement => {
  const router = useRouter();

  return (
    <div className={className}>
      {book.series && book.seriesIndex && (
        <p className="font-serif text-sm font-light italic">{`${book.series} #${book.seriesIndex}`}</p>
      )}
      <div className="flex w-full items-center justify-between gap-x-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={`https://www.goodreads.com/search?utf8=%E2%9C%93&q=${book.title}+${book.author}&search_type=books&search%5Bfield%5D=on`}
              target="_blank"
              className="w-fit font-serif text-4xl font-semibold whitespace-nowrap hover:underline"
            >
              {book.title}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>{`Search "${book.title} ${book.author}" on GoodReads`}</p>
          </TooltipContent>
        </Tooltip>
        <div className="flex gap-x-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => router.push(`/books/${book.id}/edit`)}>
                <PenIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit book details</TooltipContent>
          </Tooltip>
          <DeleteBookDialog book={book} />
        </div>
      </div>
      <span className="font-serif text-xl italic">{book.author}</span>
    </div>
  );
};

export default BookDetailsHeader;
