"use client";

import { useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { startOfDay, subWeeks } from "date-fns";
import {
  BookOpenIcon,
  CalendarIcon,
  FlameIcon,
  TrendingUpIcon,
} from "lucide-react";

import BookCard from "@/components/books/book-card";
import type { DashboardCardProps } from "@/components/dashboard/dashboard-card";
import DashboardCard from "@/components/dashboard/dashboard-card";
import ReadingGoalCard from "@/components/dashboard/reading-goal-card";
import ReadingProgressCard from "@/components/dashboard/readingprogress-card";
import SetGoalDialog from "@/components/dashboard/set-goal-dialog";
import StatusCategoryHeader from "@/components/dashboard/status-category-header";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReadStatus } from "@/generated/prisma/enums";
import { useBooks } from "@/hooks/use-books";
import { useBreakPoint } from "@/hooks/use-breakpoint";
import { useReadingGoals } from "@/hooks/use-reading-goals";
import { useReadingStats } from "@/hooks/use-reading-stats";
import {
  getDashboardMaxReadingBooksCount,
  getDashboardMaxReadNextBooksCount,
  getDashboardRecentlyReadBooksCount,
} from "@/lib/dashboard-utils";

const Page = (): React.ReactElement => {
  const {
    readingBooksCount,
    readingBooks,
    isPending,
    isError,
    error,
    readNextBooks,
    readNextBooksCount,
    books,
  } = useBooks({
    sortBy: "updatedAt",
    sortDirection: "desc",
  });

  const {
    pagesToday,
    avgPagesPerDay,
    avgPagesPerWeek,
    totalPagesRead,
    pagesThisWeek,
    pagesLastWeek,
  } = useReadingStats();

  const {
    currentGoal,
    booksReadThisYear,
    progressPercentage,
    isOnTrack,
    expectedAtThisPoint,
    paceMessage,
    pageCountThreshold,
    setGoal,
    isSettingGoal,
    setThreshold,
    isSettingThreshold,
  } = useReadingGoals(books);

  const breakPoint = useBreakPoint();
  const readingBooksToShowCount = Math.min(
    getDashboardMaxReadingBooksCount(breakPoint),
    readingBooksCount,
  );
  const readingBooksToShow = readingBooks.slice(0, readingBooksToShowCount);

  const readNextBooksToShowCount = Math.min(
    getDashboardMaxReadNextBooksCount(breakPoint),
    readNextBooksCount,
  );
  const readNextBooksToShow = readNextBooks.slice(0, readNextBooksToShowCount);

  const recentlyReadBooks = books
    .filter(
      (book) =>
        book.status === ReadStatus.READ &&
        book.finishedAt &&
        startOfDay(book.finishedAt) > startOfDay(subWeeks(new Date(), 2)),
    )
    .sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime());
  const recentlyReadBooksToShowCount = Math.min(
    getDashboardRecentlyReadBooksCount(breakPoint),
    recentlyReadBooks.length,
  );
  const recentlyReadBooksToShow = recentlyReadBooks.slice(
    0,
    recentlyReadBooksToShowCount,
  );

  const [goalDialogOpen, setGoalDialogOpen] = useState<boolean>(false);

  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  const dashBoardCardData: DashboardCardProps[] = [
    {
      header: "CURRENTLY READING",
      value: readingBooksCount,
      footer: "Active books",
      icon: BookOpenIcon,
    },
    {
      header: "PAGES TODAY",
      value: pagesToday,
      footer: `${totalPagesRead} total pages read`,
      icon: TrendingUpIcon,
    },
    {
      header: "AVG. PAGES/DAY",
      value: avgPagesPerDay,
      footer: `${avgPagesPerWeek} per week`,
      icon: FlameIcon,
    },
    {
      header: "PAGES THIS WEEK",
      value: pagesThisWeek,
      footer: `${pagesLastWeek} pages last week`,
      icon: CalendarIcon,
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
    <div className="flex h-full w-full flex-col p-4 pl-4 md:pl-8">
      {process.env.NODE_ENV === "development" && (
        <span className="fixed top-0 left-0 z-50 bg-red-500 p-2 text-white">
          {breakPoint} - {window.innerWidth}px
        </span>
      )}
      {readingBooksCount > 0 && (
        <div className="mb-4 flex w-full flex-1 flex-col items-center gap-y-2 md:items-start xl:h-full xl:w-4/5">
          <StatusCategoryHeader
            text="Currently Reading"
            count={readingBooksCount}
            visibleCount={readingBooksToShowCount}
          />
          <div className="flex flex-wrap justify-center gap-4 md:flex-nowrap md:justify-start md:gap-x-4 md:overflow-x-auto xl:h-full">
            {readingBooksToShow.map((book) =>
              breakPoint === "sm" ? (
                <BookCard
                  book={book}
                  key={book.id}
                  showStatusButton={false}
                  className="w-64"
                />
              ) : (
                <ReadingProgressCard book={book} key={book.id} />
              ),
            )}
          </div>
        </div>
      )}
      <div className="mb-4 flex w-full flex-col items-center gap-y-4 md:pr-4 md:gap-x-8 lg:flex-row lg:items-start">
        {readNextBooksCount > 0 && (
          <div className="flex w-full flex-1 flex-col items-center gap-y-2 md:w-3/5 md:items-start">
            <StatusCategoryHeader
              text="Up Next"
              count={readNextBooksCount}
              visibleCount={readNextBooksToShowCount}
            />
            <div className="flex flex-wrap justify-center gap-4 md:flex-nowrap md:justify-start md:gap-x-4">
              {readNextBooksToShow.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                  className="w-64"
                  showStatusButton={false}
                  priority
                />
              ))}
            </div>
          </div>
        )}
        {recentlyReadBooksToShowCount > 0 && (
          <div className="mb-8 flex w-full flex-col items-center gap-y-2 md:w-2/5 md:items-start">
            <StatusCategoryHeader
              text="Recently Finished"
              count={recentlyReadBooks.length}
              visibleCount={recentlyReadBooksToShowCount}
            />
            <div className="flex h-full w-full flex-wrap justify-center gap-4 md:flex-nowrap md:justify-start md:gap-x-4">
              {recentlyReadBooksToShow.map((book) => {
                return (
                  <Tooltip key={book.id}>
                    <TooltipTrigger asChild>
                      <div>
                        <BookCard
                          book={book}
                          showStatusButton={false}
                          className="w-64 rounded-md"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{`Finished on ${book.finishedAt?.toLocaleDateString()}`}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:flex xl:gap-x-4">
        <ReadingGoalCard
          currentCount={booksReadThisYear}
          goal={currentGoal}
          isOnTrack={isOnTrack}
          threshold={pageCountThreshold}
          setThreshold={setThreshold}
          isSettingThreshold={isSettingThreshold}
          onEditClick={() => setGoalDialogOpen(true)}
          paceMessage={paceMessage}
          progressPercentage={progressPercentage}
          expectedAtThisPoint={expectedAtThisPoint}
        />
        <SetGoalDialog
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
          currentGoal={currentGoal}
          onSave={setGoal}
          isSaving={isSettingGoal}
        />
        {dashBoardCardData.map((item) => (
          <DashboardCard {...item} key={item.header} />
        ))}
      </div>
    </div>
  );
};

export default Page;
