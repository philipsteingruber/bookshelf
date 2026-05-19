import "dotenv/config";

import { parseArgs } from "node:util";

import { createAuthorSort, createTitleSort } from "@/lib/book";
import prisma from "@/lib/prisma";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const apply = values.apply ?? false;

  const books = await prisma.book.findMany({
    select: { id: true, title: true, author: true, titleSort: true, authorSort: true },
  });

  const stale = books.filter((b) => {
    return b.titleSort !== createTitleSort(b.title) || b.authorSort !== createAuthorSort(b.author);
  });

  if (stale.length === 0) {
    console.log("All sort fields are up to date.");
    console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Sort Field Backfill — ${mode} ===\n`);
  console.log(`Found ${stale.length} book(s) with stale sort fields:\n`);

  for (const b of stale) {
    const newTitleSort = createTitleSort(b.title);
    const newAuthorSort = createAuthorSort(b.author);
    console.log(`  • [${b.id}] ${b.title} — ${b.author}`);
    if (b.titleSort !== newTitleSort) {
      console.log(`    titleSort:  "${b.titleSort}" → "${newTitleSort}"`);
    }
    if (b.authorSort !== newAuthorSort) {
      console.log(`    authorSort: "${b.authorSort}" → "${newAuthorSort}"`);
    }
  }

  if (!apply) {
    console.log("\nRun with --apply to write changes.");
    console.log(`MAINTENANCE_RESULT: changes=${stale.length}`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const b of stale) {
    try {
      await prisma.book.update({
        where: { id: b.id },
        data: {
          titleSort: createTitleSort(b.title),
          authorSort: createAuthorSort(b.author),
        },
      });
      succeeded++;
    } catch (err) {
      console.error(`  ✗ Failed to update [${b.id}] "${b.title}": ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} updated, ${failed} failed.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
