import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local", override: false });

import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";

import { DEFAULT_CALIBRE_DB, extractErrorMessage } from "./lib/calibre-constants";
import { startContainer, stopContainer } from "./lib/docker";
import {
  CANONICAL_TAG_SET,
  CANONICAL_TAGS,
  type CanonicalTag,
  type EnrichStatus,
  deriveEnrichStatus,
  parseCache,
  stripHtml,
  titlesMatch,
} from "./lib/enrich-tags-utils";

const CACHE_FILE = "scripts/enrich-tags-cache.txt";
const PLAN_FILE = "scripts/enrich-tags-plan.json";
const PLAN_STALE_MS = 60 * 60 * 1000;
const OL_SEARCH = "https://openlibrary.org/search.json";
const GB_SEARCH = "https://www.googleapis.com/books/v1/volumes";
const OL_DELAY_MS = 500;
const GB_DELAY_MS = 300;
const OL_USER_AGENT =
  "bookshelf-enrich-tags/1.0 (personal library enrichment script; philip.steingruber@gmail.com)";
const MAX_OL_SUBJECTS = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibreBook {
  calibreId: number;
  title: string;
  author: string;
  isbn: string | null;
  series: string | null;
  description: string | null;
  currentTags: string[];
}

interface EnrichResult {
  book: CalibreBook;
  apiSubjects: string[];
  proposedTags: CanonicalTag[];
  tagsToAdd: string[];
  status: EnrichStatus;
  processingErrors: string[];
}

interface WriteEntry {
  book: { calibreId: number; title: string };
  status: EnrichStatus;
  tagsToAdd: string[];
}

interface WriteStatus {
  errors: string[];
  failedIds: Set<number>;
}

interface PlanEntry {
  calibreId: number;
  title: string;
  author: string;
  currentTags: string[];
  tagsToAdd: string[];
  status: EnrichStatus;
  processingErrors: string[];
}

interface Plan {
  generatedAt: string;
  bookCount: number;
  results: PlanEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Cache ────────────────────────────────────────────────────────────────────

function loadCache(): Set<number> {
  if (!existsSync(CACHE_FILE)) return new Set();
  return parseCache(readFileSync(CACHE_FILE, "utf-8"));
}

function appendToCache(ids: number[]): void {
  if (ids.length === 0) return;
  appendFileSync(CACHE_FILE, ids.join("\n") + "\n", "utf-8");
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

function savePlan(results: EnrichResult[]): void {
  const plan: Plan = {
    generatedAt: new Date().toISOString(),
    bookCount: results.length,
    results: results.map((r) => ({
      calibreId: r.book.calibreId,
      title: r.book.title,
      author: r.book.author,
      currentTags: r.book.currentTags,
      tagsToAdd: r.tagsToAdd,
      status: r.status,
      processingErrors: r.processingErrors,
    })),
  };
  writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2), "utf-8");
}

