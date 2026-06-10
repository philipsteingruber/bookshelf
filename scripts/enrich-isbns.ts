import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local", override: false });

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import Database from "better-sqlite3";

import { DEFAULT_CALIBRE_DB, extractErrorMessage } from "./lib/calibre-constants";
import { startContainer, stopContainer } from "./lib/docker";

const OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json";
const GOOGLE_BOOKS_SEARCH = "https://www.googleapis.com/books/v1/volumes";
const OL_DELAY_MS = 500;
const GB_DELAY_MS = 300;
const OL_USER_AGENT =
  "bookshelf-enrich-isbns/1.0 (personal library enrichment script; philip.steingruber@gmail.com)";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibreBook {
  calibreId: number;
  title: string;
  author: string;
}

interface IsbnMatch {
  isbn: string;
  matchTitle: string;
  source: "openlibrary" | "google";
}

type MatchConfidence = "exact" | "fuzzy" | "suspicious" | "none";

interface MatchResult {
  calibreBook: CalibreBook;
  match: IsbnMatch | null;
  confidence: MatchConfidence;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function titlesMatch(calibreTitle: string, matchedTitle: string): boolean {
  const a = titleWords(calibreTitle);
  const b = titleWords(matchedTitle);
  return [...a].some((w) => b.has(w));
}

function isValidIsbn13(s: string): boolean {
  return /^\d{13}$/.test(s) && (s.startsWith("978") || s.startsWith("979"));
}

function isValidIsbn10(s: string): boolean {
  return /^\d{9}[\dX]$/.test(s);
}

// ─── OpenLibrary ──────────────────────────────────────────────────────────────

interface OlDoc {
  key: string;
  title: string;
  author_name?: string[];
  isbn?: string[];
}

async function searchOpenLibrary(title: string, author: string): Promise<IsbnMatch | null> {
  const authorLastName = author.split(/[\s,|]+/).filter(Boolean).at(-1) ?? author;
  const params = new URLSearchParams({
    title,
    author: authorLastName,
    limit: "1",
    fields: "key,title,author_name,isbn",
  });

  const res = await fetch(`${OPENLIBRARY_SEARCH}?${params}`, {
    headers: { "User-Agent": OL_USER_AGENT },
  });

  if (!res.ok) throw new Error(`OpenLibrary HTTP ${res.status}`);

  const data = (await res.json()) as { docs: OlDoc[] };
  const doc = data.docs[0];
  if (!doc?.isbn?.length) return null;

  const isbn13 = doc.isbn.find(isValidIsbn13);
  const isbn10 = doc.isbn.find(isValidIsbn10);
  const isbn = isbn13 ?? isbn10;
  if (!isbn) return null;

  return {
    isbn,
    matchTitle: doc.title,
    source: "openlibrary",
  };
}

// ─── Google Books ─────────────────────────────────────────────────────────────

interface GbItem {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
}

async function searchGoogleBooks(title: string, author: string): Promise<IsbnMatch | null> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) throw new Error("GOOGLE_BOOKS_API_KEY is not set");

  const params = new URLSearchParams({
    q: `intitle:${title} inauthor:${author}`,
    maxResults: "1",
    fields: "items(id,volumeInfo(title,authors,industryIdentifiers))",
    key,
  });

  const res = await fetch(`${GOOGLE_BOOKS_SEARCH}?${params}`);
  if (!res.ok) throw new Error(`Google Books HTTP ${res.status}`);

  const data = (await res.json()) as { items?: GbItem[] };
  const item = data.items?.[0];
  if (!item) return null;

  const ids = item.volumeInfo.industryIdentifiers ?? [];
  const isbn13Raw = ids.find((i) => i.type === "ISBN_13")?.identifier ?? null;
  const isbn10Raw = ids.find((i) => i.type === "ISBN_10")?.identifier ?? null;
  const isbn13 = isbn13Raw && isValidIsbn13(isbn13Raw) ? isbn13Raw : null;
  const isbn10 = isbn10Raw && isValidIsbn10(isbn10Raw) ? isbn10Raw : null;
  const isbn = isbn13 ?? isbn10;
  if (!isbn) return null;

  return {
    isbn,
    matchTitle: item.volumeInfo.title,
    source: "google",
  };
}

// ─── Calibre ──────────────────────────────────────────────────────────────────

