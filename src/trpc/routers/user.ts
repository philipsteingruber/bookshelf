import { authedProcedure, createTRPCRouter } from "../init";

export const userRouter = createTRPCRouter({
  getUserByClerkId: authedProcedure.query(async ({ ctx }) => {
    return { user: ctx.currentUser };
  }),
});
