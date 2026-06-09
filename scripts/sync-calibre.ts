import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { put } from "@vercel/blob";

import type { ReadStatus } from "@/generated/prisma/enums";
import { createAuthorSort, createTitleSort, estimateKepubPageCount, upsertSeries } from "@/lib/book";
import prisma from "@/lib/prisma";
import { recalculateAllUserStats } from "@/lib/reading/stats-updates";

import { DEFAULT_CALIBRE_DB, DEFAULT_CWA_DB, extractErrorMessage } from "./lib/calibre-constants";
import { readCalibreSyncData, type CalibreBookSync } from "./lib/calibre-sync-reader";
import { startContainer, stopContainer } from "./lib/docker";
import { buildCompositeKey } from "./lib/normalizer";
import { makeScriptParser } from "./lib/script-parser";
import { deriveStatus, shouldLogProgress, shouldUpdateStatus } from "./lib/sync-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  status: ReadStatus;
  progress: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  series: { name: string } | null;
  seriesIndex: number | null;
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
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

interface MetadataUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newTitle: string | null;
  newAuthor: string | null;
  newIsbn: string | null;
  newPublishedYear: number | null;
  newSummary: string | null;
}

interface SyncResults {
  toCreate: CalibreBookSync[];
  bookUpdates: BookUpdate[];
  progressUpdates: ProgressUpdate[];
  progressSkips: ProgressSkip[];
  metadataUpdates: MetadataUpdate[];
  notInCalibre: BookshelfBook[];
  readNextRemovals: CalibreBookSync[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Matching ─────────────────────────────────────────────────────────────────

function computeResults(
  calibreBooks: CalibreBookSync[],
  bookshelfBooks: BookshelfBook[],
): SyncResults {
  const bookshelfByIsbn = new Map<string, BookshelfBook>();
  const bookshelfByKey = new Map<string, BookshelfBook>();
  for (const b of bookshelfBooks) {
    if (b.isbn) bookshelfByIsbn.set(b.isbn, b);
    bookshelfByKey.set(buildCompositeKey(b.title, b.author, b.series?.name ?? null, b.seriesIndex), b);
  }

  const matchedIds = new Set<number>();
  const results: SyncResults = {
    toCreate: [],
    bookUpdates: [],
    progressUpdates: [],
    progressSkips: [],
    metadataUpdates: [],
    notInCalibre: [],
    readNextRemovals: [],
  };

  for (const calibreBook of calibreBooks) {
    const bookshelfBook =
      (calibreBook.isbn ? bookshelfByIsbn.get(calibreBook.isbn) : undefined) ??
      bookshelfByKey.get(
        buildCompositeKey(
          calibreBook.title,
          calibreBook.author,
          calibreBook.seriesName,
          calibreBook.seriesIndex,
        ),
      );

    if (!bookshelfBook) {
      results.toCreate.push(calibreBook);
      continue;
    }

    matchedIds.add(bookshelfBook.id);

    const derived = deriveStatus(
      calibreBook.readStatus,
      calibreBook.readPercent,
      calibreBook.dnf,
      calibreBook.isReadNext,
    );

    const newStatus = shouldUpdateStatus(bookshelfBook.status, derived) ? derived : null;
    const effectiveStatus = newStatus ?? bookshelfBook.status;

    const newStartedAt =
      bookshelfBook.startedAt === null && calibreBook.datestarted !== null
        ? calibreBook.datestarted
        : null;

    const newFinishedAt =
      bookshelfBook.finishedAt === null && effectiveStatus === "READ"
        ? new Date()
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

    if (shouldLogProgress(calibreBook.readPercent, bookshelfBook.progress)) {
      results.progressUpdates.push({
        calibreBook,
        bookshelfBook,
        newProgress: calibreBook.readPercent!,
      });
    } else if (
      calibreBook.readPercent !== null &&
      calibreBook.readPercent > 0 &&
      bookshelfBook.progress < 100
    ) {
      results.progressSkips.push({ calibreBook, bookshelfBook });
    }

    const newTitle = calibreBook.title !== bookshelfBook.title ? calibreBook.title : null;
    const newAuthor = calibreBook.author !== bookshelfBook.author ? calibreBook.author : null;
    const newIsbn = bookshelfBook.isbn === null && calibreBook.isbn !== null ? calibreBook.isbn : null;
    const newPublishedYear =
      bookshelfBook.publishedYear === null && calibreBook.publishedYear !== null ? calibreBook.publishedYear : null;
    const newSummary =
      calibreBook.summary !== null && bookshelfBook.summary !== calibreBook.summary
        ? calibreBook.summary
        : null;

    if (newTitle !== null || newAuthor !== null || newIsbn !== null || newPublishedYear !== null || newSummary !== null) {
      results.metadataUpdates.push({
        calibreBook,
        bookshelfBook,
        newTitle,
        newAuthor,
        newIsbn,
        newPublishedYear,
        newSummary,
      });
    }
  }

  for (const b of bookshelfBooks) {
    if (!matchedIds.has(b.id)) results.notInCalibre.push(b);
  }

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.isReadNext) continue;
    const base = deriveStatus(calibreBook.readStatus, calibreBook.readPercent, calibreBook.dnf);
    if (base !== "TO_READ") results.readNextRemovals.push(calibreBook);
  }

