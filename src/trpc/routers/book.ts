import {
  BookOrderByWithRelationInput,
  BookScalarFieldEnum,
  BookWhereInput,
} from "@/app/generated/prisma/internal/prismaNamespace";
import z from "zod";
import { authedProcedure, createTRPCRouter } from "../init";

const readStatusEnum = z.enum(["READ", "READING", "TO_READ", "DNF"]);
const bookFiltersSchema = z
  .object({
    status: readStatusEnum.optional(),
    rating: z.number().min(1).max(5).optional(),
    search: z.string().optional(), // Search in title/author
    sortBy: z.enum(Object.values(BookScalarFieldEnum)).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(100).optional(),
  })
  .optional();

export type BookFilters = z.infer<typeof bookFiltersSchema>;

export const bookRouter = createTRPCRouter({
  getBooks: authedProcedure
    .input(bookFiltersSchema)
    .query(async ({ ctx, input }) => {
      const clerkId = ctx.auth.userId;
      const user = await ctx.db.user.findUniqueOrThrow({ where: { clerkId } });
      const userId = user.id;

      const where: BookWhereInput = { userId };

      if (input?.status) {
        where.status = input.status;
      }
      if (input?.rating) {
        where.rating = { gte: input.rating };
      }
      if (input?.search) {
        where.OR = [
          { title: { contains: input.search, mode: "insensitive" } },
          { author: { contains: input.search, mode: "insensitive" } },
          { series: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const orderBy: BookOrderByWithRelationInput = input?.sortBy
        ? { [input.sortBy]: input.sortDirection || "asc" }
        : { title: "asc" };

      const limit = input?.limit || 50;

      const books = await ctx.db.book.findMany({
        where,
        orderBy,
        take: limit + 1,
      });

      let nextCursor: string | undefined = undefined;
      if (books.length > limit) {
        const nextItem = books.pop();
        nextCursor = nextItem!.id.toString();
      }

      return { books, nextCursor };
    }),
});
