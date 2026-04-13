import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import {
  createFakeBook,
  createFakeReadingProgress,
  createFakeUser,
  createMockDb,
  createMockLogger,
} from "@/lib/test-utils";

import type { AuthedContext } from "./init";
import { requireOwnedBook, requireOwnedReadingProgress } from "./helpers";

function createAuthedContext(overrides: Partial<AuthedContext> = {}): AuthedContext {
  const mockDb = createMockDb();
  const mockLogger = createMockLogger();
  const mockUser = createFakeUser();

  return {
    db: mockDb,
    auth: { userId: mockUser.clerkId } as AuthedContext["auth"],
    logger: mockLogger,
    currentUser: mockUser,
    ...overrides,
  } as AuthedContext;
}

describe("requireOwnedBook", () => {
  it("returns the book when it exists and belongs to the current user", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ userId: ctx.currentUser.id });

    vi.mocked(ctx.db.book.findUnique).mockResolvedValue(book);

    const result = await requireOwnedBook(ctx, book.id);

    expect(result).toEqual(book);
  });

  it("throws NOT_FOUND when the book does not exist", async () => {
    const ctx = createAuthedContext();

    vi.mocked(ctx.db.book.findUnique).mockResolvedValue(null);

    await expect(requireOwnedBook(ctx, 999)).rejects.toThrow(
      new TRPCError({ code: "NOT_FOUND" }),
    );
  });

  it("throws FORBIDDEN when the book belongs to a different user", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ userId: "other-user-456" });

    vi.mocked(ctx.db.book.findUnique).mockResolvedValue(book);

    await expect(requireOwnedBook(ctx, book.id)).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN" }),
    );
  });

  it("logs a warning with bookId, bookOwnerId, and attemptedBy before throwing FORBIDDEN", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ id: 42, userId: "other-user-456" });

    vi.mocked(ctx.db.book.findUnique).mockResolvedValue(book);

    await expect(requireOwnedBook(ctx, 42)).rejects.toThrow();

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: 42,
        bookOwnerId: "other-user-456",
        attemptedBy: ctx.currentUser.id,
      }),
      expect.any(String),
    );
  });
});

describe("requireOwnedReadingProgress", () => {
  it("returns the reading progress (with book) when it exists and belongs to the current user", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ userId: ctx.currentUser.id });
    const progress = { ...createFakeReadingProgress(), book } as ReadingProgress & { book: Book };

    vi.mocked(ctx.db.readingProgress.findUnique).mockResolvedValue(progress);

    const result = await requireOwnedReadingProgress(ctx, progress.id);

    expect(result).toEqual(progress);
  });

  it("throws NOT_FOUND when the reading progress does not exist", async () => {
    const ctx = createAuthedContext();

    vi.mocked(ctx.db.readingProgress.findUnique).mockResolvedValue(null);

    await expect(requireOwnedReadingProgress(ctx, "nonexistent-id")).rejects.toThrow(
      new TRPCError({ code: "NOT_FOUND" }),
    );
  });

  it("throws FORBIDDEN when the associated book belongs to a different user", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ userId: "other-user-456" });
    const progress = { ...createFakeReadingProgress(), book } as ReadingProgress & { book: Book };

    vi.mocked(ctx.db.readingProgress.findUnique).mockResolvedValue(progress);

    await expect(requireOwnedReadingProgress(ctx, progress.id)).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN" }),
    );
  });

  it("logs a warning with bookId, bookOwnerId, and attemptedBy before throwing FORBIDDEN", async () => {
    const ctx = createAuthedContext();
    const book = createFakeBook({ id: 7, userId: "other-user-456" });
    const progress = {
      ...createFakeReadingProgress({ id: "progress-abc" }),
      book,
    } as ReadingProgress & { book: Book };

    vi.mocked(ctx.db.readingProgress.findUnique).mockResolvedValue(progress);

    await expect(requireOwnedReadingProgress(ctx, "progress-abc")).rejects.toThrow();

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: 7,
        bookOwnerId: "other-user-456",
        attemptedBy: ctx.currentUser.id,
      }),
      expect.any(String),
    );
  });
});
