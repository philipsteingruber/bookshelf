// scripts/enrich-goodreads-url.ts

import "dotenv/config";

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

import { readCalibreBooks, type CalibreBook } from "./lib/calibre-reader";
import { buildCompositeKey } from "./lib/normalizer";

const DEFAULT_CALIBRE_DB = "E:\\Calibre Library\\metadata.db";

const GOODREADS_BASE_URL = "https://www.goodreads.com/book/show";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  seriesIndex: number | null;
  goodreadsUrl: string | null;
  series: { name: string } | null;
}

interface MatchResult {
  calibreBook: CalibreBook;
  bookshelfId: number;
}

interface Results {
  toUpdate: MatchResult[];
  alreadyEnriched: MatchResult[];
  notInBookshelf: CalibreBook[];
  noGoodreadsId: CalibreBook[];
  ambiguous: CalibreBook[];
  duplicateCalibreId: CalibreBook[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGoodreadsUrl(goodreadsId: string): string {
  return `${GOODREADS_BASE_URL}/${goodreadsId}`;
}

function formatBook(book: CalibreBook): string {
  const series =
    book.seriesName !== null && book.seriesIndex !== null
      ? ` [${book.seriesName} #${book.seriesIndex}]`
      : "";
  return `${book.title} — ${book.author}${series}`;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function match(calibreBooks: CalibreBook[], bookshelfBooks: BookshelfBook[]): Results {
  const bookshelfByKey = new Map<string, BookshelfBook[]>();

  for (const book of bookshelfBooks) {
    const key = buildCompositeKey(
      book.title,
      book.author,
      book.series?.name ?? null,
      book.series !== null ? book.seriesIndex : null,
    );
    const existing = bookshelfByKey.get(key) ?? [];
    existing.push(book);
    bookshelfByKey.set(key, existing);
  }

  const goodreadsIdCounts = new Map<string, number>();
  for (const book of calibreBooks) {
    if (book.goodreadsId) {
      goodreadsIdCounts.set(book.goodreadsId, (goodreadsIdCounts.get(book.goodreadsId) ?? 0) + 1);
    }
  }
  const duplicateGoodreadsIds = new Set(
    [...goodreadsIdCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );

  const results: Results = {
    toUpdate: [],
    alreadyEnriched: [],
    notInBookshelf: [],
    noGoodreadsId: [],
    ambiguous: [],
    duplicateCalibreId: [],
  };

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.goodreadsId) {
      results.noGoodreadsId.push(calibreBook);
      continue;
    }

    if (duplicateGoodreadsIds.has(calibreBook.goodreadsId)) {
      results.duplicateCalibreId.push(calibreBook);
      continue;
    }

    const key = buildCompositeKey(
      calibreBook.title,
      calibreBook.author,
      calibreBook.seriesName,
      calibreBook.seriesIndex,
    );

    const matches = bookshelfByKey.get(key) ?? [];

    if (matches.length === 0) {
      results.notInBookshelf.push(calibreBook);
    } else if (matches.length > 1) {
      results.ambiguous.push(calibreBook);
    } else {
      const bookshelfBook = matches[0];
      if (bookshelfBook.goodreadsUrl) {
        results.alreadyEnriched.push({ calibreBook, bookshelfId: bookshelfBook.id });
      } else {
        results.toUpdate.push({ calibreBook, bookshelfId: bookshelfBook.id });
      }
    }
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function printResults(results: Results, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Goodreads URL Enrichment — ${mode} ===\n`);

  const updateLabel = apply ? "UPDATED" : "WOULD UPDATE";
  console.log(`${updateLabel} (${results.toUpdate.length})`);
  for (const { calibreBook } of results.toUpdate) {
    console.log(`  • ${formatBook(calibreBook)}`);
    console.log(`    → ${buildGoodreadsUrl(calibreBook.goodreadsId!)}`);
  }

  console.log(`\nALREADY ENRICHED — SKIP (${results.alreadyEnriched.length})`);
  for (const { calibreBook } of results.alreadyEnriched) {
    console.log(`  • ${formatBook(calibreBook)}`);
  }

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
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function applyUpdates(results: Results): Promise<number> {
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

  const bookshelfBooks = await prisma.book.findMany({
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

  const results = match(calibreBooks, bookshelfBooks);

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
