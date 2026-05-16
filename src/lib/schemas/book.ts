import { parse } from "isbn3";
import z from "zod";

import { VALIDATION_LIMITS } from "../constants";

export const createFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is mandatory.")
    .max(
      VALIDATION_LIMITS.TITLE_MAX_LENGTH,
      `Title cannot be more than ${VALIDATION_LIMITS.TITLE_MAX_LENGTH} characters.`,
    ),
  author: z
    .string()
    .trim()
    .min(1, "Author is mandatory.")
    .max(
      VALIDATION_LIMITS.AUTHOR_MAX_LENGTH,
      `Author cannot be more than ${VALIDATION_LIMITS.AUTHOR_MAX_LENGTH} characters.`,
    ),
  pageCount: z
    .number()
    .int()
    .positive("Page Count must be a positive non-zero number.")
    .optional(),
  isbn: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      try {
        const parsedIsbn = parse(val);
        return parsedIsbn?.isValid;
      } catch {
        return false;
      }
    }, "Invalid ISBN. Please enter a valid ISBN-10 or ISBN-13.")
    .optional(),
  series: z.string().trim().max(VALIDATION_LIMITS.SERIES_MAX_LENGTH).optional(),
  seriesIndex: z
    .number()
    .positive()
    .optional()
    .refine(
      (val) => val === undefined || Number.isInteger(val * 10),
      "Series Index can have at most 1 decimal place",
    ),
  publishedYear: z
    .number()
    .int()
    .positive()
    .min(VALIDATION_LIMITS.MIN_PUBLISHED_YEAR)
    .max(VALIDATION_LIMITS.MAX_PUBLISHED_YEAR),
  summary: z.string().trim().max(VALIDATION_LIMITS.SUMMARY_MAX_LENGTH).optional(),
  coverUrl: z.url().optional().or(z.literal("")),
  goodreadsUrl: z.url().optional().or(z.literal("")),
});

export const createBookInputSchema = createFormSchema
  .extend({
    alreadyRead: z.boolean().optional(),
    finishedAt: z.date().optional(),
    startedAt: z.date().optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.alreadyRead) {
      if (!data.finishedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finished date is required",
          path: ["finishedAt"],
        });
        return;
      }
      if (data.finishedAt > new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finished date cannot be in the future",
          path: ["finishedAt"],
        });
      }
      if (data.startedAt && data.startedAt > data.finishedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Started date must be before the finished date",
          path: ["startedAt"],
        });
      }
    }
  });