function readMissingBooks(calibreDbPath: string): CalibreBook[] {
  const db = new Database(calibreDbPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT b.id, b.title, MIN(a.name) AS author
         FROM books b
         LEFT JOIN books_authors_link bal ON b.id = bal.book
         LEFT JOIN authors a ON bal.author = a.id
         WHERE NOT EXISTS (SELECT 1 FROM identifiers WHERE book = b.id AND type = 'isbn')
         GROUP BY b.id, b.title
         ORDER BY b.title`,
      )
      .all() as Array<{ id: number; title: string; author: string | null }>;

    return rows.map((r) => ({
      calibreId: r.id,
      title: r.title,
      author: r.author ?? "Unknown",
    }));
  } finally {
    db.close();
  }
}

function writeIsbns(calibreDbPath: string, results: MatchResult[]): string[] {
  const db = new Database(calibreDbPath);
  const errors: string[] = [];
  try {
    const upsert = db.prepare(
      `INSERT INTO identifiers (book, type, val)
       VALUES (?, ?, ?)
       ON CONFLICT (book, type) DO UPDATE SET val = excluded.val`,
    );

    for (const { calibreBook, match, confidence } of results) {
      if (!match || confidence === "suspicious") continue;
      try {
        upsert.run(calibreBook.calibreId, "isbn", match.isbn);
      } catch (err) {
        errors.push(`"${calibreBook.title}": ${extractErrorMessage(err)}`);
      }
    }
  } finally {
    db.close();
  }
  return errors;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

async function resolveMatch(book: CalibreBook): Promise<MatchResult> {
  // 1. OpenLibrary (primary)
  try {
    const match = await searchOpenLibrary(book.title, book.author);
    await sleep(OL_DELAY_MS);

    if (match) {
      if (!titlesMatch(book.title, match.matchTitle)) {
        process.stdout.write(`⚠ (OL title mismatch: "${match.matchTitle}")\n`);
        return { calibreBook: book, match, confidence: "suspicious" };
      }
      process.stdout.write(`✓ (OpenLibrary)\n`);
      return { calibreBook: book, match, confidence: "exact" };
    }
  } catch (err) {
    process.stdout.write(`\n  ⚠ OpenLibrary failed: ${extractErrorMessage(err)}\n`);
    await sleep(OL_DELAY_MS);
  }

  // 2. Google Books (fallback)
  if (!process.env.GOOGLE_BOOKS_API_KEY) {
    process.stdout.write("✗ (not found)\n");
    return { calibreBook: book, match: null, confidence: "none" };
  }

  try {
    const match = await searchGoogleBooks(book.title, book.author);
    await sleep(GB_DELAY_MS);

    if (match) {
      if (!titlesMatch(book.title, match.matchTitle)) {
        process.stdout.write(`⚠ (GB title mismatch: "${match.matchTitle}")\n`);
        return { calibreBook: book, match, confidence: "suspicious" };
      }
      process.stdout.write(`✓ (Google Books)\n`);
      return { calibreBook: book, match, confidence: "exact" };
    }
  } catch (err) {
    process.stdout.write(`\n  ⚠ Google Books failed: ${extractErrorMessage(err)}\n`);
    await sleep(GB_DELAY_MS);
  }

  process.stdout.write("✗ (not found)\n");
  return { calibreBook: book, match: null, confidence: "none" };
}

async function resolveAll(books: CalibreBook[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  for (const book of books) {
    process.stdout.write(`  Searching: ${book.title}… `);
    results.push(await resolveMatch(book));
  }
  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function printResults(results: MatchResult[], apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== ISBN Enrichment — ${mode} ===\n`);

  const exact = results.filter((r) => r.confidence === "exact");
  const suspicious = results.filter((r) => r.confidence === "suspicious");
  const notFound = results.filter((r) => r.confidence === "none");

  const writeLabel = apply ? "WRITTEN" : "WOULD WRITE";
  console.log(`${writeLabel} (${exact.length})`);
  for (const { calibreBook, match } of exact) {
    console.log(`  • ${calibreBook.title} — ${calibreBook.author}`);
    console.log(`    → ${match!.isbn} (via ${match!.source})`);
  }

  if (suspicious.length > 0) {
    console.log(`\n✗ SUSPICIOUS MATCHES — SKIPPED (${suspicious.length})`);
    for (const { calibreBook, match } of suspicious) {
      console.log(`  • ${calibreBook.title} — ${calibreBook.author}`);
      console.log(`    API returned: "${match!.matchTitle}" (${match!.source})`);
    }
  }

  if (notFound.length > 0) {
    console.log(`\nNOT FOUND (${notFound.length})`);
    for (const { calibreBook } of notFound) {
      console.log(`  • ${calibreBook.title} — ${calibreBook.author}`);
    }
  }

  const pad = (n: number) => String(n).padStart(3);
  const olCount = exact.filter((r) => r.match?.source === "openlibrary").length;
  const gbCount = exact.filter((r) => r.match?.source === "google").length;

  console.log("\n=== Summary ===");
  console.log(`Via OpenLibrary:    ${pad(olCount)}`);
  console.log(`Via Google Books:   ${pad(gbCount)}`);
  console.log(`Suspicious (skip):  ${pad(suspicious.length)}`);
  console.log(`Not found:          ${pad(notFound.length)}`);

  if (!apply && exact.length > 0) {
    console.log("\nRun with --apply to write to Calibre.");
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      apply: { type: "boolean", default: false },
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
    },
  });

  const apply = values.apply ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;

  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }

  await stopContainer();

  try {
    console.log(`Reading Calibre library from: ${calibreDbPath}`);
    const books = readMissingBooks(calibreDbPath);
    console.log(`Found ${books.length} books missing ISBN\n`);

    if (books.length === 0) {
      console.log("All books already have ISBNs.");
      return;
    }

    console.log("Querying APIs…");
    const results = await resolveAll(books);

    printResults(results, apply);

    if (apply) {
      const errors = writeIsbns(calibreDbPath, results);
      if (errors.length > 0) {
        console.error(`\n=== Errors (${errors.length}) ===`);
        for (const msg of errors) console.error(`  ✗ ${msg}`);
        process.exit(1);
      }
    }
  } finally {
    await startContainer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
