"use client";

import ReadingProgressCard from "@/components/books/readingprogress-card";
import { useBooks } from "@/hooks/use-books";

const Page = () => {
  const { readingBooksCount, readingBooks, isPending } = useBooks({
    sortBy: "progress",
    sortDirection: "desc",
  });
  const topThreeReading = readingBooks.slice(0, 3);

  if (isPending) {
  }

  return (
    <div className="flex h-full w-full flex-col p-4 pl-8">
      {readingBooksCount > 0 && (
        <div className="flex flex-col gap-y-2">
          <p className="text-xl font-semibold">
            Currently Reading{" "}
            <span className="text-primary text-md font-normal">
              ({readingBooksCount})
            </span>
          </p>
          <div className="flex gap-x-4">
            {topThreeReading.map((book) => (
              <ReadingProgressCard book={book} key={book.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;
