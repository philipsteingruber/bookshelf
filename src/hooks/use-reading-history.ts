import { useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";

import {
  type ReadingProgressWithProgressSinceLast,
  transformProgressHistory,
} from "@/lib/reading-stats-utils";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

// Re-export for backward compatibility
export type { ReadingProgressWithProgressSinceLast };

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
    return transformProgressHistory(data?.readingProgressHistory || []);
  }, [data?.readingProgressHistory]);

  return { result, isPending, isError, error };
};
