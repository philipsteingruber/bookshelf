import { differenceInDays, startOfWeek, subDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import { calculatePagesFromProgress } from "@/lib/book";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import type {
  DailyStats,
  OverallStats,
  ReadingProgressWithBook,
  ReadingProgressWithProgressSinceLast,
  ReadingStats,
  StreakDetails,
  WeeklyStats,
  YearlyStats,
} from "@/lib/types/reading";

export const getYearInTimezone = (date: Date, timezone: string): number =>
  parseInt(formatInTimeZone(date, timezone, "yyyy"), 10);

/**
 * Gets today's date key in a specific timezone.
 */
const getTodayKey = (timezone: string): string => {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
};

/**
 * Gets yesterday's date key in a specific timezone.
 */
const getYesterdayKey = (timezone: string): string => {
  return formatInTimeZone(subDays(new Date(), 1), timezone, "yyyy-MM-dd");
};

/**
 * Transforms a chronologically-ordered array of reading progress entries
 * by adding `progressSinceLast` to each entry.
 *
 * @param history - Array of reading progress entries (must be in chronological order)
 * @returns Transformed array with progressSinceLast calculated for each entry
 */
export function transformProgressHistory(
  history: ReadingProgress[],
): ReadingProgressWithProgressSinceLast[] {
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
}

const groupByDay = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): Map<string, ReadingProgressWithBook[]> => {
  const grouped = new Map<string, ReadingProgressWithBook[]>();

  progress.forEach((entry) => {
    const dayKey = formatInTimeZone(entry.createdAt, timezone, "yyyy-MM-dd");
    const existing = grouped.get(dayKey) || [];
    grouped.set(dayKey, [...existing, entry]);
  });

  return grouped;
};
const groupByWeek = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): Map<string, ReadingProgressWithBook[]> => {
  const grouped = new Map<string, ReadingProgressWithBook[]>();

  progress.forEach((entry) => {
    // Convert to timezone first, then find week start
    const zonedDate = toZonedTime(entry.createdAt, timezone);
    const weekStart = startOfWeek(zonedDate, { weekStartsOn: 1 });
    const weekKey = formatInTimeZone(weekStart, timezone, "yyyy-MM-dd");
    const existing = grouped.get(weekKey) || [];
    grouped.set(weekKey, [...existing, entry]);
  });

  return grouped;
};

/**
 * Calculates total pages read for each day across all books.
 * For each day, sums up pages read from all books by comparing max progress
 * that day against the baseline (last progress before that day).
 */
