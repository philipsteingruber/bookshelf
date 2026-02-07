import type { Book, ReadingGoal } from "@/generated/prisma/client";
import type { ExportData, ReadingProgressForExport } from "@/lib/types";

export const exportToJSON = (data: ExportData): string => {
  return JSON.stringify(data, null, 2);
};

export const exportBooksToCSV = (books: Book[]): string => {
  const headers = [
    "id",
    "title",
    "author",
    "pageCount",
    "progress",
    "status",
    "rating",
    "series",
    "seriesIndex",
    "publishedYear",
    "isbn",
    "startedAt",
    "finishedAt",
    "createdAt",
  ];

  const rows = books.map((book) => [
    book.id,
    escapeCSV(book.title),
    escapeCSV(book.author),
    book.pageCount,
    book.progress,
    book.status,
    book.rating ?? "",
    escapeCSV(book.series ?? ""),
    book.seriesIndex ?? "",
    book.publishedYear ?? "",
    book.isbn ?? "",
    book.startedAt?.toISOString() ?? "",
    book.finishedAt?.toISOString() ?? "",
    book.createdAt.toISOString(),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

export function exportReadingProgressToCSV(
  progress: ReadingProgressForExport[],
): string {
  const headers = [
    "id",
    "bookId",
    "bookTitle",
    "bookAuthor",
    "progress",
    "comments",
    "createdAt",
  ];

  const rows = progress.map((entry) => [
    entry.id,
    entry.bookId,
    escapeCSV(entry.book.title),
    escapeCSV(entry.book.author),
    entry.progress,
    escapeCSV(entry.comments ?? ""),
    entry.createdAt.toISOString(),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function exportReadingGoalsToCSV(goals: ReadingGoal[]): string {
  const headers = ["id", "year", "goal"];

  const rows = goals.map((goal) => [goal.id, goal.year, goal.goal]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

const escapeCSV = (value: string | null | undefined): string => {
  if (value === null) return "";
  const stringValue = String(value);
  if (
    stringValue?.includes(",") ||
    stringValue?.includes('"') ||
    stringValue?.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const downloadFile = (
  content: string,
  fileName: string,
  mimeType: string,
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const generateExportFilename = (
  prefix: string,
  extension: string,
): string => {
  const timestamp = new Date().toISOString().split("T")[0];
  return `${prefix}_${timestamp}.${extension}`;
};
