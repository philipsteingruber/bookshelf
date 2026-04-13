import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";

import { VALIDATION_LIMITS } from "../constants";

export const SORTABLE_FIELDS = [
  "title",
  "author",
  "series",
  "finishedAt",
  "createdAt",
  "updatedAt",
  "rating",
  "pageCount",
] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export const bookFiltersSchema = z
  .object({
    status: z.enum(Object.values(ReadStatus)).optional(),
    rating: z.number().min(1).max(5).optional(),
    search: z.string().optional(), // Search in title/author
    sortBy: z.enum(SORTABLE_FIELDS).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(VALIDATION_LIMITS.BOOKS_QUERY_MAX).optional(),
    page: z.number().int().min(1).optional(),
    unrated: z.boolean().optional(),
  })
  .optional();
