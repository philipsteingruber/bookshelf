import type { BookGetPayload } from "@/generated/prisma/models/Book";
import type z from "zod";

import type { bookFiltersSchema } from "@/lib/schemas/book-filters";

export type BookFilters = z.infer<typeof bookFiltersSchema>;

export type SeriesInfo = { series: string; seriesIndex: number };
export type ScrapeData = {
  title: string;
  author: string;
  publishedYear: number;
  seriesInfo?: SeriesInfo;
  summary?: string;
};

/**
 * Book with the series relation included. Use this type whenever series name
 * display or editing is needed. All book-fetching procedures return this type.
 */
export type BookWithSeries = BookGetPayload<{ include: { series: true } }>;
