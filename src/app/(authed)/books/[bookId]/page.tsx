"use client";

import { use } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { TRPCError } from "@trpc/server";
import { PenIcon } from "lucide-react";

import BookDetailsCover from "@/components/books/book-details/book-details-cover";
import BookDetailsHeader from "@/components/books/book-details/book-details-header";
import { ReadingProgressEstimateCard } from "@/components/books/book-details/reading-progress-estimate-card";
import ReadingProgressHistory from "@/components/books/book-details/reading-progress-history";
import ReadingProgressHistoryGraph from "@/components/books/book-details/reading-progress-history-graph";
import ReadingStatusDialog from "@/components/books/book-details/reading-status-dialog";
import UpdateReadingProgressCard from "@/components/books/book-details/update-reading-progress-card";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Progress } from "@/components/ui/progress";
import { useBook } from "@/hooks/use-book";
import { useReadingHistory } from "@/hooks/use-reading-history";
import {
  aggregateByDay,
  calculateAveragePace,
  calculateTrendline,
  type ChartDataPoint,
  estimateCompletion,
} from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const Page = ({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): React.ReactElement => {
  const { bookId } = use(params);
  const { book, isPending, isForbidden, isNotFound, error, isReading } =
    useBook(bookId);
  const { result: readingHistory } = useReadingHistory(parseInt(bookId));

  // Calculate chart data and estimates
  const aggregatedData = aggregateByDay(readingHistory);
  const chartData: ChartDataPoint[] = aggregatedData.map((entry) => ({
    date: entry.createdAt,
    displayDate: "", // Not needed for calculation
    progress: entry.progress,
    progressSinceLast: entry.progressSinceLast,
    comments: entry.comments,
    fullDate: "",
    originalEntry: entry,
  }));

  const { slope } = calculateTrendline(chartData);
  const { estimatedDate, daysRemaining } = estimateCompletion(
    book?.progress ?? 0,
    slope,
    aggregatedData[aggregatedData.length - 1]?.createdAt ?? new Date(),
  );

  const { isSignedIn, isLoaded } = useAuth();

  const averagePace = calculateAveragePace(readingHistory);

  // Show loading state until Clerk has loaded - ensures server/client render the same thing
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
    <div className="flex h-full w-full flex-col items-center justify-center px-4 lg:px-0">
      <div className="flex h-full w-full flex-col justify-center px-4 lg:flex-row lg:px-8">
        <div className="flex w-full flex-col items-center gap-y-4 lg:w-3/4 lg:flex-row lg:items-start lg:gap-x-4">
          <div className="flex flex-col gap-y-4">
            <BookDetailsCover book={book} />
            <ReadingStatusDialog book={book} />
          </div>
          <div className="flex w-full flex-col gap-y-2 lg:w-3/4">
            <BookDetailsHeader book={book} className="w-3/4" />
            <div className="text-primary flex items-center gap-x-4">
              <div className="group flex cursor-pointer items-center gap-x-1 text-sm font-semibold">
                <span className="group-hover:underline">
                  {book.pageCount ? `${book.pageCount} pages` : "Pages not set"}
                </span>
                <PenIcon className="size-3" />
              </div>
              <span className="text-secondary align-middle">•</span>
              {book.publishedYear ? (
                <span className="text-sm">
                  Published{" "}
                  <span className="text-sm font-semibold">
                    {book.publishedYear}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-semibold">
                  Unknown publishing year
                </span>
              )}
            </div>
            {isReading && (
              <div className="relative w-full lg:w-3/4">
                <Progress value={book.progress} className="h-6 rounded-md" />
                <span className="absolute inset-0 flex items-center justify-center text-sm text-white">
                  {book.progress}% /{" "}
                  {`${Math.round((book.progress / 100) * book.pageCount)}/${book.pageCount} pages`}
                </span>
              </div>
            )}
            {isReading && <UpdateReadingProgressCard book={book} />}
            {book.summary && (
              <div
                className={cn(
                  "rounded-md p-1 text-sm leading-5 font-normal text-pretty whitespace-pre-line",
                  isReading
                    ? "h-auto max-h-[35%] w-full overflow-y-auto lg:w-3/4"
                    : "h-auto w-full max-w-full lg:w-2/3 lg:max-w-[57%]",
                )}
              >
                {book.summary}
              </div>
            )}
          </div>
        </div>
      </div>
      {book.status !== "READ_NEXT" && book.status !== "TO_READ" && (
        <div className="mt-4 flex w-full flex-col items-center justify-center gap-4 px-4 lg:flex-row">
          <ReadingProgressHistoryGraph
            readingHistory={readingHistory}
            className="hidden md:flex"
          />
          <div className="flex h-auto w-full max-w-4xl flex-1 flex-col gap-4 lg:h-[368px] lg:flex-row">
            <ReadingProgressEstimateCard
              currentProgress={book.progress}
              estimatedDate={estimatedDate}
              daysRemaining={daysRemaining}
              slope={slope}
              pageCount={book.pageCount}
              averagePace={averagePace}
            />
            <ReadingProgressHistory
              readingProgressHistory={readingHistory}
              book={book}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;
