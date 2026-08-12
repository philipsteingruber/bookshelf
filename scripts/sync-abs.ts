import "dotenv/config";

import { parseArgs } from "node:util";

import { extractErrorMessage } from "./lib/calibre-constants";
import { DEFAULT_ABS_URL, resolveBookLibraryId } from "./lib/abs-client";
import { readAbsSyncData } from "./lib/abs-sync-reader";
import {
  computeAbsResults,
  type AbsProgressUpdate,
  type AbsStatusUpdate,
  type AbsSyncResults,
} from "./lib/abs-sync-results";
import prisma from "@/lib/prisma";
import { recalculateAllUserStats } from "@/lib/reading/stats-updates";

// ─── Output ───────────────────────────────────────────────────────────────────

function formatBook(title: string, author: string): string {
  return `${title} — ${author}`;
}

function printResults(results: AbsSyncResults, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== ABS Sync — ${mode} ===\n`);

  const statusLabel = apply ? "UPDATED STATUS" : "WOULD UPDATE STATUS";
  const statusUpdatesWithStatus = results.statusUpdates.filter((u) => u.newStatus !== null);
  console.log(`${statusLabel} (${statusUpdatesWithStatus.length})`);
  for (const { bookshelfBook, newStatus, newFinishedAt } of statusUpdatesWithStatus) {
    const finished = newFinishedAt ? ` | Finished: ${newFinishedAt.toISOString().slice(0, 10)}` : "";
    console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author)}`);
    console.log(`    ${bookshelfBook.status} → ${newStatus}${finished}`);
  }

  const progressLabel = apply ? "LOGGED PROGRESS" : "WOULD LOG PROGRESS";
  console.log(`\n${progressLabel} (${results.progressUpdates.length})`);
  for (const { bookshelfBook, newProgress } of results.progressUpdates) {
    console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author)}`);
    console.log(`    ${bookshelfBook.progress}% → ${newProgress}%`);
  }

  if (results.progressSkips.length > 0) {
    console.log(`\nSKIPPED — NO PROGRESS INCREASE (${results.progressSkips.length})`);
    for (const { absBook, bookshelfBook } of results.progressSkips) {
      console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author)}`);
      console.log(`    Already at ${bookshelfBook.progress}%, ABS reports ${absBook.progressPercent}%`);
    }
  }

  console.log(`\nNOT MATCHED IN BOOKSHELF (${results.notInBookshelf.length})`);
  for (const b of results.notInBookshelf) {
    console.log(`  • ${formatBook(b.title, b.author)} (${b.progressPercent}%)`);
  }

  if (!apply) {
    const pad = (n: number) => String(n).padStart(3);
    console.log("\n=== Summary ===");
    console.log(`Would update status:  ${pad(statusUpdatesWithStatus.length)}`);
    console.log(`Would log progress:   ${pad(results.progressUpdates.length)}`);
    if (results.progressSkips.length > 0) {
      console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
    }
    console.log(`Not matched:          ${pad(results.notInBookshelf.length)}`);
    console.log("\nRun with --apply to write changes.");
  }
}

function printApplySummary(
  results: AbsSyncResults,
  statusErrors: string[],
  progressErrors: string[],
): void {
  const pad = (n: number) => String(n).padStart(3);
  const statusUpdatesWithStatus = results.statusUpdates.filter((u) => u.newStatus !== null);
  console.log("\n=== Summary ===");
  console.log(`Updated status:       ${pad(statusUpdatesWithStatus.length - statusErrors.length)}`);
  console.log(`Logged progress:      ${pad(results.progressUpdates.length - progressErrors.length)}`);
  if (results.progressSkips.length > 0) {
    console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
  }
  console.log(`Not matched:          ${pad(results.notInBookshelf.length)}`);
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function applyStatusUpdates(statusUpdates: AbsStatusUpdate[]): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newStatus, newStartedAt, newFinishedAt } of statusUpdates) {
    try {
      const data: { status?: "TO_READ" | "READING" | "READ" | "READ_NEXT" | "DNF"; startedAt?: Date; finishedAt?: Date } = {};
      if (newStatus !== null) data.status = newStatus;
      if (newStartedAt !== null) data.startedAt = newStartedAt;
      if (newFinishedAt !== null) data.finishedAt = newFinishedAt;
      await prisma.book.update({ where: { id: bookshelfBook.id }, data });
    } catch (err) {
      errors.push(`Failed to update "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
    }
  }
  return errors;
}

async function applyProgressUpdates(
  progressUpdates: AbsProgressUpdate[],
  userId: string,
): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newProgress } of progressUpdates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.readingProgress.create({
          data: { userId, bookId: bookshelfBook.id, progress: newProgress },
        });
        await tx.book.update({ where: { id: bookshelfBook.id }, data: { progress: newProgress } });
      });
    } catch (err) {
      errors.push(`Failed to log progress for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
    }
  }
  return errors;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "abs-url": { type: "string", default: DEFAULT_ABS_URL },
      "library-id": { type: "string" },
      "user-email": { type: "string" },
    },
  });

  const apply = values.apply ?? false;
  const absUrl = (values["abs-url"] as string | undefined) ?? DEFAULT_ABS_URL;
  const userEmail =
    (values["user-email"] as string | undefined) ?? process.env.CALIBRE_SYNC_USER_EMAIL;
  const absToken = process.env.ABS_TOKEN;

  if (!absToken) {
    console.error("Error: ABS_TOKEN env var is not set — add it to /etc/environment or ~/.profile");
    process.exit(1);
  }

  if (!userEmail) {
    console.error(
      "Error: No user specified. Set CALIBRE_SYNC_USER_EMAIL in .env or pass --user-email",
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email: userEmail } });
  if (!user) {
    console.error(`Error: No bookshelf user found with email "${userEmail}"`);
    process.exit(1);
  }

  const libraryId =
    (values["library-id"] as string | undefined) ?? (await resolveBookLibraryId(absUrl, absToken));

  console.log(`Reading ABS library from: ${absUrl} (library ${libraryId})`);
  const absBooks = await readAbsSyncData(absUrl, absToken, libraryId);
  console.log(`Loaded ${absBooks.length} in-progress/finished items from ABS`);

  console.log(`Syncing for user: ${user.email}`);

  const bookshelfBooks = await prisma.book.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      title: true,
      author: true,
      status: true,
      progress: true,
      startedAt: true,
      finishedAt: true,
      dnfAt: true,
      resetAt: true,
      isbn: true,
    },
  });
  console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

  const results = computeAbsResults(absBooks, bookshelfBooks);
  printResults(results, apply);

  let exitCode = 0;
  if (apply) {
    const statusErrors = await applyStatusUpdates(
      results.statusUpdates.filter((u) => u.newStatus !== null),
    );
    const progressErrors = await applyProgressUpdates(results.progressUpdates, user.id);

    if (results.progressUpdates.length > 0) {
      await recalculateAllUserStats(prisma, user);
    }

    printApplySummary(results, statusErrors, progressErrors);

    const allErrors = [...statusErrors, ...progressErrors];
    if (allErrors.length > 0) {
      console.log(`\n=== Errors (${allErrors.length}) ===`);
      for (const msg of allErrors) console.error(`  ✗ ${msg}`);
      exitCode = 1;
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
