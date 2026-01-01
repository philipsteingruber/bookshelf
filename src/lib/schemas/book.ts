import { parse } from "isbn3";
import z from "zod";

const maxYear = new Date().getFullYear() + 1;

export const createFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is mandatory.")
    .max(50, "Title cannot be more than 50 characters."),
  author: z
    .string()
    .min(1, "Author is mandatory.")
    .max(50, "Author cannot be more than 50 characters."),
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
    .or(z.literal("")),
  series: z.string().max(50).optional(),
  seriesIndex: z.number().int().positive().optional(),
  publishedYear: z.number().int().positive().min(1800).max(maxYear),
  summary: z.string().max(2000).optional(),
  coverUrl: z.url().optional().or(z.literal("")),
});
