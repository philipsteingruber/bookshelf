import { useEffect, useRef } from "react";

import { trpc } from "@/trpc/client";

/**
 * Hook that automatically syncs the user's browser timezone with the server.
 * Should be called once at app initialization (e.g., in a layout component).
 *
 * Only updates the server if:
 * 1. The user is authenticated
 * 2. The browser timezone differs from the stored timezone
 */
export const useTimezoneSync = (): void => {
  const hasSynced = useRef(false);
  const { data: timezoneData, isLoading } = trpc.user.getTimezone.useQuery(
    undefined,
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  );
  const { mutate: setTimezone } = trpc.user.setTimezone.useMutation();

  useEffect(() => {
    // Only run once
    if (hasSynced.current || isLoading || !timezoneData) {
      return;
    }

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const storedTimezone = timezoneData.timezone;

    // Sync if timezones differ
    if (browserTimezone && browserTimezone !== storedTimezone) {
      setTimezone(browserTimezone);
    }

    hasSynced.current = true;
  }, [isLoading, timezoneData, setTimezone]);
};
