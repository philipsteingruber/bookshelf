# Calibre Goodreads URL Enrichment Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local TypeScript script that reads Goodreads identifiers from a Calibre library and backfills the `goodreadsUrl` field on matching bookshelf books, with a mandatory dry-run mode and an explicit `--apply` flag to write changes.

**Architecture:** A single-pass script with four modules: a pure normalizer (title/author/key), a Calibre SQLite reader, a matching engine that categories each Calibre book into one of four buckets, and a main entry point that handles CLI args, output, and optional DB writes. All writes go directly to Prisma Postgres — no tRPC layer.

**Tech Stack:** TypeScript, tsx (already installed), better-sqlite3 (new), Prisma client (existing), Node.js `node:util` parseArgs, Vitest

---

## File Map

| File                              | Role                                                                     |
| --------------------------------- | ------------------------------------------------------------------------ |
| `scripts/lib/normalizer.ts`       | Pure functions: `normalizeTitle`, `normalizeAuthor`, `buildCompositeKey` |
| `scripts/lib/normalizer.test.ts`  | Unit tests for normalizer functions                                      |
| `scripts/lib/calibre-reader.ts`   | Opens Calibre SQLite DB, returns typed `CalibreBook[]`                   |
| `scripts/enrich-goodreads-url.ts` | Entry point: CLI args, load data, match, print, apply                    |

---

## Task 1: Install Dependencies

**Files:**

- Modify: `package.json`

- [ ] **Install better-sqlite3**

```bash
pnpm add -D better-sqlite3 @types/better-sqlite3
```

Expected output ends with: `devDependencies` listing both packages.

- [ ] **Add npm script to package.json**

In the `"scripts"` section of `package.json`, add:

```json
"enrich:goodreads-url": "tsx scripts/enrich-goodreads-url.ts"
```

- [ ] **Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add better-sqlite3 for Calibre DB reads"
```

---

## Task 2: Normalizer Module (TDD)

**Files:**

- Create: `scripts/lib/normalizer.ts`
- Create: `scripts/lib/normalizer.test.ts`

- [ ] **Create the test file with failing tests**

```typescript
// scripts/lib/normalizer.test.ts
import { describe, expect, it } from "vitest";

import { buildCompositeKey, normalizeAuthor, normalizeTitle } from "./normalizer";

describe("normalizeTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTitle("  Blood Pact  ")).toBe("blood pact");
  });

  it("strips leading 'The '", () => {
    expect(normalizeTitle("The Name of the Wind")).toBe("name of the wind");
  });

  it("strips leading 'A '", () => {
    expect(normalizeTitle("A Memory Called Empire")).toBe("memory called empire");
  });

  it("strips leading 'An '", () => {
    expect(normalizeTitle("An Absolutely Remarkable Thing")).toBe("absolutely remarkable thing");
  });

  it("strips articles case-insensitively", () => {
    expect(normalizeTitle("THE Lord of the Rings")).toBe("lord of the rings");
    expect(normalizeTitle("the Dark Knight")).toBe("dark knight");
  });

  it("does not strip articles that appear mid-title", () => {
    expect(normalizeTitle("All the Light We Cannot See")).toBe("all the light we cannot see");
  });

  it("does not affect titles starting with a number", () => {
    expect(normalizeTitle("1984")).toBe("1984");
    expect(normalizeTitle("13th Legion")).toBe("13th legion");
  });

  it("does not strip 'the' when it is part of a word at the start", () => {
    expect(normalizeTitle("Theorem")).toBe("theorem");
  });
});

describe("normalizeAuthor", () => {
  it("lowercases and trims", () => {
    expect(normalizeAuthor("  Dan Abnett  ")).toBe("dan abnett");
  });

  it("preserves punctuation", () => {
    expect(normalizeAuthor("J.R.R. Tolkien")).toBe("j.r.r. tolkien");
  });
});

describe("buildCompositeKey", () => {
  it("builds key without series", () => {
    expect(buildCompositeKey("Blood Pact", "Dan Abnett", null, null)).toBe("blood pact|dan abnett");
  });

  it("builds key with series", () => {
    expect(buildCompositeKey("Blood Pact", "Dan Abnett", "Gaunt's Ghosts", 12)).toBe(
      "blood pact|dan abnett|gaunt's ghosts|12",
    );
  });

  it("strips leading article from title but not from series name", () => {
    expect(buildCompositeKey("A Thousand Sons", "Graham McNeill", "The Horus Heresy", 12)).toBe(
      "thousand sons|graham mcneill|the horus heresy|12",
    );
  });

  it("falls back to title+author key when series name is null", () => {
    expect(buildCompositeKey("Circe", "Madeline Miller", null, 1)).toBe("circe|madeline miller");
  });

  it("falls back to title+author key when series index is null", () => {
    expect(buildCompositeKey("Circe", "Madeline Miller", "Some Series", null)).toBe("circe|madeline miller");
  });
});
```

- [ ] **Run tests to verify they fail**

```bash
pnpm test -- scripts/lib/normalizer.test.ts
```

Expected: all tests fail with `Cannot find module './normalizer'`.

- [ ] **Create the normalizer implementation**

```typescript
// scripts/lib/normalizer.ts

