import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createAuthorSort, createTitleSort } from "@/lib/book";
import { findConflictingBook } from "@/lib/import/import-utils";
import type { ExportData, ImportResults } from "@/lib/types";
import type { AuthedContext } from "@/trpc/init";

export const importFromJSON = async (
  tx: TransactionClient,
  ctx: AuthedContext,
  data: ExportData,
  results: ImportResults,
): Promise<void> => {
  const bookIdMap = new Map<number, number>();

  for (const book of data.books) {
    try {
      const existing = await findConflictingBook(tx, ctx.currentUser.id, book);

      if (existing) {
        results.skipped.books++;
        bookIdMap.set(book.id, existing.id);
        continue;
      }

      const newBook = await tx.book.create({
        data: {
          userId: ctx.currentUser.id,
          title: book.title,
          titleSort: createTitleSort(book.title), // from @/lib/book/book-utils
          author: book.author,
          authorSort: createAuthorSort(book.author), // from @/lib/book/book-utils
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
          series: book.series,
          seriesIndex: book.seriesIndex,
          publishedYear: book.publishedYear,
          summary: book.summary,
          startedAt: book.startedAt,
          finishedAt: book.finishedAt,
          createdAt: book.createdAt,
          updatedAt: book.updatedAt,
        },
      });

      bookIdMap.set(book.id, newBook.id);
      results.created.books++;
    } catch (error) {
      results.errors.push(
        `Failed to import book "${book.title}": ${(error as Error).message}`,
      );
    }
  }

  for (const progress of data.readingProgress) {
    try {
      const newBookId = bookIdMap.get(progress.bookId);

      if (!newBookId) {
        results.errors.push(`Book not found for progress entry`);
        results.skipped.progress++;
        continue;
      }

      await tx.readingProgress.create({
        data: {
          userId: ctx.currentUser.id,
          bookId: newBookId,
          progress: progress.progress,
          comments: progress.comments,
          createdAt: progress.createdAt,
        },
      });

      results.created.progress++;
    } catch (error) {
      results.errors.push(
        `Failed to import progress: ${(error as Error).message}`,
      );
    }
  }

  for (const goal of data.readingGoals) {
    try {
      await tx.readingGoal.upsert({
        where: {
          userId_year: {
            userId: ctx.currentUser.id,
            year: goal.year,
          },
        },
        create: {
          userId: ctx.currentUser.id,
          year: goal.year,
          goal: goal.goal,
        },
        update: { goal: goal.goal },
      });

      results.created.goals++;
    } catch (error) {
      results.errors.push(
        `Failed to import goal for ${goal.year}: ${(error as Error).message}`,
      );
    }
  }
};