function loadPlan(): Plan {
  if (!existsSync(PLAN_FILE)) {
    console.error(`Error: No plan file found at "${PLAN_FILE}". Run with --stage first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(PLAN_FILE, "utf-8")) as Plan;
}

// ─── OpenLibrary ──────────────────────────────────────────────────────────────

interface OlDoc {
  title: string;
  subject?: string[];
}

async function fetchOlDoc(params: URLSearchParams): Promise<OlDoc | null> {
  const res = await fetch(`${OL_SEARCH}?${params}`, {
    headers: { "User-Agent": OL_USER_AGENT },
  });
  if (!res.ok) throw new Error(`OpenLibrary HTTP ${res.status}`);
  const data = (await res.json()) as { docs: OlDoc[] };
  return data.docs[0] ?? null;
}

async function fetchOlSubjects(book: CalibreBook, errors: string[]): Promise<string[]> {
  const isbn = book.isbn?.trim();

  if (isbn) {
    try {
      const doc = await fetchOlDoc(
        new URLSearchParams({ isbn, limit: "1", fields: "title,subject" }),
      );
      await sleep(OL_DELAY_MS);
      if (doc?.subject?.length) return doc.subject.slice(0, MAX_OL_SUBJECTS);
    } catch (err) {
      errors.push(`OpenLibrary (ISBN): ${extractErrorMessage(err)}`);
      await sleep(OL_DELAY_MS);
    }
  }

  try {
    const params: Record<string, string> = {
      title: book.title,
      limit: "1",
      fields: "title,subject",
    };
    if (book.author !== "Unknown") {
      const lastName = book.author.split(/[\s,|]+/).filter(Boolean).at(-1);
      if (lastName) params.author = lastName;
    }
    const doc = await fetchOlDoc(new URLSearchParams(params));
    await sleep(OL_DELAY_MS);
    if (doc?.subject?.length && titlesMatch(book.title, doc.title)) {
      return doc.subject.slice(0, MAX_OL_SUBJECTS);
    }
  } catch (err) {
    errors.push(`OpenLibrary (title+author): ${extractErrorMessage(err)}`);
    await sleep(OL_DELAY_MS);
  }

  return [];
}

// ─── Google Books ─────────────────────────────────────────────────────────────

async function fetchGbSubjects(book: CalibreBook, errors: string[]): Promise<string[]> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return [];

  const isbn = book.isbn?.trim();
  const query = isbn ? `isbn:${isbn}` : `intitle:${book.title} inauthor:${book.author}`;
  const params = new URLSearchParams({
    q: query,
    maxResults: "1",
    fields: "items(volumeInfo(title,categories))",
    key,
  });

  try {
    const res = await fetch(`${GB_SEARCH}?${params}`);
    await sleep(GB_DELAY_MS);
    if (!res.ok) throw new Error(`Google Books HTTP ${res.status}`);

    const data = (await res.json()) as {
      items?: Array<{ volumeInfo: { title: string; categories?: string[] } }>;
    };
    const item = data.items?.[0];
    if (!item?.volumeInfo.categories?.length) return [];
    if (!titlesMatch(book.title, item.volumeInfo.title)) return [];
    return item.volumeInfo.categories;
  } catch (err) {
    errors.push(`Google Books: ${extractErrorMessage(err)}`);
    await sleep(GB_DELAY_MS);
    return [];
  }
}

// ─── Claude ───────────────────────────────────────────────────────────────────

async function classifyWithClaude(
  book: CalibreBook,
  apiSubjects: string[],
  errors: string[],
): Promise<CanonicalTag[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const client = new Anthropic({ apiKey });

  const parts: string[] = [`Title: ${book.title}`, `Author: ${book.author}`];
  if (book.series) parts.push(`Series: ${book.series}`);
  if (apiSubjects.length > 0) parts.push(`Catalog subjects: ${apiSubjects.join(", ")}`);
  if (book.currentTags.length > 0) parts.push(`Current genre tags: ${book.currentTags.join(", ")}`);
  if (book.description) {
    const plain = stripHtml(book.description).slice(0, 500);
    if (plain) parts.push(`Description: ${plain}`);
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      tools: [
        {
          name: "assign_tags",
          description:
            "Assign ALL applicable genre tags to a book from the allowed list. " +
            "Return an empty array if you cannot confidently categorize the book.",
          input_schema: {
            type: "object" as const,
            properties: {
              tags: {
                type: "array" as const,
                items: { type: "string" as const, enum: [...CANONICAL_TAGS] },
                description: "All applicable genre tags from the allowed list.",
              },
            },
            required: ["tags"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "assign_tags" },
      messages: [
        {
          role: "user",
          content: "Assign all applicable genre tags to this book:\n\n" + parts.join("\n"),
        },
      ],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "assign_tags") {
        const input = block.input as { tags: string[] };
        return input.tags.filter((t): t is CanonicalTag => CANONICAL_TAG_SET.has(t));
      }
    }
  } catch (err) {
    errors.push(`Claude: ${extractErrorMessage(err)}`);
  }

  return [];
}

// ─── Calibre ──────────────────────────────────────────────────────────────────

function readAllBooks(calibreDbPath: string): CalibreBook[] {
  const db = new Database(calibreDbPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT
           b.id,
           b.title,
           COALESCE(MIN(a.name), 'Unknown') AS author,
           (SELECT val FROM identifiers WHERE book = b.id AND type = 'isbn' LIMIT 1) AS isbn,
           (SELECT s.name FROM series s JOIN books_series_link bsl ON s.id = bsl.series WHERE bsl.book = b.id LIMIT 1) AS series,
           (SELECT text FROM comments WHERE book = b.id LIMIT 1) AS description
         FROM books b
         LEFT JOIN books_authors_link bal ON b.id = bal.book
         LEFT JOIN authors a ON bal.author = a.id
         GROUP BY b.id, b.title
         ORDER BY b.title`,
      )
      .all() as Array<{
        id: number;
        title: string;
        author: string;
        isbn: string | null;
        series: string | null;
        description: string | null;
      }>;

    const tagLinks = db
      .prepare(
        `SELECT btl.book, t.name
         FROM books_tags_link btl
         JOIN tags t ON btl.tag = t.id`,
      )
      .all() as Array<{ book: number; name: string }>;

    const tagsByBook = new Map<number, string[]>();
    for (const { book, name } of tagLinks) {
      const arr = tagsByBook.get(book) ?? [];
      arr.push(name);
      tagsByBook.set(book, arr);
    }

    return rows.map((r) => ({
      calibreId: r.id,
      title: r.title,
      author: r.author,
      isbn: r.isbn,
      series: r.series,
      description: r.description,
      currentTags: tagsByBook.get(r.id) ?? [],
    }));
  } finally {
    db.close();
  }
}

