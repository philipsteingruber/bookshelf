import prisma from "@/lib/prisma";
import { config } from "dotenv";

config();
console.log(
  "DATABASE_URL:",
  process.env.DATABASE_URL?.substring(0, 30) + "...",
);

async function main() {
  type Book = {
    title: string;
    author: string;
    coverUrl: string;
    userId: string;
    series?: string;
    seriesIndex?: number;
  };

  const userId = "cmjrbq5990000aktqnm8gipd9";

  // Sample books data
  const books: Book[] = [
    {
      title: "The Emperor's Legion",
      author: "Chris Wraight",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsGxT1OC7MdJ8au0yQEAo49FghKzSClwL37nVI",
      userId: userId,
    },
    {
      title: "Fall of Cadia",
      author: "Robert Rath",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFs1cPP3X7EWGPOTyF9lVqnN3ADvkZab40p8gHw",
      userId: userId,
    },
    {
      title: "Xenos",
      author: "Dan Abnett",
      series: "Eisenhorn",
      seriesIndex: 1,
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsRfNa7VehVOyJQ0rx12BHfwbkLXWdYRp6M7Zl",
      userId: userId,
    },
  ];

  console.log("Clearing table... ⏳");
  await prisma.book.deleteMany();
  console.log("Table cleared. ✅");
  console.log("Seeding books... ⏳");
  for (const book of books) {
    console.log(`Creating ${book.title} by ${book.author}... ⏳`);
    await prisma.book.create({ data: book });
    console.log(`${book.title} by ${book.author} created. ✅`);
  }

  console.log("Seeding completed! ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
