import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createAuthorSort, createTitleSort, upsertSeries } from "@/lib/book";
import { findConflictingBook } from "@/lib/import/import-utils";
import type { CSVImportData, ImportResults } from "@/lib/types";
import type { AuthedContext } from "@/trpc/init";

export const importFromCSV = async (
  tx: TransactionClient,
  ctx: AuthedContext,
  data: CSVImportData,
  results: ImportResults,
): Promise<void> => {
  const booksByTitleAuthor = new Map<string, number>();

  if (data.books) {
    for (const book of data.books) {
      try {
        const existing = await findConflictingBook(
          tx,
          ctx.currentUser.id,
          book,
        );

        if (existing) {
          results.skipped.books++;
          const key = createKey(book.title, book.author);
          booksByTitleAuthor.set(key, existing.id);
          continue;
        }

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

        const key = createKey(book.title, book.author);
        booksByTitleAuthor.set(key, newBook.id);
        results.created.books++;
      } catch (error) {
        results.errors.push(
          `Failed to import book: ${(error as Error).message}`,
        );
      }
    }
  }

  if (data.progress) {
    for (const progress of data.progress) {
      try {
        const key = createKey(progress.bookTitle, progress.bookAuthor);
        let bookId = booksByTitleAuthor.get(key);

        if (!bookId) {
          const existingBook = await tx.book.findFirst({
            where: {
              userId: ctx.currentUser.id,
              title: progress.bookTitle,
              author: progress.bookTitle,
            },
          });

          if (!existingBook) {
            results.errors.push(
              `Book not found: "${progress.bookTitle}" by ${progress.bookAuthor}`,
            );
            results.skipped.progress++;
            continue;
          }

          booksByTitleAuthor.set(key, existingBook.id);
          bookId = existingBook.id;
        }

        await tx.readingProgress.create({
          data: {
            userId: ctx.currentUser.id,
            bookId: bookId,
            progress: Number(progress.progress),
            comments: progress.comments || null,
            createdAt: new Date(progress.createdAt),
          },
        });

        results.created.progress++;
      } catch (error) {
        results.errors.push(
          `Failed to import progress: ${(error as Error).message}`,
        );
      }
    }
  }

  if (data.goals) {
    for (const goal of data.goals) {
      try {
        await tx.readingGoal.upsert({
          where: {
            userId_year: { userId: ctx.currentUser.id, year: goal.year },
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
          `Failed to import goal: ${(error as Error).message}`,
        );
      }
    }
  }
};

const createKey = (title: string, author: string): string => {
  return `${title}|${author}`;
};
