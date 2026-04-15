import { subDays } from "date-fns";
import { config } from "dotenv";

import type { ReadStatus } from "@/generated/prisma/enums";
import { createAuthorSort, createTitleSort } from "@/lib/book";
import prisma from "@/lib/prisma";

config();

async function main(): Promise<void> {
  type BookSeed = {
    title: string;
    author: string;
    coverUrl: string;
    userId: string;
    series?: string;
    seriesIndex?: number;
    status?: ReadStatus;
    finishedAt?: Date;
    summary?: string;
    publishedYear: number;
    progress?: number;
    pageCount?: number;
    titleSort: string;
    authorSort: string;
  };

  const user = await prisma.user.findFirst();
  const userId = user!.id;

  const progressValues = [16, 27, 28, 45, 62];
  const readingProgressData = progressValues.map((val, index) => {
    return {
      progress: val,
      date: subDays(new Date(), progressValues.length - (index + 1)),
    };
  });

  // Sample books data
  const books: BookSeed[] = [
    {
      title: "The Emperor's Legion",
      titleSort: createTitleSort("The Emperor's Legion"),
      author: "Chris Wraight",
      authorSort: createAuthorSort("Chris Wraight"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsGxT1OC7MdJ8au0yQEAo49FghKzSClwL37nVI",
      status: "READ",
      finishedAt: new Date(),
      userId,
      publishedYear: 2017,
      pageCount: 336,
    },
    {
      title: "Fall of Cadia",
      author: "Robert Rath",
      titleSort: createTitleSort("Fall of Cadia"),
      authorSort: createAuthorSort("Robert Rath"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFs1cPP3X7EWGPOTyF9lVqnN3ADvkZab40p8gHw",
      status: "READING",
      userId,
      summary: `Cadia. This proud world stood defiant for centuries – a bulwark against the forces of Chaos residing in the Eye of Terror. All of this would change when it was targeted for destruction by Abaddon the Despoiler as part of his Thirteenth Black Crusade. 
READ IT BECAUSE
The Fall of Cadia is a touchstone moment of the Warhammer 40,000 timeline. This incredible battle led to the opening of the Great Rift and ushered in a grim new era in which even greater threats assailed the Imperium. 
THE STORY
Cadia licks its wounds in the wake of the Thirteenth Black Crusade. The heretic forces retreat on all fronts. The day is won. But Lord Castellan Creed cannot rest easy. Something tells him the assault was a mere prelude to something greater, something more final. He is right. Out of the Eye of Terror comes Abaddon the Despoiler, at the head of a warhost unmatched in scale since the dread days of the Horus Heresy. 
In the face of the looming apocalypse, Creed must weld the champions of Cadia into a bulwark capable of withstanding Abaddon’s fury. And in orbit, the Despoiler himself finds his own alliance teetering on a knife edge… 
This is a tale told at epic scale, from the tables of high command to the slaughter of the pylon fields, and with a huge cast of characters from self-styled demigods to the rank-and-file foot soldiers of the Imperium. 
This is the story of Abaddon’s greatest conquest. This is Cadia’s last stand.`,
      publishedYear: 2023,
      progress: 23,
      pageCount: 711,
    },
    {
      title: "Xenos",
      author: "Dan Abnett",
      titleSort: createTitleSort("Xenos"),
      authorSort: createAuthorSort("Dan Abnett"),
      series: "Eisenhorn",
      seriesIndex: 1,
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsRfNa7VehVOyJQ0rx12BHfwbkLXWdYRp6M7Zl",
      status: "TO_READ",
      userId,
      publishedYear: 2001,
    },
    {
      title: "Fifteen Hours",
      author: "Mitchel Scanlon",
      titleSort: createTitleSort("Fifteen Hours"),
      authorSort: createAuthorSort("Mitchel Scanlon"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsCQnYcm5VaXmAYWNIgH6yhQDnE8jJ9l0M35xF",
      status: "DNF",
      userId,
      publishedYear: 2005,
    },
    {
      title: "Saturnine",
      author: "Dan Abnett",
      titleSort: createTitleSort("Saturnine"),
      authorSort: createAuthorSort("Dan Abnett"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFslNH6m4uKLk6dZ5wYsF780N2Mujbpgoae9Vcl",
      userId,
      series: "Siege of Terra",
      seriesIndex: 4,
      publishedYear: 2020,
      status: "READING",
      progress: 62,
      summary: `As the traitors tighten their grip on Terra, Rogal Dorn must marshal the Imperial hosts to weather the storm. But not all of the defenders will survive the onslaught… 
READ IT BECAUSE
Dan Abnett returns to the Horus Heresy! Experience one of the crucial stages of the Siege, as Rogal Dorn and Horus match wits in a game of Regicide where the board is the Throneworld itself, and one wrong move could lead to utter devastation… 
THE STORY
The Traitor Host of Horus Lupercal tightens its iron grip on the Palace of Terra, and one by one the walls and bastions begin to crumple and collapse. Rogal Dorn, Praetorian of Terra, redoubles his efforts to keep the relentless enemy at bay, but his forces are vastly outnumbered and hopelessly outgunned. Dorn simply cannot defend everything. Any chance of survival now requires sacrifice, but what battles dare he lose so that others can be won? Is there one tactical stroke, one crucial combat, that could turn the tide forever and win the war outright?`,
      pageCount: 607,
    },
    {
      title: "The Regent's Shadow",
      author: "Chris Wraight",
      titleSort: createTitleSort("The Regent's Shadow"),
      authorSort: createAuthorSort("Chris Wraight"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsuOiWtLSxdZhnOMqtCP37QJcDvmFGTbzje0KH",
      status: "READ_NEXT",
      userId,
      publishedYear: 2020,
      pageCount: 373,
    },
    {
      title: "Darkness in the Blood",
      author: "Guy Haley",
      titleSort: createTitleSort("Darkness in the Blood"),
      authorSort: createAuthorSort("Guy Haley"),
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsmdrtkrg2UTRVFNzLP9ESulI5jboesfMhHypd",
      userId,
      publishedYear: 2019,
    },
  ];

  console.log("Clearing table... ⏳");
  await prisma.book.deleteMany();
  console.log("Table cleared. ✅");
  console.log("Seeding books... ⏳");
  for (const book of books) {
    console.log(`Creating ${book.title} by ${book.author}... ⏳`);
    const { series, ...bookRest } = book;
    let seriesId: string | null = null;
    if (series) {
      const seriesRecord = await prisma.series.upsert({
        where: { name_userId: { name: series, userId } },
        create: { name: series, nameSort: series.toLowerCase(), userId },
        update: {},
      });
      seriesId = seriesRecord.id;
    }
    const createdBook = await prisma.book.create({ data: { ...bookRest, seriesId } });
    console.log(`${book.title} by ${book.author} created. ✅`);
    if (book.title === "Saturnine") {
      console.log("Seeding ReadingProgress... ⏳");
      for (const readingProgress of readingProgressData) {
        console.log(
          `Creating ReadingProgress with progress ${readingProgress.progress} (${readingProgress.date.toISOString().substring(0, 10)}) for ${book.title} ⏳`,
        );
        await prisma.readingProgress.create({
          data: {
            bookId: createdBook.id,
            userId,
            progress: readingProgress.progress,
            createdAt: readingProgress.date,
            updatedAt: readingProgress.date,
          },
        });
        console.log(
          `ReadingProgress with progress ${readingProgress.progress} (${readingProgress.date.toISOString().substring(0, 10)}) for ${book.title} created ✅`,
        );
      }
    }
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
