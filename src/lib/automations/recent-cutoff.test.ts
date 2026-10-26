import { describe, expect, it } from "vitest";

import { getRecentCutoff, isRecentWindow } from "./recent-cutoff";

describe("getRecentCutoff", () => {
  it("returns the instant exactly a day before now for the 24h window", () => {
    const now = new Date("2026-10-26T15:30:00Z");

    expect(getRecentCutoff("24h", "Europe/Stockholm", now)).toEqual(new Date("2026-10-25T15:30:00Z"));
  });

  it("returns local midnight in the user's time zone for the today window", () => {
    // 15:30 UTC is 16:30 in Stockholm (CET, after the October DST change).
    const now = new Date("2026-10-26T15:30:00Z");

    expect(getRecentCutoff("today", "Europe/Stockholm", now)).toEqual(new Date("2026-10-25T23:00:00Z"));
  });

  it("uses the user's calendar day when it differs from the UTC day", () => {
    // 23:30 UTC on the 25th is already 00:30 on the 26th in Stockholm.
    const now = new Date("2026-10-25T23:30:00Z");

    expect(getRecentCutoff("today", "Europe/Stockholm", now)).toEqual(new Date("2026-10-25T23:00:00Z"));
  });

  it("uses the pre-change offset for midnight on a DST transition day", () => {
    // Stockholm leaves CEST at 03:00 on 2026-10-25; midnight was still UTC+2.
    const now = new Date("2026-10-25T12:00:00Z");

    expect(getRecentCutoff("today", "Europe/Stockholm", now)).toEqual(new Date("2026-10-24T22:00:00Z"));
  });
});

describe("isRecentWindow", () => {
  it("rejects values outside the supported windows", () => {
    expect(isRecentWindow("week")).toBe(false);
  });
});
