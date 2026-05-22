import { TRPCError } from "@trpc/server";
import { subWeeks } from "date-fns";
import { del } from "@vercel/blob";
import z from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ReadStatus } from "@/generated/prisma/enums";
import { type BookWhereInput } from "@/generated/prisma/internal/prismaNamespace";
import {
  cleanupOrphanedSeries,
  createAuthorSort,
  createTitleSort,
  toOrderBy,
  upsertSeries,
} from "@/lib/book";
import { isBlobUrl, uploadCoverFromUrl } from "@/lib/common";
import { performanceLogger } from "@/lib/common/logger";
import { VALIDATION_LIMITS } from "@/lib/constants";
import { createBookInputSchema, createFormSchema } from "@/lib/schemas/book";
import { bookFiltersSchema } from "@/lib/schemas/book-filters";

import { requireOwnedBook } from "../helpers";
import { authedProcedure, createTRPCRouter } from "../init";

const SERIES_INCLUDE = { series: true } as const;

export const bookRouter = createTRPCRouter({
  getBooks: authedProcedure.input(bookFiltersSchema).query(async ({ ctx, input: filters }) => {
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
        { series: { name: { contains: filters.search, mode: "insensitive" } } },
        { isbn: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters?.unrated) {
      where.rating = null;
    }

    const orderBy = toOrderBy(filters?.sortBy ?? "title", filters?.sortDirection ?? "asc");

    const limit = filters?.limit || VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT;
    let skip: number;
    if (filters?.page) {
      skip = (filters.page - 1) * limit;
    } else {
      skip = 0;
    }

    const findBooksTimer = performanceLogger("DB: Fetching books", 1000, ctx.logger);

    findBooksTimer.start();
    const [books, totalCount] = await Promise.all([
      ctx.db.book.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: SERIES_INCLUDE,
      }),
      ctx.db.book.count({ where }),
    ]);
    findBooksTimer.end({ ...filters, count: books.length });

    ctx.logger.debug({ count: books.length }, "Books query completed");
    return { books, totalCount };
  }),

  getBook: authedProcedure.input(z.number().min(0)).query(async ({ ctx, input: bookId }) => {
    ctx.logger.debug({ bookId }, "Fetching book by ID");

    const book = await ctx.db.book.findUnique({
      where: { id: bookId },
      include: SERIES_INCLUDE,
    });

    if (!book) {
      ctx.logger.warn({ bookId }, "Book not found");
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (book.userId !== ctx.currentUser.id) {
      ctx.logger.warn({ bookId, attemptedBy: ctx.currentUser.id }, "Permission denied");
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    ctx.logger.debug({ bookId }, "Successfully fetched book");
    return { book };
  }),

  createBook: authedProcedure.input(createBookInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.currentUser.id;

    const normalizedSeries = input.series && input.series.trim() !== "" ? input.series.trim() : null;

    ctx.logger.info(
      { title: input.title, author: input.author, isbn: input.isbn },
      "Creating book",
    );

    // Check for duplicate ISBN
    if (input.isbn) {
      const duplicateIsbnTimer = performanceLogger("DB: Check for duplicate ISBN", 1000, ctx.logger);
      duplicateIsbnTimer.start();
      const duplicateIsbn = await ctx.db.book.findFirst({
        where: { userId, isbn: input.isbn },
      });
      duplicateIsbnTimer.end({ isbn: input.isbn });

      if (duplicateIsbn) {
        ctx.logger.warn(
          { isbn: input.isbn, existingBookId: duplicateIsbn.id, existingBookTitle: duplicateIsbn.title },
          "Duplicate ISBN detected",
        );
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have "${duplicateIsbn.title}" with ISBN ${input.isbn}`,
        });
      }
    }

    // Upload external cover URL to Vercel Blob so all covers share one domain
    let coverUrl = input.coverUrl || null;
    if (coverUrl && !isBlobUrl(coverUrl)) {
      ctx.logger.info({ url: coverUrl }, "Uploading external cover URL to Vercel Blob");
      coverUrl = await uploadCoverFromUrl(coverUrl);
      ctx.logger.info({ blobUrl: coverUrl }, "External cover uploaded to Vercel Blob");
    }

    // Upsert series if provided
    let seriesId: string | null = null;
    if (normalizedSeries) {
      seriesId = await upsertSeries(ctx.db, normalizedSeries, userId);
    }

    const alreadyReadData = input.alreadyRead
      ? {
          status: "READ" as const,
          progress: 100,
          finishedAt: input.finishedAt,
          startedAt: input.startedAt ?? null,
          rating: input.rating ?? null,
        }
      : {};

    const createBookTimer = performanceLogger("DB: Create book", 1000, ctx.logger);
    createBookTimer.start();

    try {
      const book = await ctx.db.book.create({
        data: {
          title: input.title,
          titleSort: createTitleSort(input.title),
          author: input.author,
          authorSort: createAuthorSort(input.author),
          pageCount: input.pageCount,
          isbn: input.isbn || null,
          seriesId,
          seriesIndex: input.seriesIndex,
          publishedYear: input.publishedYear,
          summary: input.summary,
          coverUrl,
          goodreadsUrl: input.goodreadsUrl || null,
          userId,
          ...alreadyReadData,
        },
      });
      createBookTimer.end({ bookId: book.id });

      ctx.logger.info({ bookId: book.id, title: book.title, author: book.author }, "Book created successfully");
      return { book };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a book at position ${input.seriesIndex} in ${normalizedSeries ?? "this series"}`,
        });
      }
      throw error;
    }
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
      const book = await requireOwnedBook(ctx, bookId);

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

      const transactionTimer = performanceLogger("DB: Update reading status transaction", 1000, ctx.logger);

      transactionTimer.start();
      const updatedBook = await ctx.db.$transaction(async (tx) => {
        if (newStatus === "TO_READ" || newStatus === "READ_NEXT") {
          const deleted = await tx.readingProgress.deleteMany({
            where: { bookId },
          });
          ctx.logger.debug({ bookId, deletedCount: deleted.count }, "Deleted reading progress entries");
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
        { bookId, oldStatus: book.status, newStatus: updatedBook.status, oldProgress: book.progress, newProgress: updatedBook.progress },
        "Reading status updated",
      );

      return { updatedBook };
    }),

  updatePageCount: authedProcedure
    .input(z.object({ bookId: z.number(), newPageCount: z.int().positive() }))
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug({ bookId: input.bookId }, "Updating book pagecount");
      const book = await requireOwnedBook(ctx, input.bookId);

      const updatePageCountTimer = performanceLogger("DB: Update book pagecount", 1000, ctx.logger);

      updatePageCountTimer.start();
      const updatedBook = await ctx.db.book.update({
        data: { pageCount: input.newPageCount },
        where: { id: input.bookId },
      });
      updatePageCountTimer.end({ bookId: input.bookId });

      ctx.logger.info(
        { bookId: input.bookId, oldPageCount: book.pageCount, newPageCount: updatedBook.pageCount },
        "Book pagecount updated",
      );

      return updatedBook;
    }),

  updateRating: authedProcedure
    .input(
      z.object({
        bookId: z.number().int().nonnegative(),
        rating: z.number().int().min(1).max(5).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug({ bookId: input.bookId }, "Updating book rating");
      const book = await requireOwnedBook(ctx, input.bookId);

      const updateRatingTimer = performanceLogger("DB: Update book rating", 1000, ctx.logger);

      updateRatingTimer.start();
      const updatedBook = await ctx.db.book.update({
        where: { id: input.bookId },
        data: { rating: input.rating },
      });
      updateRatingTimer.end({ bookId: input.bookId });

      ctx.logger.info(
        { bookId: input.bookId, oldRating: book.rating, newRating: input.rating },
        "Book rating updated",
      );

      return { book: updatedBook };
    }),

  deleteBook: authedProcedure.input(z.number().int().nonnegative()).mutation(async ({ input: bookId, ctx }) => {
    ctx.logger.debug({ bookId }, "Deleting book");
    const book = await requireOwnedBook(ctx, bookId);

    const deleteBookTimer = performanceLogger("DB: Delete book", 1000, ctx.logger);

    deleteBookTimer.start();
    await ctx.db.book.delete({ where: { id: bookId } });
    deleteBookTimer.end({ bookId });

    // Clean up orphaned series
    if (book.seriesId) {
      await cleanupOrphanedSeries(ctx.db, book.seriesId);
    }

    if (book.coverUrl && isBlobUrl(book.coverUrl)) {
      try {
        await del(book.coverUrl);
        ctx.logger.info({ url: book.coverUrl, bookId }, "Cover image deleted from Vercel Blob");
      } catch (error) {
        ctx.logger.error({ url: book.coverUrl, bookId, error }, "Failed to delete cover from Vercel Blob");
      }
    }

    ctx.logger.info({ bookId, title: book.title, author: book.author }, "Book deleted");
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
      const book = await requireOwnedBook(ctx, input.bookId);

      const data = input.data;

      if (data.isbn) {
        const isbnConflictTimer = performanceLogger("DB: Check for ISBN conflict during update", 1000, ctx.logger);

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
            { bookId: input.bookId, isbn: data.isbn, existingBookId: isbnDuplicate.id, existingBookTitle: isbnDuplicate.title },
            "Duplicate ISBN detected during update",
          );
          throw new TRPCError({
            code: "CONFLICT",
            message: `You already have "${isbnDuplicate.title}" with ISBN ${data.isbn}`,
          });
        }
      }

      // Resolve new seriesId
      const oldSeriesId = book.seriesId;
      let newSeriesId: string | null | undefined = undefined; // undefined = no change

      if (data.series !== undefined) {
        const trimmed = data.series?.trim() ?? "";
        if (trimmed === "") {
          newSeriesId = null;
        } else {
          newSeriesId = await upsertSeries(ctx.db, trimmed, ctx.currentUser.id);
        }
      }

      // Upload external cover URL to Vercel Blob so all covers share one domain
      let resolvedCoverUrl = data.coverUrl;
      if (resolvedCoverUrl && !isBlobUrl(resolvedCoverUrl)) {
        ctx.logger.info({ url: resolvedCoverUrl, bookId: input.bookId }, "Uploading external cover URL to Vercel Blob");
        resolvedCoverUrl = await uploadCoverFromUrl(resolvedCoverUrl);
        ctx.logger.info({ blobUrl: resolvedCoverUrl, bookId: input.bookId }, "External cover uploaded to Vercel Blob");
      }

      if (book.coverUrl && isBlobUrl(book.coverUrl) && resolvedCoverUrl !== undefined && resolvedCoverUrl !== book.coverUrl) {
        try {
          await del(book.coverUrl);
          ctx.logger.info(
            { url: book.coverUrl, bookId: input.bookId },
            "Old cover image deleted from Vercel Blob",
          );
        } catch (error) {
          ctx.logger.warn(
            { error, url: book.coverUrl, bookId: input.bookId },
            "Failed to delete old cover from Vercel Blob",
          );
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

      // Omit `series` (the string field no longer exists on Book — it's now a relation)
      const { series: _series, ...restData } = data;

      const updateBookTimer = performanceLogger("DB: Update book", 1000, ctx.logger);

      updateBookTimer.start();

      try {
        const updatedBook = await ctx.db.book.update({
          where: { id: input.bookId },
          data: {
            ...restData,
            titleSort,
            authorSort,
            isbn: data.isbn === "" ? null : data.isbn,
            coverUrl: resolvedCoverUrl === "" ? null : resolvedCoverUrl,
            ...(newSeriesId !== undefined ? { seriesId: newSeriesId } : {}),
          },
        });
        updateBookTimer.end({ bookId: input.bookId });

        // Clean up orphaned series if series changed
        if (newSeriesId !== undefined && oldSeriesId && oldSeriesId !== newSeriesId) {
          await cleanupOrphanedSeries(ctx.db, oldSeriesId);
        }

        ctx.logger.info(
          { bookId: input.bookId, updatedFields: Object.keys(data) },
          "Book updated successfully",
        );

        return { book: updatedBook };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A book already exists at that position in this series`,
          });
        }
        throw error;
      }
    }),

  getSeriesList: authedProcedure.query(async ({ ctx }) => {
    const seriesData = await ctx.db.series.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { nameSort: "asc" },
      include: {
        books: { take: 5, orderBy: { seriesIndex: "asc" } },
        _count: { select: { books: true } },
      },
    });

    return {
      seriesData: seriesData.map((s) => ({
        name: s.name,
        bookCount: s._count.books,
        books: s.books,
      })),
    };
  }),

  getSeriesNames: authedProcedure.query(async ({ ctx }) => {
    const series = await ctx.db.series.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { nameSort: "asc" },
      select: { id: true, name: true },
    });
    return { series };
  }),

  getDashBoardBooks: authedProcedure.query(async ({ ctx }) => {
    const [readingBooks, readingBooksCount, readNextBooks, readNextBooksCount, recentlyReadBooks] = await Promise.all([
      ctx.db.book.findMany({
        where: { status: "READING", userId: ctx.currentUser.id },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: SERIES_INCLUDE,
      }),
      ctx.db.book.count({
        where: { status: "READING", userId: ctx.currentUser.id },
      }),
      ctx.db.book.findMany({
        where: { status: "READ_NEXT", userId: ctx.currentUser.id },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: SERIES_INCLUDE,
      }),
      ctx.db.book.count({
        where: { status: "READ_NEXT", userId: ctx.currentUser.id },
      }),
      ctx.db.book.findMany({
        where: {
          status: "READ",
          finishedAt: {
            gte: subWeeks(new Date(), 2),
          },
          userId: ctx.currentUser.id,
        },
        orderBy: { finishedAt: "desc" },
        take: 10,
        include: SERIES_INCLUDE,
      }),
    ]);

    return {
      readingBooks,
      readingBooksCount,
      readNextBooks,
      readNextBooksCount,
      recentlyReadBooks,
    };
  }),
});
