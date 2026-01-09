import { useMemo } from "react";

import { ReadingProgress } from "@/generated/prisma/client";
import { trpc } from "@/trpc/client";

export type ReadingProgressWithProgressSinceLast = ReadingProgress & {
  progressSinceLast: number;
};

export const useReadingHistory = (bookId: number) => {
  const { data, isPending, isError, error } =
    trpc.readingProgress.getProgressHistory.useQuery(bookId);

  const readingHistory: ReadingProgress[] = useMemo(
    () => data?.readingProgressHistory || [],
    [data?.readingProgressHistory],
  );

  const result: ReadingProgressWithProgressSinceLast[] = [];
  let lastProgress: number = 0;
  for (let index = 0; index < readingHistory.length; index++) {
    const element = readingHistory[index];

    result.push({
      ...element,
      progressSinceLast: element.progress - lastProgress,
    });
    lastProgress = element.progress;
  }

  return { result, isPending, isError, error };
};
