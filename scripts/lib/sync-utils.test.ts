import { describe, expect, it } from "vitest";

import {
  deriveAbsStatus,
  deriveStatus,
  isRereadStart,
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
  const NO_TIMESTAMPS: [Date | null, Date | null, Date | null, Date | null] = [null, null, null, null];
  const DNF_AT = new Date("2026-06-01");
  const BEFORE_DNF = new Date("2026-05-01");
  const AFTER_DNF = new Date("2026-07-01");
  const RESET_AT = new Date("2026-06-01");
  const BEFORE_RESET = new Date("2026-05-01");
  const AFTER_RESET = new Date("2026-07-01");
  const REREAD_AT = new Date("2026-06-01");
  const BEFORE_REREAD = new Date("2026-05-01");
  const AFTER_REREAD = new Date("2026-07-01");

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
    expect(shouldUpdateStatus("DNF", "READING", DNF_AT, null, null, AFTER_DNF)).toBe(true);
  });

  it("clears DNF to READ when the source's progress signal is newer than the DNF decision", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, AFTER_DNF)).toBe(true);
  });

  it("does not clear DNF when the source's progress signal predates the DNF decision", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, BEFORE_DNF)).toBe(false);
  });

  it("does not clear DNF when dnfAt is unknown", () => {
    expect(shouldUpdateStatus("DNF", "READ", null, null, null, AFTER_DNF)).toBe(false);
  });

  it("does not clear DNF when the source has no progress timestamp", () => {
    expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, null)).toBe(false);
  });

  it("promotes a reset TO_READ book to READING when the source's progress signal is newer than the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, AFTER_RESET)).toBe(true);
  });

  it("promotes a reset TO_READ book to READ when the source's progress signal is newer than the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READ", null, RESET_AT, null, AFTER_RESET)).toBe(true);
  });

  it("does not promote a reset TO_READ book when the source's progress signal predates the reset", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, BEFORE_RESET)).toBe(false);
  });

  it("does not promote a reset TO_READ book when the source has no progress timestamp", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, null)).toBe(false);
  });

  it("promotes an unreset TO_READ book to READING regardless of source timestamp", () => {
    expect(shouldUpdateStatus("TO_READ", "READING", null, null, null, BEFORE_RESET)).toBe(true);
  });

  it("does not change READ_NEXT to TO_READ", () => {
    expect(shouldUpdateStatus("READ_NEXT", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
  });

  it("does not update when status is unchanged", () => {
    expect(shouldUpdateStatus("READING", "READING", ...NO_TIMESTAMPS)).toBe(false);
    expect(shouldUpdateStatus("TO_READ", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
  });

  it("does not promote READING to READ off a stale signal after a reread", () => {
    expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, BEFORE_REREAD)).toBe(false);
  });

  it("promotes READING to READ from a genuine post-reread signal", () => {
    expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, AFTER_REREAD)).toBe(true);
  });

  it("does not promote READING to READ when rereadAt is set but the source has no timestamp", () => {
    expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, null)).toBe(false);
  });

  it("promotes an unreread READING book to READ unconditionally", () => {
    // rereadAt is null for every book that's never been reread — this
    // ordinary "finished reading it" case must keep working exactly as
    // before, with no timestamp requirement.
    expect(shouldUpdateStatus("READING", "READ", null, null, null, null)).toBe(true);
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

  it("does not overwrite progress from a stale cross-source signal after a reread", () => {
    const rereadAt = new Date("2026-08-01");
    const staleSignal = new Date("2026-07-01"); // predates the reread
    expect(shouldLogProgress(100, 5, null, null, rereadAt, staleSignal)).toBe(false);
  });

  it("logs progress from a genuine post-reread signal", () => {
    const rereadAt = new Date("2026-08-01");
    const freshSignal = new Date("2026-08-05");
    expect(shouldLogProgress(15, 5, null, null, rereadAt, freshSignal)).toBe(true);
  });

  it("does not log when rereadAt is set but the source timestamp is unknown", () => {
    const rereadAt = new Date("2026-08-01");
    expect(shouldLogProgress(15, 5, null, null, rereadAt, null)).toBe(false);
  });

  it("is unaffected by the override markers when all of them are null", () => {
    expect(shouldLogProgress(60, 50, null, null, null, null)).toBe(true);
    expect(shouldLogProgress(60, 50)).toBe(true); // existing 2-arg call sites keep working
  });

  it("does not reinflate wiped progress from a source signal predating the reset", () => {
    const resetAt = new Date("2026-08-30");
    const staleSignal = new Date("2026-08-22"); // CWA untouched since before the reset
    expect(shouldLogProgress(1.02, 0, null, resetAt, null, staleSignal)).toBe(false);
  });

  it("logs progress from a source signal newer than the reset", () => {
    const resetAt = new Date("2026-08-30");
    const freshSignal = new Date("2026-09-02"); // book genuinely picked back up
    expect(shouldLogProgress(4, 0, null, resetAt, null, freshSignal)).toBe(true);
  });

  it("does not log when resetAt is set but the source timestamp is unknown", () => {
    expect(shouldLogProgress(1.02, 0, null, new Date("2026-08-30"), null, null)).toBe(false);
  });

  it("does not replay a source signal predating a DNF onto wiped progress", () => {
    const dnfAt = new Date("2026-08-30");
    const staleSignal = new Date("2026-08-22");
    expect(shouldLogProgress(40, 0, dnfAt, null, null, staleSignal)).toBe(false);
  });

  it("gates against the newest marker when several are set", () => {
    const dnfAt = new Date("2026-08-01");
    const resetAt = new Date("2026-08-30"); // newest — this is the one that must apply
    const between = new Date("2026-08-15"); // newer than the DNF, older than the reset
    expect(shouldLogProgress(20, 0, dnfAt, resetAt, null, between)).toBe(false);
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

describe("isRereadStart", () => {
  const finishedAt = new Date("2026-06-01");
  const afterFinish = new Date("2026-07-01");
  const beforeFinish = new Date("2026-05-01");
  const readBook = { status: "READ" as const, progress: 100, finishedAt, rereadAt: null };

  it("fires when a finished book's source progress drops meaningfully after a newer signal", () => {
    expect(isRereadStart(readBook, "READING", 5, afterFinish, 90, 50)).toBe(true);
  });

  it("does not fire when status is not READ", () => {
    expect(isRereadStart({ ...readBook, status: "READING" }, "READING", 5, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire when derived is TO_READ, not READING", () => {
    expect(isRereadStart(readBook, "TO_READ", 0, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire when the previous read never reached minPriorProgress", () => {
    // the 69-row bulk-import case: READ with low/zero recorded progress
    expect(isRereadStart({ ...readBook, progress: 20 }, "READING", 5, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire on a drop smaller than dropThreshold", () => {
    // 90% -> 89%, the noise-level move a book marked read at 90-99% can produce
    expect(isRereadStart({ ...readBook, progress: 90 }, "READING", 89, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire when sourceProgress is null", () => {
    expect(isRereadStart(readBook, "READING", null, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire when finishedAt is null", () => {
    expect(isRereadStart({ ...readBook, finishedAt: null }, "READING", 5, afterFinish, 90, 50)).toBe(false);
  });

  it("does not fire on a stale timestamp that predates the finish", () => {
    expect(isRereadStart(readBook, "READING", 5, beforeFinish, 90, 50)).toBe(false);
  });

  it("does not fire when the source has no timestamp", () => {
    expect(isRereadStart(readBook, "READING", 5, null, 90, 50)).toBe(false);
  });

  it("does not fire when the source timestamp is not newer than an existing rereadAt suppression marker", () => {
    // simulates the post --undo-last state: rereadAt left set as a
    // suppression marker, and the same stale source row (still older than
    // rereadAt) trying to re-trigger detection on the next sync.
    const rereadAt = new Date("2026-07-15");
    expect(isRereadStart({ ...readBook, rereadAt }, "READING", 5, afterFinish, 90, 50)).toBe(false);
  });

  it("fires when the source timestamp is newer than an existing rereadAt suppression marker", () => {
    const rereadAt = new Date("2026-07-01");
    const afterReread = new Date("2026-08-01");
    expect(isRereadStart({ ...readBook, rereadAt }, "READING", 5, afterReread, 90, 50)).toBe(true);
  });
});
