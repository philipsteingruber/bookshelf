import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import {
  createLoggerWithContext,
  performanceLogger,
} from "@/lib/common/logger";
import prisma from "@/lib/prisma";

export const createTRPCContext = cache(async () => {
  const headersList = await headers();

  const requestId = headersList.get("x-request-id") ?? undefined;
  const userId = headersList.get("x-user-id") ?? undefined;
  const route = headersList.get("x-pathname") ?? undefined;

  const logger = createLoggerWithContext({ requestId, userId, route });

  return { db: prisma, auth: await auth(), logger };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
});

const isAuthed = t.middleware(async ({ next, ctx }) => {
  if (!ctx.auth.userId) {
    ctx.logger.warn("Authentication check failed: No userId in auth context");
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const fetchUserTimer = performanceLogger(
    "DB: Fetch user for auth check",
    2000,
    ctx.logger,
  );

  fetchUserTimer.start();
  const currentUser = await ctx.db.user.findUnique({
    where: { clerkId: ctx.auth.userId },
  });
  fetchUserTimer.end({ clerkId: ctx.auth.userId });

  if (!currentUser) {
    ctx.logger.warn(
      { clerkId: ctx.auth.userId },
      "User not found in database despite valid Clerk auth",
    );
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  ctx.logger.debug(
    { userId: currentUser.id },
    "User authenticated successfully",
  );

  return next({
    ctx: {
      ...ctx,
      currentUser,
    },
  });
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
export const authedProcedure = publicProcedure.use(isAuthed);