const LEADING_ARTICLES = /^(the|a|an)\s+/i;

export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(LEADING_ARTICLES, "");
}

export function normalizeAuthor(author: string): string {
  return author.toLowerCase().trim();
}

export function buildCompositeKey(
  title: string,
  author: string,
  seriesName: string | null,
  seriesIndex: number | null,
): string {
  const base = `${normalizeTitle(title)}|${normalizeAuthor(author)}`;
  if (seriesName !== null && seriesIndex !== null) {
    return `${base}|${seriesName.toLowerCase().trim()}|${seriesIndex}`;
  }
  return base;
}
```

- [ ] **Run tests to verify they pass**

```bash
pnpm test -- scripts/lib/normalizer.test.ts
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add scripts/lib/normalizer.ts scripts/lib/normalizer.test.ts
git commit -m "feat(scripts): add normalizer module for Calibre enrichment"
```

---

## Task 3: Calibre Reader Module

**Files:**

- Create: `scripts/lib/calibre-reader.ts`

- [ ] **Create the Calibre reader**

```typescript
// scripts/lib/calibre-reader.ts

import Database from "better-sqlite3";

export interface CalibreBook {
  id: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  goodreadsId: string | null;
}

const QUERY = `
  SELECT
    b.id,
    b.title,
    a.name        AS author,
    s.name        AS series_name,
    b.series_index AS series_index,
    i.val         AS goodreads_id
  FROM books b
  LEFT JOIN books_authors_link bal ON b.id = bal.book
  LEFT JOIN authors a              ON bal.author = a.id
  LEFT JOIN books_series_link bsl  ON b.id = bsl.book
  LEFT JOIN series s               ON bsl.series = s.id
  LEFT JOIN identifiers i          ON b.id = i.book AND i.type = 'goodreads'
  ORDER BY b.title
`;

interface RawRow {
  id: number;
  title: string;
  author: string | null;
  series_name: string | null;
  series_index: number | null;
  goodreads_id: string | null;
}

export function readCalibreBooks(dbPath: string): CalibreBook[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(QUERY).all() as RawRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author ?? "Unknown",
      seriesName: row.series_name,
      seriesIndex: row.series_index,
      goodreadsId: row.goodreads_id,
    }));
  } finally {
    db.close();
  }
}
```

- [ ] **Commit**

```bash
git add scripts/lib/calibre-reader.ts
git commit -m "feat(scripts): add Calibre SQLite reader for enrichment script"
```

---

## Task 4: Main Enrichment Script

**Files:**

- Create: `scripts/enrich-goodreads-url.ts`

- [ ] **Create the main script**

```typescript
// scripts/enrich-goodreads-url.ts

import "dotenv/config";

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

import { readCalibreBooks, type CalibreBook } from "./lib/calibre-reader";
import { buildCompositeKey } from "./lib/normalizer";

const DEFAULT_CALIBRE_DB = "E:\\Calibre Library\\metadata.db";

const GOODREADS_BASE_URL = "https://www.goodreads.com/book/show";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  seriesIndex: number | null;
  goodreadsUrl: string | null;
  series: { name: string } | null;
}

interface MatchResult {
  calibreBook: CalibreBook;
  bookshelfId: number;
}

