import "dotenv/config";

import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseTitleList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((title) => title.trim())
    .filter((title) => title.length > 0);

const markAbandonedBooks = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      days: { type: "string", default: "14" },
      only: { type: "string" },
      exclude: { type: "string" },
    },
  });
  const apply = values.apply ?? false;
  const thresholdDays = Number(values.days);
  const onlyTitles = parseTitleList(values.only);
  const excludeTitles = parseTitleList(values.exclude);

  if (onlyTitles.length > 0 && excludeTitles.length > 0) {
    console.error("Error: --only and --exclude are mutually exclusive. Pass one or the other, not both.");
    process.exitCode = 1;
    return;
  }

  console.log("=== Marking Abandoned Books as DNF ===");
  console.log(
    `Mode: ${apply ? "APPLY" : "DRY RUN (use --apply to update statuses)"}  |  Threshold: ${thresholdDays} day(s) without progress\n`,
  );
  if (onlyTitles.length > 0) console.log(`Restricting to --only: ${onlyTitles.join(", ")}\n`);
  if (excludeTitles.length > 0) console.log(`Skipping via --exclude: ${excludeTitles.join(", ")}\n`);

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

  // --only/--exclude narrow which of the detected candidates actually get
  // touched below, but the staleness scan above always runs unfiltered —
  // that keeps "is this book actually stale" as the source of truth and
  // these flags as a pure subset selector on top of it.
  let targets = candidates;
  if (onlyTitles.length > 0) {
    targets = candidates.filter((candidate) => onlyTitles.includes(candidate.title));
    const unmatched = onlyTitles.filter((title) => !candidates.some((candidate) => candidate.title === title));
    if (unmatched.length > 0) {
      console.log(
        `\nNote: --only title(s) not found among detected candidates (not stale, not READING, or typo'd): ${unmatched.join(", ")}`,
      );
    }
  } else if (excludeTitles.length > 0) {
    targets = candidates.filter((candidate) => !excludeTitles.includes(candidate.title));
    const unmatched = excludeTitles.filter((title) => !candidates.some((candidate) => candidate.title === title));
    if (unmatched.length > 0) {
      console.log(
        `\nNote: --exclude title(s) not found among detected candidates (nothing to skip, or typo'd): ${unmatched.join(", ")}`,
      );
    }
  }

  if (targets.length === 0) {
    console.log("\nNo books left to act on after applying --only/--exclude.");
    if (!apply) console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  if (apply) {
    await prisma.book.updateMany({
      where: { id: { in: targets.map((candidate) => candidate.id) } },
      data: { status: "DNF", dnfAt: new Date() },
    });
    console.log(`\nUpdated ${targets.length} book(s) to DNF.`);
  } else {
    console.log("\nDry run complete. Run with --apply to mark those books DNF.");
    console.log(`MAINTENANCE_RESULT: changes=${targets.length}`);
  }
};

markAbandonedBooks()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
