import { describe, expect, it } from "vitest";

import { parseMaintenanceChanges, parsePythonChanges } from "./script-output";

describe("parseMaintenanceChanges", () => {
  it("extracts the changes count from the result line", () => {
    expect(parseMaintenanceChanges("MAINTENANCE_RESULT: changes=5")).toBe(5);
  });

  it("extracts zero changes", () => {
    expect(parseMaintenanceChanges("MAINTENANCE_RESULT: changes=0")).toBe(0);
  });

  it("returns the last occurrence when the line appears multiple times", () => {
    const output = "MAINTENANCE_RESULT: changes=3\nMAINTENANCE_RESULT: changes=7";
    expect(parseMaintenanceChanges(output)).toBe(7);
  });

  it("returns null when the result line is absent", () => {
    expect(parseMaintenanceChanges("some unrelated output")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseMaintenanceChanges("")).toBeNull();
  });

  it("ignores surrounding output and finds the result line", () => {
    const output = "Processing 10 books…\nAll done.\nMAINTENANCE_RESULT: changes=2\n";
    expect(parseMaintenanceChanges(output)).toBe(2);
  });
});

describe("parsePythonChanges", () => {
  it("sums all matched pattern counts", () => {
    const output = [
      "Tags merged         : 3",
      "Book links removed  : 1",
      "AI-categorized books: 2",
      "Uncategorized books : 0",
      "Orphan tags cleaned : 1",
    ].join("\n");
    expect(parsePythonChanges(output)).toBe(7);
  });

  it("returns 0 when no patterns match", () => {
    expect(parsePythonChanges("nothing relevant here")).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(parsePythonChanges("")).toBe(0);
  });

  it("handles missing patterns gracefully by treating them as 0", () => {
    const output = "Tags merged         : 4\nOrphan tags cleaned : 2";
    expect(parsePythonChanges(output)).toBe(6);
  });

  it("accepts patterns with varying whitespace around the colon", () => {
    expect(parsePythonChanges("Tags merged : 5")).toBe(5);
  });
});
