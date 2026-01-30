import z from "zod";

import { performanceLogger } from "@/lib/common";

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

      return { newThreshold };
    }),
});
