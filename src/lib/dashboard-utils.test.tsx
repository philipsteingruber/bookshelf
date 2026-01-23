import { describe, expect, it } from "vitest";

import {
  getDashboardMaxReadingBooksCount,
  getDashboardMaxReadNextBooksCount,
  getDashboardRecentlyReadBooksCount,
} from "./dashboard-utils";

describe("dashboard-utils", () => {
  describe("getDashboardMaxReadingBooksCount", () => {
    it("should return 2 for sm breakpoint", () => {
      expect(getDashboardMaxReadingBooksCount("sm")).toEqual(2);
    });

    it("should return 2 for md breakpoint", () => {
      expect(getDashboardMaxReadingBooksCount("md")).toEqual(2);
    });

    it("should return 2 for lg breakpoint", () => {
      expect(getDashboardMaxReadingBooksCount("lg")).toEqual(2);
    });

    it("should return 3 for xl breakpoint", () => {
      expect(getDashboardMaxReadingBooksCount("xl")).toEqual(3);
    });

    it("should return 3 for 2xl breakpoint", () => {
      expect(getDashboardMaxReadingBooksCount("2xl")).toEqual(3);
    });
  });

  describe("getDashboardMaxReadNextBooksCount", () => {
    it("should return 2 for sm breakpoint", () => {
      expect(getDashboardMaxReadNextBooksCount("sm")).toEqual(2);
    });

    it("should return 2 for md breakpoint", () => {
      expect(getDashboardMaxReadNextBooksCount("md")).toEqual(2);
    });

    it("should return 3 for lg breakpoint", () => {
      expect(getDashboardMaxReadNextBooksCount("lg")).toEqual(3);
    });

    it("should return 3 for xl breakpoint", () => {
      expect(getDashboardMaxReadNextBooksCount("xl")).toEqual(3);
    });

    it("should return 5 for 2xl breakpoint", () => {
      expect(getDashboardMaxReadNextBooksCount("2xl")).toEqual(5);
    });
  });

  describe("getDashboardRecentlyReadBooksCount", () => {
    it("should return 1 for sm breakpoint", () => {
      expect(getDashboardRecentlyReadBooksCount("sm")).toEqual(1);
    });

    it("should return 2 for md breakpoint", () => {
      expect(getDashboardRecentlyReadBooksCount("md")).toEqual(2);
    });

    it("should return 2 for lg breakpoint", () => {
      expect(getDashboardRecentlyReadBooksCount("lg")).toEqual(2);
    });

    it("should return 2 for xl breakpoint", () => {
      expect(getDashboardRecentlyReadBooksCount("xl")).toEqual(2);
    });

    it("should return 3 for 2xl breakpoint", () => {
      expect(getDashboardRecentlyReadBooksCount("2xl")).toEqual(3);
    });
  });
});
