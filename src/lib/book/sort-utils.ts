import type { BookOrderByWithRelationInput } from "@/generated/prisma/internal/prismaNamespace";

import type { SortableField } from "@/lib/schemas/book-filters";

export function toOrderBy(
  sortBy: SortableField,
  direction: "asc" | "desc",
): BookOrderByWithRelationInput | BookOrderByWithRelationInput[] {
  switch (sortBy) {
    case "title":
      return { titleSort: direction };
    case "author":
      return { authorSort: direction };
    case "series":
      return [
        { series: { sort: "asc", nulls: "last" } },
        { seriesIndex: "asc" },
        { titleSort: "asc" },
      ];
    case "finishedAt":
      return [{ finishedAt: { sort: direction, nulls: "last" } }, { titleSort: "asc" }];
    case "createdAt":
      return { createdAt: direction };
    case "updatedAt":
      return { updatedAt: direction };
    case "rating":
      return { rating: direction };
    case "pageCount":
      return { pageCount: direction };
    default: {
      const _exhaustive: never = sortBy;
      throw new Error(`Unhandled sort field: ${_exhaustive}`);
    }
  }
}
