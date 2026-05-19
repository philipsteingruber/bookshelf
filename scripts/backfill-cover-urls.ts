import "dotenv/config";

import { parseArgs } from "node:util";

import { UTApi } from "uploadthing/server";

import { isUploadThingUrl } from "@/lib/common";
import prisma from "@/lib/prisma";

const backfillCoverUrls = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const apply = values.apply ?? false;

  const utApi = new UTApi();

  const books = await prisma.book.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, coverUrl: true },
  });

  const externalBooks = books.filter(
    (book) => book.coverUrl && !isUploadThingUrl(book.coverUrl),
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
    console.log("\nRun with --apply to migrate covers to UploadThing.");
    console.log(`MAINTENANCE_RESULT: changes=${externalBooks.length}`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const book of externalBooks) {
    const url = book.coverUrl!;
    process.stdout.write(`  [${book.id}] "${book.title}" ... `);

    const result = await utApi.uploadFilesFromUrl(url);

    if (result.error || !result.data) {
      console.log(`FAILED (${result.error?.message ?? "unknown error"})`);
      failed++;
      continue;
    }

    await prisma.book.update({
      where: { id: book.id },
      data: { coverUrl: result.data.ufsUrl },
    });

    console.log(`OK → ${result.data.ufsUrl}`);
    succeeded++;
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
};

backfillCoverUrls()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
