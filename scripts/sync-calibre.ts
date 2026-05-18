import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import Docker from "dockerode";
import { UTApi } from "uploadthing/server";

import type { ReadStatus } from "@/generated/prisma/enums";
import { createAuthorSort, createTitleSort, upsertSeries } from "@/lib/book";
import prisma from "@/lib/prisma";
import { recalculateAllUserStats } from "@/lib/reading/stats-updates";

import { readCalibreSyncData, type CalibreBookSync } from "./lib/calibre-sync-reader";
import { deriveStatus, shouldLogProgress, shouldUpdateStatus } from "./lib/sync-utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CALIBRE_DB = "E:\\Calibre Library\\metadata.db";
const DEFAULT_CWA_DB = "E:\\cwa\\config\\app.db";
const GOODREADS_BASE = "https://www.goodreads.com/book/show";
const CONTAINER_NAME = "calibre-web-automated";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  status: ReadStatus;
  progress: number;
  goodreadsUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  series: { name: string } | null;
  seriesIndex: number | null;
}

interface BookUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newStatus: ReadStatus | null;
  newStartedAt: Date | null;
  newFinishedAt: Date | null;
}

interface ProgressUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newProgress: number;
}

interface ProgressSkip {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
}

interface SyncResults {
  toCreate: CalibreBookSync[];
  bookUpdates: BookUpdate[];
  progressUpdates: ProgressUpdate[];
  progressSkips: ProgressSkip[];
  notInCalibre: BookshelfBook[];
  noGoodreadsId: CalibreBookSync[];
}

// ─── Container lifecycle ──────────────────────────────────────────────────────

const docker = new Docker();

async function stopContainer(): Promise<void> {
  const container = docker.getContainer(CONTAINER_NAME);
  try {
    await container.stop();
    console.log(`Stopped ${CONTAINER_NAME}.`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 304) {
      console.log(`${CONTAINER_NAME} was already stopped.`);
      return;
    }
    console.error(`Failed to stop ${CONTAINER_NAME}:`, err);
    process.exit(1);
  }
}

