import { describe, expect, it } from "vitest";

import { validateProgress } from "@/lib/reading";

describe("validateProgress", () => {
  describe("percentage mode", () => {
    it("should accept valid progress (current+1 to 100)", () => {
      const result = validateProgress({
        value: "50",
        progressType: "%",
        currentProgress: 25,
        pageCount: 300,
      });

      expect(result).toBeNull();
    });

    it("should reject progress <= current book progress", () => {
      const currentProgress = 25;
      const result = validateProgress({
        value: "25",
        progressType: "%",
        currentProgress,
        pageCount: 300,
      });

      expect(result).toEqual(
        `Progress must be greater than ${currentProgress}`,
      );
    });

    it("should reject progress > 100", () => {
      const result = validateProgress({
        value: "125",
        progressType: "%",
        currentProgress: 25,
        pageCount: 300,
      });

      expect(result).toEqual(`Progress must be between 0 and 100`);
    });

    it("should reject progress < 0", () => {
      const result = validateProgress({
        value: "-1",
        progressType: "%",
        currentProgress: 25,
        pageCount: 300,
      });

      expect(result).toEqual(`Progress must be between 0 and 100`);
    });

    it("should reject non-numeric input", () => {
      const result = validateProgress({
        value: "test",
        progressType: "%",
        currentProgress: 25,
        pageCount: 300,
      });

      expect(result).toEqual("Enter a valid number");
    });
  });

  describe("pages mode", () => {
    it("should accept valid pages (currentPages+1 to pageCount)", () => {
      const result = validateProgress({
        value: "160",
        progressType: "pages",
        currentProgress: 50,
        pageCount: 300,
      });

      expect(result).toBeNull();
    });

    it("should reject pages > pageCount", () => {
      const pageCount = 300;
      const result = validateProgress({
        value: "310",
        progressType: "pages",
        currentProgress: 50,
        pageCount,
      });

      expect(result).toEqual(`Progress cannot be greater than ${pageCount}`);
    });

    it("should reject pages < 0", () => {
      const result = validateProgress({
        value: "-1",
        progressType: "pages",
        currentProgress: 50,
        pageCount: 300,
      });

      expect(result).toEqual("Progress must be a positive number");
    });

    it("should reject pages that result in same/lower percentage than current", () => {
      const currentProgress = 50;
      const pageCount = 300;
      const pagesRead = Math.floor((50 / 100) * pageCount);
      const result = validateProgress({
        value: "140",
        progressType: "pages",
        currentProgress,
        pageCount,
      });

      expect(result).toEqual(
        `Progress must be greater than ${pagesRead} pages`,
      );
    });

    it("should reject non-numeric input", () => {
      const result = validateProgress({
        value: "test",
        progressType: "pages",
        currentProgress: 50,
        pageCount: 300,
      });

      expect(result).toEqual("Enter a valid number");
    });

    it("should calculate percentage equivalent correctly", () => {
      const result = validateProgress({
        value: "78",
        progressType: "pages",
        currentProgress: 25,
        pageCount: 300,
      });

      expect(result).toBeNull();
    });
  });
});
