import { TRPCError } from "@trpc/server";
import { UTApi } from "uploadthing/server";
import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";
import {
  type BookOrderByWithRelationInput,
  type BookWhereInput,
} from "@/generated/prisma/internal/prismaNamespace";
import { createAuthorSort, createTitleSort } from "@/lib/book";
import { extractFileKeyFromUrl } from "@/lib/common";
import { performanceLogger } from "@/lib/common/logger";
import { VALIDATION_LIMITS } from "@/lib/constants";
import { createFormSchema } from "@/lib/schemas/book";
import { bookFiltersSchema } from "@/lib/schemas/book-filters";

import { authedProcedure, createTRPCRouter } from "../init";

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

      const sortDirection = filters?.sortDirection || "asc";
      let orderBy:
        | BookOrderByWithRelationInput
        | BookOrderByWithRelationInput[];
      if (filters?.sortBy) {
        if (filters.sortBy === "series") {
          orderBy = [
            { series: { sort: "asc", nulls: "last" } },
            { seriesIndex: "asc" },
            { titleSort: "asc" },
          ];
        } else {
          orderBy = { [filters.sortBy]: sortDirection };
        }
      } else {
        orderBy = { title: "asc" };
      }

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
      const { bookId, newStatus } = input;

      ctx.logger.debug({ bookId, newStatus }, "Updating reading status");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for status update",
        500,
        ctx.logger,
      );

      fetchBookTimer.start();
      const book = await ctx.db.book.findUnique({
        where: { id: bookId },
      });
      fetchBookTimer.end({ bookId });

      if (!book) {
        ctx.logger.warn({ bookId }, "Book not found for status update");
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (book.userId !== ctx.currentUser.id) {
        ctx.logger.warn(
          {
            bookId,
            bookOwnerId: book.userId,
            attemptedBy: ctx.currentUser.id,
          },
          "Permission denied: Attempted to update another user's book status",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updateData: {
        status: ReadStatus;
        progress?: number;
        startedAt?: Date | null;
        finishedAt?: Date | null;
      } = { status: newStatus };

      if (newStatus === "READ") {
        updateData.finishedAt = new Date();
        updateData.progress = 100;
      } else if (newStatus === "TO_READ" || newStatus === "READ_NEXT") {
        updateData.progress = 0;
        updateData.startedAt = null;
        updateData.finishedAt = null;
      } else if (newStatus === "READING") {
        updateData.startedAt = new Date();
      }

      const transactionTimer = performanceLogger(
        "DB: Update reading status transaction",
        1000,
        ctx.logger,
      );

      transactionTimer.start();
      const updatedBook = await ctx.db.$transaction(async (tx) => {
        if (newStatus === "TO_READ" || newStatus === "READ_NEXT") {
          const deleted = await tx.readingProgress.deleteMany({
            where: { bookId },
          });
          ctx.logger.debug(
            { bookId, deletedCount: deleted.count },
            "Deleted reading progress entries",
          );
        } else if (newStatus === "READING") {
          const existing = await tx.readingProgress.findFirst({
            where: { bookId, progress: 0 },
          });
          if (!existing) {
            await tx.readingProgress.create({
              data: { bookId, userId: ctx.currentUser.id, progress: 0 },
            });
            ctx.logger.debug({ bookId }, "Created initial 0% reading progress");
          }
        }

        return tx.book.update({ where: { id: bookId }, data: updateData });
      });
      transactionTimer.end({ bookId });

      ctx.logger.info(
        {
          bookId,
          oldStatus: book.status,
          newStatus: updatedBook.status,
          oldProgress: book.progress,
          newProgress: updatedBook.progress,
        },
        "Reading status updated",
      );

      return { updatedBook };
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
    }),
  updateBook: authedProcedure
    .input(
      z.object({
        bookId: z.number().int().nonnegative(),
        data: createFormSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug({ bookId: input.bookId }, "Updating book");

      const fetchBookTimer = performanceLogger(
        "DB: Fetch book for update",
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
          `No book with ID ${input.bookId} found for update`,
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
          "Permission denied: Attempted to update another user's book",
        );
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data = input.data;

      if (data.series || data.seriesIndex) {
        const updatedSeriesState = {
          series: data.series || book.series,
          seriesIndex: data.seriesIndex || book.seriesIndex,
        };
        if (updatedSeriesState.series && updatedSeriesState.seriesIndex) {
          const seriesConflictTimer = performanceLogger(
            "DB: Check for series conflict during update",
            500,
            ctx.logger,
          );

          seriesConflictTimer.start();
          const seriesDuplicate = await ctx.db.book.findFirst({
            where: {
              id: { not: book.id },
              series: {
                equals: updatedSeriesState.series,
                mode: "insensitive",
              },
              seriesIndex: updatedSeriesState.seriesIndex,
              userId: ctx.currentUser.id,
            },
          });
          seriesConflictTimer.end();

          if (seriesDuplicate) {
            ctx.logger.warn(
              {
                bookId: input.bookId,
                series: updatedSeriesState.series,
                seriesIndex: updatedSeriesState.seriesIndex,
                existingBookId: seriesDuplicate.id,
                existingBookTitle: seriesDuplicate.title,
              },
              "Duplicate series entry detected during update",
            );
            throw new TRPCError({
              code: "CONFLICT",
              message: `You already have "${seriesDuplicate.title}" at position ${updatedSeriesState.seriesIndex} in ${updatedSeriesState.series}`,
            });
          }
        }
      }

      if (data.isbn) {
        const isbnConflictTimer = performanceLogger(
          "DB: Check for ISBN conflict during update",
          500,
          ctx.logger,
        );

        isbnConflictTimer.start();
        const isbnDuplicate = await ctx.db.book.findFirst({
          where: {
            isbn: data.isbn,
            userId: ctx.currentUser.id,
            NOT: { id: book.id },
          },
        });
        isbnConflictTimer.end();

        if (isbnDuplicate) {
          ctx.logger.warn(
            {
              bookId: input.bookId,
              isbn: data.isbn,
              existingBookId: isbnDuplicate.id,
              existingBookTitle: isbnDuplicate.title,
            },
            "Duplicate ISBN detected during update",
          );
          throw new TRPCError({
            code: "CONFLICT",
            message: `You already have "${isbnDuplicate.title}" with ISBN ${data.isbn}`,
          });
        }
      }

      if (
        book.coverUrl &&
        data.coverUrl !== undefined &&
        data.coverUrl !== book.coverUrl
      ) {
        const fileKeyToDelete = extractFileKeyFromUrl(book.coverUrl);
        const utAPI = new UTApi();

        if (fileKeyToDelete) {
          try {
            await utAPI.deleteFiles(fileKeyToDelete);
            ctx.logger.info(
              { fileKey: fileKeyToDelete, bookId: input.bookId },
              "Old cover image deleted from UploadThing",
            );
          } catch (error) {
            ctx.logger.warn(
              { error, fileKey: fileKeyToDelete, bookId: input.bookId },
              "Failed to delete old cover from UploadThing",
            );
          }
        }
      }

      let titleSort = book.titleSort;
      if (data.title) {
        titleSort = createTitleSort(data.title);
      }
      let authorSort = book.authorSort;
      if (data.author) {
        authorSort = createAuthorSort(data.author);
      }

      const updateBookTimer = performanceLogger(
        "DB: Update book",
        500,
        ctx.logger,
      );

      updateBookTimer.start();
      const updatedBook = await ctx.db.book.update({
        where: { id: input.bookId },
        data: {
          ...data,
          titleSort,
          authorSort,
          isbn: data.isbn === "" ? null : data.isbn,
          series: data.series === "" ? null : data.series,
          coverUrl: data.coverUrl === "" ? null : data.coverUrl,
        },
      });
      updateBookTimer.end({ bookId: input.bookId });

      ctx.logger.info(
        {
          bookId: input.bookId,
          updatedFields: Object.keys(data),
        },
        "Book updated successfully",
      );

      return { book: updatedBook };
    }),
  getSeriesList: authedProcedure.query(async ({ ctx }) => {
    const seriesData = await ctx.db.book.groupBy({
      by: ["series"],
      where: { userId: ctx.currentUser.id, series: { not: null } },
      _count: { series: true },
      orderBy: { series: "asc" },
    });

    return {
      seriesData: await Promise.all(
        seriesData
          .filter((s) => !!s.series)
          .map(async (s) => ({
            name: s.series as string,
            bookCount: s._count.series,
            books: await ctx.db.book.findMany({
              where: { userId: ctx.currentUser.id, series: s.series },
              take: 5,
            }),
          })),
      ),
    };
  }),
});
