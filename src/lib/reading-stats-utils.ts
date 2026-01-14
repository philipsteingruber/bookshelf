import {
  differenceInDays,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";

import type { Book, ReadingProgress } from "@/generated/prisma/client";

export type ReadingProgressWithBook = ReadingProgress & {
  book: Pick<Book, "pageCount" | "id" | "title">;
};
export interface DailyStats {
  pagesToday: number;
  averagePagesPerDay: number;
}
export interface WeeklyStats {
  pagesThisWeek: number;
  pagesLastWeek: number;
  weeksActive: number;
}
export interface OverallStats {
  activeDays: number;
  totalPagesRead: number;
  averagePagesPerWeek: number;
  weeksActive: number;
}
export interface StreakDetails {
  currentStreak: number;
  longestStreak: number;
  isActiveToday: boolean;
  streakStart: Date | null;
}
export interface ReadingStats {
  daily: DailyStats;
  weekly: WeeklyStats;
  overall: OverallStats;
  streak: StreakDetails;
}

const calculatePagesFromProgress = (progress: number, pageCount: number) => {
  return Math.round((progress / 100) * pageCount);
};
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

  let pagesToday = 0;
  todayByBook.forEach((entries) => {
    const sorted = [...entries].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const firstProgress = sorted[0].progress;
    const lastProgress = sorted[sorted.length - 1].progress;
    const progressGain = lastProgress - firstProgress;

    pagesToday += calculatePagesFromProgress(
      progressGain,
      sorted[0].book.pageCount,
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
      weeksActive: 0,
    };
  }

  const progressByWeek = groupByWeek(validProgress);
  const weeksActive = progressByWeek.size;

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(new Date(), 7), {
    weekStartsOn: 1,
  });

  const thisWeekKey = format(thisWeekStart, "yyyy-MM-dd");
  const lastWeekKey = format(lastWeekStart, "yyyy-MM-dd");

  const calculateWeekPages = (
    weekEntries: ReadingProgressWithBook[],
  ): number => {
    const byBook = new Map<number, { max: number; pageCount: number }>();
    weekEntries.forEach((entry) => {
      const current = byBook.get(entry.bookId);
      if (!current) {
        byBook.set(entry.bookId, {
          max: entry.progress,
          pageCount: entry.book.pageCount,
        });
      } else {
        current.max = Math.max(current.max, entry.progress);
      }
    });

    let weekPages = 0;
    byBook.forEach(({ max, pageCount }) => {
      weekPages += calculatePagesFromProgress(max, pageCount);
    });

    return weekPages;
  };

  const pagesThisWeek = calculateWeekPages(
    progressByWeek.get(thisWeekKey) || [],
  );
  const pagesLastWeek = calculateWeekPages(
    progressByWeek.get(lastWeekKey) || [],
  );

  return {
    pagesThisWeek,
    pagesLastWeek,
    weeksActive,
  };
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
): StreakDetails => {
  if (progress.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
      streakStart: null,
    };
  }

  const progressByDay = groupByDay(progress);
  const activeDates = Array.from(progressByDay.keys())
    .map((dateStr) => new Date(dateStr))
    .sort((a, b) => a.getTime() - b.getTime()); // Same question here, is getTime enough?
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
