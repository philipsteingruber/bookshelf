import type {
  Book,
  ReadingGoal,
  ReadingProgress,
  UserStats,
} from "@/generated/prisma/client";

export type ReadingProgressForExport = ReadingProgress & {
  book: { id: number; title: string; author: string };
};

export interface ExportData {
  user: {
    id: string;
    name: string;
    email: string;
    defaultReadingThreshold: number;
    minimumPagesForStreak: number;
    timezone: string;
    createdAt: Date;
  } | null;
  books: Book[];
  readingProgress: ReadingProgressForExport[];
  readingGoals: ReadingGoal[];
  userStats: UserStats | null;
  exportDate: string;
}
