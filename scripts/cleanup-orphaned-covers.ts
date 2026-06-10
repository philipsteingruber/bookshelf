import "dotenv/config";

import { del, list } from "@vercel/blob";

import prisma from "@/lib/prisma";

const main = async (): Promise<void> => {
  const isDryRun = !process.argv.includes("--apply");

  console.log("=== Cleaning Up Orphaned Covers From Vercel Blob ===");
  console.log(
    `Mode: ${isDryRun ? "DRY RUN (use --apply to actually delete)" : "DELETE"}\n`,
  );

  console.log("Fetching files from Vercel Blob...");
  const blobFiles = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: "covers/", cursor, limit: 1000 });
    blobFiles.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  console.log(`Found ${blobFiles.length} files in Vercel Blob\n`);

  if (blobFiles.length === 0) {
    console.log("No files in Vercel Blob, exiting.");
    if (isDryRun) console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  console.log("Fetching cover URLs from database...");
  const booksWithCovers = await prisma.book.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, coverUrl: true },
  });
  console.log(`Found ${booksWithCovers.length} books with covers\n`);

  const databaseUrls = new Set<string>(
    booksWithCovers
      .map((book) => book.coverUrl)
      .filter((url): url is string => url !== null),
  );

  const orphanedFiles = blobFiles.filter((blob) => !databaseUrls.has(blob.url));

  if (orphanedFiles.length === 0) {
    console.log("No orphaned files found, exiting.");
    if (isDryRun) console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  console.log(`Found ${orphanedFiles.length} orphaned files:\n`);
  for (const file of orphanedFiles) {
    console.log(`  • ${file.url}`);
  }

  if (isDryRun) {
    console.log("\nDry run complete. Run with --apply to remove those files.");
    console.log(`MAINTENANCE_RESULT: changes=${orphanedFiles.length}`);
  } else {
    console.log("\nDeleting orphaned files...");
    const urlsToDelete = orphanedFiles.map((f) => f.url);
    try {
      await del(urlsToDelete);
      console.log(`Deleted ${orphanedFiles.length} files successfully.`);
    } catch (error) {
      console.error("Error deleting files:", error);
      throw error;
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
