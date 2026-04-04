import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";
import { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";

import { VALIDATION_LIMITS } from "../constants";

export const bookFiltersSchema = z
  .object({
    status: z.enum(Object.values(ReadStatus)).optional(),
    rating: z.number().min(1).max(5).optional(),
    search: z.string().optional(), // Search in title/author
    sortBy: z.enum(Object.values(BookScalarFieldEnum)).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(VALIDATION_LIMITS.BOOKS_QUERY_MAX).optional(),
    page: z.number().int().min(1).optional(),
    unrated: z.boolean().optional(),
  })
  .optional();
