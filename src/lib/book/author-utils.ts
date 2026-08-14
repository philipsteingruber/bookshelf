import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

import { createAuthorSort } from "./book-utils";

/**
 * Replaces a book's credited-author links to match `names` exactly, in
 * order. Upserts an Author row per name (scoped per user, same pattern as
 * Series), relinks BookAuthor with a 0-based `order` column, and cleans up
 * any Author rows left with no remaining books (mirrors
 * cleanupOrphanedSeries below). Does NOT touch Book.author/authorSort —
 * callers compute those via computeAuthorFields() and write them as part of
 * the same create/update, since BookAuthor needs the book row to already
 * exist (bookId is a required FK).
 *
 * Safe to call with both PrismaClient and TransactionClient. Callers should
 * wrap this together with the book create/update in a transaction so the
 * cached author/authorSort strings and the relational rows never disagree.
 */
export async function syncBookAuthors(
  db: TransactionClient,
  names: string[],
  bookId: number,
  userId: string,
): Promise<void> {
  const authorIds: string[] = [];
  for (const name of names) {
    const author = await db.author.upsert({
      where: { name_userId: { name, userId } },
      create: { name, sort: createAuthorSort(name), userId },
      update: {},
      select: { id: true },
    });
    authorIds.push(author.id);
  }

  const previouslyLinked = await db.bookAuthor.findMany({
    where: { bookId },
    select: { authorId: true },
  });

  await db.bookAuthor.deleteMany({ where: { bookId } });
  await db.bookAuthor.createMany({
    data: authorIds.map((authorId, order) => ({ bookId, authorId, order })),
  });

  // An author who was linked before this call but isn't in the new list
  // (e.g. corrected out of a mis-parsed name) may now have zero books left.
  const droppedAuthorIds = previouslyLinked
    .map((link) => link.authorId)
    .filter((id) => !authorIds.includes(id));
  await cleanupOrphanedAuthors(db, droppedAuthorIds);
}

/**
 * Deletes any of the given Author rows that no longer have a linked book.
 * Call after removing a book's author links or deleting a book.
 */
export async function cleanupOrphanedAuthors(
  db: TransactionClient,
  authorIds: string[],
): Promise<void> {
  for (const authorId of authorIds) {
    const bookCount = await db.bookAuthor.count({ where: { authorId } });
    if (bookCount === 0) {
      await db.author.delete({ where: { id: authorId } });
    }
  }
}
