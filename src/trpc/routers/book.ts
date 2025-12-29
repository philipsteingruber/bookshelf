import { authedProcedure, createTRPCRouter } from "../init";

export const bookRouter = createTRPCRouter({
  getBooks: authedProcedure.query(async ({ ctx }) => {
    const clerkId = ctx.auth.userId;
    const user = await ctx.db.user.findUniqueOrThrow({ where: { clerkId } });
    const userId = user.id;

    const books = await ctx.db.book.findMany({ where: { userId } });
    return { books };
  }),
});
