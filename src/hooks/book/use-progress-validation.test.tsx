import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProgressValidation } from "@/hooks/book/use-progress-validation";
import { createFakeBook } from "@/lib/test-utils";

describe("useProgressValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial state", () => {
    it("should return empty inputValue initially", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      expect(result.current.inputValue).toBe("");
    });

    it("should return null error initially", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      expect(result.current.error).toBeNull();
    });

    it("should return isValid as false initially (empty input)", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      expect(result.current.isValid).toBe(false);
    });
  });

  describe("Percentage mode validation", () => {
    it("should accept valid progress (current+1 to 100)", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("75");
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isValid).toBe(true);
    });

    it("should reject progress <= current book progress", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("40");
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("should reject progress > 100", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("150");
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("should reject non-numeric input", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("abc");
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.isValid).toBe(false);
    });
  });

  describe("Pages mode validation", () => {
    it("should accept valid pages (resulting in higher progress)", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "pages"));

      act(() => {
        result.current.handleChange("150"); // 75% progress
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isValid).toBe(true);
    });

    it("should reject pages > pageCount", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "pages"));

      act(() => {
        result.current.handleChange("250");
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("should reject pages that result in same/lower percentage", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "pages"));

      act(() => {
        result.current.handleChange("80"); // 40% progress, less than current 50%
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.isValid).toBe(false);
    });
  });

  describe("handleChange", () => {
    it("should update inputValue on change", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("75");
      });

      expect(result.current.inputValue).toBe("75");
    });
  });

  describe("resetInput", () => {
    it("should reset inputValue to empty string", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("75");
      });
      expect(result.current.inputValue).toBe("75");

      act(() => {
        result.current.resetInput();
      });
      expect(result.current.inputValue).toBe("");
    });
  });

  describe("isValid computation", () => {
    it("should return true when input is not empty and no error", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("75");
      });

      expect(result.current.isValid).toBe(true);
    });

    it("should return false when input is empty", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      expect(result.current.isValid).toBe(false);
    });

    it("should return false when there is an error", () => {
      const book = createFakeBook({ progress: 50, pageCount: 200 });
      const { result } = renderHook(() => useProgressValidation(book, "%"));

      act(() => {
        result.current.handleChange("40"); // Invalid - below current
      });

      expect(result.current.isValid).toBe(false);
    });
  });
});
