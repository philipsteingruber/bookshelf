import z from "zod";

import { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";

import { VALIDATION_LIMITS } from "../constants";

const readStatusEnum = z.enum([
  "READ",
  "READING",
  "TO_READ",
  "DNF",
  "READ_NEXT",
]);

export const bookFiltersSchema = z
  .object({
    status: readStatusEnum.optional(),
    rating: z.number().min(1).max(5).optional(),
    search: z.string().optional(), // Search in title/author
    sortBy: z.enum(Object.values(BookScalarFieldEnum)).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(VALIDATION_LIMITS.BOOKS_QUERY_MAX).optional(),
  })
  .optional();
