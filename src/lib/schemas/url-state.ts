import { parseAsString, parseAsStringLiteral } from "nuqs";

import { READ_STATUS_OPTIONS, sortGroups } from "@/lib/constants";
import type { SortOptions } from "@/lib/types";

const sortOptionValues = sortGroups.flatMap((group) =>
  group.items.map((item) => item.value),
) as SortOptions[];

const statusFilterValues = ["ALL_BOOKS", ...READ_STATUS_OPTIONS] as const;

export const sortParser =
  parseAsStringLiteral(sortOptionValues).withDefault("RECENTLY_UPDATED");
export const statusParser =
  parseAsStringLiteral(statusFilterValues).withDefault("ALL_BOOKS");
export const searchParser = parseAsString.withDefault("");

export const librarySearchParams = {
  sort: sortParser,
  status: statusParser,
  q: searchParser,
};
