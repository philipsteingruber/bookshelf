import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  CalendarPlusIcon,
  CheckIcon,
  FileTextIcon,
  LibraryIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { ReadStatus } from "@/generated/prisma/enums";
import type { SortItem } from "@/lib/types";

export const BOOK_COVER_PLACEHOLDER_URL = "/book-placeholder.png";

/**
 * Validation limits for book-related fields
 * These constants are used in Zod schemas and throughout the application
 */
export const VALIDATION_LIMITS = {
  // Book field length limits
  TITLE_MAX_LENGTH: 50,
  AUTHOR_MAX_LENGTH: 50,
  SERIES_MAX_LENGTH: 50,
  SUMMARY_MAX_LENGTH: 2000,

  // Year constraints
  MIN_PUBLISHED_YEAR: 1800,
  get MAX_PUBLISHED_YEAR() {
    return new Date().getFullYear() + 1;
  },

  // Query limits
  BOOKS_QUERY_MAX: 100,
  BOOKS_QUERY_DEFAULT: 25,

  // Progress values
  PROGRESS_COMPLETE: 100,
  PROGRESS_NOT_STARTED: 0,
} as const;

/**
 * Available reading status options in order of typical reading flow
 * Used for dropdowns, filters, and status updates
 */
export const READ_STATUS_OPTIONS: ReadStatus[] = ["TO_READ", "READ_NEXT", "READING", "READ", "DNF"] as const;

export const READING_GOAL_DEFAULT_THRESHOLD = 200 as const;

export const DEFAULT_SORTING = "RECENTLY_UPDATED";
export const DEFAULT_FILTER = "ALL_BOOKS";

export const DEBOUNCE_INTERVAL = 500;

export const sortGroups: { text: string; items: SortItem[] }[] = [
  {
    text: "BY DATE",
    items: [
      {
        text: "Recently Updated",
        Icon: CalendarPlusIcon,
        value: "RECENTLY_UPDATED",
      },
      {
        text: "Recently Added",
        Icon: CalendarPlusIcon,
        value: "RECENTLY_ADDED",
      },
      {
        text: "Recently Finished",
        Icon: CheckIcon,
        value: "RECENTLY_FINISHED",
      },
    ],
  },
  {
    text: "BY TITLE & AUTHOR",
    items: [
      { text: "Title A-Z", Icon: ArrowDownAZIcon, value: "TITLE_AZ" },
      { text: "Title Z-A", Icon: ArrowUpAZIcon, value: "TITLE_ZA" },
      { text: "Author A-Z", Icon: ArrowDownAZIcon, value: "AUTHOR_AZ" },
      { text: "Author Z-A", Icon: ArrowUpAZIcon, value: "AUTHOR_ZA" },
    ],
  },
  {
    text: "BY RATING & LENGTH",
    items: [
      { text: "Highest Rated", Icon: TrendingUp, value: "HIGHEST_RATED" },
      { text: "Lowest Rated", Icon: TrendingDown, value: "LOWEST_RATED" },
      { text: "Shortest First", Icon: FileTextIcon, value: "SHORTEST_FIRST" },
      { text: "Longest First", Icon: FileTextIcon, value: "LONGEST_FIRST" },
    ],
  },
  {
    text: "BY SERIES",
    items: [{ text: "Series Order", Icon: LibraryIcon, value: "SERIES_ORDER" }],
  },
] as const;

export const RECOMMENDATIONS_MODEL = "claude-sonnet-4-6" as const;
export const CLASSIFICATION_MODEL = "claude-haiku-4-5-20251001" as const;

export const DEFAULT_TIMEZONE = "UTC" as const;
