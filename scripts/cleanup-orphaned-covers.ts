import "dotenv/config";

import { UTApi } from "uploadthing/server";

import { extractFileKeyFromUrl } from "@/lib/common";
import prisma from "@/lib/prisma";

const utApi = new UTApi();

const main = async (): Promise<void> => {
  const isDryRun = !process.argv.includes("--delete");

  console.log("=== Cleaning Up Orphaned Covers From UploadThing ===");
  console.log(
    `Mode: ${isDryRun ? "DRY RUN (use --delete to actually delete)" : "DELETE"}\n`,
  );

  console.log("Fetching files from UploadThing...");
  const { files: uploadThingFiles } = await utApi.listFiles();
  console.log(`Found ${uploadThingFiles.length} files in UploadThing\n`);

  if (uploadThingFiles.length === 0) {
    console.log("No files in UploadThing, exiting.");
    return;
  }

  console.log("Fetching cover URLs from database...");
  const booksWithCovers = await prisma.book.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, coverUrl: true },
  });
  console.log(`Found ${booksWithCovers.length} books with covers\n`);

  const databaseFileKeys = new Set<string>();
  booksWithCovers.forEach((book) => {
    if (book.coverUrl) {
      const key = extractFileKeyFromUrl(book.coverUrl);
      if (key) {
        databaseFileKeys.add(key);
      }
    }
  });
  console.log(
    `Extracted ${databaseFileKeys.size} unique file keys from database\n`,
  );

  const orphanedFiles = uploadThingFiles.filter(
    (file) => !databaseFileKeys.has(file.key),
  );

  if (orphanedFiles.length === 0) {
    console.log("No orphaned files found, exiting.");
    return;
  }

  console.log(`Found ${orphanedFiles.length} orphaned files:\n`);

  if (isDryRun) {
    console.log("Dry run complete. Run with --delete to remove those files.");
  } else {
    console.log("Deleting orphaned files...");
    const keysToDelete = orphanedFiles.map((f) => f.key);

    try {
      const result = await utApi.deleteFiles(keysToDelete);
      console.log(`Deleted ${result.deletedCount} files successfully.`);
    } catch (error) {
      console.error("Error deleting files:", error);
      process.exit(1);
    }
  }
  process.exit(0);
};

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