const calculatePagesPerDay = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): Map<string, number> => {
  const validProgress = progress.filter((p) => p.book.pageCount != null && p.book.pageCount > 0);
  const progressByDay = groupByDay(validProgress, timezone);
  const pagesPerDay = new Map<string, number>();

  // Group all entries by book to find baselines
  const allEntriesByBook = new Map<number, ReadingProgressWithBook[]>();
  validProgress.forEach((entry) => {
    const bookEntries = allEntriesByBook.get(entry.bookId) || [];
    allEntriesByBook.set(entry.bookId, [...bookEntries, entry]);
  });

  // Sort dates chronologically
  const sortedDates = Array.from(progressByDay.keys()).sort();

  for (const dateKey of sortedDates) {
    const dayEntries = progressByDay.get(dateKey) || [];

    // Group day's entries by book
    const dayByBook = new Map<number, ReadingProgressWithBook[]>();
    dayEntries.forEach((entry) => {
      const bookEntries = dayByBook.get(entry.bookId) || [];
      dayByBook.set(entry.bookId, [...bookEntries, entry]);
    });

    let totalPagesForDay = 0;

    dayByBook.forEach((entries, bookId) => {
      const allBookEntries = allEntriesByBook.get(bookId) || [];

      // Find the last entry before this day for this book
      // Compare using the date key to ensure timezone consistency
      const entriesBeforeDay = allBookEntries
        .filter((e) => {
          const entryDateKey = formatInTimeZone(
            e.createdAt,
            timezone,
            "yyyy-MM-dd",
          );
          return entryDateKey < dateKey;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const baseline =
        entriesBeforeDay.length > 0 ? entriesBeforeDay[0].progress : 0;

      // Find this day's max progress
      const dayMaxProgress = Math.max(...entries.map((e) => e.progress));
      const progressGain = dayMaxProgress - baseline;

      totalPagesForDay += calculatePagesFromProgress(
        progressGain,
        entries[0].book.pageCount,
      );
    });

    pagesPerDay.set(dateKey, totalPagesForDay);
  }

  return pagesPerDay;
};

export const calculateDailyStats = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): DailyStats => {
  const validProgress = progress.filter((p) => p.book.pageCount != null && p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return { pagesToday: 0, pagesYesterday: 0, averagePagesPerDay: 0 };
  }

  const progressByDay = groupByDay(validProgress, timezone);
  const pagesPerDay = calculatePagesPerDay(validProgress, timezone);

  const today = getTodayKey(timezone);
  const yesterday = getYesterdayKey(timezone);

  const pagesToday = pagesPerDay.get(today) ?? 0;
  const pagesYesterday = pagesPerDay.get(yesterday) ?? 0;

  let totalPages = 0;
  const bookProgress = new Map<number, { max: number; pageCount: number | null }>();
  validProgress.forEach((entry) => {
    const current = bookProgress.get(entry.bookId);
    if (!current) {
      bookProgress.set(entry.bookId, {
        max: entry.progress,
        pageCount: entry.book.pageCount,
      });
    } else {
      current.max = Math.max(current.max, entry.progress);
    }
  });
  bookProgress.forEach(({ max, pageCount }) => {
    totalPages += calculatePagesFromProgress(max, pageCount);
  });

  const activeDays = progressByDay.size;
  const averagePagesPerDay = activeDays > 0 ? totalPages / activeDays : 0;

  return { pagesToday, pagesYesterday, averagePagesPerDay };
};

export const calculateWeeklyStats = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): WeeklyStats => {
  const validProgress = progress.filter((p) => p.book.pageCount != null && p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return {
      pagesThisWeek: 0,
      pagesLastWeek: 0,
    };
  }

  const progressByWeek = groupByWeek(validProgress, timezone);

  // Get current time in timezone, then find week starts
  const nowInTimezone = toZonedTime(new Date(), timezone);
  const thisWeekStart = startOfWeek(nowInTimezone, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(nowInTimezone, 7), {
    weekStartsOn: 1,
  });

  const thisWeekKey = formatInTimeZone(thisWeekStart, timezone, "yyyy-MM-dd");
  const lastWeekKey = formatInTimeZone(lastWeekStart, timezone, "yyyy-MM-dd");

  // Group all entries by book to find baselines
  const allEntriesByBook = new Map<number, ReadingProgressWithBook[]>();
  validProgress.forEach((entry) => {
    const bookEntries = allEntriesByBook.get(entry.bookId) || [];
    allEntriesByBook.set(entry.bookId, [...bookEntries, entry]);
  });

  const calculateWeekPages = (
    weekEntries: ReadingProgressWithBook[],
    weekStartKey: string,
  ): number => {
    // Group week entries by book
    const weekByBook = new Map<number, ReadingProgressWithBook[]>();
    weekEntries.forEach((entry) => {
      const bookEntries = weekByBook.get(entry.bookId) || [];
      weekByBook.set(entry.bookId, [...bookEntries, entry]);
    });

    let weekPages = 0;
    weekByBook.forEach((entries, bookId) => {
      const allBookEntries = allEntriesByBook.get(bookId) || [];

      // Find the last entry before this week started (compare week keys)
      const entriesBeforeWeek = allBookEntries
        .filter((e) => {
          const entryZoned = toZonedTime(e.createdAt, timezone);
          const entryWeekStart = startOfWeek(entryZoned, { weekStartsOn: 1 });
          const entryWeekKey = formatInTimeZone(
            entryWeekStart,
            timezone,
            "yyyy-MM-dd",
          );
          return entryWeekKey < weekStartKey;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const baseline =
        entriesBeforeWeek.length > 0 ? entriesBeforeWeek[0].progress : 0;

      // Find this week's max progress
      const weekMaxProgress = Math.max(...entries.map((e) => e.progress));
      const progressGain = weekMaxProgress - baseline;

      weekPages += calculatePagesFromProgress(
        progressGain,
        entries[0].book.pageCount,
      );
    });

    return weekPages;
  };

  const pagesThisWeek = calculateWeekPages(
    progressByWeek.get(thisWeekKey) || [],
    thisWeekKey,
  );
  const pagesLastWeek = calculateWeekPages(
    progressByWeek.get(lastWeekKey) || [],
    lastWeekKey,
  );

  return {
    pagesThisWeek,
    pagesLastWeek,
  };
};

export const calculateYearlyStats = (
  books: Book[],
  readingGoalThreshold: number,
  timezone: string = DEFAULT_TIMEZONE,
): YearlyStats => {
  const validBooks = books.filter(
    (book): book is Book & { finishedAt: Date; pageCount: number } =>
      book.finishedAt != null && book.pageCount != null && book.pageCount >= readingGoalThreshold,
  );

  if (validBooks.length === 0) return { booksFinishedByYear: [], pagesFinishedByYear: [] };

  const booksByYear = new Map<number, number>();
  const pagesByYear = new Map<number, number>();

  validBooks.forEach((book) => {
    const year = getYearInTimezone(book.finishedAt, timezone);

    booksByYear.set(year, (booksByYear.get(year) ?? 0) + 1);
    pagesByYear.set(year, (pagesByYear.get(year) ?? 0) + book.pageCount);
  });

  return {
    booksFinishedByYear: Array.from(booksByYear.entries(), ([year, count]) => ({
      year,
      count,
    })).sort((a, b) => b.year - a.year),
    pagesFinishedByYear: Array.from(pagesByYear.entries(), ([year, pages]) => ({
      year,
      pages,
    })).sort((a, b) => b.year - a.year),
  } satisfies YearlyStats;
};

export const calculateOverallStats = (
  progress: ReadingProgressWithBook[],
  timezone: string = DEFAULT_TIMEZONE,
): OverallStats => {
  const validProgress = progress.filter((p) => p.book.pageCount != null && p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return {
      activeDays: 0,
      totalPagesRead: 0,
      averagePagesPerWeek: 0,
      weeksActive: 0,
    };
  }

  const progressByDay = groupByDay(validProgress, timezone);
  const progressByWeek = groupByWeek(validProgress, timezone);

  const activeDays = progressByDay.size;
  const weeksActive = progressByWeek.size;

  const bookProgress = new Map<number, { max: number; pageCount: number | null }>();

  validProgress.forEach((entry) => {
    const current = bookProgress.get(entry.bookId);
    if (!current) {
      bookProgress.set(entry.bookId, {
        max: entry.progress,
        pageCount: entry.book.pageCount,
      });
    } else {
      current.max = Math.max(current.max, entry.progress);
    }
  });

  let totalPagesRead = 0;
  bookProgress.forEach(({ max, pageCount }) => {
    totalPagesRead += calculatePagesFromProgress(max, pageCount);
  });

  const averagePagesPerWeek =
    weeksActive > 0 ? Math.round(totalPagesRead / weeksActive) : 0;

  return { activeDays, totalPagesRead, averagePagesPerWeek, weeksActive };
};

/**
 * Returns all date keys (YYYY-MM-DD) that meet the minimum pages threshold, sorted chronologically.
 */
export const getQualifyingDays = (
  progress: ReadingProgressWithBook[],
  minimumPagesForStreak: number = 0,
  timezone: string = DEFAULT_TIMEZONE,
): string[] => {
  if (progress.length === 0) {
    return [];
  }

  const pagesPerDay = calculatePagesPerDay(progress, timezone);

  return Array.from(pagesPerDay.entries())
    .filter(([_, pages]) => pages >= minimumPagesForStreak)
    .map(([dateKey]) => dateKey)
    .sort();
};

/**
 * Helper to parse a date key (YYYY-MM-DD) into a Date object (UTC midnight).
 */
const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Helper to calculate difference in days between two date keys.
 */
const daysBetweenKeys = (key1: string, key2: string): number => {
  const date1 = parseDateKey(key1);
  const date2 = parseDateKey(key2);
  return differenceInDays(date2, date1);
};

export const calculateStreakDetails = (
  progress: ReadingProgressWithBook[],
  minimumPagesForStreak: number = 0,
  timezone: string = DEFAULT_TIMEZONE,
): StreakDetails => {
  if (progress.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
      streakStart: null,
    };
  }

  const activeDateKeys = getQualifyingDays(
    progress,
    minimumPagesForStreak,
    timezone,
  );

  if (activeDateKeys.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
      streakStart: null,
    };
  }

  const todayKey = getTodayKey(timezone);
  const yesterdayKey = getYesterdayKey(timezone);
  const isActiveToday = activeDateKeys.includes(todayKey);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;
  let streakStart: Date | null = null;

  // Calculate longest streak
  for (let i = 1; i < activeDateKeys.length; i++) {
    const daysDiff = daysBetweenKeys(activeDateKeys[i - 1], activeDateKeys[i]);

    if (daysDiff === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }

  longestStreak = Math.max(longestStreak, tempStreak);

  // Calculate current streak
  const lastActiveDateKey = activeDateKeys[activeDateKeys.length - 1];

  if (lastActiveDateKey === todayKey || lastActiveDateKey === yesterdayKey) {
    currentStreak = 1;
    streakStart = parseDateKey(lastActiveDateKey);

    for (let i = activeDateKeys.length - 2; i >= 0; i--) {
      const daysDiff = daysBetweenKeys(
        activeDateKeys[i],
        activeDateKeys[i + 1],
      );

      if (daysDiff === 1) {
        currentStreak++;
        streakStart = parseDateKey(activeDateKeys[i]);
      } else {
        break;
      }
    }
  } else {
    currentStreak = 0;
    streakStart = null;
  }

  return { currentStreak, longestStreak, isActiveToday, streakStart };
};

export const calculateReadingStats = (
  progress: ReadingProgressWithBook[],
  threshold?: number,
  timezone: string = DEFAULT_TIMEZONE,
): ReadingStats => {
  return {
    daily: calculateDailyStats(progress, timezone),
    weekly: calculateWeeklyStats(progress, timezone),
    overall: calculateOverallStats(progress, timezone),
    streak: calculateStreakDetails(progress, threshold ?? 0, timezone),
  };
};
