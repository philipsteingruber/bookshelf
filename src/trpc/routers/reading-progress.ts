import { TRPCError } from "@trpc/server";
import z from "zod";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import { performanceLogger } from "@/lib/logger";

import { authedProcedure, createTRPCRouter } from "../init";

export const readingProgressRouter = createTRPCRouter({
  createReadingProgressInstance: authedProcedure
    .input(
      z.object({
        bookId: z.int().min(1),
        newProgress: z.int().min(0).max(100).optional(),
        newPagesRead: z.int().min(0).optional(),
        comments: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug("Creating new ReadingProgress instance");

      if (!input.newPagesRead && !input.newProgress) {
        ctx.logger.error(
          {
            bookId: input.bookId,
            newProgress: input.newProgress,
            newPagesRead: input.newPagesRead,
          },
          "Tried to create reading progress without supplying progress data",
        );
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for ReadingProgress creation",
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
      });
      fetchBookTimer.end({ bookId: book?.id });

      if (!book) {
        ctx.logger.warn(
          { bookId: input.bookId },
          "No book found for reading progress creation",
        );
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

      const progress =
        input.newProgress ??
        Math.floor(((input.newPagesRead ?? 0) / book.pageCount) * 100);

      if (progress < 0 || progress > 100) {
        ctx.logger.warn(
          {
            calculatedProgress: progress,
            newPagesRead: input.newPagesRead,
            newProgress: input.newProgress,
            pageCount: book.pageCount,
            bookId: input.bookId,
          },
          "Calculated progress not in valid range (0-100)",
        );
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      if (progress <= book.progress) {
        ctx.logger.warn(
          {
            newProgress: progress,
            oldProgress: book.progress,
            bookId: book.id,
          },
          "Tried to create a reading progress instance with less progress than book's progress",
        );
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const readingProgressTimer = performanceLogger(
        "DB: Starting transaction - Create ReadingProgress, Update book progress/status",
        500,
        ctx.logger,
      );

      let result: { readingProgress: ReadingProgress; updatedBook: Book };
      readingProgressTimer.start();

      try {
        result = await ctx.db.$transaction(async (tx) => {
          const readingProgress = await tx.readingProgress.create({
            data: {
              userId: ctx.currentUser.id,
              bookId: book.id,
              progress,
              comments: input.comments,
            },
          });

          const updateData: {
            progress: number;
            status?: "READ";
            finishedAt?: Date;
          } = {
            progress,
          };

          if (progress === 100) {
            updateData.status = "READ";
            updateData.finishedAt = new Date();
          }

          const updatedBook = await tx.book.update({
            data: updateData,
            where: { id: input.bookId },
          });

          return { readingProgress, updatedBook };
        });

        readingProgressTimer.end({ success: true });
      } catch (error) {
        readingProgressTimer.end({ success: false });
        ctx.logger.error(
          { bookId: input.bookId, progress, error },
          "Failed to create reading progress/update book",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update reading progress",
          cause: error,
        });
      }

      ctx.logger.info(
        {
          bookId: input.bookId,
          readingProgressId: result.readingProgress.id,
          oldProgress: book.progress,
          newProgress: result.updatedBook.progress,
          oldStatus: book.status,
          newStatus: result.updatedBook.status,
        },
        "ReadingProcess created, Book progress updated",
      );
      return {
        readingProgress: result.readingProgress,
        updatedBook: result.updatedBook,
      };
    }),
  getProgressHistory: authedProcedure
    .input(z.int().min(1))
    .query(async ({ ctx, input: bookId }) => {
      ctx.logger.debug({ bookId }, "Getting reading progress history");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for reading progress history",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({ where: { id: bookId } });
      fetchBookTimer.end({ bookId });

      if (!book) {
        ctx.logger.warn(
          { bookId },
          "No book found for fetching reading progress history",
        );
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

      const fetchReadingProgressHistoryTimer = performanceLogger(
        "DB: Fetch reading progress history",
        500,
        ctx.logger,
      );

      fetchReadingProgressHistoryTimer.start();
      const readingProgressHistory = await ctx.db.readingProgress.findMany({
        where: { bookId, userId: ctx.currentUser.id },
        orderBy: { createdAt: "asc" },
      });
      fetchReadingProgressHistoryTimer.end({ bookId });

      return { readingProgressHistory };
    }),
});