interface Results {
  toUpdate: MatchResult[];
  alreadyEnriched: MatchResult[];
  notInBookshelf: CalibreBook[];
  noGoodreadsId: CalibreBook[];
  ambiguous: CalibreBook[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGoodreadsUrl(goodreadsId: string): string {
  return `${GOODREADS_BASE_URL}/${goodreadsId}`;
}

function formatBook(book: CalibreBook): string {
  const series =
    book.seriesName !== null && book.seriesIndex !== null ? ` [${book.seriesName} #${book.seriesIndex}]` : "";
  return `${book.title} — ${book.author}${series}`;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function match(calibreBooks: CalibreBook[], bookshelfBooks: BookshelfBook[]): Results {
  const bookshelfByKey = new Map<string, BookshelfBook[]>();

  for (const book of bookshelfBooks) {
    const key = buildCompositeKey(
      book.title,
      book.author,
      book.series?.name ?? null,
      book.series !== null ? book.seriesIndex : null,
    );
    const existing = bookshelfByKey.get(key) ?? [];
    existing.push(book);
    bookshelfByKey.set(key, existing);
  }

  const results: Results = {
    toUpdate: [],
    alreadyEnriched: [],
    notInBookshelf: [],
    noGoodreadsId: [],
    ambiguous: [],
  };

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.goodreadsId) {
      results.noGoodreadsId.push(calibreBook);
      continue;
    }

    const key = buildCompositeKey(
      calibreBook.title,
      calibreBook.author,
      calibreBook.seriesName,
      calibreBook.seriesIndex,
    );

    const matches = bookshelfByKey.get(key) ?? [];

    if (matches.length === 0) {
      results.notInBookshelf.push(calibreBook);
    } else if (matches.length > 1) {
      results.ambiguous.push(calibreBook);
    } else {
      const bookshelfBook = matches[0];
      if (bookshelfBook.goodreadsUrl) {
        results.alreadyEnriched.push({ calibreBook, bookshelfId: bookshelfBook.id });
      } else {
        results.toUpdate.push({ calibreBook, bookshelfId: bookshelfBook.id });
      }
    }
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function printResults(results: Results, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Goodreads URL Enrichment — ${mode} ===\n`);

  const updateLabel = apply ? "UPDATED" : "WOULD UPDATE";
  console.log(`${updateLabel} (${results.toUpdate.length})`);
  for (const { calibreBook } of results.toUpdate) {
    console.log(`  • ${formatBook(calibreBook)}`);
    console.log(`    → ${buildGoodreadsUrl(calibreBook.goodreadsId!)}`);
  }

  console.log(`\nALREADY ENRICHED — SKIP (${results.alreadyEnriched.length})`);
  for (const { calibreBook } of results.alreadyEnriched) {
    console.log(`  • ${formatBook(calibreBook)}`);
  }

  console.log(`\nNOT FOUND IN BOOKSHELF (${results.notInBookshelf.length})`);
  for (const book of results.notInBookshelf) {
    console.log(`  • ${formatBook(book)}`);
  }

  console.log(`\nNO GOODREADS ID IN CALIBRE (${results.noGoodreadsId.length})`);
  for (const book of results.noGoodreadsId) {
    console.log(`  • ${book.title} — ${book.author}`);
  }

  if (results.ambiguous.length > 0) {
    console.log(`\nAMBIGUOUS MATCHES — SKIPPED (${results.ambiguous.length})`);
    for (const book of results.ambiguous) {
      console.log(`  ⚠ ${formatBook(book)} — multiple bookshelf books matched, skipped both`);
    }
  }

  console.log("\n=== Summary ===");
  const updateSummaryLabel = apply ? "Updated:        " : "Would update:   ";
  console.log(`${updateSummaryLabel}  ${String(results.toUpdate.length).padStart(3)}`);
  console.log(`Already enriched:   ${String(results.alreadyEnriched.length).padStart(3)}`);
  console.log(`Not in bookshelf:   ${String(results.notInBookshelf.length).padStart(3)}`);
  console.log(`No Goodreads ID:    ${String(results.noGoodreadsId.length).padStart(3)}`);
  if (results.ambiguous.length > 0) {
    console.log(`Ambiguous matches:  ${String(results.ambiguous.length).padStart(3)}`);
  }

  if (!apply && results.toUpdate.length > 0) {
    console.log("\nRun with --apply to write changes.");
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function applyUpdates(results: Results): Promise<number> {
  let failures = 0;
  for (const { calibreBook, bookshelfId } of results.toUpdate) {
    try {
      await prisma.book.update({
        where: { id: bookshelfId },
        data: { goodreadsUrl: buildGoodreadsUrl(calibreBook.goodreadsId!) },
      });
    } catch (error) {
      console.error(`  ✗ Failed to update "${calibreBook.title}":`, error);
      failures++;
    }
  }
  return failures;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
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

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log(`Reading Calibre library from: ${calibreDbPath}`);
  const calibreBooks = readCalibreBooks(calibreDbPath);
  console.log(`Loaded ${calibreBooks.length} books from Calibre`);

  const bookshelfBooks = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      author: true,
      seriesIndex: true,
      goodreadsUrl: true,
      series: { select: { name: true } },
    },
  });
  console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

  const results = match(calibreBooks, bookshelfBooks);

  printResults(results, apply);

  if (apply && results.toUpdate.length > 0) {
    const failures = await applyUpdates(results);
    if (failures > 0) {
      console.error(`\n${failures} update(s) failed. See errors above.`);
      process.exit(1);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Run a dry-run to verify the script works**

First ensure the CWA container is stopped, then:

```bash
pnpm enrich:goodreads-url
```

Expected: output shows all four sections (WOULD UPDATE, ALREADY ENRICHED, NOT FOUND IN BOOKSHELF, NO GOODREADS ID) with counts, followed by summary and "Run with --apply to write changes."

- [ ] **Review the "NOT FOUND IN BOOKSHELF" and "NO GOODREADS ID" sections**

Read the output carefully. The "NOT FOUND IN BOOKSHELF" list reveals books in Calibre that may have a slightly different title or author spelling vs. the bookshelf. If you see matches that should have been found, the normalization may need adjusting before running `--apply`.

- [ ] **Run with --apply once the dry-run output looks correct**

```bash
pnpm enrich:goodreads-url --apply
```

Expected: same output but headed "APPLYING", with "UPDATED" instead of "WOULD UPDATE".

- [ ] **Verify in the database that goodreadsUrls were written**

```bash
pnpm enrich:goodreads-url
```

Expected: the "WOULD UPDATE" count is now 0, and the "ALREADY ENRICHED" count matches the previous "UPDATED" count.

- [ ] **Commit**

```bash
git add scripts/enrich-goodreads-url.ts
git commit -m "feat(scripts): add Calibre Goodreads URL enrichment script"
```
