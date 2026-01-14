import { parse } from "isbn3";
import z from "zod";

import { VALIDATION_LIMITS } from "../constants";

export const createFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is mandatory.")
    .max(
      VALIDATION_LIMITS.TITLE_MAX_LENGTH,
      `Title cannot be more than ${VALIDATION_LIMITS.TITLE_MAX_LENGTH} characters.`,
    ),
  author: z
    .string()
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
    .refine((val) => {
      try {
        const parsedIsbn = parse(val);
        return !val || parsedIsbn?.isValid;
      } catch {
        return false;
      }
    }, "Invalid ISBN. Please enter a valid ISBN-10 or ISBN-13.")
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((val) => val || null),
  series: z.string().max(VALIDATION_LIMITS.SERIES_MAX_LENGTH).optional(),
  seriesIndex: z.number().int().positive().optional(),
  publishedYear: z
    .number()
    .int()
    .positive()
    .min(VALIDATION_LIMITS.MIN_PUBLISHED_YEAR)
    .max(VALIDATION_LIMITS.MAX_PUBLISHED_YEAR),
  summary: z.string().max(VALIDATION_LIMITS.SUMMARY_MAX_LENGTH).optional(),
  coverUrl: z.url().optional().or(z.literal("")),
});
