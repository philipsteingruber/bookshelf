import z from "zod";
import { authedProcedure, createTRPCRouter } from "../init";

export const userRouter = createTRPCRouter({
  getUserByClerkId: authedProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input: clerkId }) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { clerkId },
      });

      return { user };
    }),
});
