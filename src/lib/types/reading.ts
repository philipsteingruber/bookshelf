import type { Book, ReadingProgress } from "@/generated/prisma/client";

export type ReadingProgressWithProgressSinceLast = ReadingProgress & {
  progressSinceLast: number;
};

export type ReadingProgressWithBook = ReadingProgress & {
  book: Pick<Book, "pageCount" | "id" | "title">;
};

export interface DailyStats {
  pagesToday: number;
  pagesYesterday: number;
  averagePagesPerDay: number;
}
export interface WeeklyStats {
  pagesThisWeek: number;
  pagesLastWeek: number;
}
export interface YearlyStats {
  booksFinishedByYear: { year: number; count: number }[];
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
export interface ChartDataPoint {
  date: Date;
  displayDate: string;
  progress: number;
  progressSinceLast: number;
  comments: string | null;
  fullDate: string;
  originalEntry: ReadingProgressWithProgressSinceLast;
}
