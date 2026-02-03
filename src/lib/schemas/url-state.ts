import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";

import {
  DEFAULT_FILTER,
  DEFAULT_SORTING,
  READ_STATUS_OPTIONS,
  sortGroups,
  VALIDATION_LIMITS,
} from "@/lib/constants";
import type { SortOptions } from "@/lib/types";

const sortOptionValues = sortGroups.flatMap((group) =>
  group.items.map((item) => item.value),
) as SortOptions[];

const statusFilterValues = ["ALL_BOOKS", ...READ_STATUS_OPTIONS] as const;

export const sortParser =
  parseAsStringLiteral(sortOptionValues).withDefault(DEFAULT_SORTING);
export const statusParser =
  parseAsStringLiteral(statusFilterValues).withDefault(DEFAULT_FILTER);
export const searchParser = parseAsString.withDefault("");
export const pageParser = parseAsInteger.withDefault(1);
export const pageSizeParser = parseAsInteger.withDefault(
  VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT,
);

export const librarySearchParams = {
  sort: sortParser,
  status: statusParser,
  q: searchParser,
  page: pageParser,
  pageSize: pageSizeParser,
};
