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
