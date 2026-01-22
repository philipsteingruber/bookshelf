import { useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";

import type { ReadingProgress } from "@/generated/prisma/client";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

export type ReadingProgressWithProgressSinceLast = ReadingProgress & {
  progressSinceLast: number;
};

interface UseReadingHistoryReturn {
  result: ReadingProgressWithProgressSinceLast[];
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | null;
}

export const useReadingHistory = (bookId: number): UseReadingHistoryReturn => {
  const { data, isPending, isError, error } =
    trpc.readingProgress.getProgressHistory.useQuery(bookId);

  const result = useMemo(() => {
    const history = data?.readingProgressHistory || [];
    const transformed: ReadingProgressWithProgressSinceLast[] = [];
    let lastProgress = 0;

    history.forEach((element) => {
      transformed.push({
        ...element,
        progressSinceLast: element.progress - lastProgress,
      });
      lastProgress = element.progress;
    });

    return transformed;
  }, [data?.readingProgressHistory]);

  return { result, isPending, isError, error };
};
