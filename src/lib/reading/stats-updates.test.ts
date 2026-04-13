import { subDays } from "date-fns";
import { describe, expect, it, vi } from "vitest";

import {
  createFakeReadingProgressWithBook,
  createFakeUser,
  createFakeUserStats,
  createMockDb,
} from "@/lib/test-utils";

import { recalculateAllUserStats } from "./stats-updates";

describe("recalculateAllUserStats", () => {
  it("upserts zero stats when the user has no reading history", async () => {
    const mockDb = createMockDb();
    const user = createFakeUser({ minimumPagesForStreak: 0 });

    vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
    vi.mocked(mockDb.userStats.upsert).mockResolvedValue(createFakeUserStats());

    await recalculateAllUserStats(mockDb, user);

    expect(mockDb.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: user.id },
        create: expect.objectContaining({
          currentStreak: 0,
          longestStreak: 0,
          lastReadingDate: null,
          lastQualifyingReadingDate: null,
          totalPagesRead: 0,
          totalActiveDays: 0,
        }),
        update: expect.objectContaining({
          currentStreak: 0,
          longestStreak: 0,
          lastReadingDate: null,
          lastQualifyingReadingDate: null,
          totalPagesRead: 0,
          totalActiveDays: 0,
        }),
      }),
    );
  });

  it("sets lastReadingDate to the most recent progress entry's createdAt", async () => {
    const mockDb = createMockDb();
    const user = createFakeUser({ minimumPagesForStreak: 0, timezone: "UTC" });

    const recentDate = new Date("2026-03-10T12:00:00Z");
    const progress = createFakeReadingProgressWithBook({
      userId: user.id,
      createdAt: recentDate,
      progress: 50,
      book: { pageCount: 200, id: 1, title: "Book" },
    });

    vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([progress]);
    vi.mocked(mockDb.userStats.upsert).mockResolvedValue(createFakeUserStats());

    await recalculateAllUserStats(mockDb, user);

    expect(mockDb.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastReadingDate: recentDate }),
        update: expect.objectContaining({ lastReadingDate: recentDate }),
      }),
    );
  });

  it("computes totalPagesRead and totalActiveDays from full history", async () => {
    const mockDb = createMockDb();
    const user = createFakeUser({ minimumPagesForStreak: 0, timezone: "UTC" });

    // Two entries on separate days, each reading 100 pages on a 200-page book (50%)
    const day1 = createFakeReadingProgressWithBook({
      userId: user.id,
      createdAt: new Date("2026-03-09T10:00:00Z"),
      progress: 50,
      book: { pageCount: 200, id: 1, title: "Book A" },
    });
    const day2 = createFakeReadingProgressWithBook({
      userId: user.id,
      createdAt: new Date("2026-03-10T10:00:00Z"),
      progress: 50,
      book: { pageCount: 200, id: 2, title: "Book B" },
    });

    vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([day1, day2]);
    vi.mocked(mockDb.userStats.upsert).mockResolvedValue(createFakeUserStats());

    await recalculateAllUserStats(mockDb, user);

    const upsertCall = vi.mocked(mockDb.userStats.upsert).mock.calls[0][0];
    expect(upsertCall.create.totalPagesRead).toBeGreaterThan(0);
    expect(upsertCall.create.totalActiveDays).toBe(2);
    expect(upsertCall.create.totalPagesRead).toEqual(upsertCall.update.totalPagesRead);
    expect(upsertCall.create.totalActiveDays).toEqual(upsertCall.update.totalActiveDays);
  });

  it("queries all progress for the correct user ordered by createdAt", async () => {
    const mockDb = createMockDb();
    const user = createFakeUser({ id: "specific-user-id" });

    vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([]);
    vi.mocked(mockDb.userStats.upsert).mockResolvedValue(createFakeUserStats());

    await recalculateAllUserStats(mockDb, user);

    expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "specific-user-id" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("computes a streak from consecutive qualifying days", async () => {
    const mockDb = createMockDb();
    // minimumPagesForStreak = 0 so any entry counts
    const user = createFakeUser({ minimumPagesForStreak: 0, timezone: "UTC" });

    const today = new Date();
    const yesterday = subDays(today, 1);

    const entry1 = createFakeReadingProgressWithBook({
      userId: user.id,
      createdAt: new Date(yesterday.toISOString().replace("T", "T") ),
      progress: 50,
      book: { pageCount: 100, id: 1, title: "Book" },
    });
    const entry2 = createFakeReadingProgressWithBook({
      userId: user.id,
      createdAt: today,
      progress: 75,
      book: { pageCount: 100, id: 1, title: "Book" },
    });

    vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([entry1, entry2]);
    vi.mocked(mockDb.userStats.upsert).mockResolvedValue(createFakeUserStats());

    await recalculateAllUserStats(mockDb, user);

    const upsertCall = vi.mocked(mockDb.userStats.upsert).mock.calls[0][0];
    expect(upsertCall.create.currentStreak).toBeGreaterThanOrEqual(1);
    expect(upsertCall.create.longestStreak).toBeGreaterThanOrEqual(1);
  });
});
