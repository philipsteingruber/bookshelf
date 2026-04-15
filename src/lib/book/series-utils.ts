import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

import { createTitleSort } from "./book-utils";

/**
 * Finds or creates a Series record for the given name+userId pair.
 * Returns the Series id. Safe to call with both PrismaClient and TransactionClient
 * (PrismaClient is structurally assignable to TransactionClient).
 */
export async function upsertSeries(
  db: TransactionClient,
  name: string,
  userId: string,
): Promise<string> {
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
export async function cleanupOrphanedSeries(
  db: TransactionClient,
  seriesId: string,
): Promise<void> {
  const bookCount = await db.book.count({ where: { seriesId } });
  if (bookCount === 0) {
    await db.series.delete({ where: { id: seriesId } });
  }
}
