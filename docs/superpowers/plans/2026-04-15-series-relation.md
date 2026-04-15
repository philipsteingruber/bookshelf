# Series Relation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `series String?` field on `Book` with a proper per-user `Series` relation model, eliminating N+1 queries in `getSeriesList`, enabling autocomplete in the series form field, and enforcing series uniqueness at the DB level.

**Architecture:** A new `Series` model holds `name`, `nameSort`, and `userId`. `Book` gets a nullable `seriesId` FK. The migration is two-phase: Phase 1 renames the old `series` string column to `seriesName` (preserving data), adds the `Series` model, and adds `seriesId`. A seed script populates `Series` rows and links books. Phase 2 drops `seriesName`. Export format is preserved (series emitted as a name string). All book queries gain `include: { series: true }`.

**Tech Stack:** Prisma (db push, no migrations), TRPC, React Hook Form, ShadCN `Command` + `Popover` (combobox), `tsx` (seed script runner)

> **⚠️ TypeScript compilation is broken between Task 1 and the end of Task 7.** Do not run typecheck until instructed. Each task moves closer to full TypeScript validity; Task 7 restores it.

---

## File Map

**New files:**

- `scripts/migrate-series.ts` — one-time data migration: reads `seriesName`, creates `Series` rows, links books via `seriesId`
- `src/lib/book/series-utils.ts` — `upsertSeries` and `cleanupOrphanedSeries` helpers

**Modified files:**

- `prisma/schema.prisma` — Phase 1 (Series model + Book changes), Phase 2 (drop seriesName)
- `src/lib/book/sort-utils.ts` — series case uses relation sort
- `src/lib/book/sort-utils.test.ts` — series test updated for relation sort shape
- `src/lib/book/index.ts` — export series helpers
- `src/lib/types/book.ts` — add `BookWithSeries` type
- `src/lib/types/export.ts` — add `BookForExport` type, update `ExportData.books`
- `src/trpc/routers/book.ts` — all procedures updated (includes, upserts, orphan cleanup, new `getSeriesNames`, replaced `getSeriesList`)
- `src/trpc/routers/user.ts` — `getExportData` fetches with include + flattens series
- `src/lib/export/export-utils.ts` — `exportBooksToCSV` accepts `BookForExport[]`
- `src/lib/import/import-utils.ts` — `findConflictingBook` uses two-step series lookup
- `src/lib/import/import-json.ts` — upserts Series before book create
- `src/lib/import/import-csv.ts` — upserts Series before book create
- `src/components/books/book-card.tsx` — prop type → `BookWithSeries`, series display fixed
- `src/components/books/book-details/book-details-header.tsx` — prop type + series display
- `src/components/books/edit-form/edit-form.tsx` — prop type + series default value
- `src/hooks/book/use-book.ts` — return type → `BookWithSeries`
- `src/components/books/create-form/form-sections/optional-info-section.tsx` — series combobox

---

### Task 1: Schema Phase 1

**Files:**

- Modify: `prisma/schema.prisma`

> After this task TypeScript is broken until Task 7. This is expected.

- [ ] **Step 1: Update schema**

Replace the content of `prisma/schema.prisma` with:

```prisma
generator client {
    provider      = "prisma-client"
    output        = "../src/generated/prisma"
    compilerBuild = "fast"
}

datasource db {
    provider = "postgresql"
}

model User {
    id      String @id @default(cuid())
    clerkId String @unique

    name  String
    email String @unique

    defaultReadingThreshold Int    @default(200)
    minimumPagesForStreak   Int    @default(0)
    timezone                String @default("UTC")

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    books             Book[]
    readingProgresses ReadingProgress[]
    readingGoals      ReadingGoal[]
    stats             UserStats?
    series            Series[]

    @@index([clerkId])
}

model ReadingGoal {
    id String @id @default(cuid())

    year Int
    goal Int @default(20)

    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId String

    @@unique([userId, year])
}

enum ReadStatus {
    TO_READ
    READING
    READ
    READ_NEXT
    DNF
}

model Series {
    id       String @id @default(cuid())
    name     String
    nameSort String

    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId String

    books Book[]

    @@unique([name, userId])
    @@index([userId])
}

model Book {
    id Int @id @default(autoincrement())

    title      String
    titleSort  String
    author     String
    authorSort String

    pageCount Int?
    progress  Int @default(0)

    rating          Int?
    goodreadsRating Decimal? @db.Decimal(3, 2)
    goodreadsUrl    String?
    googleBooksUrl  String?
    review          String?  @db.Text

    coverUrl String?

    isbn String?

    seriesName  String?  @map("series")
    seriesIndex Float?

    series   Series? @relation(fields: [seriesId], references: [id])
    seriesId String?

    publishedYear Int?

    summary String? @db.Text

    status ReadStatus @default(TO_READ)

    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId String

    startedAt         DateTime?
    finishedAt        DateTime?
    createdAt         DateTime          @default(now())
    updatedAt         DateTime          @updatedAt
    readingProgresses ReadingProgress[]

    @@unique([seriesId, seriesIndex])
    @@unique([isbn, userId])
    @@index([userId])
    @@index([status])
    @@index([titleSort])
    @@index([authorSort])
    @@index([status, userId])
    @@index([userId, createdAt])
    @@index([userId, updatedAt])
}

model ReadingProgress {
    id String @id @default(cuid())

    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    book   Book   @relation(fields: [bookId], references: [id], onDelete: Cascade)
    userId String
    bookId Int

    progress Int

    comments String? @db.Text

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@index([userId])
    @@index([bookId])
    @@index([bookId, createdAt])
    @@index([userId, createdAt])
}

model UserStats {
    id     String @id @default(cuid())
    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId String @unique

    currentStreak             Int       @default(0)
    longestStreak             Int       @default(0)
    lastQualifyingReadingDate DateTime?
    lastReadingDate           DateTime?

    totalPagesRead  Int @default(0)
    totalActiveDays Int @default(0)

    updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Push schema and regenerate client**

```bash
pnpm prisma db push
```

Expected output ends with: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit schema**

```bash
git add prisma/schema.prisma src/generated/prisma
git commit -m "feat(schema): add Series model and seriesId FK to Book (Phase 1)"
```

---

### Task 2: Update sort-utils (TDD)

**Files:**

- Modify: `src/lib/book/sort-utils.test.ts`
- Modify: `src/lib/book/sort-utils.ts`

- [ ] **Step 1: Update the failing test**

In `src/lib/book/sort-utils.test.ts`, replace the `"returns 3-field nulls-last array for series"` test:

```ts
it("returns 3-field relation sort array for series", () => {
  expect(toOrderBy("series", "asc")).toEqual([
    { series: { nameSort: "asc" } },
    { seriesIndex: "asc" },
    { titleSort: "asc" },
  ]);
  // direction is ignored for series (always asc by convention)
  expect(toOrderBy("series", "desc")).toEqual([
    { series: { nameSort: "asc" } },
    { seriesIndex: "asc" },
    { titleSort: "asc" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/book/sort-utils.test.ts
```

Expected: FAIL — the test for `"series"` fails because current implementation returns the old scalar shape.

- [ ] **Step 3: Update the implementation**

In `src/lib/book/sort-utils.ts`, replace the `"series"` case:

```ts
case "series":
  return [
    { series: { nameSort: "asc" } },
    { seriesIndex: "asc" },
    { titleSort: "asc" },
  ];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/book/sort-utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/book/sort-utils.ts src/lib/book/sort-utils.test.ts
git commit -m "refactor(sort): use relation sort for series field"
```

---

### Task 3: Series helpers and BookWithSeries type

**Files:**

- Create: `src/lib/book/series-utils.ts`
- Modify: `src/lib/types/book.ts`
- Modify: `src/lib/book/index.ts`

- [ ] **Step 1: Create series-utils.ts**

Create `src/lib/book/series-utils.ts`:

```ts
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

import { createTitleSort } from "./book-utils";

/**
 * Finds or creates a Series record for the given name+userId pair.
 * Returns the Series id. Safe to call with both PrismaClient and TransactionClient
 * (PrismaClient is structurally assignable to TransactionClient).
 */
export async function upsertSeries(db: TransactionClient, name: string, userId: string): Promise<string> {
  const trimmedName = name.trim();
  const nameSort = createTitleSort(trimmedName);

  const series = await db.series.upsert({
    where: { name_userId: { name: trimmedName, userId } },
    create: { name: trimmedName, nameSort, userId },
    update: {},
    select: { id: true },
  });

  return series.id;
}

/**
 * Deletes a Series record if it has no remaining books.
 * Call after removing a book's seriesId or deleting a book.
 */
export async function cleanupOrphanedSeries(db: TransactionClient, seriesId: string): Promise<void> {
  const bookCount = await db.book.count({ where: { seriesId } });
  if (bookCount === 0) {
    await db.series.delete({ where: { id: seriesId } });
  }
}
```

- [ ] **Step 2: Add BookWithSeries type**

Replace the full contents of `src/lib/types/book.ts`:

```ts
import type { BookGetPayload } from "@/generated/prisma/models/Book";
import type z from "zod";

import type { bookFiltersSchema } from "@/lib/schemas/book-filters";

export type BookFilters = z.infer<typeof bookFiltersSchema>;

export type SeriesInfo = { series: string; seriesIndex: number };
export type ScrapeData = {
  title: string;
  author: string;
  publishedYear: number;
  seriesInfo?: SeriesInfo;
  summary?: string;
};

/**
 * Book with the series relation included. Use this type whenever series name
 * display or editing is needed. All book-fetching procedures return this type.
 */
export type BookWithSeries = BookGetPayload<{ include: { series: true } }>;
```

- [ ] **Step 3: Export from book index**

In `src/lib/book/index.ts`, add the new exports:

```ts
export {
  calculatePagesFromProgress,
  createAuthorSort,
  createTitleSort,
  formatSeriesIndex,
  getStatusButtonStyle,
  parseReadStatus,
} from "./book-utils";
export { toOrderBy } from "./sort-utils";
export { cleanupOrphanedSeries, upsertSeries } from "./series-utils";
export type { SortableField } from "@/lib/schemas/book-filters";
export { SORTABLE_FIELDS } from "@/lib/schemas/book-filters";
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/book/series-utils.ts src/lib/types/book.ts src/lib/book/index.ts
git commit -m "feat(series): add upsertSeries, cleanupOrphanedSeries helpers and BookWithSeries type"
```

---

### Task 4: Update book router

**Files:**

- Modify: `src/trpc/routers/book.ts`

Replace the full contents of `src/trpc/routers/book.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { subWeeks } from "date-fns";
import { UTApi } from "uploadthing/server";
import z from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ReadStatus } from "@/generated/prisma/enums";
import { type BookWhereInput } from "@/generated/prisma/internal/prismaNamespace";
import { cleanupOrphanedSeries, createAuthorSort, createTitleSort, toOrderBy, upsertSeries } from "@/lib/book";
import { extractFileKeyFromUrl } from "@/lib/common";
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

    ctx.logger.info({ title: input.title, author: input.author, isbn: input.isbn }, "Creating book");

    // Check for duplicate ISBN
    if (input.isbn) {
      const duplicateIsbnTimer = performanceLogger("DB: Check for duplicate ISBN", 1000, ctx.logger);
      duplicateIsbnTimer.start();
      const duplicateIsbn = await ctx.db.book.findFirst({
        where: { userId, isbn: input.isbn },
      });
      duplicateIsbnTimer.end({ isbn: input.isbn });

      if (duplicateIsbn) {
        ctx.logger.warn({ isbn: input.isbn, existingBookId: duplicateIsbn.id }, "Duplicate ISBN detected");
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have "${duplicateIsbn.title}" with ISBN ${input.isbn}`,
        });
      }
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
          coverUrl: input.coverUrl,
          userId,
          ...alreadyReadData,
        },
      });
      createBookTimer.end({ bookId: book.id });

      ctx.logger.info({ bookId: book.id, title: book.title }, "Book created successfully");
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
          const deleted = await tx.readingProgress.deleteMany({ where: { bookId } });
          ctx.logger.debug({ bookId, deletedCount: deleted.count }, "Deleted reading progress entries");
        } else if (newStatus === "READING") {
          const existing = await tx.readingProgress.findFirst({ where: { bookId, progress: 0 } });
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

      ctx.logger.info({ bookId, oldStatus: book.status, newStatus: updatedBook.status }, "Reading status updated");

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

      ctx.logger.info({ bookId: input.bookId, oldRating: book.rating, newRating: input.rating }, "Book rating updated");

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

    if (book.coverUrl) {
      const fileKey = extractFileKeyFromUrl(book.coverUrl);
      if (fileKey) {
        try {
          const utApi = new UTApi();
          await utApi.deleteFiles(fileKey);
          ctx.logger.info({ fileKey, bookId }, "Cover image deleted from UploadThing");
        } catch (error) {
          ctx.logger.error({ fileKey, bookId, error }, "Failed to delete cover from UploadThing");
        }
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

      // Handle ISBN duplicate check
      if (data.isbn) {
        const isbnConflictTimer = performanceLogger("DB: Check for ISBN conflict during update", 1000, ctx.logger);
        isbnConflictTimer.start();
        const isbnDuplicate = await ctx.db.book.findFirst({
          where: { isbn: data.isbn, userId: ctx.currentUser.id, NOT: { id: book.id } },
        });
        isbnConflictTimer.end();

        if (isbnDuplicate) {
          ctx.logger.warn({ bookId: input.bookId, isbn: data.isbn }, "Duplicate ISBN detected during update");
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

      if (book.coverUrl && data.coverUrl !== undefined && data.coverUrl !== book.coverUrl) {
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

      // Build update payload — omit `series` (string field no longer exists on Book)
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
            coverUrl: data.coverUrl === "" ? null : data.coverUrl,
            ...(newSeriesId !== undefined ? { seriesId: newSeriesId } : {}),
          },
        });
        updateBookTimer.end({ bookId: input.bookId });

        // Clean up orphaned series if series changed
        if (newSeriesId !== undefined && oldSeriesId && oldSeriesId !== newSeriesId) {
          await cleanupOrphanedSeries(ctx.db, oldSeriesId);
        }

        ctx.logger.info({ bookId: input.bookId, updatedFields: Object.keys(data) }, "Book updated successfully");
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
      ctx.db.book.count({ where: { status: "READING", userId: ctx.currentUser.id } }),
      ctx.db.book.findMany({
        where: { status: "READ_NEXT", userId: ctx.currentUser.id },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: SERIES_INCLUDE,
      }),
      ctx.db.book.count({ where: { status: "READ_NEXT", userId: ctx.currentUser.id } }),
      ctx.db.book.findMany({
        where: {
          status: "READ",
          finishedAt: { gte: subWeeks(new Date(), 2) },
          userId: ctx.currentUser.id,
        },
        orderBy: { finishedAt: "desc" },
        take: 10,
        include: SERIES_INCLUDE,
      }),
    ]);

    return { readingBooks, readingBooksCount, readNextBooks, readNextBooksCount, recentlyReadBooks };
  }),
});
```

- [ ] **Step 1: Write the file** (use the code above)

- [ ] **Step 2: Commit**

```bash
git add src/trpc/routers/book.ts
git commit -m "feat(book-router): use Series relation in all procedures, add getSeriesNames"
```

---

### Task 5: Update hooks and display components

**Files:**

- Modify: `src/hooks/book/use-book.ts`
- Modify: `src/components/books/book-card.tsx`
- Modify: `src/components/books/book-details/book-details-header.tsx`
- Modify: `src/components/books/edit-form/edit-form.tsx`

- [ ] **Step 1: Update use-book.ts**

Replace the full contents of `src/hooks/book/use-book.ts`:

```ts
import type { TRPCClientErrorLike } from "@trpc/client";

import { ReadStatus } from "@/generated/prisma/enums";
import type { BookWithSeries } from "@/lib/types/book";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

interface UseBookReturn {
  book: BookWithSeries | null;
  isPending: boolean;
  isError: boolean;
  error: TRPCClientErrorLike<AppRouter> | Error | null;
  isReading: boolean;
  isToRead: boolean;
  isRead: boolean;
  isReadNext: boolean;
  isDNF: boolean;
  isForbidden: boolean;
  isNotFound: boolean;
}

export const useBook = (bookId: string): UseBookReturn => {
  const utils = trpc.useUtils();

  const getCachedBook = (): BookWithSeries | undefined => {
    const allBooksQueries = utils.book.getBooks.getData();

    if (allBooksQueries?.books) {
      return allBooksQueries.books.find((book) => book.id === parseInt(bookId)) ?? undefined;
    }
  };

  const { data, isPending, isError, error } = trpc.book.getBook.useQuery(parseInt(bookId), {
    initialData: getCachedBook() ? { book: getCachedBook()! } : undefined,
  });

  const book = data?.book ?? null;
  const isForbidden = error?.data?.code === "FORBIDDEN";
  const isNotFound = error?.data?.code === "NOT_FOUND";

  if (isPending) {
    return {
      book: null,
      isPending: true,
      isError: false,
      error: null,
      isReading: false,
      isToRead: false,
      isRead: false,
      isReadNext: false,
      isDNF: false,
      isForbidden: false,
      isNotFound: false,
    };
  }

  if (isError || !book) {
    return {
      book: null,
      isPending: false,
      isError: true,
      error: error || new Error("Failed to load book."),
      isReading: false,
      isToRead: false,
      isRead: false,
      isReadNext: false,
      isDNF: false,
      isForbidden,
      isNotFound,
    };
  }

  const isReading = book.status === ReadStatus.READING;
  const isToRead = book.status === ReadStatus.TO_READ;
  const isRead = book.status === ReadStatus.READ;
  const isReadNext = book.status === ReadStatus.READ_NEXT;
  const isDNF = book.status === ReadStatus.DNF;

  return {
    book,
    isReading,
    isToRead,
    isRead,
    isReadNext,
    isDNF,
    isPending: false,
    isError: false,
    error: null,
    isForbidden: false,
    isNotFound: false,
  };
};
```

- [ ] **Step 2: Update BookCard**

In `src/components/books/book-card.tsx`:

1. Replace the import:

```ts
import type { BookWithSeries } from "@/lib/types/book";
```

(Remove `import type { Book } from "@/generated/prisma/client";`)

1. Change the interface:

```ts
interface BookCardProps {
  book: BookWithSeries;
  showStatusButton: boolean;
  showRating?: boolean;
  className?: string;
  wrapperClassName?: string;
  priority?: boolean;
  orientation?: "horizontal" | "vertical";
}
```

1. Fix the series display line (line 83 in original):

```tsx
{
  book.series?.name && book.seriesIndex ? `${book.series.name} #${formatSeriesIndex(book.seriesIndex)}` : "\u00A0";
}
```

- [ ] **Step 3: Update BookDetailsHeader**

In `src/components/books/book-details/book-details-header.tsx`:

1. Replace the import:

```ts
import type { BookWithSeries } from "@/lib/types/book";
```

(Remove `import type { Book } from "@/generated/prisma/client";`)

1. Change the component prop type:

```ts
const BookDetailsHeader = ({
  book,
  className,
}: {
  book: BookWithSeries;
  className?: string;
}): React.ReactElement => {
```

1. Fix the series display line (line 29-31 in original):

```tsx
{
  book.series?.name && book.seriesIndex && (
    <p className="font-serif text-sm font-light italic">{`${book.series.name} #${formatSeriesIndex(book.seriesIndex)}`}</p>
  );
}
```

- [ ] **Step 4: Update EditBookForm**

In `src/components/books/edit-form/edit-form.tsx`:

1. Replace the import:

```ts
import type { BookWithSeries } from "@/lib/types/book";
```

(Remove `import type { Book } from "@/generated/prisma/client";`)

1. Change the component prop:

```ts
export const EditBookForm = ({ book }: { book: BookWithSeries }): React.ReactElement => {
```

1. Fix the default value for `series` (line 65 in original):

```ts
series: book.series?.name ?? "",
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/book/use-book.ts src/components/books/book-card.tsx src/components/books/book-details/book-details-header.tsx src/components/books/edit-form/edit-form.tsx
git commit -m "refactor: update book components and hooks to use BookWithSeries type"
```

---

### Task 6: Update export

**Files:**

- Modify: `src/lib/types/export.ts`
- Modify: `src/lib/export/export-utils.ts`
- Modify: `src/trpc/routers/user.ts`

- [ ] **Step 1: Update export types**

Replace the full contents of `src/lib/types/export.ts`:

```ts
import type { ReadingGoal, ReadingProgress, UserStats } from "@/generated/prisma/client";
import type { BookGetPayload } from "@/generated/prisma/models/Book";

export type ReadingProgressForExport = ReadingProgress & {
  book: { id: number; title: string; author: string };
};

/**
 * Books are flattened for export: the Series relation is reduced to a
 * plain `series: string | null` name so the export format stays unchanged.
 */
export type BookForExport = Omit<BookGetPayload<{ include: { series: true } }>, "series" | "seriesId"> & {
  series: string | null;
};

export interface ExportData {
  user: {
    id: string;
    name: string;
    email: string;
    defaultReadingThreshold: number;
    minimumPagesForStreak: number;
    timezone: string;
    createdAt: Date;
  } | null;
  books: BookForExport[];
  readingProgress: ReadingProgressForExport[];
  readingGoals: ReadingGoal[];
  userStats: UserStats | null;
  exportDate: string;
}
```

- [ ] **Step 2: Update exportBooksToCSV signature**

In `src/lib/export/export-utils.ts`, change the function signature on line 8:

```ts
export const exportBooksToCSV = (books: BookForExport[]): string => {
```

Add the import at the top of the file:

```ts
import type { BookForExport } from "@/lib/types";
```

The rest of `exportBooksToCSV` is unchanged — `book.series` is still `string | null` in `BookForExport`.

- [ ] **Step 3: Update getExportData in user.ts router**

In `src/trpc/routers/user.ts`, add the import for `BookForExport`:

```ts
import type { BookForExport, ExportData } from "@/lib/types";
```

In the `getExportData` mutation, update the books fetch and add flattening. Find this section:

```ts
const [books, readingProgress, readingGoals, userStats] = await Promise.all(
  [
    ctx.db.book.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { createdAt: "asc" },
    }),
```

Replace with:

```ts
const [rawBooks, readingProgress, readingGoals, userStats] = await Promise.all(
  [
    ctx.db.book.findMany({
      where: { userId: ctx.currentUser.id },
      orderBy: { createdAt: "asc" },
      include: { series: true },
    }),
```

Then after the `Promise.all`, add the flattening step before `const user = ...`:

```ts
const books: BookForExport[] = rawBooks.map(({ series, seriesId: _seriesId, ...book }) => ({
  ...book,
  series: series?.name ?? null,
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/export.ts src/lib/export/export-utils.ts src/trpc/routers/user.ts
git commit -m "refactor(export): flatten Series relation to string name for export compatibility"
```

---

### Task 7: Update import logic

**Files:**

- Modify: `src/lib/import/import-utils.ts`
- Modify: `src/lib/import/import-json.ts`
- Modify: `src/lib/import/import-csv.ts`

- [ ] **Step 1: Update findConflictingBook**

Replace the full contents of `src/lib/import/import-utils.ts`:

```ts
import type { Book } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

export const findConflictingBook = async (
  tx: TransactionClient,
  userId: string,
  book: {
    isbn?: string | null;
    series?: string | null;
    seriesIndex?: number | null;
  },
): Promise<Book | null> => {
  if (book.isbn) {
    const byISBN = await tx.book.findUnique({
      where: { isbn_userId: { isbn: book.isbn, userId } },
    });
    if (byISBN) return byISBN;
  }

  if (book.series && book.seriesIndex) {
    const seriesRecord = await tx.series.findUnique({
      where: { name_userId: { name: book.series, userId } },
    });
    if (seriesRecord) {
      const bySeries = await tx.book.findFirst({
        where: { seriesId: seriesRecord.id, seriesIndex: book.seriesIndex },
      });
      if (bySeries) return bySeries;
    }
  }

  return null;
};
```

- [ ] **Step 2: Update importFromJSON**

In `src/lib/import/import-json.ts`, add the import for `upsertSeries`:

```ts
import { createAuthorSort, createTitleSort, upsertSeries } from "@/lib/book";
```

Inside the `for (const book of data.books)` loop, replace the `tx.book.create` call to upsert series first:

```ts
const newBook = await tx.book.create({
  data: {
    userId: ctx.currentUser.id,
    title: book.title,
    titleSort: createTitleSort(book.title),
    author: book.author,
    authorSort: createAuthorSort(book.author),
    pageCount: book.pageCount,
    progress: book.progress,
    status: book.status,
    rating: book.rating,
    goodreadsRating: book.goodreadsRating,
    goodreadsUrl: book.goodreadsUrl,
    googleBooksUrl: book.googleBooksUrl,
    review: book.review,
    coverUrl: book.coverUrl,
    isbn: book.isbn,
    seriesId: book.series ? await upsertSeries(tx, book.series, ctx.currentUser.id) : null,
    seriesIndex: book.seriesIndex,
    publishedYear: book.publishedYear,
    summary: book.summary,
    startedAt: book.startedAt,
    finishedAt: book.finishedAt,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  },
});
```

- [ ] **Step 3: Update importFromCSV**

In `src/lib/import/import-csv.ts`, add the import for `upsertSeries`:

```ts
import { createAuthorSort, createTitleSort, upsertSeries } from "@/lib/book";
```

Inside the `for (const book of data.books)` loop, replace the `tx.book.create` call:

```ts
const newBook = await tx.book.create({
  data: {
    userId: ctx.currentUser.id,
    title: book.title,
    titleSort: createTitleSort(book.title),
    author: book.author,
    authorSort: createAuthorSort(book.author),
    pageCount: book.pageCount,
    progress: book.progress,
    status: book.status,
    rating: book.rating,
    goodreadsRating: book.goodreadsRating,
    goodreadsUrl: book.goodreadsUrl,
    googleBooksUrl: book.googleBooksUrl,
    review: book.review,
    coverUrl: book.coverUrl,
    seriesId: book.series ? await upsertSeries(tx, book.series, ctx.currentUser.id) : null,
    seriesIndex: book.seriesIndex,
    publishedYear: book.publishedYear,
    isbn: book.isbn,
    summary: book.summary,
    startedAt: book.startedAt,
    finishedAt: book.finishedAt,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  },
});
```

- [ ] **Step 4: Run typecheck — should be clean**

```bash
pnpm tsc --noEmit
```

Expected: no errors. This confirms Tasks 1–7 fully restore TypeScript compilation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/import-utils.ts src/lib/import/import-json.ts src/lib/import/import-csv.ts
git commit -m "refactor(import): resolve series name to Series relation on import"
```

---

### Task 8: Series combobox

**Files:**

- Modify: `src/components/books/create-form/form-sections/optional-info-section.tsx`

- [ ] **Step 1: Install the Command ShadCN component**

```bash
pnpm dlx shadcn@latest add command
```

Expected: `src/components/ui/command.tsx` created.

- [ ] **Step 2: Replace the series field with a combobox**

Replace the full contents of `src/components/books/create-form/form-sections/optional-info-section.tsx`:

```tsx
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type z from "zod";

import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { createFormSchema } from "@/lib/schemas/book";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

interface OptionalInfoSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
  idPrefix?: "create" | "edit";
  disabled?: boolean;
}

export const OptionalInfoSection = ({
  form,
  idPrefix = "create",
  disabled = false,
}: OptionalInfoSectionProps): React.ReactElement => {
  const [seriesOpen, setSeriesOpen] = useState(false);

  const { data: seriesData } = trpc.book.getSeriesNames.useQuery();
  const existingSeries = seriesData?.series ?? [];

  return (
    <FieldGroup className="gap-y-1">
      <Controller
        name="publishedYear"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-publishedYear`}>Published Year</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-publishedYear`}
              aria-invalid={fieldState.invalid}
              placeholder="1954"
              autoComplete="off"
              type="number"
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="pageCount"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-pageCount`}>Page Count</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-pageCount`}
              aria-invalid={fieldState.invalid}
              placeholder="432"
              autoComplete="off"
              type="number"
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="series"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel>Series</FieldLabel>
            <Popover open={seriesOpen} onOpenChange={setSeriesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={seriesOpen}
                  disabled={disabled}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn(!field.value && "text-muted-foreground")}>
                    {field.value || "Select or type a series..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput
                    placeholder="Search or add series..."
                    value={field.value ?? ""}
                    onValueChange={(val) => field.onChange(val)}
                  />
                  <CommandList>
                    <CommandEmpty className="text-muted-foreground py-3 text-center text-sm">
                      {field.value ? `Press Enter or click away to use "${field.value}"` : "No series found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {existingSeries.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.name}
                          onSelect={(val) => {
                            field.onChange(val);
                            setSeriesOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", field.value === s.name ? "opacity-100" : "opacity-0")} />
                          {s.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="seriesIndex"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-seriesIndex`}>
              Series Index{" "}
              <span className="text-muted-foreground text-xs">
                (First book is index 1, decimals allowed for short stories etc)
              </span>
            </FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-seriesIndex`}
              aria-invalid={fieldState.invalid}
              placeholder="1"
              autoComplete="off"
              type="number"
              step={0.1}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="isbn"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-isbn`}>
              ISBN <span className="text-muted-foreground text-xs"> (10 or 13 digits)</span>
            </FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-isbn`}
              aria-invalid={fieldState.invalid}
              placeholder="9780007203543"
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="summary"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-summary`}>Summary</FieldLabel>
            <Textarea
              {...field}
              id={`${idPrefix}-book-form-summary`}
              aria-invalid={fieldState.invalid}
              placeholder={`Sauron, the Dark Lord, has gathered to him all the Rings of Power – the means by which he intends to rule Middle-earth. All he lacks in his plans for dominion is the One Ring – the ring that rules them all – which has fallen into the hands of the hobbit, Bilbo Baggins.

In a sleepy village in the Shire, young Frodo Baggins finds himself faced with an immense task, as his elderly cousin Bilbo entrusts the Ring to his care. Frodo must leave his home and make a perilous journey across Middle-earth to the Cracks of Doom, there to destroy the Ring and foil the Dark Lord in his evil purpose.`}
              autoComplete="off"
              className="h-48 resize-none overflow-y-auto"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/books/create-form/form-sections/optional-info-section.tsx src/components/ui/command.tsx
git commit -m "feat(ui): replace series text input with combobox using getSeriesNames"
```

---

### Task 9: Data migration and Schema Phase 2

**Files:**

- Create: `scripts/migrate-series.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Create migration script**

Create `scripts/migrate-series.ts`:

```ts
import "dotenv/config";

import prisma from "@/lib/prisma";
import { createTitleSort } from "@/lib/book";

/**
 * One-time migration: creates Series records from Book.seriesName strings,
 * then links each book to its Series via seriesId.
 */
const migrateSeries = async (): Promise<void> => {
  // Find all distinct (seriesName, userId) pairs
  const booksWithSeries = await prisma.book.findMany({
    where: { seriesName: { not: null } },
    select: { id: true, seriesName: true, userId: true },
  });

  if (booksWithSeries.length === 0) {
    console.log("No books with series found. Nothing to migrate.");
    return;
  }

  console.log(`Migrating series for ${booksWithSeries.length} books...`);

  // Deduplicate: (seriesName, userId) → seriesId
  const seriesCache = new Map<string, string>();

  for (const book of booksWithSeries) {
    const seriesName = book.seriesName!;
    const cacheKey = `${book.userId}::${seriesName.toLowerCase()}`;

    let seriesId = seriesCache.get(cacheKey);

    if (!seriesId) {
      const series = await prisma.series.upsert({
        where: { name_userId: { name: seriesName, userId: book.userId } },
        create: { name: seriesName, nameSort: createTitleSort(seriesName), userId: book.userId },
        update: {},
        select: { id: true },
      });
      seriesId = series.id;
      seriesCache.set(cacheKey, seriesId);
      console.log(`  Created series: "${seriesName}" for user ${book.userId}`);
    }

    await prisma.book.update({
      where: { id: book.id },
      data: { seriesId },
    });
  }

  console.log(`Migration complete. Linked ${booksWithSeries.length} books to series.`);
};

migrateSeries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the migration script**

```bash
pnpm tsx scripts/migrate-series.ts
```

Expected output ends with: `Migration complete. Linked N books to series.`

- [ ] **Step 3: Update schema (Phase 2) — remove seriesName**

In `prisma/schema.prisma`, remove the `seriesName` field from the `Book` model. The field to remove is:

```prisma
seriesName  String?  @map("series")
```

After removal, the `Book` model's series-related section should look like:

```prisma
seriesIndex Float?

series   Series? @relation(fields: [seriesId], references: [id])
seriesId String?
```

- [ ] **Step 4: Push Phase 2 schema**

```bash
pnpm prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Run typecheck to confirm no regressions**

```bash
pnpm tsc --noEmit
```

Expected: no errors. (The generated Prisma types no longer include `seriesName`, and no application code references it.)

- [ ] **Step 6: Run full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/generated/prisma scripts/migrate-series.ts
git commit -m "feat(schema): drop seriesName column after data migration (Phase 2)"
```

---

## Self-Review

**Spec coverage:**

| Decision                                     | Covered by    |
| -------------------------------------------- | ------------- |
| Per-user Series model                        | Task 1 schema |
| `id`, `name`, `nameSort`, `userId` on Series | Task 1 schema |
| Two-step migration                           | Tasks 1 + 9   |
| `@@unique([seriesId, seriesIndex])`          | Task 1 schema |
| `@@unique([name, userId])` on Series         | Task 1 schema |
| Series sort uses relation (`nameSort`)       | Task 2        |
| Search through relation                      | Task 4        |
| N+1 `getSeriesList` replaced                 | Task 4        |
| Orphaned series cleanup on update/delete     | Task 4        |
| `getSeriesNames` endpoint                    | Task 4        |
| Export format unchanged                      | Tasks 6 + 9   |
| Import upserts Series transparently          | Task 7        |
| Combobox with free-entry                     | Task 8        |
| `nameSort` reuses `createTitleSort`          | Task 3 + 9    |

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" — all tasks contain complete code.

**Type consistency:**

- `BookWithSeries` defined in Task 3, used in Tasks 4, 5
- `BookForExport` defined in Task 6, used in Tasks 6
- `upsertSeries` / `cleanupOrphanedSeries` defined in Task 3, used in Tasks 4, 7, 9
- `getSeriesNames` defined in Task 4, consumed in Task 8
- `series.name_userId` unique constraint name matches `@@unique([name, userId])` in Task 1
