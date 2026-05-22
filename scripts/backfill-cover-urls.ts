import "dotenv/config";

import { parseArgs } from "node:util";

import { put } from "@vercel/blob";

import { isBlobUrl } from "@/lib/common";
import prisma from "@/lib/prisma";

const backfillCoverUrls = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const apply = values.apply ?? false;

  const books = await prisma.book.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, coverUrl: true },
  });

  const externalBooks = books.filter(
    (book) => book.coverUrl && !isBlobUrl(book.coverUrl),
  );

  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Cover URL Backfill — ${mode} ===\n`);
  console.log(
    `Found ${externalBooks.length} book(s) with external cover URLs (${books.length} total with a cover).`,
  );

  if (externalBooks.length === 0) {
    console.log("Nothing to backfill.");
    console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  for (const book of externalBooks) {
    console.log(`  • [${book.id}] "${book.title}" — ${book.coverUrl}`);
  }

  if (!apply) {
    console.log("\nRun with --apply to migrate covers to Vercel Blob.");
    console.log(`MAINTENANCE_RESULT: changes=${externalBooks.length}`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const book of externalBooks) {
    const url = book.coverUrl!;
    process.stdout.write(`  [${book.id}] "${book.title}" ... `);

    let response: Response;
    try {
      response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (fetch: ${message})`);
      failed++;
      continue;
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    try {
      const blob = await put(`covers/${book.id}`, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
      });

      await prisma.book.update({
        where: { id: book.id },
        data: { coverUrl: blob.url },
      });

      console.log(`OK → ${blob.url}`);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (upload: ${message})`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
};

backfillCoverUrls()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
