import { ReadStatus } from "@/app/generated/prisma/enums";
import {
  BookOrderByWithRelationInput,
  BookScalarFieldEnum,
  BookWhereInput,
} from "@/app/generated/prisma/internal/prismaNamespace";
import { createFormSchema } from "@/lib/schemas/book";
import { logBookUpdate } from "@/utils/utils";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { authedProcedure, createTRPCRouter } from "../init";

const readStatusEnum = z.enum([
  "READ",
  "READING",
  "TO_READ",
  "DNF",
  "READ_NEXT",
]);
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
          { isbn: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const orderBy: BookOrderByWithRelationInput = input?.sortBy
        ? { [input.sortBy]: input.sortDirection || "asc" }
        : { title: "asc" };

      const limit = input?.limit || 50;

      const books = await ctx.db.book.findMany({
        where,
        orderBy,
        take: limit,
      });

      return { books };
    }),
  getBook: authedProcedure
    .input(z.number().min(0))
    .query(async ({ ctx, input: bookId }) => {
      const clerkId = ctx.auth.userId;
      const user = await ctx.db.user.findUnique({ where: { clerkId } });

      const book = await ctx.db.book.findUniqueOrThrow({
        where: { id: bookId },
      });

      if (user?.id !== book?.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return { book };
    }),
  createBook: authedProcedure
    .input(createFormSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { clerkId: ctx.auth.userId },
      });

      const book = await ctx.db.book.create({
        data: {
          title: input.title,
          author: input.author,
          pageCount: input.pageCount,
          isbn: input.isbn,
          series: input.series,
          seriesIndex: input.seriesIndex,
          publishedYear: input.publishedYear,
          summary: input.summary,
          coverUrl: input.coverUrl,
          userId: user.id,
        },
      });

      console.log(`Book Created: ${book.title} - ${book.author}`);
      return { book };
    }),
  updateReadingStatus: authedProcedure
    .input(
      z.object({
        bookId: z.number(),
        newStatus: z.enum(Object.values(ReadStatus)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const book = await ctx.db.book.findUniqueOrThrow({
        where: { id: input.bookId },
      });

      if (book.userId !== ctx.currentUser.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updatedBook = await ctx.db.book.update({
        data: { status: input.newStatus },
        where: { id: input.bookId },
      });

      if (updatedBook.status === "READ") {
        const bookUpdatedProgress = await ctx.db.book.update({
          data: { progress: 100 },
          where: { id: input.bookId },
        });
        logBookUpdate(
          bookUpdatedProgress.title,
          bookUpdatedProgress.id,
          "progress",
          bookUpdatedProgress.progress,
        );
      }

      if (
        updatedBook.status === "TO_READ" ||
        updatedBook.status === "READ_NEXT"
      ) {
        const bookUpdatedProgress = await ctx.db.book.update({
          data: { progress: 0 },
          where: { id: input.bookId },
        });
        logBookUpdate(
          bookUpdatedProgress.title,
          bookUpdatedProgress.id,
          "progress",
          bookUpdatedProgress.progress,
        );
      }

      logBookUpdate(
        updatedBook.title,
        updatedBook.id,
        "status",
        updatedBook.status,
      );

      return updatedBook;
    }),
});
