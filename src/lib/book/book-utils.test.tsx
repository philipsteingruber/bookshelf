import { describe, expect, it } from "vitest";

import { ReadStatus } from "@/generated/prisma/enums";
import {
  createAuthorSort,
  createTitleSort,
  formatSeriesIndex,
  getStatusButtonStyle,
  parseReadStatus,
} from "@/lib/book";

describe("bookUtils", () => {
  describe("parseReadStatus", () => {
    it("should return 'To Read' for TO_READ", () => {
      expect(parseReadStatus(ReadStatus.TO_READ)).toEqual("To Read");
    });

    it("should return 'Reading' for READING", () => {
      expect(parseReadStatus(ReadStatus.READING)).toEqual("Reading");
    });

    it("should return 'Finished' for READ", () => {
      expect(parseReadStatus(ReadStatus.READ)).toEqual("Finished");
    });

    it("should return 'DNF' for DNF", () => {
      expect(parseReadStatus(ReadStatus.DNF)).toEqual("DNF");
    });

    it("should return 'Read Next' for READ_NEXT", () => {
      expect(parseReadStatus(ReadStatus.READ_NEXT)).toEqual("Read Next");
    });
  });

  describe("getStatusButtonStyle", () => {
    it("should return orange gradient for TO_READ", () => {
      expect(getStatusButtonStyle(ReadStatus.TO_READ)).toContain("orange");
    });

    it("should return blue gradient for READING", () => {
      expect(getStatusButtonStyle(ReadStatus.READING)).toContain("blue");
    });

    it("should return green gradient for READ", () => {
      expect(getStatusButtonStyle(ReadStatus.READ)).toContain("green");
    });

    it("should return red gradient for DNF", () => {
      expect(getStatusButtonStyle(ReadStatus.DNF)).toContain("red");
    });

    it("should return purple gradient for READ_NEXT", () => {
      expect(getStatusButtonStyle(ReadStatus.READ_NEXT)).toContain("purple");
    });
  });

  describe("createTitleSort", () => {
    it("should move 'The' to the end", () => {
      expect(createTitleSort("The Book")).toEqual("Book, The");
    });

    it("should handle lowercase 'the'", () => {
      expect(createTitleSort("the Book")).toEqual("Book, The");
    });

    it("should return unchanged if no 'The' prefix", () => {
      const title = "Book";
      expect(createTitleSort(title)).toEqual(title);
    });

    it("should handle single word title 'The' correctly", () => {
      const title = "The";
      expect(createTitleSort(title)).toEqual(title);
    });
  });

  describe("createAuthorSort", () => {
    it("should reformat 'First Last' -> 'Last, First'", () => {
      expect(createAuthorSort("First Last")).toEqual("Last, First");
    });

    it("should handle single name authors", () => {
      expect(createAuthorSort("SingleName")).toEqual("SingleName");
    });

    it("should handle multi-part surnames", () => {
      expect(createAuthorSort("First Van Last")).toEqual("Van Last, First");
    });
  });

  describe("formatSeriesIndex", () => {
    it("should return integer as-is for whole numbers", () => {
      expect(formatSeriesIndex(1)).toEqual(1);
    });

    it("should return decimal as-is for non-whole numbers", () => {
      expect(formatSeriesIndex(1.5)).toEqual(1.5);
    });

    it("should return 0 as-is", () => {
      expect(formatSeriesIndex(0)).toEqual(0);
    });

    it("should preserve single decimal place values", () => {
      expect(formatSeriesIndex(3.1)).toEqual(3.1);
    });
  });
});
