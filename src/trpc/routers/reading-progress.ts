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
  getAllReadingProgress: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Fetching all reading progress for stats calculation");

    const fetchAllProgressTimer = performanceLogger(
      "DB: Fetch all reading progress",
      500,
      ctx.logger,
    );

    fetchAllProgressTimer.start();
    const allProgress = await ctx.db.readingProgress.findMany({
      where: { userId: ctx.currentUser.id },
      include: {
        book: {
          select: {
            pageCount: true,
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    fetchAllProgressTimer.end({ count: allProgress.length });

    return { allProgress };
  }),
  deleteReadingProgressInstance: authedProcedure
    .input(z.string().min(1))
    .mutation(async ({ input: readingProgressId, ctx }) => {
      ctx.logger.debug(
        { readingProgressId },
        "Deleting reading progress instance",
      );

      const fetchReadingProgressTimer = performanceLogger(
        "DB: Fetch reading progress for deletion",
        500,
        ctx.logger,
      );

      fetchReadingProgressTimer.start();
      const readingProgress = await ctx.db.readingProgress.findUnique({
        where: { id: readingProgressId },
        include: { book: true },
      });
      fetchReadingProgressTimer.end({ readingProgressId });

      if (!readingProgress) {
        ctx.logger.warn(
          { readingProgressId },
          `No reading progress with ID ${readingProgressId} found for deletion`,
        );
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (readingProgress.book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId: readingProgress.book.id,
            bookOwnerId: readingProgress.book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleteReadingProgressTransactionTimer = performanceLogger(
        "DB: Transaction - Delete ReadingProgress / Update Book Progress",
        1000,
        ctx.logger,
      );

      deleteReadingProgressTransactionTimer.start();
      try {
        await ctx.db.$transaction(async (tx) => {
          await tx.readingProgress.delete({
            where: { id: readingProgressId },
          });

          const latestReadingProgress = await tx.readingProgress.findFirst({
            where: {
              bookId: readingProgress.bookId,
              userId: ctx.currentUser.id,
            },
            orderBy: { progress: "desc" },
          });

          const updateData: { progress: number; status?: "TO_READ" } = {
            progress: latestReadingProgress?.progress ?? 0,
          };
          if (
            !latestReadingProgress &&
            readingProgress.book.status !== "DNF" &&
            readingProgress.book.status !== "READ"
          ) {
            updateData.status = "TO_READ";
          }

          await tx.book.update({
            where: { id: readingProgress.bookId },
            data: updateData,
          });
        });
        deleteReadingProgressTransactionTimer.end({ success: true });
      } catch (error) {
        deleteReadingProgressTransactionTimer.end({ success: false });
        ctx.logger.error(
          { error, readingProgressId: readingProgress.id },
          "Failed to delete reading progress",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete reading progress",
          cause: error,
        });
      }

      ctx.logger.info(
        {
          readingProgressId,
          bookId: readingProgress.bookId,
          progress: readingProgress.progress,
        },
        "Reading progress instance deleted",
      );

      return;
    }),

  updateReadingProgressInstance: authedProcedure
    .input(
      z.object({
        progressId: z.string().min(1),
        newProgress: z.number().int().nonnegative().max(100),
        comments: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug(
        { progressId: input.progressId, newProgress: input.newProgress },
        "Updating reading progress instance",
      );

      const fetchProgressTimer = performanceLogger(
        "DB: Fetch reading progress for update",
        500,
        ctx.logger,
      );

      fetchProgressTimer.start();
      const readingProgress = await ctx.db.readingProgress.findUnique({
        where: { id: input.progressId },
        include: { book: true },
      });
      fetchProgressTimer.end({ progressId: input.progressId });

      if (!readingProgress) {
        ctx.logger.warn(
          { progressId: input.progressId },
          `No reading progress with ID ${input.progressId} found for update`,
        );
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (readingProgress.book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId: readingProgress.book.id,
            bookOwnerId: readingProgress.book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      ctx.logger.debug(
        {
          progressId: input.progressId,
          bookId: readingProgress.bookId,
          currentProgress: readingProgress.progress,
          requestedProgress: input.newProgress,
        },
        "Fetched progress entry, validating constraints",
      );

      const fetchConstraintsTimer = performanceLogger(
        "DB: Fetch previous/next reading progress for chronological validation",
        500,
        ctx.logger,
      );

      fetchConstraintsTimer.start();
      const previousReadingProgressInstance =
        await ctx.db.readingProgress.findFirst({
          where: {
            bookId: readingProgress.bookId,
            createdAt: { lt: readingProgress.createdAt },
          },
          orderBy: { createdAt: "desc" },
        });
      const nextReadingProgressInstance =
        await ctx.db.readingProgress.findFirst({
          where: {
            bookId: readingProgress.bookId,
            createdAt: { gt: readingProgress.createdAt },
          },
          orderBy: { createdAt: "asc" },
        });
      fetchConstraintsTimer.end({
        hasPreviousEntry: !!previousReadingProgressInstance,
        hasNextEntry: !!nextReadingProgressInstance,
      });

      if (
        previousReadingProgressInstance &&
        input.newProgress <= previousReadingProgressInstance.progress
      ) {
        ctx.logger.warn(
          {
            progressId: input.progressId,
            requestedProgress: input.newProgress,
            previousProgress: previousReadingProgressInstance.progress,
            previousProgressId: previousReadingProgressInstance.id,
          },
          "Validation failed: new progress not greater than previous entry",
        );
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      if (
        nextReadingProgressInstance &&
        input.newProgress >= nextReadingProgressInstance.progress
      ) {
        ctx.logger.warn(
          {
            progressId: input.progressId,
            requestedProgress: input.newProgress,
            nextProgress: nextReadingProgressInstance.progress,
            nextProgressId: nextReadingProgressInstance.id,
          },
          "Validation failed: new progress not less than next entry",
        );
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      ctx.logger.debug(
        {
          progressId: input.progressId,
          bookId: readingProgress.bookId,
          willUpdateBookProgress: !nextReadingProgressInstance,
        },
        "Chronological validation passed, starting transaction",
      );

      const updateProgressTimer = performanceLogger(
        "DB: Transaction - Update ReadingProgress and optionally Book Progress",
        1000,
        ctx.logger,
      );

      updateProgressTimer.start();
      const updatedProgress = await ctx.db.$transaction(async (tx) => {
        try {
          ctx.logger.debug(
            { progressId: input.progressId },
            "Updating reading progress entry",
          );

          const updatedProgress = await tx.readingProgress.update({
            where: { id: input.progressId },
            data: { progress: input.newProgress, comments: input.comments },
          });

          if (!nextReadingProgressInstance) {
            ctx.logger.debug(
              {
                progressId: input.progressId,
                bookId: readingProgress.bookId,
                newBookProgress: input.newProgress,
              },
              "This is the most recent progress entry, updating book progress",
            );

            await tx.book.update({
              where: { id: readingProgress.bookId },
              data: { progress: input.newProgress },
            });
          } else {
            ctx.logger.debug(
              {
                progressId: input.progressId,
                bookId: readingProgress.bookId,
                nextProgressId: nextReadingProgressInstance.id,
              },
              "Not the most recent entry, skipping book progress update",
            );
          }

          return updatedProgress;
        } catch (error) {
          updateProgressTimer.end({ success: false });
          ctx.logger.error(
            { error, readingProgressId: readingProgress.id },
            "Transaction failed during reading progress update",
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update reading progress",
            cause: error,
          });
        }
      });
      updateProgressTimer.end({ success: true });

      ctx.logger.info(
        {
          progressId: input.progressId,
          bookId: readingProgress.bookId,
          oldProgress: readingProgress.progress,
          newProgress: updatedProgress.progress,
          commentsUpdated: input.comments !== undefined,
          oldComments: readingProgress.comments,
          newComments: updatedProgress.comments,
        },
        "Reading progress instance updated successfully",
      );

      return { updatedProgress };
    }),
});