  return results;
}

// ─── Page count ───────────────────────────────────────────────────────────────

async function computePageCounts(
  books: CalibreBookSync[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (books.length === 0) return map;

  const parser = makeScriptParser();
  for (const b of books) {
    if (!b.bookFilePath || !existsSync(b.bookFilePath)) continue;
    try {
      const buffer = readFileSync(b.bookFilePath);
      map.set(b.calibreId, await estimateKepubPageCount(buffer, parser));
    } catch (err) {
      console.warn(`  ⚠ Could not estimate page count for "${b.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return map;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function printResults(
  results: SyncResults,
  apply: boolean,
  pageCountMap: Map<number, number>,
): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Calibre Sync — ${mode} ===\n`);

  const createLabel = apply ? "CREATED" : "WOULD CREATE";
  const createdWithProgress = results.toCreate.filter((b) => (b.readPercent ?? 0) > 0).length;
  const createdProgressSuffix =
    createdWithProgress > 0 ? ` (${createdWithProgress} with progress logged)` : "";
  console.log(`${createLabel} (${results.toCreate.length})${createdProgressSuffix}`);
  for (const b of results.toCreate) {
    const derived = deriveStatus(b.readStatus, b.readPercent, b.dnf, b.isReadNext);
    const pct = b.readPercent ? ` (${b.readPercent}%)` : "";
    const pages = pageCountMap.has(b.calibreId) ? ` | Pages: ${pageCountMap.get(b.calibreId)}` : "";
    const started = b.datestarted
      ? ` | Started: ${b.datestarted.toISOString().slice(0, 10)}`
      : "";
    console.log(`  • ${formatBook(b.title, b.author, b.seriesName, b.seriesIndex)}`);
    console.log(`    Status: ${derived}${pct}${pages}${started}`);
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

  const metadataLabel = apply ? "UPDATED METADATA" : "WOULD UPDATE METADATA";
  const renameCount = results.metadataUpdates.filter(
    (u) => u.newTitle !== null || u.newAuthor !== null,
  ).length;
  const renameSuffix = renameCount > 0 ? ` (${renameCount} renames)` : "";
  console.log(`\n${metadataLabel} (${results.metadataUpdates.length})${renameSuffix}`);
  for (const { bookshelfBook, newTitle, newAuthor, newIsbn, newPublishedYear, newSummary } of results.metadataUpdates) {
    console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author, null, null)}`);
    if (newTitle !== null) console.log(`    Title: "${bookshelfBook.title}" → "${newTitle}"`);
    if (newAuthor !== null) console.log(`    Author: "${bookshelfBook.author}" → "${newAuthor}"`);
    if (newIsbn !== null) console.log(`    ISBN: ${newIsbn}`);
    if (newPublishedYear !== null) console.log(`    Year: ${newPublishedYear}`);
    if (newSummary !== null) console.log(`    Summary: ${newSummary.slice(0, 80)}…`);
  }

  const progressLabel = apply ? "LOGGED PROGRESS" : "WOULD LOG PROGRESS";
  console.log(`\n${progressLabel} (${results.progressUpdates.length})`);
  for (const { calibreBook, bookshelfBook, newProgress } of results.progressUpdates) {
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    ${bookshelfBook.progress}% → ${newProgress}%`);
  }

  if (results.progressSkips.length > 0) {
    console.log(`\nSKIPPED — NO PROGRESS INCREASE (${results.progressSkips.length})`);
    for (const { calibreBook, bookshelfBook } of results.progressSkips) {
      console.log(
        `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
      );
      console.log(
        `    Already at ${bookshelfBook.progress}%, Calibre reports ${calibreBook.readPercent}%`,
      );
    }
  }

  const removeLabel = apply ? "REMOVED FROM CWA READ NEXT SHELF" : "WOULD REMOVE FROM CWA READ NEXT SHELF";
  console.log(`\n${removeLabel} (${results.readNextRemovals.length})`);
  for (const b of results.readNextRemovals) {
    const base = deriveStatus(b.readStatus, b.readPercent, b.dnf);
    console.log(`  • ${formatBook(b.title, b.author, b.seriesName, b.seriesIndex)}`);
    console.log(`    Reason: ${base}`);
  }

  console.log(`\nNOT IN CALIBRE (${results.notInCalibre.length})`);
  for (const b of results.notInCalibre) {
    console.log(`  • ${formatBook(b.title, b.author, b.series?.name ?? null, b.seriesIndex)}`);
  };

  if (!apply) {
    const pad = (n: number) => String(n).padStart(3);
    const renameCount = results.metadataUpdates.filter(
      (u) => u.newTitle !== null || u.newAuthor !== null,
    ).length;
    const renameSuffix = renameCount > 0 ? ` (${renameCount} renames)` : "";
    console.log("\n=== Summary ===");
    console.log(`Would create:         ${pad(results.toCreate.length)}`);
    console.log(`Would update:         ${pad(bookUpdatesWithStatus.length)}`);
    console.log(`Would log:            ${pad(results.progressUpdates.length)}`);
    console.log(`Would update meta:    ${pad(results.metadataUpdates.length)}${renameSuffix}`);
    console.log(`Would remove from Read Next (CWA):  ${pad(results.readNextRemovals.length)}`);
    if (results.progressSkips.length > 0) {
      console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
    }
    console.log(`Not in Calibre:       ${pad(results.notInCalibre.length)}`);
    console.log("\nRun with --apply to write changes.");
  }
}

function printApplySummary(
  results: SyncResults,
  createErrors: string[],
  updateErrors: string[],
  metadataErrors: string[],
  progressErrors: string[],
  readNextErrors: string[],
): void {
  const pad = (n: number) => String(n).padStart(3);
  const bookUpdatesWithStatus = results.bookUpdates.filter((u) => u.newStatus !== null);

  const renameCount = results.metadataUpdates.filter(
    (u) => u.newTitle !== null || u.newAuthor !== null,
  ).length;
  const renameSuffix = renameCount > 0 ? ` (${renameCount} renames)` : "";
  console.log("\n=== Summary ===");
  console.log(`Created:              ${pad(results.toCreate.length - createErrors.length)}`);
  console.log(`Updated status:       ${pad(bookUpdatesWithStatus.length - updateErrors.length)}`);
  console.log(`Logged progress:      ${pad(results.progressUpdates.length - progressErrors.length)}`);
  console.log(`Updated metadata:     ${pad(results.metadataUpdates.length - metadataErrors.length)}${renameSuffix}`);
  console.log(`Removed from Read Next (CWA):  ${pad(results.readNextRemovals.length - readNextErrors.length)}`);
  if (results.progressSkips.length > 0) {
    console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
  }
  console.log(`Not in Calibre:       ${pad(results.notInCalibre.length)}`);
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function uploadCover(coverPath: string | null): Promise<string | null> {
  if (!coverPath || !existsSync(coverPath)) return null;
  try {
    const buffer = readFileSync(coverPath);
    const blob = await put(`covers/${Date.now()}`, buffer, {
      access: "public",
      contentType: "image/jpeg",
    });
    return blob.url;
  } catch (err) {
    console.error(
      `  ⚠ Cover upload failed for ${path.basename(path.dirname(coverPath))}:`,
      err,
    );
    return null;
  }
}

async function applyCreates(
  toCreate: CalibreBookSync[],
  userId: string,
  pageCountMap: Map<number, number>,
): Promise<{ errors: string[]; progressLogged: number }> {
  const errors: string[] = [];
  let progressLogged = 0;
  for (const b of toCreate) {
    try {
      const coverUrl = await uploadCover(b.coverPath);
      const seriesId = b.seriesName ? await upsertSeries(prisma, b.seriesName, userId) : null;
      const derived = deriveStatus(b.readStatus, b.readPercent, b.dnf, b.isReadNext);
      const initialProgress = b.readPercent ?? 0;

      await prisma.$transaction(async (tx) => {
        const created = await tx.book.create({
          data: {
            title: b.title,
            titleSort: createTitleSort(b.title),
            author: b.author,
            authorSort: createAuthorSort(b.author),
            seriesId,
            seriesIndex: b.seriesIndex,
            isbn: b.isbn,
            publishedYear: b.publishedYear,
            summary: b.summary,
            coverUrl,
            pageCount: pageCountMap.get(b.calibreId) ?? null,
            status: derived,
            progress: initialProgress,
            startedAt: b.datestarted,
            finishedAt: derived === "READ" ? new Date() : null,
            userId,
          },
        });

        // Mirror the web UI's "log progress" action (createReadingProgressInstance):
        // a book imported with real reading progress gets a ReadingProgress row,
        // dated now exactly as the UI does, so it counts toward page/streak stats.
        // Without it, an imported in-progress/finished book would be invisible to
        // the ReadingProgress-derived stats.
        if (initialProgress > 0) {
          await tx.readingProgress.create({
            data: { userId, bookId: created.id, progress: initialProgress },
          });
          progressLogged++;
        }
      });
    } catch (err) {
      const prismaErr = err as { code?: string; meta?: { target?: string | string[] } };
      const target = prismaErr.meta?.target;
      const targetStr = Array.isArray(target) ? target.join(",") : (target ?? "");
      const isSeriesConflict =
        prismaErr.code === "P2002" &&
        targetStr.includes("seriesId") &&
        targetStr.includes("seriesIndex");

      errors.push(
        isSeriesConflict
          ? `Series conflict: "${b.title}" — another book in "${b.seriesName}" already has index ${b.seriesIndex}. Fix the series index in Calibre and rerun.`
          : `Failed to create "${b.title}": ${extractErrorMessage(err)}`,
      );
    }
  }
  return { errors, progressLogged };
}

async function applyBookUpdates(bookUpdates: BookUpdate[]): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newStatus, newStartedAt, newFinishedAt } of bookUpdates) {
    try {
      const data: { status?: ReadStatus; startedAt?: Date; finishedAt?: Date } = {};
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

async function applyMetadataUpdates(metadataUpdates: MetadataUpdate[]): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newTitle, newAuthor, newIsbn, newPublishedYear, newSummary } of metadataUpdates) {
    try {
      const data: {
        title?: string;
        titleSort?: string;
        author?: string;
        authorSort?: string;
        isbn?: string;
        publishedYear?: number;
        summary?: string;
      } = {};
      if (newTitle !== null) { data.title = newTitle; data.titleSort = createTitleSort(newTitle); }
      if (newAuthor !== null) { data.author = newAuthor; data.authorSort = createAuthorSort(newAuthor); }
      if (newIsbn !== null) data.isbn = newIsbn;
      if (newPublishedYear !== null) data.publishedYear = newPublishedYear;
      if (newSummary !== null) data.summary = newSummary;
      await prisma.book.update({ where: { id: bookshelfBook.id }, data });
    } catch (err) {
      errors.push(
        `Failed to update metadata for "${bookshelfBook.title}": ${extractErrorMessage(err)}`,
      );
    }
  }
  return errors;
}

async function applyProgressUpdates(
  progressUpdates: ProgressUpdate[],
  userId: string,
): Promise<string[]> {
  const errors: string[] = [];
  for (const { calibreBook, bookshelfBook, newProgress } of progressUpdates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.readingProgress.create({
          data: {
            userId,
            bookId: bookshelfBook.id,
            progress: newProgress,
          },
        });
        await tx.book.update({
          where: { id: bookshelfBook.id },
          data: { progress: newProgress },
        });
      });
    } catch (err) {
      errors.push(
        `Failed to log progress for "${bookshelfBook.title}": ${extractErrorMessage(err)}`,
      );
    }
  }
  return errors;
}

async function applyReadNextRemovals(
  cwaDbPath: string,
  books: CalibreBookSync[],
): Promise<string[]> {
  if (books.length === 0) return [];
  const errors: string[] = [];
  let db: import("better-sqlite3").Database | null = null;
  try {
    const Database = (await import("better-sqlite3")).default;
    db = new Database(cwaDbPath);
    const shelf = db
      .prepare("SELECT id FROM shelf WHERE name = 'Read Next' LIMIT 1")
      .get() as { id: number } | undefined;
    if (!shelf) return [];
    const del = db.prepare("DELETE FROM book_shelf_link WHERE shelf = ? AND book_id = ?");
    for (const b of books) {
      try {
        del.run(shelf.id, b.calibreId);
      } catch (err) {
        errors.push(
          `Failed to remove "${b.title}" from Read Next shelf: ${extractErrorMessage(err)}`,
        );
      }
    }
  } catch (err) {
    errors.push(`Failed to open CWA database: ${extractErrorMessage(err)}`);
  } finally {
    db?.close();
  }
  return errors;
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

  // Resolve the user before stopping the container. Any process.exit() here
  // bypasses the finally block below, so all early exits must happen while the
  // container is still running — once it's stopped, the finally is the only
  // thing that brings it back.
  const user = await prisma.user.findFirst({ where: { email: userEmail } });

  if (!user) {
    console.error(`Error: No bookshelf user found with email "${userEmail}"`);
    process.exit(1);
  }

  await stopContainer();

  let exitCode = 0;
  try {
    console.log(`Reading Calibre library from: ${calibreDbPath}`);
    console.log(`Reading CWA database from: ${cwaDbPath}`);
    const calibreBooks = readCalibreSyncData(calibreDbPath, cwaDbPath);
    console.log(`Loaded ${calibreBooks.length} books from Calibre`);

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
        series: { select: { name: true } },
        seriesIndex: true,
        isbn: true,
        publishedYear: true,
        summary: true,
      },
    });
    console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

    const results = computeResults(calibreBooks, bookshelfBooks);
    const pageCountMap = await computePageCounts(results.toCreate);
    printResults(results, apply, pageCountMap);

    if (apply) {
      const { errors: createErrors, progressLogged: createdProgressLogged } = await applyCreates(
        results.toCreate,
        user.id,
        pageCountMap,
      );
      const updateErrors = await applyBookUpdates(results.bookUpdates);
      const metadataErrors = await applyMetadataUpdates(results.metadataUpdates);
      const progressErrors = await applyProgressUpdates(results.progressUpdates, user.id);
      const readNextErrors = await applyReadNextRemovals(cwaDbPath, results.readNextRemovals);

      if (results.progressUpdates.length > 0 || createdProgressLogged > 0) {
        await recalculateAllUserStats(prisma, user);
      }

      printApplySummary(results, createErrors, updateErrors, metadataErrors, progressErrors, readNextErrors);

      const allErrors = [...createErrors, ...updateErrors, ...metadataErrors, ...progressErrors, ...readNextErrors];
      if (allErrors.length > 0) {
        console.log(`\n=== Errors (${allErrors.length}) ===`);
        for (const msg of allErrors) {
          console.error(`  ✗ ${msg}`);
        }
        exitCode = 1;
      }
    }
  } finally {
    await startContainer();
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
