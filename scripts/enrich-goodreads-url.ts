import "dotenv/config";

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

import { DEFAULT_CALIBRE_DB } from "./lib/calibre-constants";
import { readCalibreBooks, type CalibreBook } from "./lib/calibre-reader";
import {
  buildGoodreadsUrl,
  matchGoodreadsUrls,
  type BookshelfBookForGoodreads,
  type GoodreadsMatchResults,
} from "./lib/goodreads-match";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBook(book: CalibreBook): string {
  const series =
    book.seriesName !== null && book.seriesIndex !== null
      ? ` [${book.seriesName} #${book.seriesIndex}]`
      : "";
  return `${book.title} — ${book.author}${series}`;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function printResults(results: GoodreadsMatchResults, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Goodreads URL Enrichment — ${mode} ===\n`);

  const updateLabel = apply ? "UPDATED" : "WOULD UPDATE";
  console.log(`${updateLabel} (${results.toUpdate.length})`);
  for (const { calibreBook } of results.toUpdate) {
    console.log(`  • ${formatBook(calibreBook)}`);
    console.log(`    → ${buildGoodreadsUrl(calibreBook.goodreadsId!)}`);
  }

  console.log(`\nALREADY ENRICHED — SKIP (${results.alreadyEnriched.length})`);

  console.log(`\nNOT FOUND IN BOOKSHELF (${results.notInBookshelf.length})`);
  for (const book of results.notInBookshelf) {
    console.log(`  • ${formatBook(book)}`);
  }

  console.log(`\nNO GOODREADS ID IN CALIBRE (${results.noGoodreadsId.length})`);
  for (const book of results.noGoodreadsId) {
    console.log(`  • ${book.title} — ${book.author}`);
  }

  if (results.ambiguous.length > 0) {
    console.log(`\nAMBIGUOUS MATCHES — SKIPPED (${results.ambiguous.length})`);
    for (const book of results.ambiguous) {
      console.log(
        `  ⚠ ${formatBook(book)} — multiple bookshelf books matched, skipped both`,
      );
    }
  }

  if (results.duplicateCalibreId.length > 0) {
    console.log(`\nDUPLICATE GOODREADS ID IN CALIBRE — SKIPPED (${results.duplicateCalibreId.length})`);
    for (const book of results.duplicateCalibreId) {
      console.log(
        `  ⚠ ${formatBook(book)} — Goodreads ID ${book.goodreadsId} appears on multiple Calibre books`,
      );
    }
  }

  console.log("\n=== Summary ===");
  const updateSummaryLabel = apply ? "Updated:        " : "Would update:   ";
  console.log(`${updateSummaryLabel}  ${String(results.toUpdate.length).padStart(3)}`);
  console.log(`Already enriched:   ${String(results.alreadyEnriched.length).padStart(3)}`);
  console.log(`Not in bookshelf:   ${String(results.notInBookshelf.length).padStart(3)}`);
  console.log(`No Goodreads ID:    ${String(results.noGoodreadsId.length).padStart(3)}`);
  if (results.ambiguous.length > 0) {
    console.log(`Ambiguous matches:  ${String(results.ambiguous.length).padStart(3)}`);
  }
  if (results.duplicateCalibreId.length > 0) {
    console.log(`Duplicate Calibre ID:${String(results.duplicateCalibreId.length).padStart(3)}`);
  }

  if (!apply && results.toUpdate.length > 0) {
    console.log("\nRun with --apply to write changes.");
  }

  if (!apply) {
    console.log(`MAINTENANCE_RESULT: changes=${results.toUpdate.length}`);
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function applyUpdates(results: GoodreadsMatchResults): Promise<number> {
  let failures = 0;
  for (const { calibreBook, bookshelfId } of results.toUpdate) {
    try {
      await prisma.book.update({
        where: { id: bookshelfId },
        data: { goodreadsUrl: buildGoodreadsUrl(calibreBook.goodreadsId!) },
      });
    } catch (error) {
      console.error(`  ✗ Failed to update "${calibreBook.title}":`, error);
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
    },
  });

  const apply = values.apply ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;

  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log(`Reading Calibre library from: ${calibreDbPath}`);
  const calibreBooks = readCalibreBooks(calibreDbPath);
  console.log(`Loaded ${calibreBooks.length} books from Calibre`);

  const bookshelfBooks: BookshelfBookForGoodreads[] = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      author: true,
      seriesIndex: true,
      goodreadsUrl: true,
      series: { select: { name: true } },
    },
  });
  console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

  const results = matchGoodreadsUrls(calibreBooks, bookshelfBooks);

  printResults(results, apply);

  if (apply && results.toUpdate.length > 0) {
    const failures = await applyUpdates(results);
    if (failures > 0) {
      console.error(`\n${failures} update(s) failed. See errors above.`);
      process.exit(1);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
