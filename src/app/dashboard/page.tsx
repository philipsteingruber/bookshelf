"use client";

import BookCard from "@/components/books/book-card";
import ReadingProgressCard from "@/components/books/readingprogress-card";
import { Spinner } from "@/components/ui/spinner";
import { useBooks } from "@/hooks/use-books";

const Page = () => {
  const {
    readingBooksCount,
    readingBooks,
    isPending,
    readNextBooks,
    readNextBooksCount,
  } = useBooks({
    sortBy: "title",
    sortDirection: "desc",
  });

  let sliceLength = Math.min(3, readingBooksCount);
  const topThreeReading = readingBooks.slice(0, sliceLength);
  sliceLength = Math.min(3, readNextBooksCount);
  const topThreeReadNext = readNextBooks.slice(0, sliceLength);

  if (isPending) {
    return (
      <div className="flex size-full flex-col items-center justify-center">
        <Spinner className="size-40" />
        <span className="mt-4 text-xl">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-4 pl-8">
      {readingBooksCount > 0 && (
        <div className="mb-8 flex flex-col gap-y-2">
          <StatusCategoryHeader
            text="Currently Reading"
            count={readingBooksCount}
          />
          <div className="flex gap-x-4">
            {topThreeReading.map((book) => (
              <ReadingProgressCard book={book} key={book.id} />
            ))}
          </div>
        </div>
      )}
      {readNextBooksCount > 0 && (
        <div className="mb-8 flex flex-col gap-y-2">
          <StatusCategoryHeader text="Up Next" count={readNextBooksCount} />
          <div className="flex gap-x-4">
            {topThreeReadNext.map((book) => (
              <BookCard
                book={book}
                key={book.id}
                className="width-1/6"
                showStatusButton={false}
                orientation="vertical"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatusCategoryHeader = ({
  text,
  count,
}: {
  text: string;
  count: number;
}) => {
  return (
    <p className="text-xl font-semibold">
      {text} <span className="text-primary text-md font-normal">({count})</span>
    </p>
  );
};

export default Page;
