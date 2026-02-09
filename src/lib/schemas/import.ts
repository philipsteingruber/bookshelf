import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";

const currentYear = new Date().getFullYear();

export const importJSONSchema = z.object({
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      defaultReadingThreshold: z.number().nonnegative().int(),
      minimumPagesForStreak: z.number().nonnegative().int(),
      timezone: z.string(),
      createdAt: z.coerce.date(),
    })
    .nullable(),
  books: z.array(
    z.object({
      id: z.number().nonnegative(),
      title: z.string().min(1),
      titleSort: z.string().min(1),
      author: z.string().min(1),
      authorSort: z.string().min(1),
      pageCount: z.number().int().min(1),
      progress: z.number().int().min(0).max(100),
      rating: z.number().min(1).max(5).nullable(),
      goodreadsRating: z.number().min(1).max(5).nullable(),
      goodreadsUrl: z.url().nullable(),
      googleBooksUrl: z.url().nullable(),
      review: z.string().nullable(),
      coverUrl: z.url().nullable(),
      isbn: z.string().nullable(),
      series: z.string().min(1).nullable(),
      seriesIndex: z.number().positive().nullable(),
      publishedYear: z
        .number()
        .min(1800)
        .max(currentYear + 1)
        .nullable(),
      summary: z.string().nullable(),
      status: z.enum(Object.values(ReadStatus)),
      userId: z.cuid(),
      startedAt: z.coerce.date().nullable(),
      finishedAt: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
    }),
  ),
  readingProgress: z.array(
    z.object({
      id: z.cuid(),
      userId: z.cuid(),
      bookId: z.int().nonnegative(),
      progress: z.int().min(0).max(100),
      comments: z.string().nullable(),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      book: z.object({
        id: z.number(),
        title: z.string(),
        author: z.string(),
      }),
    }),
  ),
  readingGoals: z.array(
    z.object({
      id: z.cuid(),
      year: z.number(),
      goal: z.int().nonnegative(),
      userId: z.cuid(),
    }),
  ),
  userStats: z
    .object({
      id: z.cuid(),
      currentStreak: z.int().nonnegative(),
      longestStreak: z.int().nonnegative(),
      lastQualifyingReadingDate: z.coerce.date().nullable(),
      lastReadingDate: z.coerce.date().nullable(),
      totalPagesRead: z.int().nonnegative(),
      totalActiveDays: z.int().nonnegative(),
      updatedAt: z.coerce.date(),
    })
    .nullable(),
  exportDate: z.string().min(1),
});

const emptyToNullNumber = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().nullable(),
);
const emptyToNullString = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().nullable(),
);
const emptyToNullDate = z.preprocess(
  (v) => (v === "" ? null : v),
  z.date().nullable(),
);

export const bookCSVSchema = z.object({
  id: z.string(),

  title: z.string().min(1),
  author: z.string().min(1),

  review: emptyToNullString,
  summary: emptyToNullString,

  pageCount: z.coerce.number().int().min(1),
  progress: z.coerce.number().int().min(0).max(100),

  status: z.enum(Object.values(ReadStatus)),

  rating: emptyToNullNumber.pipe(z.number().min(1).max(5).nullable()),
  goodreadsRating: emptyToNullNumber.pipe(z.number().min(1).max(5).nullable()),
  seriesIndex: emptyToNullNumber.pipe(z.number().positive().nullable()),
  publishedYear: emptyToNullNumber.pipe(
    z
      .number()
      .min(1800)
      .max(currentYear + 1)
      .nullable(),
  ),

  goodreadsUrl: z.url().nullable(),
  googleBooksUrl: z.url().nullable(),
  coverUrl: z.url().nullable(),

  series: emptyToNullString,
  isbn: emptyToNullString,

  startedAt: emptyToNullDate,
  finishedAt: emptyToNullDate,

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const progressCSVSchema = z.object({
  id: z.cuid(),

  bookId: z.string(),

  bookTitle: z.string().min(1),
  bookAuthor: z.string().min(1),

  progress: z.coerce.number().int().min(0).max(100),

  comments: emptyToNullString,

  createdAt: z.coerce.date(),
});

export const goalCSVSchema = z.object({
  id: z.cuid(),

  year: z.coerce.number().int().min(2000),
  goal: z.coerce.number().int().positive(),
});
