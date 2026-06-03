import { parseArgs } from "node:util";

import { DEFAULT_CALIBRE_DB } from "./lib/calibre-constants";
import { readCalibreBooks, type CalibreBook } from "./lib/calibre-reader";
import { startContainer, stopContainer } from "./lib/docker";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
    },
  });

  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;

  await stopContainer();

  try {
    const calibreBooks = readCalibreBooks(calibreDbPath);

    const missing: CalibreBook[] = calibreBooks.filter((b) => !b.goodreadsId);

    console.log(`\n=== Missing Goodreads IDs ===\n`);
    console.log(`Scanned ${calibreBooks.length} book(s) in Calibre.`);
    console.log(`Found ${missing.length} book(s) without a Goodreads ID.\n`);

    if (missing.length > 0) {
      for (const book of missing) {
        const series =
          book.seriesName !== null && book.seriesIndex !== null
            ? ` [${book.seriesName} #${book.seriesIndex}]`
            : "";
        console.log(`  • [${book.id}] ${book.title} — ${book.author}${series}`);
      }
    }

    console.log(`MAINTENANCE_RESULT: changes=${missing.length}`);
  } finally {
    await startContainer();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
