import { describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/lib/test-utils";

import { getProgressBefore } from "./progress-before";

const cutoff = new Date("2026-10-03T12:00:00Z");
const recent = new Date("2026-10-04T08:00:00Z");

describe("getProgressBefore", () => {
  it("returns null when the book has no progress rows", async () => {
    const db = createMockDb();

    const result = await getProgressBefore(
      db,
      { id: 1, resetAt: null, rereadAt: null, latestProgressAt: undefined },
      cutoff,
    );

    expect(result).toBeNull();
  });

  it("returns null when the latest row is older than the cutoff", async () => {
    const db = createMockDb();

    const result = await getProgressBefore(
      db,
      { id: 1, resetAt: null, rereadAt: null, latestProgressAt: new Date("2026-10-01T20:00:00Z") },
      cutoff,
    );

    expect(result).toBeNull();
  });

  it("returns the progress of the newest row before the cutoff", async () => {
    const db = createMockDb();
    vi.mocked(db.readingProgress.findFirst).mockResolvedValue({ progress: 40 } as never);

    const result = await getProgressBefore(
      db,
      { id: 1, resetAt: null, rereadAt: null, latestProgressAt: recent },
      cutoff,
    );

    expect(result).toBe(40);
  });

  it("returns zero when every row falls inside the recent window", async () => {
    const db = createMockDb();
    vi.mocked(db.readingProgress.findFirst).mockResolvedValue(null);

    const result = await getProgressBefore(
      db,
      { id: 1, resetAt: null, rereadAt: null, latestProgressAt: recent },
      cutoff,
    );

    expect(result).toBe(0);
  });

  it("ignores rows from before the later of the reset and reread dates", async () => {
    const db = createMockDb();
    vi.mocked(db.readingProgress.findFirst).mockResolvedValue(null);
    const resetAt = new Date("2026-09-01T00:00:00Z");
    const rereadAt = new Date("2026-10-03T09:00:00Z");

    await getProgressBefore(db, { id: 1, resetAt, rereadAt, latestProgressAt: recent }, cutoff);

    expect(db.readingProgress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookId: 1, createdAt: { lt: cutoff, gte: rereadAt } } }),
    );
  });
});
