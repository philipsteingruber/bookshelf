import { describe, expect, it } from "vitest";

import { deriveStatus, shouldLogProgress, shouldUpdateStatus, statusPriority } from "./sync-utils";

describe("statusPriority", () => {
  it("DNF and READ have equal priority", () => {
    expect(statusPriority("DNF")).toBe(statusPriority("READ"));
  });

  it("READ > READING > READ_NEXT > TO_READ", () => {
    expect(statusPriority("READ")).toBeGreaterThan(statusPriority("READING"));
    expect(statusPriority("READING")).toBeGreaterThan(statusPriority("READ_NEXT"));
    expect(statusPriority("READ_NEXT")).toBeGreaterThan(statusPriority("TO_READ"));
  });
});

describe("deriveStatus", () => {
  it("returns DNF when dnf=true regardless of other signals", () => {
    expect(deriveStatus(1, 100, true)).toBe("DNF");
    expect(deriveStatus(2, 50, true)).toBe("DNF");
  });

  it("returns READ when read_status=1", () => {
    expect(deriveStatus(1, null, false)).toBe("READ");
  });

  it("returns READ when koboreadpct=100", () => {
    expect(deriveStatus(0, 100, false)).toBe("READ");
  });

  it("returns READING when read_status=2", () => {
    expect(deriveStatus(2, null, false)).toBe("READING");
  });

  it("returns READING when koboreadpct is between 1 and 99", () => {
    expect(deriveStatus(0, 50, false)).toBe("READING");
    expect(deriveStatus(0, 1, false)).toBe("READING");
    expect(deriveStatus(0, 99, false)).toBe("READING");
  });

  it("returns TO_READ when all signals indicate unread", () => {
    expect(deriveStatus(0, null, false)).toBe("TO_READ");
    expect(deriveStatus(null, null, false)).toBe("TO_READ");
  });

  it("returns TO_READ when koboreadpct=0", () => {
    expect(deriveStatus(0, 0, false)).toBe("TO_READ");
  });
});

describe("shouldUpdateStatus", () => {
  it("updates TO_READ to READING", () => {
    expect(shouldUpdateStatus("TO_READ", "READING")).toBe(true);
  });

  it("updates TO_READ to READ", () => {
    expect(shouldUpdateStatus("TO_READ", "READ")).toBe(true);
  });

  it("updates READING to READ", () => {
    expect(shouldUpdateStatus("READING", "READ")).toBe(true);
  });

  it("updates READ_NEXT to READING", () => {
    expect(shouldUpdateStatus("READ_NEXT", "READING")).toBe(true);
  });

  it("does not downgrade READ to READING", () => {
    expect(shouldUpdateStatus("READ", "READING")).toBe(false);
  });

  it("does not change READ to DNF (equal priority)", () => {
    expect(shouldUpdateStatus("READ", "DNF")).toBe(false);
  });

  it("does not change DNF to READ (equal priority)", () => {
    expect(shouldUpdateStatus("DNF", "READ")).toBe(false);
  });

  it("does not change READ_NEXT to TO_READ", () => {
    expect(shouldUpdateStatus("READ_NEXT", "TO_READ")).toBe(false);
  });

  it("does not update when status is unchanged", () => {
    expect(shouldUpdateStatus("READING", "READING")).toBe(false);
    expect(shouldUpdateStatus("TO_READ", "TO_READ")).toBe(false);
  });
});

describe("shouldLogProgress", () => {
  it("returns true when calibre progress is higher than bookshelf", () => {
    expect(shouldLogProgress(60, 50)).toBe(true);
  });

  it("returns true when bookshelf is at 0 and calibre has progress", () => {
    expect(shouldLogProgress(10, 0)).toBe(true);
  });

  it("returns false when progress is equal", () => {
    expect(shouldLogProgress(50, 50)).toBe(false);
  });

  it("returns false when calibre progress is lower", () => {
    expect(shouldLogProgress(40, 50)).toBe(false);
  });

  it("returns false when koboreadpct is null", () => {
    expect(shouldLogProgress(null, 0)).toBe(false);
  });

  it("returns false when koboreadpct is 0", () => {
    expect(shouldLogProgress(0, 0)).toBe(false);
  });
});
