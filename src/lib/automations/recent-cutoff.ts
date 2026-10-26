import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const RECENT_WINDOWS = ["24h", "today"] as const;
export type RecentWindow = (typeof RECENT_WINDOWS)[number];

export const isRecentWindow = (value: string): value is RecentWindow =>
  (RECENT_WINDOWS as readonly string[]).includes(value);

/**
 * Start of reading-status's "recent" window: either a rolling 24h, or the
 * most recent midnight in the user's own time zone (the same one streaks
 * and pages-read use), so "today" matches the day the app shows.
 */
export const getRecentCutoff = (window: RecentWindow, timeZone: string, now: Date = new Date()): Date => {
  if (window === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  return fromZonedTime(`${today}T00:00:00`, timeZone);
};
