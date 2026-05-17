"use client";

import React from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { BookIcon, FileTextIcon } from "lucide-react";

import DashboardCard from "@/components/dashboard/dashboard-card";
import LoadingState from "@/components/loading-state";
import ReadingGoalHistoryTable from "@/components/reading-goals/reading-goal-history-table";
import { useReadingGoals } from "@/hooks/reading";

const Page = (): React.ReactElement => {
  const {
    goalHistory,
    isPending: isLoadingGoals,
    booksReadThisYear,
    pagesReadThisYear,
    onPaceForBooks,
    onPaceForPages,
  } = useReadingGoals();
  const { userId } = useAuth();

  if (!userId) {
    return <RedirectToSignIn />;
  }
  if (isLoadingGoals) {
    return <LoadingState />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center gap-8 p-8">
      <div className="grid w-3/5 grid-cols-1 gap-4 sm:grid-cols-2">
        <DashboardCard
          header="BOOKS READ THIS YEAR"
          value={booksReadThisYear}
          footer={`On pace for ${onPaceForBooks} by Dec 31`}
          icon={BookIcon}
        />
        <DashboardCard
          header="PAGES READ THIS YEAR"
          value={pagesReadThisYear}
          footer={`On pace for ${onPaceForPages} by Dec 31`}
          icon={FileTextIcon}
        />
      </div>
      <div className="flex w-3/5 flex-col items-center justify-center">
        <ReadingGoalHistoryTable data={goalHistory} />
      </div>
    </div>
  );
};

export default Page;
