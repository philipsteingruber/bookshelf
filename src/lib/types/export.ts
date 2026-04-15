import type {
  ReadingGoal,
  ReadingProgress,
  UserStats,
} from "@/generated/prisma/client";
import type { BookGetPayload } from "@/generated/prisma/models/Book";

export type ReadingProgressForExport = ReadingProgress & {
  book: { id: number; title: string; author: string };
};

/**
 * Books are flattened for export: the Series relation is reduced to a
 * plain `series: string | null` name so the export format stays unchanged
 * and remains compatible with existing import files.
 */
export type BookForExport = Omit<
  BookGetPayload<{ include: { series: true } }>,
  "series" | "seriesId"
> & { series: string | null };

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
  books: BookForExport[];
  readingProgress: ReadingProgressForExport[];
  readingGoals: ReadingGoal[];
  userStats: UserStats | null;
  exportDate: string;
}
