"use client";

import React from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import LoadingState from "@/components/loading-state";
import ReadingGoalHistoryTable from "@/components/reading-goals/reading-goal-history-table";
import { useReadingGoals } from "@/hooks/reading";

const Page = (): React.ReactElement => {
  const { goalHistory, isPending: isLoadingGoals } = useReadingGoals();
  const { userId } = useAuth();

  if (!userId) {
    return <RedirectToSignIn />;
  }
  if (isLoadingGoals) {
    return <LoadingState />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex w-3/5 flex-col items-center justify-center">
        <ReadingGoalHistoryTable data={goalHistory} />
      </div>
    </div>
  );
};

export default Page;
