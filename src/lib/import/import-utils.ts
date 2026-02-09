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

  if (book.series && !!book.seriesIndex) {
    const bySeries = await tx.book.findUnique({
      where: {
        series_seriesIndex_userId: {
          series: book.series,
          seriesIndex: book.seriesIndex,
          userId,
        },
      },
    });
    if (bySeries) return bySeries;
  }

  return null;
};