async function startContainer(): Promise<void> {
  const container = docker.getContainer(CONTAINER_NAME);
  try {
    await container.start();
    console.log(`Started ${CONTAINER_NAME}.`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 304) {
      console.log(`${CONTAINER_NAME} was already running.`);
      return;
    }
    console.error(`Failed to restart ${CONTAINER_NAME} — restart it manually:`, err);
  }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function computeResults(
  calibreBooks: CalibreBookSync[],
  bookshelfBooks: BookshelfBook[],
): SyncResults {
  const bookshelfByUrl = new Map<string, BookshelfBook>();
  for (const b of bookshelfBooks) {
    if (b.goodreadsUrl) bookshelfByUrl.set(b.goodreadsUrl, b);
  }

  const matchedIds = new Set<number>();
  const results: SyncResults = {
    toCreate: [],
    bookUpdates: [],
    progressUpdates: [],
    progressSkips: [],
    notInCalibre: [],
    noGoodreadsId: [],
  };

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.goodreadsId) {
      results.noGoodreadsId.push(calibreBook);
      continue;
    }

    const url = `${GOODREADS_BASE}/${calibreBook.goodreadsId}`;
    const bookshelfBook = bookshelfByUrl.get(url);

    if (!bookshelfBook) {
      results.toCreate.push(calibreBook);
      continue;
    }

    matchedIds.add(bookshelfBook.id);

    const derived = deriveStatus(
      calibreBook.readStatus,
      calibreBook.koboreadpct,
      calibreBook.dnf,
    );

    const newStatus = shouldUpdateStatus(bookshelfBook.status, derived) ? derived : null;
    const effectiveStatus = newStatus ?? bookshelfBook.status;

    const newStartedAt =
      bookshelfBook.startedAt === null && calibreBook.datestarted !== null
        ? calibreBook.datestarted
        : null;

    const newFinishedAt =
      bookshelfBook.finishedAt === null &&
      effectiveStatus === "READ" &&
      calibreBook.kobolastread !== null
        ? calibreBook.kobolastread
        : null;

    if (newStatus !== null || newStartedAt !== null || newFinishedAt !== null) {
      results.bookUpdates.push({
        calibreBook,
        bookshelfBook,
        newStatus,
        newStartedAt,
        newFinishedAt,
      });
    }

    if (shouldLogProgress(calibreBook.koboreadpct, bookshelfBook.progress)) {
      results.progressUpdates.push({
        calibreBook,
        bookshelfBook,
        newProgress: calibreBook.koboreadpct!,
      });
    } else if (calibreBook.koboreadpct !== null && calibreBook.koboreadpct > 0) {
      results.progressSkips.push({ calibreBook, bookshelfBook });
    }
  }

  for (const b of bookshelfBooks) {
    if (!matchedIds.has(b.id)) results.notInCalibre.push(b);
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function formatBook(
  title: string,
  author: string,
  seriesName: string | null,
  seriesIndex: number | null,
): string {
  const series =
    seriesName !== null && seriesIndex !== null ? ` [${seriesName} #${seriesIndex}]` : "";
  return `${title} — ${author}${series}`;
}

function printResults(results: SyncResults, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Calibre Sync — ${mode} ===\n`);

  const createLabel = apply ? "CREATED" : "WOULD CREATE";
  console.log(`${createLabel} (${results.toCreate.length})`);
  for (const b of results.toCreate) {
    const derived = deriveStatus(b.readStatus, b.koboreadpct, b.dnf);
    const pct = b.koboreadpct ? ` (${b.koboreadpct}%)` : "";
    const started = b.datestarted
      ? ` | Started: ${b.datestarted.toISOString().slice(0, 10)}`
      : "";
    console.log(`  • ${formatBook(b.title, b.author, b.seriesName, b.seriesIndex)}`);
    console.log(`    Status: ${derived}${pct}${started}`);
  }

  const bookUpdatesWithStatus = results.bookUpdates.filter((u) => u.newStatus !== null);
  const updateLabel = apply ? "UPDATED STATUS" : "WOULD UPDATE STATUS";
  console.log(`\n${updateLabel} (${bookUpdatesWithStatus.length})`);
  for (const { calibreBook, bookshelfBook, newStatus, newFinishedAt } of bookUpdatesWithStatus) {
    const finished = newFinishedAt
      ? ` | Finished: ${newFinishedAt.toISOString().slice(0, 10)}`
      : "";
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    ${bookshelfBook.status} → ${newStatus}${finished}`);
  }

  const progressLabel = apply ? "LOGGED PROGRESS" : "WOULD LOG PROGRESS";
  console.log(`\n${progressLabel} (${results.progressUpdates.length})`);
  for (const { calibreBook, bookshelfBook, newProgress } of results.progressUpdates) {
    const lastRead = calibreBook.kobolastread
      ? calibreBook.kobolastread.toISOString().slice(0, 10)
      : "unknown";
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    ${bookshelfBook.progress}% → ${newProgress}% (kobolastread: ${lastRead})`);
  }

  if (results.progressSkips.length > 0) {
    console.log(`\nSKIPPED — NO PROGRESS INCREASE (${results.progressSkips.length})`);
    for (const { calibreBook, bookshelfBook } of results.progressSkips) {
      console.log(
        `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
      );
      console.log(
        `    Already at ${bookshelfBook.progress}%, Calibre reports ${calibreBook.koboreadpct}%`,
      );
    }
  }

  console.log(`\nNOT IN CALIBRE (${results.notInCalibre.length})`);

  if (results.noGoodreadsId.length > 0) {
    console.log(`\nNO GOODREADS ID — SKIPPED (${results.noGoodreadsId.length})`);
    for (const b of results.noGoodreadsId) {
      console.log(`  • ${b.title} — ${b.author}`);
    }
  }

  const pad = (n: number) => String(n).padStart(3);
  console.log("\n=== Summary ===");
  console.log(`${apply ? "Created:         " : "Would create:    "}  ${pad(results.toCreate.length)}`);
  console.log(`${apply ? "Updated status:  " : "Would update:    "}  ${pad(bookUpdatesWithStatus.length)}`);
  console.log(`${apply ? "Logged progress: " : "Would log:       "}  ${pad(results.progressUpdates.length)}`);
  if (results.progressSkips.length > 0) {
    console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
  }
  console.log(`Not in Calibre:       ${pad(results.notInCalibre.length)}`);
  if (results.noGoodreadsId.length > 0) {
    console.log(`No Goodreads ID:      ${pad(results.noGoodreadsId.length)}`);
  }

  if (!apply) {
    console.log("\nRun with --apply to write changes.");
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function uploadCover(coverPath: string | null): Promise<string | null> {
  if (!coverPath || !existsSync(coverPath)) return null;
  try {
    const utapi = new UTApi();
    const buffer = readFileSync(coverPath);
    const file = new File([buffer], "cover.jpg", { type: "image/jpeg" });
    const { data, error } = await utapi.uploadFiles(file);
    if (error) {
      console.error(
        `  ⚠ Cover upload failed for ${path.basename(path.dirname(coverPath))}:`,
        error.message,
      );
      return null;
    }
    return data?.ufsUrl ?? null;
  } catch (err) {
    console.error(
      `  ⚠ Cover upload failed for ${path.basename(path.dirname(coverPath))}:`,
      err,
    );
    return null;
  }
}

async function applyCreates(toCreate: CalibreBookSync[], userId: string): Promise<number> {
  let failures = 0;
  for (const b of toCreate) {
    try {
      const coverUrl = await uploadCover(b.coverPath);
      const seriesId = b.seriesName ? await upsertSeries(prisma, b.seriesName, userId) : null;
      const derived = deriveStatus(b.readStatus, b.koboreadpct, b.dnf);

      await prisma.book.create({
        data: {
          title: b.title,
          titleSort: createTitleSort(b.title),
          author: b.author,
          authorSort: createAuthorSort(b.author),
          seriesId,
          seriesIndex: b.seriesIndex,
          goodreadsUrl: `${GOODREADS_BASE}/${b.goodreadsId}`,
          coverUrl,
          status: derived,
          progress: b.koboreadpct ?? 0,
          startedAt: b.datestarted,
          finishedAt: derived === "READ" ? b.kobolastread : null,
          userId,
        },
      });
    } catch (err) {
      const isSeriesConflict =
        (err as { code?: string; meta?: { target?: string[] } }).code === "P2002" &&
        (err as { meta?: { target?: string[] } }).meta?.target?.some((f) =>
          ["seriesId", "seriesIndex"].includes(f),
        );

      if (isSeriesConflict) {
        console.error(
          `  ✗ Series conflict for "${b.title}": another book in "${b.seriesName}" already has index ${b.seriesIndex}. Fix the series index in Calibre and rerun.`,
        );
      } else {
        console.error(`  ✗ Failed to create "${b.title}":`, err);
      }
      failures++;
    }
  }
  return failures;
}

async function applyBookUpdates(bookUpdates: BookUpdate[]): Promise<number> {
  let failures = 0;
  for (const { bookshelfBook, newStatus, newStartedAt, newFinishedAt } of bookUpdates) {
    try {
      const data: { status?: ReadStatus; startedAt?: Date; finishedAt?: Date } = {};
      if (newStatus !== null) data.status = newStatus;
      if (newStartedAt !== null) data.startedAt = newStartedAt;
      if (newFinishedAt !== null) data.finishedAt = newFinishedAt;

      await prisma.book.update({ where: { id: bookshelfBook.id }, data });
    } catch (err) {
      console.error(`  ✗ Failed to update "${bookshelfBook.title}":`, err);
      failures++;
    }
  }
  return failures;
}

async function applyProgressUpdates(
  progressUpdates: ProgressUpdate[],
  userId: string,
): Promise<number> {
  let failures = 0;
  for (const { calibreBook, bookshelfBook, newProgress } of progressUpdates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.readingProgress.create({
          data: {
            userId,
            bookId: bookshelfBook.id,
            progress: newProgress,
            createdAt: calibreBook.kobolastread ?? new Date(),
          },
        });
        await tx.book.update({
          where: { id: bookshelfBook.id },
          data: { progress: newProgress },
        });
      });
    } catch (err) {
      console.error(`  ✗ Failed to log progress for "${bookshelfBook.title}":`, err);
      failures++;
    }
  }
  return failures;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
      "cwa-db": { type: "string", default: DEFAULT_CWA_DB },
      "user-email": { type: "string" },
    },
  });

  const apply = values.apply ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;
  const cwaDbPath = (values["cwa-db"] as string | undefined) ?? DEFAULT_CWA_DB;
  const userEmail =
    (values["user-email"] as string | undefined) ?? process.env.CALIBRE_SYNC_USER_EMAIL;

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

  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }

  if (!existsSync(cwaDbPath)) {
    console.error(`Error: CWA database not found at "${cwaDbPath}"`);
    process.exit(1);
  }

  await stopContainer();

  try {
    console.log(`Reading Calibre library from: ${calibreDbPath}`);
    console.log(`Reading CWA database from: ${cwaDbPath}`);
    const calibreBooks = readCalibreSyncData(calibreDbPath, cwaDbPath);
    console.log(`Loaded ${calibreBooks.length} books from Calibre`);

    const user = await prisma.user.findFirst({ where: { email: userEmail } });

    if (!user) {
      console.error(`Error: No bookshelf user found with email "${userEmail}"`);
      process.exit(1);
    }

    console.log(`Syncing for user: ${user.email}`);

    const bookshelfBooks = await prisma.book.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        author: true,
        status: true,
        progress: true,
        goodreadsUrl: true,
        startedAt: true,
        finishedAt: true,
        series: { select: { name: true } },
        seriesIndex: true,
      },
    });
    console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

    const results = computeResults(calibreBooks, bookshelfBooks);
    printResults(results, apply);

    if (apply) {
      let totalFailures = 0;
      totalFailures += await applyCreates(results.toCreate, user.id);
      totalFailures += await applyBookUpdates(results.bookUpdates);
      totalFailures += await applyProgressUpdates(results.progressUpdates, user.id);

      if (results.progressUpdates.length > 0) {
        await recalculateAllUserStats(prisma, user);
      }

      if (totalFailures > 0) {
        console.error(`\n${totalFailures} write(s) failed. See errors above.`);
        process.exit(1);
      }
    }
  } finally {
    await startContainer();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
