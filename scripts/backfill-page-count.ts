import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { estimateKepubPageCount } from "@/lib/book";
import prisma from "@/lib/prisma";

import {
  DEFAULT_CALIBRE_DB,
  DEFAULT_CWA_DB,
  GOODREADS_BASE,
  normaliseGoodreadsUrl,
} from "./lib/calibre-constants";
import { readCalibreSyncData } from "./lib/calibre-sync-reader";
import { startContainer, stopContainer } from "./lib/docker";
import { makeScriptParser } from "./lib/script-parser";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
      "cwa-db": { type: "string", default: DEFAULT_CWA_DB },
    },
  });

  const apply = values.apply ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;
  const cwaDbPath = (values["cwa-db"] as string | undefined) ?? DEFAULT_CWA_DB;

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  await stopContainer();

  try {
    const calibreBooks = readCalibreSyncData(calibreDbPath, cwaDbPath);

    // Build lookup: normalised Goodreads URL -> file path
    const fileByUrl = new Map<string, string>();
    for (const b of calibreBooks) {
      if (b.goodreadsId && b.bookFilePath) {
        fileByUrl.set(`${GOODREADS_BASE}/${b.goodreadsId}`, b.bookFilePath);
      }
    }

    const booksWithoutPageCount = await prisma.book.findMany({
      where: { pageCount: null },
      select: { id: true, title: true, author: true, goodreadsUrl: true },
    });

    console.log(`\nFound ${booksWithoutPageCount.length} book(s) without a page count.\n`);

    type BookResult =
      | { kind: "match"; bookId: number; title: string; author: string; filePath: string; pageCount: number }
      | { kind: "no_goodreads_url"; title: string; author: string }
      | { kind: "no_calibre_match"; title: string; author: string }
      | { kind: "file_missing"; title: string; author: string; filePath: string }
      | { kind: "error"; title: string; author: string; message: string };

    const results: BookResult[] = [];
    const total = booksWithoutPageCount.length;

    for (let i = 0; i < total; i++) {
      const book = booksWithoutPageCount[i];
      const prefix = `[${String(i + 1).padStart(String(total).length)}/${total}] ${book.title} — ${book.author}`;

      if (!book.goodreadsUrl) {
        console.log(`${prefix} → skip (no Goodreads URL)`);
        results.push({ kind: "no_goodreads_url", title: book.title, author: book.author });
        continue;
      }

      const filePath = fileByUrl.get(normaliseGoodreadsUrl(book.goodreadsUrl));

      if (!filePath) {
        console.log(`${prefix} → skip (not in Calibre)`);
        results.push({ kind: "no_calibre_match", title: book.title, author: book.author });
        continue;
      }

      if (!existsSync(filePath)) {
        console.log(`${prefix} → skip (file missing)`);
        results.push({ kind: "file_missing", title: book.title, author: book.author, filePath });
        continue;
      }

      try {
        const buffer = readFileSync(filePath);
        const pageCount = await estimateKepubPageCount(buffer, makeScriptParser());
        console.log(`${prefix} → ${pageCount} pages`);
        results.push({ kind: "match", bookId: book.id, title: book.title, author: book.author, filePath, pageCount });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`${prefix} → error: ${message}`);
        results.push({ kind: "error", title: book.title, author: book.author, message });
      }
    }

    const matches = results.filter((r) => r.kind === "match") as Extract<BookResult, { kind: "match" }>[];
    const mode = apply ? "APPLYING" : "DRY RUN";
    console.log(`=== Page Count Backfill — ${mode} ===\n`);

    const updateLabel = apply ? "UPDATED" : "WOULD UPDATE";
    console.log(`${updateLabel} (${matches.length})`);
    for (const r of matches) {
      console.log(`  • [${r.bookId}] ${r.title} — ${r.author}: ${r.pageCount} pages`);
    }

    const noMatch = results.filter((r) => r.kind === "no_calibre_match");
    if (noMatch.length > 0) {
      console.log(`\nNO CALIBRE MATCH — SKIPPED (${noMatch.length})`);
      for (const r of noMatch) {
        console.log(`  • ${r.title} — ${r.author}`);
      }
    }

    const noUrl = results.filter((r) => r.kind === "no_goodreads_url");
    if (noUrl.length > 0) {
      console.log(`\nNO GOODREADS URL — SKIPPED (${noUrl.length})`);
      for (const r of noUrl) {
        console.log(`  • ${r.title} — ${r.author}`);
      }
    }

    const missing = results.filter((r) => r.kind === "file_missing") as Extract<BookResult, { kind: "file_missing" }>[];
    if (missing.length > 0) {
      console.log(`\nFILE MISSING — SKIPPED (${missing.length})`);
      for (const r of missing) {
        console.log(`  • ${r.title} — ${r.author}`);
        console.log(`    ${r.filePath}`);
      }
    }

    const errors = results.filter((r) => r.kind === "error") as Extract<BookResult, { kind: "error" }>[];
    if (errors.length > 0) {
      console.log(`\nERRORS (${errors.length})`);
      for (const r of errors) {
        console.log(`  • ${r.title} — ${r.author}: ${r.message}`);
      }
    }

    if (!apply) {
      console.log("\nRun with --apply to write changes.");
      console.log(`MAINTENANCE_RESULT: changes=${matches.length}`);
      return;
    }

    let succeeded = 0;
    let failed = 0;

    for (const r of matches) {
      try {
        await prisma.book.update({ where: { id: r.bookId }, data: { pageCount: r.pageCount } });
        succeeded++;
      } catch (err) {
        console.error(
          `  ✗ Failed to update "${r.title}": ${err instanceof Error ? err.message : String(err)}`,
        );
        failed++;
      }
    }

    console.log(`\nDone. ${succeeded} updated, ${failed} failed.`);
  } finally {
    await startContainer();
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
