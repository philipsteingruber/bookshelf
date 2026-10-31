import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { removeArgs, removeFromConcordanceAllowlist } from "./concordance-allowlist";

describe("removeArgs", () => {
  it("passes each Calibre id once, in ascending order", () => {
    expect(removeArgs([620, 561, 620])).toEqual(["remove", "561", "620"]);
  });

  it("drops books with no Calibre copy", () => {
    expect(removeArgs([null, 561])).toEqual(["remove", "561"]);
  });

  it("returns nothing to run when no book has a Calibre id", () => {
    expect(removeArgs([null])).toBeNull();
  });
});

describe("removeFromConcordanceAllowlist", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "concordance-"));
    mkdirSync(path.join(dir, "concordance"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs Concordance's remove command from its checkout", () => {
    const run = vi.fn().mockReturnValue("removed 561\nallowlist: 609\n");
    removeFromConcordanceAllowlist([561], dir, run);
    expect(run).toHaveBeenCalledWith(dir, ["remove", "561"]);
  });

  it("prefixes each line of Concordance's output for the log", () => {
    const run = vi.fn().mockReturnValue("removed 561\n");
    expect(removeFromConcordanceAllowlist([561], dir, run)).toEqual(["Concordance allowlist: removed 561"]);
  });

  it("reports a failed removal instead of throwing", () => {
    const run = vi.fn().mockImplementation(() => {
      throw new Error("python3 not found");
    });
    expect(removeFromConcordanceAllowlist([561], dir, run)[0]).toContain("FAILED to remove 561");
  });

  it("skips the call when there is no Concordance checkout", () => {
    const run = vi.fn();
    removeFromConcordanceAllowlist([561], path.join(dir, "missing"), run);
    expect(run).not.toHaveBeenCalled();
  });
});
