import { TRPCError } from "@trpc/server";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import { performanceLogger } from "@/lib/common/logger";

import type { AuthedContext } from "./init";

/**
 * Fetches a book by ID and verifies the current user owns it.
 * Throws NOT_FOUND if the book does not exist.
 * Throws FORBIDDEN if the book belongs to a different user (with a warning log).
 * Returns the Book record on success.
 */
export const requireOwnedBook = async (ctx: AuthedContext, bookId: number): Promise<Book> => {
  const timer = performanceLogger("DB: Fetch book for ownership check", 1000, ctx.logger);

  timer.start();
  const book = await ctx.db.book.findUnique({ where: { id: bookId } });
  timer.end({ bookId });

  if (!book) {
    ctx.logger.warn({ bookId }, "Book not found");
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (book.userId !== ctx.currentUser.id) {
    ctx.logger.warn(
      {
        bookId: book.id,
        bookOwnerId: book.userId,
        attemptedBy: ctx.currentUser.id,
      },
      "Permission denied: Attempted to access another user's book",
    );
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return book;
};

/**
 * Fetches a ReadingProgress entry (with its book) by ID and verifies the current user owns
 * the associated book.
 * Throws NOT_FOUND if the entry does not exist.
 * Throws FORBIDDEN if the associated book belongs to a different user (with a warning log).
 * Returns the ReadingProgress record (with book included) on success.
 */
export const requireOwnedReadingProgress = async (
  ctx: AuthedContext,
  readingProgressId: string,
): Promise<ReadingProgress & { book: Book }> => {
  const timer = performanceLogger("DB: Fetch reading progress for ownership check", 1000, ctx.logger);

  timer.start();
  const readingProgress = await ctx.db.readingProgress.findUnique({
    where: { id: readingProgressId },
    include: { book: true },
  });
  timer.end({ readingProgressId });

  if (!readingProgress) {
    ctx.logger.warn({ readingProgressId }, "Reading progress not found");
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (readingProgress.book.userId !== ctx.currentUser.id) {
    ctx.logger.warn(
      {
        readingProgressId,
        bookId: readingProgress.book.id,
        bookOwnerId: readingProgress.book.userId,
        attemptedBy: ctx.currentUser.id,
      },
      "Permission denied: Attempted to access another user's reading progress",
    );
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return readingProgress;
};
