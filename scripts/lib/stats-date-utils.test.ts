import { describe, expect, it } from "vitest";

import { datesMatch, parseDateKey } from "./stats-date-utils";

describe("parseDateKey", () => {
  it("parses a YYYY-MM-DD string into a UTC Date", () => {
    const result = parseDateKey("2024-03-15");
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(2); // 0-indexed
    expect(result.getUTCDate()).toBe(15);
  });

  it("correctly offsets the month by -1 for UTC construction", () => {
    const jan = parseDateKey("2024-01-01");
    expect(jan.getUTCMonth()).toBe(0);

    const dec = parseDateKey("2024-12-31");
    expect(dec.getUTCMonth()).toBe(11);
  });

  it("returns a Date with zero time components", () => {
    const result = parseDateKey("2024-06-10");
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });
});

describe("datesMatch", () => {
  it("returns true when both dates are null", () => {
    expect(datesMatch(null, null)).toBe(true);
  });

  it("returns false when the first date is null and the second is not", () => {
    expect(datesMatch(null, new Date("2024-01-01"))).toBe(false);
  });

  it("returns false when the second date is null and the first is not", () => {
    expect(datesMatch(new Date("2024-01-01"), null)).toBe(false);
  });

  it("returns true for two Date objects with the same timestamp", () => {
    const a = new Date("2024-03-15T00:00:00.000Z");
    const b = new Date("2024-03-15T00:00:00.000Z");
    expect(datesMatch(a, b)).toBe(true);
  });

  it("returns false for two Date objects with different timestamps", () => {
    const a = new Date("2024-03-15T00:00:00.000Z");
    const b = new Date("2024-03-16T00:00:00.000Z");
    expect(datesMatch(a, b)).toBe(false);
  });
});
