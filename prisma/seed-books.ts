import { ReadStatus } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { config } from "dotenv";

config();

async function main() {
  type Book = {
    title: string;
    author: string;
    coverUrl: string;
    userId: string;
    series?: string;
    seriesIndex?: number;
    status?: ReadStatus;
  };

  const user = await prisma.user.findFirst();
  const userId = user!.id;

  // Sample books data
  const books: Book[] = [
    {
      title: "The Emperor's Legion",
      author: "Chris Wraight",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsGxT1OC7MdJ8au0yQEAo49FghKzSClwL37nVI",
      status: "READ",
      userId,
    },
    {
      title: "Fall of Cadia",
      author: "Robert Rath",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFs1cPP3X7EWGPOTyF9lVqnN3ADvkZab40p8gHw",
      status: "READING",
      userId,
    },
    {
      title: "Xenos",
      author: "Dan Abnett",
      series: "Eisenhorn",
      seriesIndex: 1,
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsRfNa7VehVOyJQ0rx12BHfwbkLXWdYRp6M7Zl",
      status: "TO_READ",
      userId,
    },
    {
      title: "Fifteen Hours",
      author: "Mitchel Scanlon",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsCQnYcm5VaXmAYWNIgH6yhQDnE8jJ9l0M35xF",
      status: "DNF",
      userId,
    },
    {
      title: "Saturnine",
      author: "Dan Abnett",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFslNH6m4uKLk6dZ5wYsF780N2Mujbpgoae9Vcl",
      userId,
      series: "Siege of Terra",
      seriesIndex: 4,
    },
    {
      title: "The Regent's Shadow",
      author: "Chris Wraight",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsuOiWtLSxdZhnOMqtCP37QJcDvmFGTbzje0KH",
      status: "READ_NEXT",
      userId,
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
