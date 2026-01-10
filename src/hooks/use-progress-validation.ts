import { useCallback, useMemo, useState } from "react";

import type { Book } from "@/generated/prisma/client";

export const useProgressValidation = (
  book: Book,
  progressType: "%" | "pages",
) => {
  const [inputValue, setInputValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (value: string) => {
      const numValue = parseInt(value);

      if (isNaN(numValue)) {
        return "Enter a valid number";
      }

      if (progressType === "%") {
        if (numValue < 0 || numValue > 100) {
          return "Progress must be between 0 and 100";
        }
        if (numValue <= book.progress) {
          return `Progress must be greater than ${book.progress}`;
        }
      } else if (progressType === "pages") {
        if (numValue < 0) {
          return "Progress must be a positive number";
        }
        if (numValue > book.pageCount) {
          return `Progress cannot be greater than ${book.pageCount}`;
        }
        const percentEquivalent = Math.floor((numValue / book.pageCount) * 100);
        if (percentEquivalent <= book.progress) {
          const currentPages = Math.floor(
            (book.progress / 100) * book.pageCount,
          );
          return `Progress must be greater than ${currentPages} pages`;
        }
      }

      return null;
    },
    [book.progress, book.pageCount, progressType],
  );

  const handleChange = useCallback(
    (value: string) => {
      setInputValue(value);
      const validationError = validate(value);
      setError(validationError);
    },
    [validate],
  );

  const isValid = useMemo(() => {
    return inputValue !== "" && !error;
  }, [inputValue, error]);

  return {
    inputValue,
    error,
    isValid,
    handleChange,
    resetInput: () => setInputValue(""),
  };
};
