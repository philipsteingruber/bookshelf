import { useCallback, useMemo, useState } from "react";

import type { Book } from "@/generated/prisma/client";
import { validateProgress } from "@/lib/reading";

export const useProgressValidation = (
  book: Book,
  progressType: "%" | "pages",
): {
  inputValue: string;
  error: string | null;
  isValid: boolean;
  handleChange: (value: string) => void;
  resetInput: () => void;
} => {
  const [inputValue, setInputValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setInputValue(value);
      const validationError = validateProgress({
        value,
        progressType,
        currentProgress: book.progress,
        pageCount: book.pageCount,
      });
      setError(validationError);
    },
    [book.progress, book.pageCount, progressType],
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
