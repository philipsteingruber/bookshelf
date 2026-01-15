import z from "zod";

import type { ReadingGoal } from "@/generated/prisma/client";
import { performanceLogger } from "@/lib/logger";

import { authedProcedure, createTRPCRouter } from "../init";

export const userRouter = createTRPCRouter({
  setReadingGoal: authedProcedure
    .input(z.number().int().positive())
    .mutation(async ({ ctx, input: newGoal }) => {
      ctx.logger.debug({ newGoal }, "Setting new yearly goal");

      const currentYear = new Date().getFullYear();

      const getReadingGoalTimer = performanceLogger(
        "DB: Get reading goal for current year",
      );

      getReadingGoalTimer.start();
      const readingGoal = await ctx.db.readingGoal.findUnique({
        where: {
          userId_year: { userId: ctx.currentUser.id, year: currentYear },
        },
      });
      getReadingGoalTimer.end({ currentYear });

      if (readingGoal) {
        const setUpdatingGoalTimer = performanceLogger(
          "DB: Update reading goal",
          500,
          ctx.logger,
        );

        setUpdatingGoalTimer.start();
        const updatedGoal = await ctx.db.readingGoal.update({
          where: { id: readingGoal.id },
          data: { goal: newGoal },
        });
        setUpdatingGoalTimer.end({ newGoal });

        return { updatedGoal };
      } else {
        const readingGoal = await ctx.db.readingGoal.create({
          data: {
            userId: ctx.currentUser.id,
            year: currentYear,
            goal: newGoal,
          } satisfies Partial<ReadingGoal>,
        });

        return { readingGoal };
      }
    }),

  getReadingGoal: authedProcedure.query(async ({ ctx }) => {
    ctx.logger.debug("Getting yearly goal");

    const currentYear = new Date().getFullYear();

    const getReadingGoalTimer = performanceLogger(
      "DB: Get user object to return yearly goal",
      500,
      ctx.logger,
    );

    let readingGoal: ReadingGoal | null;
    getReadingGoalTimer.start();
    readingGoal = await ctx.db.readingGoal.findUnique({
      where: { userId_year: { userId: ctx.currentUser.id, year: currentYear } },
    });
    getReadingGoalTimer.end();

    if (!readingGoal) {
      const createReadingGoalTimer = performanceLogger(
        "DB: Create Reading Goal",
        500,
        ctx.logger,
      );
      createReadingGoalTimer.start();
      readingGoal = await ctx.db.readingGoal.create({
        data: {
          userId: ctx.currentUser.id,
          year: currentYear,
        } satisfies Partial<ReadingGoal>,
      });
      createReadingGoalTimer.end();
    }

    return { readingGoal };
  }),
});
