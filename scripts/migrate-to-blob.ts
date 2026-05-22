import "dotenv/config";

import { parseArgs } from "node:util";

import { put } from "@vercel/blob";
import { UTApi } from "uploadthing/server";

import prisma from "@/lib/prisma";

const isUploadThingUrl = (url: string): boolean => {
  try {
    const segments = new URL(url).pathname.split("/");
    return segments.indexOf("f") !== -1;
  } catch {
    return false;
  }
};

const migrateToBlob = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "delete-old": { type: "boolean", default: false },
    },
  });
  const apply = values.apply ?? false;
  const deleteOld = values["delete-old"] ?? false;

  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Migrate Covers to Vercel Blob — ${mode} ===\n`);

  if (deleteOld && !apply) {
    console.log(
      "Note: --delete-old has no effect in dry-run mode. Pass --apply to enable deletion.\n",
    );
  }

  const books = await prisma.book.findMany({
    where: { coverUrl: { not: null } },
    select: { id: true, title: true, coverUrl: true },
  });

  const uploadThingBooks = books.filter(
    (book) => book.coverUrl && isUploadThingUrl(book.coverUrl),
  );

  console.log(
    `Found ${uploadThingBooks.length} book(s) with UploadThing covers (${books.length} total with a cover).`,
  );

  if (uploadThingBooks.length === 0) {
    console.log("Nothing to migrate.");
    console.log("MAINTENANCE_RESULT: changes=0");
    return;
  }

  for (const book of uploadThingBooks) {
    console.log(`  • [${book.id}] "${book.title}" — ${book.coverUrl}`);
  }

  if (!apply) {
    console.log("\nRun with --apply to migrate covers to Vercel Blob.");
    if (deleteOld) {
      console.log(
        "Run with --apply --delete-old to also delete originals from UploadThing after migration.",
      );
    }
    console.log(`MAINTENANCE_RESULT: changes=${uploadThingBooks.length}`);
    return;
  }

  let succeeded = 0;
  let failed = 0;
  const migratedOldUrls: string[] = [];

  for (const book of uploadThingBooks) {
    const oldUrl = book.coverUrl!;
    process.stdout.write(`  [${book.id}] "${book.title}" ... `);

    let response: Response;
    try {
      response = await fetch(oldUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (fetch error: ${message})`);
      failed++;
      continue;
    }

    const buffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ?? "image/jpeg";

    let newUrl: string;
    try {
      const blob = await put(`covers/${book.id}`, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
      });
      newUrl = blob.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (upload error: ${message})`);
      failed++;
      continue;
    }

    await prisma.book.update({
      where: { id: book.id },
      data: { coverUrl: newUrl },
    });

    console.log(`OK → ${newUrl}`);
    migratedOldUrls.push(oldUrl);
    succeeded++;
  }

  console.log(`\nMigration done. ${succeeded} succeeded, ${failed} failed.`);

  if (deleteOld && migratedOldUrls.length > 0) {
    console.log(`\nDeleting ${migratedOldUrls.length} files from UploadThing...`);
    const utApi = new UTApi();

    const keysToDelete = migratedOldUrls
      .map((url) => {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/");
        const fIndex = segments.indexOf("f");
        return fIndex !== -1 ? (segments[fIndex + 1] ?? null) : null;
      })
      .filter((key): key is string => key !== null);

    try {
      const result = await utApi.deleteFiles(keysToDelete);
      console.log(`Deleted ${result.deletedCount} files from UploadThing.`);
    } catch (err) {
      console.error("Error deleting from UploadThing:", err);
    }
  }

  console.log(`MAINTENANCE_RESULT: changes=${succeeded}`);
};

migrateToBlob()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
