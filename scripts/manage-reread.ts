import "dotenv/config";

import { parseArgs } from "node:util";

import { recalculateAllUserStats } from "@/lib/reading/stats-updates";
import prisma from "@/lib/prisma";

async function listBook(bookId: number): Promise<void> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      finishedAt: true,
      previousFinishedAt: true,
      rereadAt: true,
    },
  });
  if (!book) {
    console.error(`No book found with id ${bookId}`);
    process.exit(1);
  }
  console.log(`"${book.title}" (id ${book.id})`);
  console.log(`  status:              ${book.status}`);
  console.log(`  progress:            ${book.progress}%`);
  console.log(`  finishedAt:          ${book.finishedAt?.toISOString() ?? "null"}`);
  console.log(`  rereadAt:            ${book.rereadAt?.toISOString() ?? "null"}`);
  console.log(`  previousFinishedAt:  [${book.previousFinishedAt.map((d) => d.toISOString()).join(", ")}]`);
}

async function undoLast(bookId: number): Promise<void> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true, previousFinishedAt: true, rereadAt: true, userId: true },
  });
  if (!book) {
    console.error(`No book found with id ${bookId}`);
    process.exit(1);
  }
  if (book.previousFinishedAt.length === 0) {
    console.log(`"${book.title}": nothing to undo — previousFinishedAt is empty.`);
    return;
  }

  const restoredFinishedAt = book.previousFinishedAt[book.previousFinishedAt.length - 1]!;
  const remainingPreviousFinishedAt = book.previousFinishedAt.slice(0, -1);

  // Delete progress rows logged since the reread started, NOT since the
  // restored finishedAt — applyBookUpdates/applyProgressUpdates run as
  // separate steps in each sync script, so the original read's own final
  // progress row is routinely stamped AFTER its finishedAt and would be
  // wrongly deleted by a "since finishedAt" rule.
  const deleteFrom = book.rereadAt ?? restoredFinishedAt;

  await prisma.$transaction(async (tx) => {
    await tx.readingProgress.deleteMany({
      where: { bookId: book.id, createdAt: { gte: deleteFrom } },
    });
    await tx.book.update({
      where: { id: book.id },
      data: {
        previousFinishedAt: { set: remainingPreviousFinishedAt },
        status: "READ",
        // Approximation, not an exact restore — the pre-reread progress
        // value isn't preserved; isRereadStart's prior-progress gate means
        // the real value was at least minPriorProgress, so 100 is close.
        // previousStartedAt isn't tracked, so startedAt is left as-is —
        // undo is explicitly lossy on that field.
        progress: 100,
        finishedAt: restoredFinishedAt,
        dnfAt: null,
        resetAt: null,
        // Deliberately NOT cleared: leaving rereadAt at its existing
        // (original detection time) value lets isRereadStart's gate 7
        // permanently suppress re-detection from the same stale source
        // signal that caused the false positive in the first place. A
        // genuinely newer source timestamp will still correctly pass that
        // gate and allow a real future reread.
      },
    });
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: book.userId } });
  await recalculateAllUserStats(prisma, user);

  console.log(
    `"${book.title}" (id ${book.id}): undone. Restored to READ, finished ${restoredFinishedAt.toISOString()}.`,
  );
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      list: { type: "string" },
      "undo-last": { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.list !== undefined) {
    await listBook(Number(values.list));
  } else if (values["undo-last"] !== undefined) {
    await undoLast(Number(values["undo-last"]));
  } else {
    console.error("Usage: pnpm run manage:reread -- --list <bookId> | --undo-last <bookId>");
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
