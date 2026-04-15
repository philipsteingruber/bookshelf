import "dotenv/config";

import prisma from "@/lib/prisma";

async function main(): Promise<void> {
  console.log("Starting to fix empty series values...");

  const result = await prisma.book.updateMany({
    where: {
      seriesName: "",
    },
    data: {
      seriesName: null,
    },
  });

  console.log(`Updated ${result.count} books with empty series to null`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
