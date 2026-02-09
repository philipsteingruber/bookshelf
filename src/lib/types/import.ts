import type z from "zod";

import type {
  bookCSVSchema,
  goalCSVSchema,
  progressCSVSchema,
} from "@/lib/schemas";

// Matches the structure from CSV files (must align with export-utils.ts)
export interface BookCSVRow {
  id: string;
  title: string;
  titleSort: string;
  author: string;
  authorSort: string;
  pageCount: string;
  progress: string;
  status: string;
  rating: string;
  goodreadsRating: string;
  goodreadsUrl: string;
  googleBooksUrl: string;
  review: string;
  coverUrl: string;
  series: string;
  seriesIndex: string;
  publishedYear: string;
  isbn: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressCSVRow {
  id: string;
  bookId: string;
  bookTitle: string; // Key for smart matching!
  bookAuthor: string; // Key for smart matching!
  progress: string;
  comments: string;
  createdAt: string;
}

export interface GoalCSVRow {
  id: string;
  year: string;
  goal: string;
}

// CSV import data structure (used when importing multiple CSV files)
export interface CSVImportData {
  books?: z.infer<typeof bookCSVSchema>[];
  progress?: z.infer<typeof progressCSVSchema>[];
  goals?: z.infer<typeof goalCSVSchema>[];
}

// Import results to return to client
export interface ImportResults {
  created: {
    books: number;
    progress: number;
    goals: number;
  };
  skipped: {
    books: number;
    progress: number;
    goals: number;
  };
  errors: string[];
}

export type ImportFormat = "json" | "csv";
