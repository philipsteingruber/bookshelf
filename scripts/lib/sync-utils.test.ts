import { describe, expect, it } from "vitest";

import {
  deriveAbsStatus,
  deriveStatus,
  shouldLogProgress,
  shouldUpdateStatus,
  statusPriority,
} from "./sync-utils";

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
  const NO_TIMESTAMPS: [Date | null, Date | null, Date | null] = [null, null, null];
  const DNF_AT = new Date("2026-06-01");
  const BEFORE_DNF = new Date("2026-05-01");
  const AFTER_DNF = new Date("2026-07-01");
  const RESET_AT = new Date("2026-06-01");
  const BEFORE_RESET = new Date("2026-05-01");
  const AFTER_RESET = new Date("2026-07-01");

  it("updates TO_READ to READING", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", ...NO_TIMESTAMPS)).toBe(true);
  });

  it("updates TO_READ to READ", () => {
    expect(shouldUpdateStatus("TO_READ", "READ", ...NO_TIMESTAMPS)).toBe(true);
  });

  it("updates READING to READ", () => {
    expect(shouldUpdateStatus("READING", "READ", ...NO_TIMESTAMPS)).toBe(true);
  });

  it("updates READ_NEXT to READING", () => {
    expect(shouldUpdateStatus("READ_NEXT", "READING", ...NO_TIMESTAMPS)).toBe(true);
  });

  it("does not downgrade READ to READING", () => {
    expect(shouldUpdateStatus("READ", "READING", ...NO_TIMESTAMPS)).toBe(false);
  });

  it("does not change READ to DNF (equal priority)", () => {
    expect(shouldUpdateStatus("READ", "DNF", ...NO_TIMESTAMPS)).toBe(false);
  });

  it("clears DNF to READING when the source's progress signal is newer than the DNF decision", () => {
    expect(shouldUpdateStatus("DNF", "READING", DNF_AT, null, AFTER_DNF)).toBe(true);
  });

  it("clears DNF to READ when the source's progress signal is newer than the DNF decision", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, AFTER_DNF)).toBe(true);
  });

  it("does not clear DNF when the source's progress signal predates the DNF decision", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, BEFORE_DNF)).toBe(false);
  });

  it("does not clear DNF when dnfAt is unknown", () => {
    expect(shouldUpdateStatus("DNF", "READ", null, null, AFTER_DNF)).toBe(false);
  });

  it("does not clear DNF when the source has no progress timestamp", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null)).toBe(false);
  });

  it("promotes a reset TO_READ book to READING when the source's progress signal is newer than the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, AFTER_RESET)).toBe(true);
  });

  it("promotes a reset TO_READ book to READ when the source's progress signal is newer than the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READ", null, RESET_AT, AFTER_RESET)).toBe(true);
  });

  it("does not promote a reset TO_READ book when the source's progress signal predates the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, BEFORE_RESET)).toBe(false);
  });

  it("does not promote a reset TO_READ book when the source has no progress timestamp", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null)).toBe(false);
  });

  it("promotes an unreset TO_READ book to READING regardless of source timestamp", () => {
    // resetAt is null for the overwhelming majority of TO_READ books — ones
    // that were simply never started, not reset from an abandoned READING.
    // That ordinary "starting a new book" case must keep working unconditionally.
    expect(shouldUpdateStatus("TO_READ", "READING", null, null, BEFORE_RESET)).toBe(true);
  });

  it("does not change READ_NEXT to TO_READ", () => {
    expect(shouldUpdateStatus("READ_NEXT", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
  });

  it("does not update when status is unchanged", () => {
    expect(shouldUpdateStatus("READING", "READING", ...NO_TIMESTAMPS)).toBe(false);
    expect(shouldUpdateStatus("TO_READ", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
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

describe("deriveAbsStatus", () => {
  it("returns READ when isFinished is true regardless of progress", () => {
    expect(deriveAbsStatus(40, true)).toBe("READ");
  });

  it("returns READ when progress is 100 even if isFinished is false", () => {
    expect(deriveAbsStatus(100, false)).toBe("READ");
  });

  it("returns READING when progress is between 1 and 99 and not finished", () => {
    expect(deriveAbsStatus(1, false)).toBe("READING");
    expect(deriveAbsStatus(99, false)).toBe("READING");
  });

  it("returns TO_READ when progress is 0 and not finished", () => {
    expect(deriveAbsStatus(0, false)).toBe("TO_READ");
  });
});
