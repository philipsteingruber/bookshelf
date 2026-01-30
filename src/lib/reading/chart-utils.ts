import {
  differenceInDays,
  format,
  isSameYear,
  isToday,
  isYesterday,
  startOfDay,
} from "date-fns";

import type { ReadingProgressWithProgressSinceLast } from "@/lib/types";

/**
 * Formats a date as a relative string for chart display
 * - "Today" / "Yesterday" for very recent
 * - "3d ago" for last week
 * - "2w ago" for last month
 * - "Jan 5" for older dates
 * - "Tomorrow" / "+2d" / "Jan 5" for future dates
 */
export const formatRelativeDate = (date: Date): string => {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";

  const today = startOfDay(new Date());
  const targetDay = startOfDay(date);
  const daysDiff = differenceInDays(today, targetDay);

  // Handle future dates (for projected trendline)
  if (daysDiff < 0) {
    const futureDays = Math.abs(daysDiff);
    if (futureDays === 1) return "Tomorrow";
    if (futureDays < 7) return `+${futureDays}d`;
    if (futureDays < 30) return `+${Math.floor(futureDays / 7)}w`;
    return format(date, "MMM d");
  }

  if (daysDiff < 7) return `${daysDiff}d ago`;
  if (daysDiff < 30) return `${Math.floor(daysDiff / 7)}w ago`;

  return format(date, "MMM d");
};

/**
 * Formats a date as a full timestamp for display in tooltips/modals
 * Example: "Jan 9, 2026 at 3:45 PM"
 */
export const formatFullTimestamp = (date: Date): string => {
  return format(date, "PPpp");
};

/**
 * Formats a date for estimated completion display
 * Shows year only if different from current year
 * Example: "January 15" or "January 15, 2027"
 */
export const formatEstimatedDate = (date: Date): string => {
  return format(date, isSameYear(date, new Date()) ? "MMMM d" : "MMMM d, yyyy");
};

/**
 * Aggregates reading progress entries by day
 * If multiple entries exist for the same day, keeps the latest one
 * Returns sorted array (oldest to newest)
 */
