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
    finishedAt?: Date;
    summary?: string;
    publishedYear: number;
    progress?: number;
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
      finishedAt: new Date(),
      userId,
      publishedYear: 2017,
    },
    {
      title: "Fall of Cadia",
      author: "Robert Rath",
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
      publishedYear: 2001,
    },
    {
      title: "Fifteen Hours",
      author: "Mitchel Scanlon",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsCQnYcm5VaXmAYWNIgH6yhQDnE8jJ9l0M35xF",
      status: "DNF",
      userId,
      publishedYear: 2005,
    },
    {
      title: "Saturnine",
      author: "Dan Abnett",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFslNH6m4uKLk6dZ5wYsF780N2Mujbpgoae9Vcl",
      userId,
      series: "Siege of Terra",
      seriesIndex: 4,
      publishedYear: 2020,
      status: "READING",
      progress: 71,
    },
    {
      title: "The Regent's Shadow",
      author: "Chris Wraight",
      coverUrl:
        "https://3k01dt1q3i.ufs.sh/f/yX6XxGcalfFsuOiWtLSxdZhnOMqtCP37QJcDvmFGTbzje0KH",
      status: "READ_NEXT",
      userId,
      publishedYear: 2020,
    },
    {
      title: "Darkness in Blood",
      author: "Guy Haley",
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
