"use client";

import { useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
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
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Separator } from "@/components/ui/separator";
import { useBooks } from "@/hooks/use-books";
import { useReadingGoals } from "@/hooks/use-reading-goal";
import { useReadingStats } from "@/hooks/use-reading-stats";
import {
  DASHBOARD_MAX_READ_NEXT_BOOKS,
  DASHBOARD_MAX_READING_BOOKS,
} from "@/lib/constants";

const Page = () => {
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
    paceMessage,
    pageCountThreshold,
    setGoal,
    isSettingGoal,
  } = useReadingGoals(books);

  const [goalDialogOpen, setGoalDialogOpen] = useState<boolean>(false);

  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  let sliceLength = Math.min(DASHBOARD_MAX_READING_BOOKS, readingBooksCount);
  const readingBooksToShow = readingBooks.slice(0, sliceLength);
  sliceLength = Math.min(DASHBOARD_MAX_READ_NEXT_BOOKS, readNextBooksCount);
  const readNextBooksToShow = readNextBooks.slice(0, sliceLength);

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
    <div className="flex h-full w-full flex-col p-4 pl-8">
      {readingBooksCount > 0 && (
        <div className="mb-8 flex flex-col gap-y-2">
          <StatusCategoryHeader
            text="Currently Reading"
            count={readingBooksCount}
          />
          <div className="flex gap-x-4">
            {readingBooksToShow.map((book) => (
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
              {readNextBooksToShow.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                  className="w-64 rounded-md"
                  showStatusButton={false}
                  priority
                />
              ))}
            </div>
          </div>
          <Separator className="my-8" />
        </>
      )}
      <div className="flex gap-x-4">
        <ReadingGoalCard
          currentCount={booksReadThisYear}
          goal={currentGoal}
          isOnTrack={isOnTrack}
          threshold={pageCountThreshold}
          onEditClick={() => setGoalDialogOpen(true)}
          paceMessage={paceMessage}
          progressPercentage={progressPercentage}
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

const StatusCategoryHeader = ({
  text,
  count,
}: {
  text: string;
  count: number;
}) => {
  return (
    <p className="mb-2 text-xl font-semibold">
      {text} <span className="text-primary text-md font-normal">({count})</span>
    </p>
  );
};

export default Page;
