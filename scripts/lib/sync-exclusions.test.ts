import { describe, expect, it } from "vitest";

import { partitionExcluded } from "./sync-exclusions";

interface Row {
  id: number;
  title: string;
}

const rows: Row[] = [
  { id: 1, title: "Kept" },
  { id: 2, title: "Sandbox" },
  { id: 3, title: "Also kept" },
];

describe("partitionExcluded", () => {
  it("moves records whose key is excluded into skipped", () => {
    const { skipped } = partitionExcluded(rows, (r) => r.id, new Set([2]));
    expect(skipped.map((r) => r.title)).toEqual(["Sandbox"]);
  });

  it("keeps every record whose key is not excluded, in original order", () => {
    const { kept } = partitionExcluded(rows, (r) => r.id, new Set([2]));
    expect(kept.map((r) => r.title)).toEqual(["Kept", "Also kept"]);
  });

  it("keeps all records when the exclusion set is empty", () => {
    const { kept, skipped } = partitionExcluded(rows, (r) => r.id, new Set<number>());
    expect({ kept: kept.length, skipped: skipped.length }).toEqual({ kept: 3, skipped: 0 });
  });

  it("matches on the key alone, so a record sharing an excluded title is still kept", () => {
    const lookalike: Row[] = [{ id: 9, title: "Sandbox" }];
    const { kept } = partitionExcluded(lookalike, (r) => r.id, new Set([2]));
    expect(kept).toHaveLength(1);
  });
});