export const aggregateByDay = (
  readingHistory: ReadingProgressWithProgressSinceLast[],
): ReadingProgressWithProgressSinceLast[] => {
  const byDay = new Map<number, ReadingProgressWithProgressSinceLast>();

  readingHistory.forEach((entry) => {
    const dayKey = startOfDay(entry.createdAt).getTime();
    const existing = byDay.get(dayKey);

    if (!existing || entry.createdAt > existing.createdAt) {
      byDay.set(dayKey, entry);
    }
  });

  return Array.from(byDay.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
};

/**
 * Chart data point structure with all necessary display information
 */
export interface ChartDataPoint {
  date: Date;
  displayDate: string;
  progress: number;
  progressSinceLast: number;
  comments: string | null;
  fullDate: string;
  originalEntry: ReadingProgressWithProgressSinceLast;
}

/**
 * Calculates linear regression trendline for reading progress
 * Returns trendline data points and slope (progress per day)
 * Extends trendline to 100% if book not yet finished
 *
 * Note: Expects data to already be aggregated by day (one entry per day).
 * Use aggregateByDay() before calling this function.
 */
export const calculateTrendline = (
  data: ChartDataPoint[],
): {
  trendlineData: { displayDate: string; trend: number }[];
  slope: number;
  intercept: number;
} => {
  if (data.length < 2) {
    return { trendlineData: [], slope: 0, intercept: 0 };
  }

  // Convert dates to numeric: days since first entry (normalized to start of day)
  const startDate = startOfDay(data[0].date).getTime();
  const points = data.map((d) => ({
    x: (startOfDay(d.date).getTime() - startDate) / (1000 * 60 * 60 * 24), // days
    y: d.progress,
  }));

  // Calculate means
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  // Calculate slope (m) and intercept (b) for y = mx + b
  const numerator = points.reduce(
    (sum, p) => sum + (p.x - meanX) * (p.y - meanY),
    0,
  );
  const denominator = points.reduce(
    (sum, p) => sum + Math.pow(p.x - meanX, 2),
    0,
  );

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  // Generate trendline points for visualization (one per day)
  const trendlineData: { displayDate: string; trend: number }[] = [];

  data.forEach((d) => {
    const x =
      (startOfDay(d.date).getTime() - startDate) / (1000 * 60 * 60 * 24);
    trendlineData.push({
      displayDate: d.displayDate,
      trend: Math.max(0, Math.min(100, slope * x + intercept)),
    });
  });

  // Extend trendline with daily projected points if not at 100%
  const lastProgress = data[data.length - 1].progress;
  const MAX_PROJECTED_DAYS = 14;

  if (lastProgress < 100 && slope > 0) {
    const lastX = points[points.length - 1].x;
    const lastDate = startOfDay(data[data.length - 1].date);

    // Add daily projection points until 100% or max days reached
    for (let dayOffset = 1; dayOffset <= MAX_PROJECTED_DAYS; dayOffset++) {
      const projectedX = lastX + dayOffset;
      const projectedTrend = slope * projectedX + intercept;

      const projectedDate = new Date(lastDate);
      projectedDate.setDate(projectedDate.getDate() + dayOffset);

      trendlineData.push({
        displayDate: formatRelativeDate(projectedDate),
        trend: Math.min(100, projectedTrend),
      });

      // Stop if we've reached 100%
      if (projectedTrend >= 100) {
        break;
      }
    }
  }

  return { trendlineData, slope, intercept };
};

/**
 * Estimates completion date based on reading pace
 * Returns null if no progress or book already finished
 */
export const estimateCompletion = (
  currentProgress: number,
  slope: number,
  lastUpdateDate: Date,
): { estimatedDate: Date | null; daysRemaining: number | null } => {
  if (slope <= 0 || currentProgress >= 100) {
    return { estimatedDate: null, daysRemaining: null };
  }

  const remainingProgress = 100 - currentProgress;
  const daysRemaining = Math.ceil(remainingProgress / slope);

  const estimatedDate = new Date(lastUpdateDate);
  estimatedDate.setDate(estimatedDate.getDate() + daysRemaining);

  return { estimatedDate, daysRemaining };
};

export const calculateAveragePace = (
  readingHistory: ReadingProgressWithProgressSinceLast[],
): number => {
  if (readingHistory.length < 2) {
    return 0;
  }

  const sortedHistory = [...readingHistory].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const firstEntry = sortedHistory[0];
  const lastEntry = sortedHistory[sortedHistory.length - 1];

  const daysElapsed = differenceInDays(
    startOfDay(lastEntry.createdAt),
    startOfDay(firstEntry.createdAt),
  );

  if (daysElapsed === 0) {
    return 0;
  }

  return lastEntry.progress / daysElapsed;
};

/**
 * Ensures chart data starts at 0% by prepending a synthetic baseline entry
 * if the first aggregated entry isn't already at 0%.
 * This provides accurate visual representation of the full reading journey.
 */
export function ensureZeroBaseline(
  data: ReadingProgressWithProgressSinceLast[],
): ReadingProgressWithProgressSinceLast[] {
  if (data.length === 0 || data[0].progress === 0) {
    return data;
  }

  const firstEntry = data[0];
  const syntheticEntry: ReadingProgressWithProgressSinceLast = {
    id: `synthetic-baseline-${firstEntry.bookId}`,
    bookId: firstEntry.bookId,
    userId: firstEntry.userId,
    progress: 0,
    comments: null,
    createdAt: startOfDay(firstEntry.createdAt),
    updatedAt: startOfDay(firstEntry.createdAt),
    progressSinceLast: 0,
  };

  return [syntheticEntry, ...data];
}
