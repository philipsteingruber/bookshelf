import { describe, expect, it } from "vitest";

import { parseMaintenanceChanges } from "./script-output";

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
