import {
  differenceInDays,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import { calculatePagesFromProgress } from "@/lib/book";
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
): Map<string, ReadingProgressWithBook[]> => {
  const grouped = new Map<string, ReadingProgressWithBook[]>();

  progress.forEach((entry) => {
    const dayKey = format(startOfDay(entry.createdAt), "yyyy-MM-dd");
    const existing = grouped.get(dayKey) || [];
    grouped.set(dayKey, [...existing, entry]);
  });

  return grouped;
};
const groupByWeek = (
  progress: ReadingProgressWithBook[],
): Map<string, ReadingProgressWithBook[]> => {
  const grouped = new Map<string, ReadingProgressWithBook[]>();

  progress.forEach((entry) => {
    const weekStart = startOfWeek(entry.createdAt, { weekStartsOn: 1 });
    const weekKey = format(weekStart, "yyyy-MM-dd");
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
): Map<string, number> => {
  const validProgress = progress.filter((p) => p.book.pageCount > 0);
  const progressByDay = groupByDay(validProgress);
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

    // Parse date for comparison
    const [year, month, day] = dateKey.split("-").map(Number);
    const dayStart = new Date(year, month - 1, day);

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
      const entriesBeforeDay = allBookEntries
        .filter((e) => e.createdAt < dayStart)
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
): DailyStats => {
  const validProgress = progress.filter((p) => p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return { pagesToday: 0, averagePagesPerDay: 0 };
  }

  const progressByDay = groupByDay(validProgress);

  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayEntries = progressByDay.get(today) || [];

  const todayByBook = new Map<number, ReadingProgressWithBook[]>();
  todayEntries.forEach((entry) => {
    const bookEntries = todayByBook.get(entry.bookId) || [];
    todayByBook.set(entry.bookId, [...bookEntries, entry]);
  });

  // Group all entries by book to find previous day's baseline
  const allEntriesByBook = new Map<number, ReadingProgressWithBook[]>();
  validProgress.forEach((entry) => {
    const bookEntries = allEntriesByBook.get(entry.bookId) || [];
    allEntriesByBook.set(entry.bookId, [...bookEntries, entry]);
  });

  let pagesToday = 0;
  todayByBook.forEach((todayEntries, bookId) => {
    const allBookEntries = allEntriesByBook.get(bookId) || [];
    const todayStart = startOfDay(new Date());

    // Find the last entry before today for this book
    const entriesBeforeToday = allBookEntries
      .filter((e) => e.createdAt < todayStart)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const baseline =
      entriesBeforeToday.length > 0 ? entriesBeforeToday[0].progress : 0;

    // Find today's max progress
    const todayMaxProgress = Math.max(...todayEntries.map((e) => e.progress));
    const progressGain = todayMaxProgress - baseline;

    pagesToday += calculatePagesFromProgress(
      progressGain,
      todayEntries[0].book.pageCount,
    );
  });

  let totalPages = 0;
  const bookProgress = new Map<number, { max: number; pageCount: number }>();
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

  return { pagesToday, averagePagesPerDay };
};

export const calculateWeeklyStats = (
  progress: ReadingProgressWithBook[],
): WeeklyStats => {
  const validProgress = progress.filter((p) => p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return {
      pagesThisWeek: 0,
      pagesLastWeek: 0,
    };
  }

  const progressByWeek = groupByWeek(validProgress);

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(new Date(), 7), {
    weekStartsOn: 1,
  });

  const thisWeekKey = format(thisWeekStart, "yyyy-MM-dd");
  const lastWeekKey = format(lastWeekStart, "yyyy-MM-dd");

  // Group all entries by book to find baselines
  const allEntriesByBook = new Map<number, ReadingProgressWithBook[]>();
  validProgress.forEach((entry) => {
    const bookEntries = allEntriesByBook.get(entry.bookId) || [];
    allEntriesByBook.set(entry.bookId, [...bookEntries, entry]);
  });

  const calculateWeekPages = (
    weekEntries: ReadingProgressWithBook[],
    weekStart: Date,
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

      // Find the last entry before this week started
      const entriesBeforeWeek = allBookEntries
        .filter((e) => e.createdAt < weekStart)
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
    thisWeekStart,
  );
  const pagesLastWeek = calculateWeekPages(
    progressByWeek.get(lastWeekKey) || [],
    lastWeekStart,
  );

  return {
    pagesThisWeek,
    pagesLastWeek,
  };
};

export const calculateYearlyStats = (
  books: Book[],
  readingGoalThreshold: number,
): YearlyStats => {
  const validBooks = books.filter(
    (book): book is Book & { finishedAt: Date } =>
      book.finishedAt != null && book.pageCount >= readingGoalThreshold,
  );

  if (validBooks.length === 0) return { booksFinishedByYear: [] };

  const booksByYear = new Map<number, number>();

  validBooks.forEach((book) => {
    const year = book.finishedAt.getFullYear();
    const current = booksByYear.get(year);

    if (!current) {
      booksByYear.set(year, 1);
    } else {
      booksByYear.set(year, current + 1);
    }
  });

  return {
    booksFinishedByYear: Array.from(booksByYear.entries(), ([year, count]) => ({
      year,
      count,
    })).sort((a, b) => b.year - a.year),
  } satisfies YearlyStats;
};

export const calculateOverallStats = (
  progress: ReadingProgressWithBook[],
): OverallStats => {
  const validProgress = progress.filter((p) => p.book.pageCount > 0);

  if (validProgress.length === 0) {
    return {
      activeDays: 0,
      totalPagesRead: 0,
      averagePagesPerWeek: 0,
      weeksActive: 0,
    };
  }

  const progressByDay = groupByDay(validProgress);
  const progressByWeek = groupByWeek(validProgress);

  const activeDays = progressByDay.size;
  const weeksActive = progressByWeek.size;

  const bookProgress = new Map<number, { max: number; pageCount: number }>();

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

export const calculateStreakDetails = (
  progress: ReadingProgressWithBook[],
  minimumPagesForStreak: number = 0,
): StreakDetails => {
  if (progress.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
      streakStart: null,
    };
  }

  const pagesPerDay = calculatePagesPerDay(progress);

  // Filter to only days that meet the minimum pages threshold
  const qualifyingDateKeys = Array.from(pagesPerDay.entries())
    .filter(([_, pages]) => pages >= minimumPagesForStreak)
    .map(([dateKey]) => dateKey);

  const activeDates = qualifyingDateKeys
    .map((dateStr) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(year, month - 1, day);
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (activeDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
      streakStart: null,
    };
  }

  const today = startOfDay(new Date());
  const isActiveToday = activeDates.some(
    (date) => startOfDay(date).getTime() === today.getTime(),
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;
  let streakStart: Date | null = null;

  for (let i = 1; i < activeDates.length; i++) {
    const prevDate = startOfDay(activeDates[i - 1]);
    const currDate = startOfDay(activeDates[i]);
    const daysDiff = differenceInDays(currDate, prevDate);

    if (daysDiff === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }

  longestStreak = Math.max(longestStreak, tempStreak);

  const lastActiveDate = startOfDay(activeDates[activeDates.length - 1]);
  const yesterday = subDays(new Date(today), 1);

  if (
    lastActiveDate.getTime() === today.getTime() ||
    lastActiveDate.getTime() === startOfDay(yesterday).getTime()
  ) {
    currentStreak = 1;
    streakStart = lastActiveDate;

    for (let i = activeDates.length - 2; i >= 0; i--) {
      const prevDate = startOfDay(activeDates[i]);
      const nextDate = startOfDay(activeDates[i + 1]);
      const daysDiff = differenceInDays(nextDate, prevDate);

      if (daysDiff === 1) {
        currentStreak++;
        streakStart = prevDate;
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
): ReadingStats => {
  return {
    daily: calculateDailyStats(progress),
    weekly: calculateWeeklyStats(progress),
    overall: calculateOverallStats(progress),
    streak: calculateStreakDetails(progress),
  };
};
