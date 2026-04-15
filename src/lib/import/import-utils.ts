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
