export interface ValidateProgressParams {
  value: string;
  progressType: "%" | "pages";
  currentProgress: number;
  pageCount: number | null;
}

/**
 * Validates a progress input value against the current book state.
 *
 * @param params.value - The input value to validate (as string from input field)
 * @param params.progressType - Whether validating percentage or page count
 * @param params.currentProgress - The book's current progress percentage (0-100)
 * @param params.pageCount - The book's total page count
 * @returns Error message string if invalid, null if valid
 */
export function validateProgress({
  value,
  progressType,
  currentProgress,
  pageCount,
}: ValidateProgressParams): string | null {
  const numValue = parseInt(value);

  if (isNaN(numValue)) {
    return "Enter a valid number";
  }

  if (progressType === "%") {
    if (numValue < 0 || numValue > 100) {
      return "Progress must be between 0 and 100";
    }
    if (numValue <= currentProgress) {
      return `Progress must be greater than ${currentProgress}`;
    }
  } else if (progressType === "pages") {
    if (!pageCount) {
      return "Page count not set for this book";
    }
    if (numValue < 0) {
      return "Progress must be a positive number";
    }
    if (numValue > pageCount) {
      return `Progress cannot be greater than ${pageCount}`;
    }
    const percentEquivalent = Math.floor((numValue / pageCount) * 100);
    if (percentEquivalent <= currentProgress) {
      const currentPages = Math.floor((currentProgress / 100) * pageCount);
      return `Progress must be greater than ${currentPages} pages`;
    }
  }

  return null;
}
