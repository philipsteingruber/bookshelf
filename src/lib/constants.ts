import type { ReadStatus } from "@/generated/prisma/enums";

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
  BOOKS_QUERY_DEFAULT: 50,

  // Progress values
  PROGRESS_COMPLETE: 100,
  PROGRESS_NOT_STARTED: 0,
} as const;

/**
 * Available reading status options in order of typical reading flow
 * Used for dropdowns, filters, and status updates
 */
export const READ_STATUS_OPTIONS: ReadStatus[] = [
  "TO_READ",
  "READ_NEXT",
  "READING",
  "READ",
  "DNF",
] as const;
