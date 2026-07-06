import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

// Transient — wiped on every startup. Holds decisions made in the current
// session that haven't been committed to Bookshelf yet.
const STATE_FILE = path.join(SCRIPTS_DIR, "rating-review-state.json");

// Persistent — survives across sessions. Holds Bookshelf book IDs whose
// decisions have been committed.
const PROCESSED_FILE = path.join(SCRIPTS_DIR, "rating-review-processed-books.json");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatedBook {
  bookId: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  currentRating: number; // Bookshelf scale: 1–5
}

interface PendingWrite {
  bookId: number;
  title: string;
  oldRating: number; // 1–5
  newRating: number; // 1–5
}

// ─── Criteria ─────────────────────────────────────────────────────────────────

const CRITERIA: [number, string][] = [
  [1, "Actively bad — would warn others away"],
  [2, "Disappointing — not worth the time"],
  [3, "Fine — won't stick with you"],
  [4, "Great — would recommend"],
  [5, "Exceptional — think about it after finishing"],
];

// ─── Persistent processed-books file ─────────────────────────────────────────

function loadProcessed(): Set<number> {
  if (!existsSync(PROCESSED_FILE)) return new Set();
  try {
    const ids = JSON.parse(readFileSync(PROCESSED_FILE, "utf-8")) as number[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveProcessed(ids: Set<number>): void {
  writeFileSync(PROCESSED_FILE, JSON.stringify([...ids], null, 2), "utf-8");
}

// ─── Transient state file ─────────────────────────────────────────────────────

function clearState(): void {
  writeFileSync(STATE_FILE, JSON.stringify([], null, 2), "utf-8");
}

function savePending(pending: PendingWrite[]): void {
  writeFileSync(STATE_FILE, JSON.stringify(pending, null, 2), "utf-8");
}

// ─── Bookshelf reads ──────────────────────────────────────────────────────────

async function readRatedBooks(userId: string): Promise<RatedBook[]> {
  const books = await prisma.book.findMany({
    where: { userId, rating: { not: null } },
    include: { series: true },
    orderBy: { title: "asc" },
  });

  return books.map((b) => ({
    bookId: b.id,
    title: b.title,
    author: b.author,
    seriesName: b.series?.name ?? null,
    seriesIndex: b.seriesIndex,
    currentRating: b.rating!,
  }));
}

// ─── Bookshelf writes ─────────────────────────────────────────────────────────

// Groups by target rating so each distinct value is a single updateMany, all
// applied atomically in one transaction.
async function writeRatings(pending: PendingWrite[]): Promise<void> {
  const writes = pending.filter((p) => p.newRating !== p.oldRating);
  if (writes.length === 0) return;

  const idsByRating = new Map<number, number[]>();
  for (const w of writes) {
    const ids = idsByRating.get(w.newRating) ?? [];
    ids.push(w.bookId);
    idsByRating.set(w.newRating, ids);
  }

  await prisma.$transaction(
    [...idsByRating.entries()].map(([rating, ids]) =>
      prisma.book.updateMany({ where: { id: { in: ids } }, data: { rating } }),
    ),
  );
}

// ─── Display ──────────────────────────────────────────────────────────────────

function starsLabel(rating: number): string {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}★)`;
}

function printCriteria(): void {
  console.log("\n  Rating guide:");
  for (const [n, desc] of CRITERIA) {
    console.log(`    ${n}★  ${desc}`);
  }
}

function printBook(book: RatedBook, index: number, total: number): void {
  const series =
    book.seriesName !== null && book.seriesIndex !== null
      ? ` [${book.seriesName} #${book.seriesIndex}]`
      : "";
  console.log(`\n[${index + 1}/${total}] ${book.title} — ${book.author}${series}`);
  console.log(`  Current: ${starsLabel(book.currentRating)}`);
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

// Resolves with the answer string, or null if the readline interface closed
// before the user responded (SIGINT path).
function ask(rl: Interface, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (val: string | null) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    const onClose = () => settle(null);
    rl.question(prompt, (answer) => {
      rl.removeListener("close", onClose);
      settle(answer);
    });
    rl.once("close", onClose);
  });
}

// ─── Session ──────────────────────────────────────────────────────────────────

async function runSession(books: RatedBook[], processed: Set<number>): Promise<void> {
  const pending: PendingWrite[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let committing = false;

  // Ctrl-C: discard pending decisions and exit.
  rl.on("SIGINT", () => {
    rl.close();
    console.log("\nInterrupted — discarding uncommitted decisions.");
    clearState();
    process.exit(0);
  });

  async function commit(reason: string): Promise<void> {
    if (committing) return;
    committing = true;
    rl.close();

    const changed = pending.filter((p) => p.newRating !== p.oldRating);
    const confirmed = pending.length - changed.length;

    console.log(`\n${reason}`);

    if (pending.length === 0) {
      console.log("No decisions to commit.");
      clearState();
      return;
    }

    console.log(
      `Committing ${pending.length} decision(s): ${changed.length} changed, ${confirmed} confirmed unchanged...`,
    );

    await writeRatings(pending);

    for (const p of pending) processed.add(p.bookId);
    saveProcessed(processed);
    clearState();

    if (changed.length > 0) {
      console.log("\nChanges written:");
      for (const w of changed) {
        console.log(`  ${w.title}: ${starsLabel(w.oldRating)} → ${starsLabel(w.newRating)}`);
      }
    }

    console.log("Done.");
  }

  const toReview = books.filter((b) => !processed.has(b.bookId));

  if (toReview.length === 0) {
    console.log("\nAll rated books have already been processed. Nothing to do.");
    rl.close();
    clearState();
    return;
  }

  console.log(
    `\n${toReview.length} book(s) to review` +
      (processed.size > 0 ? ` (${processed.size} already done)` : "") +
      ".",
  );

  for (let i = 0; i < toReview.length; i++) {
    if (committing) break;

    const book = toReview[i]!;
    printCriteria();
    printBook(book, i, toReview.length);

    let newRating: number | null = null;
    while (newRating === null) {
      const answer = await ask(rl, "  New rating [1-5], Enter to keep, q to stop: ");

      if (answer === null) return; // SIGINT handler is running

      const trimmed = answer.trim().toLowerCase();

      if (trimmed === "q" || trimmed === "quit") {
        await commit("Stopping session.");
        process.exit(0);
      } else if (trimmed === "") {
        newRating = book.currentRating;
      } else {
        const n = parseInt(trimmed, 10);
        if (isNaN(n) || n < 1 || n > 5) {
          console.log("  Invalid — enter a number 1–5, Enter to keep, or q to stop.");
        } else {
          newRating = n;
        }
      }
    }

    pending.push({
      bookId: book.bookId,
      title: book.title,
      oldRating: book.currentRating,
      newRating,
    });
    savePending(pending);

    if (newRating !== book.currentRating) {
      console.log(`  → ${starsLabel(book.currentRating)} → ${starsLabel(newRating)}`);
    } else {
      console.log(`  → Kept ${starsLabel(newRating)}`);
    }
  }

  if (!committing) {
    await commit("All books reviewed.");
    process.exit(0);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "user-email": { type: "string" },
    },
  });

  const userEmail =
    (values["user-email"] as string | undefined) ?? process.env.CALIBRE_SYNC_USER_EMAIL;

  if (!userEmail) {
    console.error(
      "Error: No user specified. Set CALIBRE_SYNC_USER_EMAIL in .env or pass --user-email",
    );
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email: userEmail } });

  if (!user) {
    console.error(`Error: No bookshelf user found with email "${userEmail}"`);
    process.exit(1);
  }

  // Wipe any leftover transient state from a previous session
  clearState();

  const processed = loadProcessed();

  const books = await readRatedBooks(user.id);
  console.log(`Read ${books.length} rated book(s).`);

  await runSession(books, processed);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