function writeTags(calibreDbPath: string, entries: WriteEntry[]): WriteStatus {
  const applicable = entries.filter((e) => e.status === "add" || e.status === "uncategorized");
  if (applicable.length === 0) return { errors: [], failedIds: new Set() };

  const db = new Database(calibreDbPath);
  const errors: string[] = [];
  const failedIds = new Set<number>();

  try {
    const findTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const insertTag = db.prepare(`INSERT INTO tags (name, link) VALUES (?, '')`);
    const checkLink = db.prepare(
      `SELECT COUNT(*) AS count FROM books_tags_link WHERE book = ? AND tag = ?`,
    );
    const insertLink = db.prepare(`INSERT INTO books_tags_link (book, tag) VALUES (?, ?)`);

    for (const entry of applicable) {
      const tagsToWrite = entry.status === "uncategorized" ? ["Uncategorized"] : entry.tagsToAdd;

      try {
        const tx = db.transaction(() => {
          for (const tagName of tagsToWrite) {
            const existing = findTag.get(tagName) as { id: number } | undefined;
            let tagId: number;
            if (existing) {
              tagId = existing.id;
            } else {
              tagId = Number(insertTag.run(tagName).lastInsertRowid);
            }
            const link = checkLink.get(entry.book.calibreId, tagId) as { count: number };
            if (link.count === 0) {
              insertLink.run(entry.book.calibreId, tagId);
            }
          }
        });
        tx();
      } catch (err) {
        errors.push(`"${entry.book.title}": ${extractErrorMessage(err)}`);
        failedIds.add(entry.book.calibreId);
      }
    }
  } finally {
    db.close();
  }

  return { errors, failedIds };
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

async function enrichBook(book: CalibreBook): Promise<EnrichResult> {
  const processingErrors: string[] = [];

  const olSubjects = await fetchOlSubjects(book, processingErrors);
  const apiSubjects =
    olSubjects.length > 0 ? olSubjects : await fetchGbSubjects(book, processingErrors);

  const proposedTags = await classifyWithClaude(book, apiSubjects, processingErrors);

  const { status, tagsToAdd } = deriveEnrichStatus(proposedTags, book.currentTags);

  return { book, apiSubjects, proposedTags, tagsToAdd, status, processingErrors };
}

// ─── Output ───────────────────────────────────────────────────────────────────

type RunMode = "dry-run" | "staging" | "applying";

function printResults(results: EnrichResult[], mode: RunMode): void {
  const modeLabel = mode === "applying" ? "APPLYING" : mode === "staging" ? "STAGING" : "DRY RUN";
  console.log(`\n=== Tag Enrichment — ${modeLabel} ===\n`);

  const toAdd = results.filter((r) => r.status === "add");
  const toUncategorize = results.filter((r) => r.status === "uncategorized");
  const complete = results.filter((r) => r.status === "complete");
  const noResults = results.filter((r) => r.status === "no-results");
  const failed = results.filter((r) => r.status === "error");
  const withApiErrors = results.filter((r) => r.processingErrors.length > 0);

  const applying = mode === "applying";

  if (toAdd.length > 0) {
    console.log(`${applying ? "ADDED" : "WOULD ADD"} TAGS (${toAdd.length})`);
    for (const { book, tagsToAdd } of toAdd) {
      console.log(`  • ${book.title} — ${book.author}`);
      console.log(`    Before:  ${book.currentTags.length > 0 ? book.currentTags.join(", ") : "(none)"}`);
      console.log(`    +Adding: ${tagsToAdd.join(", ")}`);
    }
    console.log();
  }

  if (toUncategorize.length > 0) {
    console.log(`${applying ? "MARKED" : "WOULD MARK"} UNCATEGORIZED (${toUncategorize.length})`);
    for (const { book } of toUncategorize) {
      console.log(`  • ${book.title} — ${book.author}`);
      console.log(`    Before:  (none)`);
      console.log(`    +Adding: Uncategorized`);
    }
    console.log();
  }

  if (complete.length > 0) {
    console.log(`ALREADY COMPLETE (${complete.length})`);
    for (const { book } of complete) {
      console.log(`  • ${book.title} — ${book.author}`);
      console.log(`    Tags: ${book.currentTags.join(", ")}`);
    }
    console.log();
  }

  if (noResults.length > 0) {
    console.log(`NO RESULTS FOUND (${noResults.length})`);
    for (const { book } of noResults) {
      console.log(`  • ${book.title} — ${book.author}`);
      console.log(`    Tags: ${book.currentTags.length > 0 ? book.currentTags.join(", ") : "(none)"}`);
    }
    console.log();
  }

  if (withApiErrors.length > 0) {
    console.log(`API / CLASSIFICATION ERRORS (${withApiErrors.length})`);
    for (const { book, processingErrors } of withApiErrors) {
      console.log(`  • ${book.title} — ${book.author}`);
      for (const e of processingErrors) console.log(`    ⚠ ${e}`);
    }
    console.log();
  }

  if (failed.length > 0) {
    console.log(`FAILED (${failed.length})`);
    for (const { book, processingErrors } of failed) {
      console.log(`  • ${book.title} — ${book.author}`);
      for (const e of processingErrors) console.log(`    ${e}`);
    }
    console.log();
  }

  const pad = (n: number) => String(n).padStart(3);
  const changes = toAdd.length + toUncategorize.length;
  console.log("=== Summary ===");
  console.log(`Books processed:      ${pad(results.length)}`);
  console.log(
    `${applying ? "Tags added:           " : "Would add tags:       "}${pad(toAdd.length)}`,
  );
  console.log(
    `${applying ? "Uncategorized:        " : "Would uncategorize:   "}${pad(toUncategorize.length)}`,
  );
  console.log(`Already complete:     ${pad(complete.length)}`);
  console.log(`No results found:     ${pad(noResults.length)}`);
  if (withApiErrors.length > 0) console.log(`With API errors:      ${pad(withApiErrors.length)}`);
  if (failed.length > 0) console.log(`Failed:               ${pad(failed.length)}`);

  if (mode === "dry-run" && changes > 0) {
    console.log(
      "\nRun with --stage to save a plan, then --apply-plan to apply without re-querying.",
    );
    console.log("Or run with --apply to query and apply in one step.");
  }
  if (mode === "staging") {
    console.log(`\nPlan saved to ${PLAN_FILE}. Run with --apply-plan to apply.`);
  }

  console.log(`\nMAINTENANCE_RESULT: changes=${changes}`);
}

// ─── Apply from plan ──────────────────────────────────────────────────────────

async function applyFromPlan(calibreDbPath: string, force: boolean): Promise<void> {
  const plan = loadPlan();

  const ageMs = Date.now() - new Date(plan.generatedAt).getTime();
  if (ageMs > PLAN_STALE_MS && !force) {
    const ageMinutes = Math.round(ageMs / 60_000);
    console.error(
      `Error: Plan is ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} old (limit: 60 minutes).`,
    );
    console.error("Re-run --stage to generate a fresh plan, or add --force to apply anyway.");
    process.exit(1);
  }

  console.log(`Plan generated: ${plan.generatedAt}`);
  console.log(`Books in plan:  ${plan.bookCount}\n`);

  const toAdd = plan.results.filter((e) => e.status === "add");
  const toUncategorize = plan.results.filter((e) => e.status === "uncategorized");

  if (toAdd.length === 0 && toUncategorize.length === 0) {
    console.log("Plan has no actionable changes — nothing to write.");
    const toCache = plan.results
      .filter((e) => e.status !== "error")
      .map((e) => e.calibreId);
    appendToCache(toCache);
    unlinkSync(PLAN_FILE);
    console.log("Cache updated and plan removed.");
    return;
  }

  if (toAdd.length > 0) {
    console.log(`ADDING TAGS (${toAdd.length})`);
    for (const entry of toAdd) {
      console.log(`  • ${entry.title} — ${entry.author}`);
      console.log(`    Before:  ${entry.currentTags.length > 0 ? entry.currentTags.join(", ") : "(none)"}`);
      console.log(`    +Adding: ${entry.tagsToAdd.join(", ")}`);
    }
    console.log();
  }

  if (toUncategorize.length > 0) {
    console.log(`MARKING UNCATEGORIZED (${toUncategorize.length})`);
    for (const entry of toUncategorize) {
      console.log(`  • ${entry.title} — ${entry.author}`);
      console.log(`    Before:  (none)`);
      console.log(`    +Adding: Uncategorized`);
    }
    console.log();
  }

  await stopContainer();

  try {
    const writeEntries: WriteEntry[] = plan.results.map((e) => ({
      book: { calibreId: e.calibreId, title: e.title },
      status: e.status,
      tagsToAdd: e.tagsToAdd,
    }));

    const { errors: writeErrors, failedIds } = writeTags(calibreDbPath, writeEntries);

    const toCache = plan.results
      .filter((e) => e.status !== "error" && !failedIds.has(e.calibreId))
      .map((e) => e.calibreId);
    appendToCache(toCache);
    if (toCache.length > 0) {
      console.log(`Cached ${toCache.length} processed book${toCache.length === 1 ? "" : "s"}.`);
    }

    unlinkSync(PLAN_FILE);
    console.log("Plan applied and removed.");

    if (writeErrors.length > 0) {
      console.error(`\n=== Write Errors (${writeErrors.length}) ===`);
      for (const msg of writeErrors) console.error(`  ✗ ${msg}`);
      process.exit(1);
    }
  } finally {
    await startContainer();
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      help: { type: "boolean", default: false, short: "h" },
      apply: { type: "boolean", default: false },
      stage: { type: "boolean", default: false },
      "apply-plan": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
    },
  });

  if (values.help) {
    console.log(`
Usage: pnpm enrich:tags [-- <flags>]

Enriches books in Calibre with canonical genre tags using OpenLibrary,
Google Books, and Claude AI. Canonical tags: ${CANONICAL_TAGS.join(", ")}.

MODES (mutually exclusive)
  (none)         Dry run — queries APIs and Claude, prints what would change.
                 Nothing is written. Does not update the cache.
  --stage        Same as dry run, but also saves a plan file (${PLAN_FILE})
                 so results can be applied later without re-querying.
  --apply-plan   Reads the saved plan file and applies it to Calibre.
                 No API or Claude calls are made. Deletes the plan on success.
                 Exits with an error if the plan is older than 60 minutes.
  --apply        Queries APIs and Claude, then immediately applies results.
                 Equivalent to --stage followed by --apply-plan in one step.

FLAGS
  --force        With dry run / --stage / --apply: bypass the processed-book
                 cache and reprocess all books.
                 With --apply-plan: bypass the 60-minute staleness check.
  --calibre-db   Override the Calibre database path.
                 Default: ${DEFAULT_CALIBRE_DB}
  -h, --help     Print this help text and exit.

TYPICAL WORKFLOW
  pnpm enrich:tags                    Preview what would change
  pnpm enrich:tags -- --stage         Save a plan for review
  pnpm enrich:tags -- --apply-plan    Apply the saved plan
  pnpm enrich:tags -- --apply         Query and apply in one step

ENVIRONMENT VARIABLES
  ANTHROPIC_API_KEY      Required for AI classification (Claude Haiku).
  GOOGLE_BOOKS_API_KEY   Optional. Enables Google Books as an OL fallback.
`);
    process.exit(0);
  }

  const apply = values.apply ?? false;
  const stage = values.stage ?? false;
  const applyPlan = values["apply-plan"] ?? false;
  const force = values.force ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;

  if ([apply, stage, applyPlan].filter(Boolean).length > 1) {
    console.error("Error: --apply, --stage, and --apply-plan are mutually exclusive.");
    process.exit(1);
  }

  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }

  if (applyPlan) {
    await applyFromPlan(calibreDbPath, force);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY not set — AI classification will be skipped.");
  }
  if (!process.env.GOOGLE_BOOKS_API_KEY) {
    console.warn("Warning: GOOGLE_BOOKS_API_KEY not set — Google Books fallback disabled.");
  }

  const cache = loadCache();

  await stopContainer();

  try {
    console.log(`Reading Calibre library from: ${calibreDbPath}`);
    const allBooks = readAllBooks(calibreDbPath);
    console.log(`Found ${allBooks.length} book${allBooks.length === 1 ? "" : "s"} total`);

    const books = force ? allBooks : allBooks.filter((b) => !cache.has(b.calibreId));
    const skippedCount = allBooks.length - books.length;

    if (books.length === 0) {
      console.log("All books have already been processed. Use --force to reprocess.");
      console.log("\nMAINTENANCE_RESULT: changes=0");
      return;
    }

    if (skippedCount > 0) {
      console.log(
        `Skipping ${skippedCount} already-processed book${skippedCount === 1 ? "" : "s"}`,
      );
    }
    console.log(`Processing ${books.length} book${books.length === 1 ? "" : "s"}…\n`);

    const results: EnrichResult[] = [];

    for (const book of books) {
      process.stdout.write(`  ${book.title}… `);
      try {
        const result = await enrichBook(book);
        const errSuffix =
          result.processingErrors.length > 0
            ? ` [${result.processingErrors.length} API error${result.processingErrors.length === 1 ? "" : "s"}]`
            : "";
        const statusLabel: Record<EnrichStatus, string> = {
          add: `+${result.tagsToAdd.length} tag${result.tagsToAdd.length === 1 ? "" : "s"}`,
          uncategorized: "→ Uncategorized",
          complete: "complete",
          "no-results": "no results",
          error: "ERROR",
        };
        process.stdout.write(`${statusLabel[result.status]}${errSuffix}\n`);
        results.push(result);
      } catch (err) {
        process.stdout.write("ERROR\n");
        results.push({
          book,
          apiSubjects: [],
          proposedTags: [],
          tagsToAdd: [],
          status: "error",
          processingErrors: [extractErrorMessage(err)],
        });
      }
    }

    const mode: RunMode = apply ? "applying" : stage ? "staging" : "dry-run";
    printResults(results, mode);

    if (stage) {
      savePlan(results);
    }

    if (apply) {
      const writeEntries: WriteEntry[] = results.map((r) => ({
        book: { calibreId: r.book.calibreId, title: r.book.title },
        status: r.status,
        tagsToAdd: r.tagsToAdd,
      }));

      const { errors: writeErrors, failedIds } = writeTags(calibreDbPath, writeEntries);

      const toCache = results
        .filter((r) => r.status !== "error" && !failedIds.has(r.book.calibreId))
        .map((r) => r.book.calibreId);
      appendToCache(toCache);
      if (toCache.length > 0) {
        console.log(
          `Cached ${toCache.length} processed book${toCache.length === 1 ? "" : "s"}.`,
        );
      }

      if (writeErrors.length > 0) {
        console.error(`\n=== Write Errors (${writeErrors.length}) ===`);
        for (const msg of writeErrors) console.error(`  ✗ ${msg}`);
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
