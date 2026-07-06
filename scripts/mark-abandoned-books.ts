import "dotenv/config";

import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const markAbandonedBooks = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      days: { type: "string", default: "14" },
    },
  });
  const apply = values.apply ?? false;
  const thresholdDays = Number(values.days);

  console.log("=== Marking Abandoned Books as DNF ===");
  console.log(
    `Mode: ${apply ? "APPLY" : "DRY RUN (use --apply to update statuses)"}  |  Threshold: ${thresholdDays} day(s) without progress\n`,
  );

  const readingBooks = await prisma.book.findMany({
    where: { status: "READING" },
    select: {
      id: true,
      title: true,
      author: true,
      startedAt: true,
      createdAt: true,
    },
  });

  console.log(`Found ${readingBooks.length} book(s) currently marked READING\n`);

  const now = Date.now();
  const candidates: { id: number; title: string; author: string; daysStale: number }[] = [];

  for (const book of readingBooks) {
    const latestProgress = await prisma.readingProgress.findFirst({
      where: { bookId: book.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    // startedAt is set whenever a book enters READING (UI and both sync
    // scripts), so it's a valid baseline even if no progress was ever logged.
    // createdAt is the final fallback and is never null.
    const lastActivity = [book.startedAt, latestProgress?.createdAt, book.createdAt]
      .filter((date): date is Date => date !== null && date !== undefined)
      .reduce((latest, date) => (date > latest ? date : latest));

    const daysStale = (now - lastActivity.getTime()) / MS_PER_DAY;

    if (daysStale > thresholdDays) {
      candidates.push({
        id: book.id,
        title: book.title,
        author: book.author,
        daysStale: Math.floor(daysStale),
      });
    }
  }

  if (candidates.length === 0) {
    console.log("No abandoned books found.");
    if (!apply) console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  console.log(`Found ${candidates.length} abandoned book(s):\n`);
  for (const candidate of candidates) {
    console.log(`  • ${candidate.title} by ${candidate.author} — ${candidate.daysStale} day(s) since last progress`);
  }

  if (apply) {
    await prisma.book.updateMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
      data: { status: "DNF", dnfAt: new Date() },
    });
    console.log(`\nUpdated ${candidates.length} book(s) to DNF.`);
  } else {
    console.log("\nDry run complete. Run with --apply to mark those books DNF.");
    console.log(`MAINTENANCE_RESULT: changes=${candidates.length}`);
  }
};

markAbandonedBooks()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
