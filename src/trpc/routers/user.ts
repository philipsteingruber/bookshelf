import z from "zod";

import type { Book } from "@/generated/prisma/client";
import { performanceLogger } from "@/lib/common/logger";
import {
  calculateYearlyStats,
  isToday,
  validateCurrentStreak,
} from "@/lib/reading";
import { recalculateUserStreaks } from "@/lib/reading/streak-utils";

import { authedProcedure, createTRPCRouter } from "../init";

export const userRouter = createTRPCRouter({
  setReadingGoal: authedProcedure
    .input(z.number().int().positive())
    .mutation(async ({ ctx, input: newGoal }) => {
      ctx.logger.debug({ newGoal }, "Setting new yearly goal");

      const currentYear = new Date().getFullYear();

      const upsertReadingGoalTimer = performanceLogger(
        "DB: Upsert new Reading Goal",
      );

      upsertReadingGoalTimer.start();
      const readingGoal = await ctx.db.readingGoal.upsert({
        where: {
          userId_year: { userId: ctx.currentUser.id, year: currentYear },
        },
        create: {
          userId: ctx.currentUser.id,
          year: currentYear,
          goal: newGoal,
        },
        update: { goal: newGoal },
      });

      ctx.logger.info({ newGoal, year: currentYear }, "Reading goal updated");
      return { readingGoal };
    }),

  getReadingGoal: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Getting yearly goal");

    const currentYear = new Date().getFullYear();

    const getReadingGoalTimer = performanceLogger(
      "DB: Get reading goal object (or create if it doesn't exist) for current year",
      500,
      ctx.logger,
    );

    getReadingGoalTimer.start();
    const readingGoal = await ctx.db.readingGoal.upsert({
      where: { userId_year: { userId: ctx.currentUser.id, year: currentYear } },
      create: {
        userId: ctx.currentUser.id,
        year: currentYear,
        // goal defaults to 20 (specified in schema)
      },
      update: {},
    });
    getReadingGoalTimer.end();

    return {
      readingGoal,
      defaultReadingThreshold: ctx.currentUser.defaultReadingThreshold,
    };
  }),

  getReadingGoalHistory: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Getting reading goal history");

    const getReadingGoalHistoryTimer = performanceLogger(
      "DB: Get reading goal history",
      500,
      ctx.logger,
    );

    getReadingGoalHistoryTimer.start();
    const readingGoalHistory = await ctx.db.readingGoal.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { year: "desc" },
    });
    getReadingGoalHistoryTimer.end();

    return { readingGoalHistory };
  }),

  setReadingGoalThreshold: authedProcedure
    .input(z.number().int().nonnegative())
    .mutation(async ({ ctx, input: newThreshold }) => {
      ctx.logger.debug(
        { newThreshold },
        "Setting new default reading goal threshold",
      );

      const setReadingGoalThresholdTimer = performanceLogger(
        "DB: Update default reading threshold on user",
        500,
        ctx.logger,
      );

      setReadingGoalThresholdTimer.start();
      await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: { defaultReadingThreshold: newThreshold },
      });
      setReadingGoalThresholdTimer.end({ newThreshold });

      ctx.logger.info({ newThreshold }, "Reading goal threshold updated");
      return { newThreshold };
    }),

  getYearlyBookStats: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Getting yearly book stats");

    const threshold = ctx.currentUser.defaultReadingThreshold;

    const books = (await ctx.db.book.findMany({
      where: { userId: ctx.currentUser.id, finishedAt: { not: null } },
    })) as Book[];

    const stats = calculateYearlyStats(books, threshold);

    return { booksFinishedByYear: stats.booksFinishedByYear };
  }),

  getUserStats: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Getting user stats");

    const stats = await ctx.db.userStats.upsert({
      where: { userId: ctx.currentUser.id },
      create: { userId: ctx.currentUser.id },
      update: {},
    });

    const timezone = ctx.currentUser.timezone;
    const validatedStreak = validateCurrentStreak(stats, timezone);

    return {
      currentStreak: validatedStreak,
      longestStreak: stats.longestStreak,
      lastReadingDate: stats.lastReadingDate,
      isActiveToday: stats.lastReadingDate
        ? isToday(stats.lastReadingDate, timezone)
        : false,
      totalPagesRead: stats.totalPagesRead,
      totalActiveDays: stats.totalActiveDays,
      streakThreshold: ctx.currentUser.minimumPagesForStreak,
    };
  }),

  setStreakThreshold: authedProcedure
    .input(z.number().int().nonnegative().max(1000))
    .mutation(async ({ ctx, input: newThreshold }) => {
      ctx.logger.debug({ newThreshold }, "Setting new streak threshold");

      await ctx.db.user.update({
        where: { id: ctx.currentUser.id },
        data: { minimumPagesForStreak: newThreshold },
      });

      await recalculateUserStreaks(ctx.db, {
        ...ctx.currentUser,
        minimumPagesForStreak: newThreshold,
      });

      ctx.logger.info({ newThreshold }, "Streak threshold updated");
      return { success: true };
    }),

  setTimezone: authedProcedure
    .input(z.string().min(1).max(100))
    .mutation(async ({ ctx, input: timezone }) => {
      ctx.logger.debug({ timezone }, "Setting user timezone");

      // Only update if timezone has changed
      if (ctx.currentUser.timezone !== timezone) {
        await ctx.db.user.update({
          where: { id: ctx.currentUser.id },
          data: { timezone },
        });

        // Recalculate streaks with new timezone
        await recalculateUserStreaks(ctx.db, {
          ...ctx.currentUser,
          timezone,
        });

        ctx.logger.info({ timezone }, "User timezone updated");
      }

      return { success: true };
    }),

  getTimezone: authedProcedure.query(({ ctx }) => {
    ctx.logger.debug("Getting user timezone");
    return { timezone: ctx.currentUser.timezone };
  }),

  getExportData: authedProcedure.mutation(async ({ ctx }) => {
    ctx.logger.debug("Getting export data");

    const exportDataTimer = performanceLogger(
      "DB: Fetch all export data",
      500,
      ctx.logger,
    );

    exportDataTimer.start();
    const [books, readingProgress, readingGoals, userStats] = await Promise.all(
      [
        ctx.db.book.findMany({
          where: { userId: ctx.currentUser.id },
          orderBy: { createdAt: "asc" },
        }),
        ctx.db.readingProgress.findMany({
          where: { userId: ctx.currentUser.id },
          include: {
            book: { select: { id: true, title: true, author: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        ctx.db.readingGoal.findMany({
          where: { userId: ctx.currentUser.id },
          orderBy: { year: "asc" },
        }),
        ctx.db.userStats.findUnique({ where: { userId: ctx.currentUser.id } }),
      ],
    );

    const user = await ctx.db.user.findUnique({
      where: { id: ctx.currentUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        defaultReadingThreshold: true,
        minimumPagesForStreak: true,
        timezone: true,
        createdAt: true,
      },
    });
    exportDataTimer.end();

    ctx.logger.info(
      {
        bookCount: books.length,
        progressCount: readingProgress.length,
        goalCount: readingGoals.length,
      },
      "Export data retrieved",
    );

    return {
      user,
      books,
      readingProgress,
      readingGoals,
      userStats,
      exportDate: new Date().toISOString(),
    };
  }),
});
