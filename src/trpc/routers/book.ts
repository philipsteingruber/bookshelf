import { TRPCError } from "@trpc/server";
import { UTApi } from "uploadthing/server";
import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";
import type {
  BookOrderByWithRelationInput,
  BookWhereInput,
} from "@/generated/prisma/internal/prismaNamespace";
import { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";
import { createAuthorSort, createTitleSort } from "@/lib/book-utils";
import { VALIDATION_LIMITS } from "@/lib/constants";
import { performanceLogger } from "@/lib/logger";
import { createFormSchema } from "@/lib/schemas/book";
import { extractFileKeyFromUrl } from "@/lib/uploadthing-utils";

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
    .query(async ({ ctx, input: filters }) => {
      const userId = ctx.currentUser.id;

      ctx.logger.debug(filters, "Querying books with filters");

      const where: BookWhereInput = { userId };

      if (filters?.status) {
        where.status = filters.status;
      }
      if (filters?.rating) {
        where.rating = { gte: filters.rating };
      }
      if (filters?.search) {
        where.OR = [
          { title: { contains: filters.search, mode: "insensitive" } },
          { author: { contains: filters.search, mode: "insensitive" } },
          { series: { contains: filters.search, mode: "insensitive" } },
          { isbn: { contains: filters.search, mode: "insensitive" } },
        ];
      }

      const orderBy: BookOrderByWithRelationInput = filters?.sortBy
        ? { [filters.sortBy]: filters.sortDirection || "asc" }
        : { title: "asc" };

      const limit = filters?.limit || VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT;

      const findBooksTimer = performanceLogger(
        "DB: Fetching books",
        500,
        ctx.logger,
      );

      findBooksTimer.start();
      const books = await ctx.db.book.findMany({
        where,
        orderBy,
        take: limit,
      });
      findBooksTimer.end({ ...filters, count: books.length });

      ctx.logger.debug({ count: books.length }, "Books query completed");
      return { books };
    }),
  getBook: authedProcedure
    .input(z.number().min(0))
    .query(async ({ ctx, input: bookId }) => {
      ctx.logger.debug({ bookId }, "Fetching book by ID");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book by ID",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({
        where: { id: bookId },
      });
      fetchBookTimer.end({ bookId });

      if (!book) {
        ctx.logger.warn({ bookId }, "Book not found");
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId: book.id,
            bookOwnerId: book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      ctx.logger.debug({ bookId }, "Successfully fetched book");
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
          "DB: Check for duplicate series index",
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
          titleSort: createTitleSort(input.title),
          author: input.author,
          authorSort: createAuthorSort(input.author),
          pageCount: input.pageCount,
          isbn: input.isbn || null,
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
        {
          bookId: book.id,
          title: book.title,
          author: book.author,
          isbn: book.isbn,
        },
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
      ctx.logger.info(
        { bookId: input.bookId, newStatus: input.newStatus },
        "Updating reading status",
      );

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for status update",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
      });
      fetchBookTimer.end({ bookId: input.bookId });

      if (!book) {
        ctx.logger.warn(
          { bookId: input.bookId },
          "No book found for status update",
        );
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId: book.id,
            bookOwnerId: book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Prepare update data with status and progress in one operation
      const updateData: {
        status: ReadStatus;
        progress?: number;
        startedAt?: Date | null;
        finishedAt?: Date | null;
      } = {
        status: input.newStatus,
      };

      // Set progress/timestamps based on status
      if (input.newStatus === "READ") {
        updateData.progress = VALIDATION_LIMITS.PROGRESS_COMPLETE;
        updateData.finishedAt = new Date();
      } else if (
        input.newStatus === "TO_READ" ||
        input.newStatus === "READ_NEXT"
      ) {
        updateData.progress = VALIDATION_LIMITS.PROGRESS_NOT_STARTED;
        updateData.startedAt = null;
      } else if (input.newStatus === "READING") {
        updateData.startedAt = new Date();

        const createInitialReadingProgressTimer = performanceLogger(
          "DB: Check/Create initial ReadingProgress instance for book set as READING",
          500,
          ctx.logger,
        );
        createInitialReadingProgressTimer.start();
        const existingInitialEntry = await ctx.db.readingProgress.findFirst({
          where: {
            bookId: input.bookId,
            userId: ctx.currentUser.id,
            progress: 0,
          },
        });
        if (!existingInitialEntry) {
          await ctx.db.readingProgress.create({
            data: {
              bookId: input.bookId,
              userId: ctx.currentUser.id,
              progress: 0,
            },
          });
        }
        createInitialReadingProgressTimer.end({ bookId: input.bookId });
      }

      const updateBookStatusTimer = performanceLogger(
        "DB: Update book status/progress",
        500,
        ctx.logger,
      );

      updateBookStatusTimer.start();
      const updatedBook = await ctx.db.book.update({
        data: updateData,
        where: { id: input.bookId },
      });
      updateBookStatusTimer.end({ bookId: input.bookId });

      ctx.logger.info(
        {
          bookId: updatedBook.id,
          oldStatus: book.status,
          newStatus: updatedBook.status,
          oldProgress: book.progress,
          newProgress: updatedBook.progress,
          oldStartedAt: book.startedAt,
          newStartedAt: updatedBook.startedAt,
          oldFinishedAt: book.finishedAt,
          newFinishedAt: updatedBook.finishedAt,
        },
        "Book status (and progress/timestamps if relevant) updated",
      );

      return updatedBook;
    }),
  updatePageCount: authedProcedure
    .input(z.object({ bookId: z.number(), newPageCount: z.int().positive() }))
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug({ bookId: input.bookId }, "Updating book pagecount");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for pagecount update",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
      });
      fetchBookTimer.end({ bookId: input.bookId });

      if (!book) {
        ctx.logger.warn(
          { bookId: input.bookId },
          `No book with ID ${input.bookId} found for pagecount update`,
        );
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId: input.bookId,
            bookOwnerId: book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updatePageCountTimer = performanceLogger(
        "DB: Update book pagecount",
        500,
        ctx.logger,
      );

      updatePageCountTimer.start();
      const updatedBook = await ctx.db.book.update({
        data: { pageCount: input.newPageCount },
        where: { id: input.bookId },
      });
      updatePageCountTimer.end({ bookId: input.bookId });

      ctx.logger.info(
        {
          bookId: input.bookId,
          oldPageCount: book.pageCount,
          newPageCount: updatedBook.pageCount,
        },
        "Book pagecount updated",
      );

      return updatedBook;
    }),
  deleteBook: authedProcedure
    .input(z.number().int().nonnegative())
    .mutation(async ({ input: bookId, ctx }) => {
      ctx.logger.debug({ bookId }, "Deleting book");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for deletion",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({ where: { id: bookId } });
      fetchBookTimer.end({ bookId });

      if (!book) {
        ctx.logger.warn(
          { bookId },
          `No book with ID ${bookId} found for deletion`,
        );
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId,
            bookOwnerId: book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to access another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleteBookTimer = performanceLogger(
        "DB: Delete book",
        500,
        ctx.logger,
      );

      deleteBookTimer.start();
      await ctx.db.book.delete({ where: { id: bookId } });
      deleteBookTimer.end({ bookId });

      if (book.coverUrl) {
        const fileKey = extractFileKeyFromUrl(book.coverUrl);
        if (fileKey) {
          try {
            const utApi = new UTApi();
            await utApi.deleteFiles(fileKey);
            ctx.logger.info(
              { fileKey, bookId },
              "Cover image deleted from UploadThing",
            );
          } catch (error) {
            ctx.logger.error(
              { fileKey, bookId, error },
              "Failed to delete cover from UploadThing",
            );
          }
        }
      }

      ctx.logger.info(
        {
          bookId,
          title: book.title,
          author: book.author,
        },
        "Book deleted",
      );

      return;
    }),
});
