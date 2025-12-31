"use client";

import BookCard from "@/components/books/book-card";
import DashboardCard, {
  DashboardCardProps,
} from "@/components/dashboard/dashboard-card";
import ReadingProgressCard from "@/components/dashboard/readingprogress-card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useBooks } from "@/hooks/use-books";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  BookCheckIcon,
  BookIcon,
  FlameIcon,
  TrendingUpIcon,
} from "lucide-react";

const Page = () => {
  const {
    readingBooksCount,
    readingBooks,
    isPending,
    isError,
    error,
    readNextBooks,
    readNextBooksCount,
    finishedThisYearBooksCount,
    readBooksCount,
  } = useBooks({
    sortBy: "title",
    sortDirection: "desc",
  });

  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  let sliceLength = Math.min(3, readingBooksCount);
  const topThreeReading = readingBooks.slice(0, sliceLength);
  sliceLength = Math.min(3, readNextBooksCount);
  const topThreeReadNext = readNextBooks.slice(0, sliceLength);

  const dashBoardCardData: DashboardCardProps[] = [
    {
      header: "BOOKS READ THIS YEAR",
      value: finishedThisYearBooksCount,
      footer: `${readBooksCount} total`,
      icon: BookCheckIcon,
    },
    {
      header: "CURRENTLY READING",
      value: readingBooksCount,
      footer: "Active books",
      icon: BookIcon,
    },
    {
      header: "PAGES TODAY",
      value: 61,
      footer: "126 this month",
      icon: TrendingUpIcon,
    },
    {
      header: "AVG. PAGES/DAY",
      value: 32,
      footer: "Last 30 days",
      icon: FlameIcon,
    },
  ];

  if (isPending) {
    return (
      <div className="flex size-full flex-col items-center justify-center">
        <Spinner className="size-30" />
        <span className="mt-4 text-xl">Loading...</span>
      </div>
    );
  }

  if (isError) {
    return <div>Error loading books: {error?.message}</div>;
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
        <>
          <div className="flex flex-col gap-y-2">
            <StatusCategoryHeader text="Up Next" count={readNextBooksCount} />
            <div className="flex gap-x-4">
              {topThreeReadNext.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                  className="width-1/6"
                  showStatusButton={false}
                  orientation="vertical"
                  priority
                />
              ))}
            </div>
          </div>
          <Separator className="my-8" />
        </>
      )}
      <div className="flex gap-x-4">
        {dashBoardCardData.map((item) => (
          <DashboardCard {...item} key={item.header} />
        ))}
      </div>
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
