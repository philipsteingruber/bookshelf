import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import { parseArgs } from "node:util";

import Database from "better-sqlite3";
import Docker from "dockerode";

import { DEFAULT_CALIBRE_DB, DEFAULT_CWA_DB } from "./lib/calibre-constants";
import { startContainer } from "./lib/docker";

const CONTAINER_NAME = "calibre-web-automated";
const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

// Transient — wiped on every startup. Holds decisions made in the current
// session that haven't been committed to Calibre yet.
const STATE_FILE = path.join(SCRIPTS_DIR, "rating-review-state.json");

// Persistent — survives across sessions. Holds Calibre IDs of books whose
// decisions have been committed to the DB.
const PROCESSED_FILE = path.join(SCRIPTS_DIR, "rating-review-processed-books.json");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatedBook {
  calibreId: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  currentRating: number | null; // Calibre scale: 2–10, or null if unrated
  tags: string | null;
}

interface PendingWrite {
  calibreId: number;
  title: string;
  oldRating: number | null; // null if book was previously unrated
  newRating: number; // Calibre scale
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

// ─── Calibre reads ────────────────────────────────────────────────────────────

const BOOKS_QUERY = `
  SELECT
    b.id,
    b.title,
    MIN(a.name)                AS author,
    s.name                     AS series_name,
    b.series_index,
    r.rating,
    GROUP_CONCAT(t.name, ', ') AS tags
  FROM books b
  LEFT JOIN books_ratings_link brl ON brl.book = b.id
  LEFT JOIN ratings r              ON r.id = brl.rating
  LEFT JOIN books_authors_link bal ON bal.book = b.id
  LEFT JOIN authors a              ON a.id = bal.author
  LEFT JOIN books_series_link bsl  ON bsl.book = b.id
  LEFT JOIN series s               ON s.id = bsl.series
  LEFT JOIN books_tags_link btl    ON btl.book = b.id
  LEFT JOIN tags t                 ON t.id = btl.tag
  GROUP BY b.id, b.title, s.name, b.series_index, r.rating
  ORDER BY b.title
`;

interface RawBookRow {
  id: number;
  title: string;
  author: string | null;
  series_name: string | null;
  series_index: number | null;
  rating: number | null;
  tags: string | null;
}

function readAllBooks(calibreDbPath: string): RatedBook[] {
  const db = new Database(calibreDbPath, { readonly: true });
  try {
    const rows = db.prepare(BOOKS_QUERY).all() as RawBookRow[];
    return rows.map((r) => ({
      calibreId: r.id,
      title: r.title,
      author: r.author ?? "Unknown",
      seriesName: r.series_name,
      seriesIndex: r.series_index,
      currentRating: r.rating,
      tags: r.tags,
    }));
  } finally {
    db.close();
  }
}

function readReadBookIds(cwaDbPath: string): Set<number> {
  const db = new Database(cwaDbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT book_id FROM book_read_link WHERE read_status = 1")
      .all() as { book_id: number }[];
    return new Set(rows.map((r) => r.book_id));
  } finally {
    db.close();
  }
}

// ─── Calibre writes ───────────────────────────────────────────────────────────

function writeRatings(calibreDbPath: string, pending: PendingWrite[]): void {
  const writes = pending.filter((p) => p.newRating !== p.oldRating);
  if (writes.length === 0) return;

  const db = new Database(calibreDbPath);
  try {
    const getRatingRow = db.prepare<[number], { id: number }>(
      "SELECT id FROM ratings WHERE rating = ? LIMIT 1",
    );
    const insertRatingRow = db.prepare("INSERT INTO ratings (rating) VALUES (?)");
    const insertLink = db.prepare(
      "INSERT INTO books_ratings_link (book, rating) VALUES (?, ?)",
    );
    const updateLink = db.prepare(
      "UPDATE books_ratings_link SET rating = ? WHERE book = ?",
    );

    const applyWrite = db.transaction(
      (calibreId: number, calibreValue: number, wasUnrated: boolean) => {
        const existing = getRatingRow.get(calibreValue);
        const ratingId = existing
          ? existing.id
          : Number(insertRatingRow.run(calibreValue).lastInsertRowid);
        if (wasUnrated) {
          insertLink.run(calibreId, ratingId);
        } else {
          updateLink.run(ratingId, calibreId);
        }
      },
    );

    for (const w of writes) {
      applyWrite(w.calibreId, w.newRating, w.oldRating === null);
    }
  } finally {
    db.close();
  }
}

// ─── Container management ─────────────────────────────────────────────────────

// Does NOT use the shared stopContainer() because that calls process.exit on
// failure, which would skip the finally block and leave the container down.
async function withContainerDown<T>(fn: () => T | Promise<T>): Promise<T> {
  const container = new Docker().getContainer(CONTAINER_NAME);

  try {
    await container.stop();
    console.log(`Stopped ${CONTAINER_NAME}.`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 304) {
      throw new Error(
        `Failed to stop ${CONTAINER_NAME} — cannot safely write to DB.`,
      );
    }
  }

  try {
    return await fn();
  } finally {
    await startContainer();
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

function starsLabel(calibreRating: number | null): string {
  if (calibreRating === null) return "Unrated";
  const n = calibreRating / 2;
  return `${"★".repeat(n)}${"☆".repeat(5 - n)} (${n}★)`;
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
  if (book.tags) console.log(`  Tags: ${book.tags}`);
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

async function runSession(
  calibreDbPath: string,
  books: RatedBook[],
  processed: Set<number>,
): Promise<void> {
  const pending: PendingWrite[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let committing = false;

  // Ctrl-C: discard pending decisions, ensure container is up, exit.
  rl.on("SIGINT", () => {
    rl.close();
    console.log("\nInterrupted — discarding uncommitted decisions.");
    clearState();
    void startContainer()
      .catch(() => {
        console.error(`Could not restart ${CONTAINER_NAME} — restart it manually.`);
      })
      .then(() => process.exit(0));
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

    await withContainerDown(() => {
      writeRatings(calibreDbPath, pending);
    });

    for (const p of pending) processed.add(p.calibreId);
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

  const toReview = books.filter((b) => !processed.has(b.calibreId));

  if (toReview.length === 0) {
    console.log("\nAll books have already been processed. Nothing to do.");
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

    const isUnrated = book.currentRating === null;
    const prompt = isUnrated
      ? "  New rating [1-5], q to stop: "
      : "  New rating [1-5], Enter to keep, q to stop: ";

    let newRating: number | null = null;
    while (newRating === null) {
      const answer = await ask(rl, prompt);

      if (answer === null) return; // SIGINT handler is running

      const trimmed = answer.trim().toLowerCase();

      if (trimmed === "q" || trimmed === "quit") {
        await commit("Stopping session.");
        process.exit(0);
      } else if (trimmed === "" && !isUnrated) {
        newRating = book.currentRating;
      } else if (trimmed === "" && isUnrated) {
        console.log("  This book has no rating — enter a number 1–5, or q to stop.");
      } else {
        const n = parseInt(trimmed, 10);
        if (isNaN(n) || n < 1 || n > 5) {
          const keepHint = isUnrated ? "" : ", Enter to keep";
          console.log(`  Invalid — enter a number 1–5${keepHint}, or q to stop.`);
        } else {
          newRating = n * 2; // Convert 1–5 stars to Calibre's 2–10 scale
        }
      }
    }

    pending.push({
      calibreId: book.calibreId,
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
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
      "cwa-db": { type: "string", default: DEFAULT_CWA_DB },
    },
  });

  const calibreDbPath =
    (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;
  const cwaDbPath = (values["cwa-db"] as string | undefined) ?? DEFAULT_CWA_DB;

  if (!existsSync(calibreDbPath)) {
    console.error(`Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }
  if (!existsSync(cwaDbPath)) {
    console.error(`CWA database not found at "${cwaDbPath}"`);
    process.exit(1);
  }

  // Wipe any leftover transient state from a previous session
  clearState();

  const processed = loadProcessed();

  // One-time read phase — container down only for the duration of the DB reads
  console.log("Stopping container to read Calibre and CWA data...");
  let books: RatedBook[] = [];
  await withContainerDown(() => {
    const allBooks = readAllBooks(calibreDbPath);
    const readIds = readReadBookIds(cwaDbPath);

    // Include books that are rated, or read (in CWA) but unrated
    const included = allBooks.filter(
      (b) => b.currentRating !== null || readIds.has(b.calibreId),
    );

    // Rated books first, then unrated
    const rated = included.filter((b) => b.currentRating !== null);
    const unrated = included.filter((b) => b.currentRating === null);
    books = [...rated, ...unrated];

    console.log(
      `Read ${rated.length} rated book(s) and ${unrated.length} read-but-unrated book(s).`,
    );
  });

  await runSession(calibreDbPath, books, processed);
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await startContainer().catch(() => {
    console.error(`Could not restart ${CONTAINER_NAME} — restart it manually.`);
  });
  process.exit(1);
});
