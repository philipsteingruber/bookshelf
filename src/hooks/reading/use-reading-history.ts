import { useMemo } from "react";

import type { TRPCClientErrorLike } from "@trpc/client";

import { transformProgressHistory } from "@/lib/reading";
import type { ReadingProgressWithProgressSinceLast } from "@/lib/types";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

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
