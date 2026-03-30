"use client";

import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { trpc } from "@/trpc/client";

export const useTimezone = (): string => {
  const { data } = trpc.user.getTimezone.useQuery(undefined, {
    staleTime: Infinity,
  });
  return data?.timezone ?? DEFAULT_TIMEZONE;
};
