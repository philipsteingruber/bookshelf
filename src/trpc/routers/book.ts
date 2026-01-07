import { TRPCError } from "@trpc/server";
import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";
import {
  BookOrderByWithRelationInput,
  BookScalarFieldEnum,
  BookWhereInput,
} from "@/generated/prisma/internal/prismaNamespace";
import { logBookUpdate } from "@/lib/book-utils";
import { VALIDATION_LIMITS } from "@/lib/constants";
import { performanceLogger } from "@/lib/logger";
import { createFormSchema } from "@/lib/schemas/book";

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
    limit: z.number().min(1).max(VALIDATION_LIMITS.BOOKS_QUERY_MAX).optional(),
  })
  .optional();

export type BookFilters = z.infer<typeof bookFiltersSchema>;

export const bookRouter = createTRPCRouter({
  getBooks: authedProcedure
    .input(bookFiltersSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.currentUser.id;

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

      const limit = input?.limit || VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT;

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
      const book = await ctx.db.book.findUniqueOrThrow({
        where: { id: bookId },
      });

      if (book.userId !== ctx.currentUser.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return { book };
    }),
  createBook: authedProcedure
    .input(createFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.currentUser.id;

      ctx.logger.info(
        {
          title: input.title,
          author: input.author,
          isbn: input.isbn,
        },
        "Creating book",
      );

      // Check for duplicate series entry
      if (input.series && input.seriesIndex) {
        const duplicateSeriesTimer = performanceLogger(
          "DB: Check for duplicate Series Index",
          500,
          ctx.logger,
        );

        duplicateSeriesTimer.start();
        const duplicateSeries = await ctx.db.book.findFirst({
          where: {
            userId,
            series: { equals: input.series, mode: "insensitive" },
            seriesIndex: input.seriesIndex,
          },
        });
        duplicateSeriesTimer.end();

        if (duplicateSeries) {
          ctx.logger.warn(
            {
              series: input.series,
              seriesIndex: input.seriesIndex,
              existingBookId: duplicateSeries.id,
              existingBookTitle: duplicateSeries.title,
            },
            "Duplicate series entry detected",
          );

          throw new TRPCError({
            code: "CONFLICT",
            message: `You already have "${duplicateSeries.title}" at position ${input.seriesIndex} in ${input.series}`,
          });
        }
      }

      // Check for duplicate ISBN
      if (input.isbn) {
        const duplicateIsbnTimer = performanceLogger(
          "DB: Check for duplicate ISBN",
          500,
          ctx.logger,
        );

        duplicateIsbnTimer.start();
        const duplicateIsbn = await ctx.db.book.findFirst({
          where: {
            userId,
            isbn: input.isbn,
          },
        });
        duplicateIsbnTimer.end({ isbn: input.isbn });

        if (duplicateIsbn) {
          ctx.logger.warn(
            {
              isbn: input.isbn,
              existingBookId: duplicateIsbn.id,
              existingBookTitle: duplicateIsbn.title,
            },
            "Duplicate ISBN detected",
          );

          throw new TRPCError({
            code: "CONFLICT",
            message: `You already have "${duplicateIsbn.title}" with ISBN ${input.isbn}`,
          });
        }
      }

      const createBookTimer = performanceLogger(
        "DB: Create book",
        500,
        ctx.logger,
      );
      createBookTimer.start();
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
          userId,
        },
      });
      createBookTimer.end({ bookId: book.id });

      ctx.logger.info(
        { bookId: book.id, title: book.title, author: book.author },
        "Book created successfully",
      );
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

      // Prepare update data with status and progress in one operation
      const updateData: { status: ReadStatus; progress?: number } = {
        status: input.newStatus,
      };

      // Set progress based on status
      if (input.newStatus === "READ") {
        updateData.progress = VALIDATION_LIMITS.PROGRESS_COMPLETE;
      } else if (
        input.newStatus === "TO_READ" ||
        input.newStatus === "READ_NEXT"
      ) {
        updateData.progress = VALIDATION_LIMITS.PROGRESS_NOT_STARTED;
      }

      // Single database update
      const updatedBook = await ctx.db.book.update({
        data: updateData,
        where: { id: input.bookId },
      });

      // Log updates
      logBookUpdate(
        updatedBook.title,
        updatedBook.id,
        "status",
        updatedBook.status,
      );

      if (updateData.progress !== undefined) {
        logBookUpdate(
          updatedBook.title,
          updatedBook.id,
          "progress",
          updatedBook.progress,
        );
      }

      return updatedBook;
    }),
});
