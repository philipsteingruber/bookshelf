"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { formatInTimeZone } from "date-fns-tz";
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
import ReadingProgressCard from "@/components/dashboard/reading-progress-card";
import SetGoalDialog from "@/components/dashboard/set-goal-dialog";
import StatusCategoryHeader from "@/components/dashboard/status-category-header";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDashBoardData } from "@/hooks/book/use-dashboard-data";
import { useReadingGoals, useReadingStats } from "@/hooks/reading";
import { useBreakPoint, useDialogState } from "@/hooks/ui";
import {
  getDashboardMaxReadingBooksCount,
  getDashboardMaxReadNextBooksCount,
  getDashboardRecentlyReadBooksCount,
} from "@/lib/reading";
import { trpc } from "@/trpc/client";

const Page = (): React.ReactElement => {
  const {
    readingBooksCount,
    readingBooks,
    isPending,
    isError,
    error,
    readNextBooks,
    readNextBooksCount,
    recentlyReadBooks,
  } = useDashBoardData();

  const {
    pagesToday,
    pagesYesterday,
    avgPagesPerDay,
    avgPagesPerWeek,
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
  } = useReadingGoals();

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

  const recentlyReadBooksToShowCount = Math.min(
    getDashboardRecentlyReadBooksCount(breakPoint),
    recentlyReadBooks.length,
  );
  const recentlyReadBooksToShow = recentlyReadBooks.slice(
    0,
    recentlyReadBooksToShowCount,
  );

  const {
    isOpen: isReadingGoalDialogOpen,
    setIsOpen: setIsReadingGoalDialogOpen,
  } = useDialogState();

  const { data: timezoneData } = trpc.user.getTimezone.useQuery();

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
      footer: `${pagesYesterday} pages read yesterday`,
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
      {readingBooksToShowCount > 0 && (
        <div className="mb-4 flex w-full flex-1 flex-col items-center gap-y-2 md:items-start xl:h-full xl:w-4/5">
          <StatusCategoryHeader
            text="Currently Reading"
            count={readingBooksCount}
            visibleCount={readingBooksToShowCount}
            href="/books?status=READING"
          />
          <div className="flex h-full flex-wrap justify-center gap-4 lg:justify-start xl:flex-nowrap xl:justify-start xl:gap-x-4 xl:overflow-x-auto">
            {readingBooksToShow.map((book) =>
              breakPoint === "sm" ? (
                <BookCard
                  book={book}
                  key={book.id}
                  showStatusButton={false}
                  className="w-64"
                />
              ) : (
                <ReadingProgressCard
                  book={book}
                  key={book.id}
                  className="w-full min-w-[240px] md:w-[450px] md:max-w-[500px] xl:h-full"
                />
              ),
            )}
          </div>
        </div>
      )}
      <div className="mb-4 flex w-full flex-col items-center gap-y-4 md:items-start md:gap-x-8 md:pr-4 xl:flex-row">
        {readNextBooksToShowCount > 0 && (
          <div className="flex w-full flex-1 flex-col items-center gap-y-2 md:w-3/5 md:items-start">
            <StatusCategoryHeader
              text="Up Next"
              count={readNextBooksCount}
              visibleCount={readNextBooksToShowCount}
              href="/books?status=READ_NEXT"
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
              href="/books?status=READ"
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
                    <TooltipContent>{`Finished on ${book.finishedAt ? formatInTimeZone(book.finishedAt, timezoneData?.timezone ?? "UTC", "PP") : ""}`}</TooltipContent>
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
          onEditClick={() => setIsReadingGoalDialogOpen(true)}
          paceMessage={paceMessage}
          progressPercentage={progressPercentage}
          expectedAtThisPoint={expectedAtThisPoint}
        />
        <SetGoalDialog
          open={isReadingGoalDialogOpen}
          onOpenChange={setIsReadingGoalDialogOpen}
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
