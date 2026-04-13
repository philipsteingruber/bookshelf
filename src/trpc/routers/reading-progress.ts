import { TRPCError } from "@trpc/server";
import { addDays, startOfDay, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import z from "zod";

import type { Book, ReadingProgress } from "@/generated/prisma/client";
import { calculatePagesFromProgress } from "@/lib/book";
import { performanceLogger } from "@/lib/common/logger";
import { calculateStreakUpdate } from "@/lib/reading";
import { recalculateUserStreaks } from "@/lib/reading/streak-utils";

import { requireOwnedBook, requireOwnedReadingProgress } from "../helpers";
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

      const book = await requireOwnedBook(ctx, input.bookId);

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
        1000,
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

      const timezone = ctx.currentUser.timezone;
      const todayStart = fromZonedTime(
        startOfDay(toZonedTime(new Date(), timezone)),
        timezone,
      );
      const todayProgressInstances = await ctx.db.readingProgress.findMany({
        where: { userId: ctx.currentUser.id, createdAt: { gte: todayStart } },
        include: { book: { select: { pageCount: true } } },
      });

      const progressByBook = new Map<number, number>();
      todayProgressInstances.forEach((entry) => {
        const current = progressByBook.get(entry.bookId) ?? 0;
        if (entry.progress > current) {
          progressByBook.set(entry.bookId, entry.progress);
        }
      });
      let pagesReadToday = 0;
      progressByBook.forEach((maxProgress, bookId) => {
        const entry = todayProgressInstances.find((e) => e.bookId === bookId)!;
        pagesReadToday += calculatePagesFromProgress(
          maxProgress,
          entry.book.pageCount,
        );
      });

      const dayCountsForStreak =
        pagesReadToday >= ctx.currentUser.minimumPagesForStreak;
      const currentStreak = await ctx.db.userStats.upsert({
        where: { userId: ctx.currentUser.id },
        create: { userId: ctx.currentUser.id },
        update: {},
      });
      const isFirstEntryToday = todayProgressInstances.length === 1;

      if (dayCountsForStreak) {
        const { newStreak, shouldUpdate } = calculateStreakUpdate(
          currentStreak.lastReadingDate,
          currentStreak.currentStreak,
          ctx.currentUser.timezone,
        );

        if (shouldUpdate) {
          await ctx.db.userStats.update({
            where: { userId: ctx.currentUser.id },
            data: {
              currentStreak: newStreak,
              longestStreak: Math.max(newStreak, currentStreak.longestStreak),
              lastReadingDate: new Date(),
              lastQualifyingReadingDate: new Date(),
              totalActiveDays: isFirstEntryToday
                ? currentStreak.totalActiveDays + 1
                : currentStreak.totalActiveDays,
            },
          });
        }
      }

      // Use delta (new progress - old progress) to avoid overcounting
      const pagesFromThisEntry = calculatePagesFromProgress(
        result.readingProgress.progress - book.progress,
        book.pageCount,
      );
      await ctx.db.userStats.update({
        where: { userId: ctx.currentUser.id },
        data: { totalPagesRead: { increment: pagesFromThisEntry } },
      });

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
      await requireOwnedBook(ctx, bookId);

      const fetchReadingProgressHistoryTimer = performanceLogger(
        "DB: Fetch reading progress history",
        1000,
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
      1000,
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

      const readingProgressToDelete = await requireOwnedReadingProgress(ctx, readingProgressId);

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
              bookId: readingProgressToDelete.bookId,
              userId: ctx.currentUser.id,
            },
            orderBy: { progress: "desc" },
          });

          const updateData: { progress: number; status?: "TO_READ" } = {
            progress: latestReadingProgress?.progress ?? 0,
          };
          if (
            !latestReadingProgress &&
            readingProgressToDelete.book.status !== "DNF" &&
            readingProgressToDelete.book.status !== "READ"
          ) {
            updateData.status = "TO_READ";
          }

          await tx.book.update({
            where: { id: readingProgressToDelete.bookId },
            data: updateData,
          });

          // Only adjust totalPagesRead if the deleted entry was the highest for this book
          // Decrement by the delta between old max and new max
          if (
            readingProgressToDelete.progress ===
            readingProgressToDelete.book.progress
          ) {
            const newMaxProgress = latestReadingProgress?.progress ?? 0;
            const pagesToDecrement = calculatePagesFromProgress(
              readingProgressToDelete.progress - newMaxProgress,
              readingProgressToDelete.book.pageCount,
            );
            await tx.userStats.update({
              where: { userId: ctx.currentUser.id },
              data: {
                totalPagesRead: { decrement: pagesToDecrement },
              },
            });
          }

          const timezone = ctx.currentUser.timezone;
          const entryInTz = toZonedTime(readingProgressToDelete.createdAt, timezone);
          const dayStartUTC = fromZonedTime(startOfDay(entryInTz), timezone);
          const nextDayStartUTC = fromZonedTime(addDays(startOfDay(entryInTz), 1), timezone);
          const entriesOnSameDay = await tx.readingProgress.count({
            where: {
              userId: ctx.currentUser.id,
              createdAt: {
                gte: dayStartUTC,
                lt: nextDayStartUTC,
              },
            },
          });

          if (entriesOnSameDay === 0) {
            await tx.userStats.update({
              where: { userId: ctx.currentUser.id },
              data: { totalActiveDays: { decrement: 1 } },
            });

            await recalculateUserStreaks(tx, ctx.currentUser);
          }
        });
        deleteReadingProgressTransactionTimer.end({ success: true });
      } catch (error) {
        deleteReadingProgressTransactionTimer.end({ success: false });
        ctx.logger.error(
          { error, readingProgressId: readingProgressToDelete.id },
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
          bookId: readingProgressToDelete.bookId,
          progress: readingProgressToDelete.progress,
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

      const readingProgress = await requireOwnedReadingProgress(ctx, input.progressId);

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
        1000,
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

  getRecentReadingProgress: authedProcedure
    .input(
      z.object({ sinceDays: z.number().int().positive().max(90).default(14) }),
    )
    .query(async ({ ctx, input }) => {
      const sinceDate = subDays(new Date(), input.sinceDays);

      return ctx.db.readingProgress.findMany({
        where: { userId: ctx.currentUser.id, createdAt: { gte: sinceDate } },
        include: {
          book: { select: { id: true, title: true, pageCount: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),
});
