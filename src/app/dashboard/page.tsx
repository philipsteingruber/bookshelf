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
import RecentlyReadCard from "@/components/dashboard/recently-read-card";
import SetGoalDialog from "@/components/dashboard/set-goal-dialog";
import StatusCategoryHeader from "@/components/dashboard/status-category-header";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { ReadStatus } from "@/generated/prisma/enums";
import { useBooks } from "@/hooks/use-books";
import { useReadingGoals } from "@/hooks/use-reading-goals";
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

  const recentlyReadBooks = books
    .filter(
      (book) =>
        book.status === ReadStatus.READ &&
        book.finishedAt &&
        startOfDay(book.finishedAt) > startOfDay(subWeeks(new Date(), 2)),
    )
    .sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime())
    .slice(0, 3);

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
    setThreshold,
    isSettingThreshold,
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
        <div className="mb-4 flex w-4/5 flex-1 flex-col gap-y-2">
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
      <div className="mb-4 flex w-full gap-x-8 pr-4">
        {readNextBooksCount > 0 && (
          <div className="flex w-3/5 flex-1 flex-col gap-y-2">
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
        )}
        {recentlyReadBooks.length > 0 && (
          <RecentlyReadCard books={recentlyReadBooks} className="w-2/5" />
        )}
      </div>
      <div className="flex gap-x-4">
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
