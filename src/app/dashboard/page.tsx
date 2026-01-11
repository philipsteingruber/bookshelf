"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  BookCheckIcon,
  BookIcon,
  FlameIcon,
  TrendingUpIcon,
} from "lucide-react";

import BookCard from "@/components/books/book-card";
import type { DashboardCardProps } from "@/components/dashboard/dashboard-card";
import DashboardCard from "@/components/dashboard/dashboard-card";
import ReadingProgressCard from "@/components/dashboard/readingprogress-card";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Separator } from "@/components/ui/separator";
import { useBooks } from "@/hooks/use-books";

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
      value: 0,
      footer: "Coming Soon",
      icon: TrendingUpIcon,
      className: "opacity-50",
    },
    {
      header: "AVG. PAGES/DAY",
      value: 0,
      footer: "Coming Soon",
      icon: FlameIcon,
      className: "opacity-50",
    },
  ];

  if (isPending) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <ErrorState
        code={error?.data?.code}
        message={error?.message}
        linkText="Return to Dashboard"
        href="/dashboard"
      />
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
        <>
          <div className="flex flex-col gap-y-2">
            <StatusCategoryHeader text="Up Next" count={readNextBooksCount} />
            <div className="flex gap-x-4">
              {topThreeReadNext.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                  className="w-1/3 rounded-[6px]"
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
