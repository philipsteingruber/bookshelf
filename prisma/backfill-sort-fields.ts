import "dotenv/config";

import { createAuthorSort, createTitleSort } from "@/lib/book";
import prisma from "@/lib/prisma";

async function backfillSortFields(): Promise<void> {
  const books = await prisma.book.findMany({
    where: {
      OR: [{ titleSort: "" }, { authorSort: "" }],
    },
  });

  console.log(`Found ${books.length} books to update`);

  for (const book of books) {
    const titleSort = createTitleSort(book.title);
    const authorSort = createAuthorSort(book.author);

    await prisma.book.update({
      where: { id: book.id },
      data: { titleSort, authorSort },
    });

    console.log(`Updated: "${book.title}" -> "${titleSort}"`);
    console.log(`Updated: "${book.author}" -> "${authorSort}"`);
  }

  console.log("Done!");
}

backfillSortFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
