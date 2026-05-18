# Calibre Sync Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily scheduled script that syncs reading state from a local Calibre/CWA instance into the bookshelf database, with Docker container lifecycle management.

**Architecture:** Three files — `scripts/lib/sync-utils.ts` (pure testable functions), `scripts/lib/calibre-sync-reader.ts` (SQLite reader), and `scripts/sync-calibre.ts` (entry point with container lifecycle, matching, output, and writes). The script stops the `calibre-web-automated` Docker container before reading SQLite files and always restarts it in a `finally` block.

**Tech Stack:** `better-sqlite3` (already installed), `child_process.execSync` for Docker commands, `UTApi` from `uploadthing/server` (already installed) for cover uploads, Prisma client for bookshelf writes.

---

## File Structure

- **Create:** `scripts/lib/sync-utils.ts` — pure functions: `deriveStatus`, `shouldUpdateStatus`, `statusPriority`, `shouldLogProgress`
- **Create:** `scripts/lib/sync-utils.test.ts` — unit tests for all four functions
- **Create:** `scripts/lib/calibre-sync-reader.ts` — reads all sync data from Calibre `metadata.db` and CWA `app.db`; merges and returns `CalibreBookSync[]`
- **Create:** `scripts/sync-calibre.ts` — full entry point
- **Modify:** `package.json` — add `sync:calibre` script

---

## Context for implementers

**Spec:** `docs/superpowers/specs/2026-05-18-calibre-sync-design.md` — read this first.

**Reference scripts** for patterns (arg parsing, dotenv, prisma usage, output format):

- `scripts/enrich-goodreads-url.ts`
- `scripts/lib/calibre-reader.ts`

**Existing helpers used:**

- `upsertSeries(db, name, userId)` from `@/lib/book` — finds-or-creates a Series, returns its id
- `createTitleSort(title)`, `createAuthorSort(author)` from `@/lib/book`
- `recalculateAllUserStats(db, user)` from `@/lib/reading/stats-updates` — must be called after any ReadingProgress writes
- `prisma` default export from `@/lib/prisma`

**Calibre data sources:**

- `custom_column_3` (`koboreadpct`) — Kobo read percentage, integer 0–100
- `custom_column_5` (`kobolastread`) — last Kobo sync datetime
- `custom_column_23` (`datestarted`) — reading start datetime
- `custom_column_29` (`dnf`) — did-not-finish bool (1=true)
- `book_read_link` in CWA `app.db` — `read_status`: 0=unread, 1=read, 2=reading
- Cover files at `{libraryRoot}/{books.path}/cover.jpg` where `libraryRoot = path.dirname(calibreDbPath)`

**ReadStatus enum values:** `"TO_READ"`, `"READING"`, `"READ"`, `"READ_NEXT"`, `"DNF"` — import from `@/generated/prisma/enums`.

**Priority rule:** `DNF = READ (3) > READING (2) > READ_NEXT (1) > TO_READ (0)` — never downgrade.

---

## Task 1: Pure functions + unit tests

**Files:**

- Create: `scripts/lib/sync-utils.ts`
- Create: `scripts/lib/sync-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/sync-utils.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { deriveStatus, shouldLogProgress, shouldUpdateStatus, statusPriority } from "./sync-utils";

describe("statusPriority", () => {
  it("DNF and READ have equal priority", () => {
    expect(statusPriority("DNF")).toBe(statusPriority("READ"));
  });

  it("READ > READING > READ_NEXT > TO_READ", () => {
    expect(statusPriority("READ")).toBeGreaterThan(statusPriority("READING"));
    expect(statusPriority("READING")).toBeGreaterThan(statusPriority("READ_NEXT"));
    expect(statusPriority("READ_NEXT")).toBeGreaterThan(statusPriority("TO_READ"));
  });
});

describe("deriveStatus", () => {
  it("returns DNF when dnf=true regardless of other signals", () => {
    expect(deriveStatus(1, 100, true)).toBe("DNF");
    expect(deriveStatus(2, 50, true)).toBe("DNF");
  });

  it("returns READ when read_status=1", () => {
    expect(deriveStatus(1, null, false)).toBe("READ");
  });

  it("returns READ when koboreadpct=100", () => {
    expect(deriveStatus(0, 100, false)).toBe("READ");
  });

  it("returns READING when read_status=2", () => {
    expect(deriveStatus(2, null, false)).toBe("READING");
  });

  it("returns READING when koboreadpct is between 1 and 99", () => {
    expect(deriveStatus(0, 50, false)).toBe("READING");
    expect(deriveStatus(0, 1, false)).toBe("READING");
    expect(deriveStatus(0, 99, false)).toBe("READING");
  });

  it("returns TO_READ when all signals indicate unread", () => {
    expect(deriveStatus(0, null, false)).toBe("TO_READ");
    expect(deriveStatus(null, null, false)).toBe("TO_READ");
  });

  it("returns TO_READ when koboreadpct=0", () => {
    expect(deriveStatus(0, 0, false)).toBe("TO_READ");
  });
});

describe("shouldUpdateStatus", () => {
  it("updates TO_READ to READING", () => {
    expect(shouldUpdateStatus("TO_READ", "READING")).toBe(true);
  });

  it("updates TO_READ to READ", () => {
    expect(shouldUpdateStatus("TO_READ", "READ")).toBe(true);
  });

  it("updates READING to READ", () => {
    expect(shouldUpdateStatus("READING", "READ")).toBe(true);
  });

  it("updates READ_NEXT to READING", () => {
    expect(shouldUpdateStatus("READ_NEXT", "READING")).toBe(true);
  });

  it("does not downgrade READ to READING", () => {
    expect(shouldUpdateStatus("READ", "READING")).toBe(false);
  });

  it("does not change READ to DNF (equal priority)", () => {
    expect(shouldUpdateStatus("READ", "DNF")).toBe(false);
  });

  it("does not change DNF to READ (equal priority)", () => {
    expect(shouldUpdateStatus("DNF", "READ")).toBe(false);
  });

  it("does not change READ_NEXT to TO_READ", () => {
    expect(shouldUpdateStatus("READ_NEXT", "TO_READ")).toBe(false);
  });

  it("does not update when status is unchanged", () => {
    expect(shouldUpdateStatus("READING", "READING")).toBe(false);
    expect(shouldUpdateStatus("TO_READ", "TO_READ")).toBe(false);
  });
});

describe("shouldLogProgress", () => {
  it("returns true when calibre progress is higher than bookshelf", () => {
    expect(shouldLogProgress(60, 50)).toBe(true);
  });

  it("returns true when bookshelf is at 0 and calibre has progress", () => {
    expect(shouldLogProgress(10, 0)).toBe(true);
  });

  it("returns false when progress is equal", () => {
    expect(shouldLogProgress(50, 50)).toBe(false);
  });

  it("returns false when calibre progress is lower", () => {
    expect(shouldLogProgress(40, 50)).toBe(false);
  });

  it("returns false when koboreadpct is null", () => {
    expect(shouldLogProgress(null, 0)).toBe(false);
  });

  it("returns false when koboreadpct is 0", () => {
    expect(shouldLogProgress(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run scripts/lib/sync-utils.test.ts
```

Expected: FAIL — `sync-utils` module not found.

- [ ] **Step 3: Implement `scripts/lib/sync-utils.ts`**

```typescript
import type { ReadStatus } from "@/generated/prisma/enums";

const STATUS_PRIORITY: Record<ReadStatus, number> = {
  DNF: 3,
  READ: 3,
  READING: 2,
  READ_NEXT: 1,
  TO_READ: 0,
};

export function statusPriority(status: ReadStatus): number {
  return STATUS_PRIORITY[status];
}

export function deriveStatus(readStatus: number | null, koboreadpct: number | null, dnf: boolean): ReadStatus {
  if (dnf) return "DNF";
  if (readStatus === 1 || koboreadpct === 100) return "READ";
  if (readStatus === 2 || (koboreadpct !== null && koboreadpct > 0 && koboreadpct < 100)) return "READING";
  return "TO_READ";
}

export function shouldUpdateStatus(current: ReadStatus, derived: ReadStatus): boolean {
  return statusPriority(derived) > statusPriority(current);
}

export function shouldLogProgress(koboreadpct: number | null, currentProgress: number): boolean {
  return koboreadpct !== null && koboreadpct > currentProgress;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run scripts/lib/sync-utils.test.ts
```

Expected: 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sync-utils.ts scripts/lib/sync-utils.test.ts
git commit -m "feat(scripts): add sync-utils pure functions with tests"
```

---

## Task 2: Calibre sync reader

**Files:**

- Create: `scripts/lib/calibre-sync-reader.ts`

This module has no unit tests (per spec). Its correctness is verified by running the main script in dry-run mode in Task 3.

- [ ] **Step 1: Create `scripts/lib/calibre-sync-reader.ts`**

```typescript
import path from "node:path";

import Database from "better-sqlite3";

export interface CalibreBookSync {
  calibreId: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  goodreadsId: string | null;
  coverPath: string | null;
  // CWA reading state (null if book not in CWA)
  readStatus: number | null;
  // Calibre custom column data
  koboreadpct: number | null;
  kobolastread: Date | null;
  datestarted: Date | null;
  dnf: boolean;
}

const CALIBRE_QUERY = `
  SELECT
    b.id,
    b.title,
    MIN(a.name)    AS author,
    s.name         AS series_name,
    b.series_index AS series_index,
    b.path,
    b.has_cover,
    i.val          AS goodreads_id,
    cc3.value      AS koboreadpct,
    cc5.value      AS kobolastread,
    cc23.value     AS datestarted,
    cc29.value     AS dnf
  FROM books b
  LEFT JOIN books_authors_link bal  ON b.id = bal.book
  LEFT JOIN authors a               ON bal.author = a.id
  LEFT JOIN books_series_link bsl   ON b.id = bsl.book
  LEFT JOIN series s                ON bsl.series = s.id
  LEFT JOIN identifiers i           ON b.id = i.book AND i.type = 'goodreads'
  LEFT JOIN custom_column_3  cc3    ON cc3.book  = b.id
  LEFT JOIN custom_column_5  cc5    ON cc5.book  = b.id
  LEFT JOIN custom_column_23 cc23   ON cc23.book = b.id
  LEFT JOIN custom_column_29 cc29   ON cc29.book = b.id
  GROUP BY b.id, b.title, s.name, b.series_index, b.path, b.has_cover,
           i.val, cc3.value, cc5.value, cc23.value, cc29.value
  ORDER BY b.title
`;

interface CalibreRawRow {
  id: number;
  title: string;
  author: string | null;
  series_name: string | null;
  series_index: number | null;
  path: string;
  has_cover: number;
  goodreads_id: string | null;
  koboreadpct: number | null;
  kobolastread: string | null;
  datestarted: string | null;
  dnf: number | null;
}

interface CwaRawRow {
  book_id: number;
  read_status: number;
}

export function readCalibreSyncData(calibreDbPath: string, cwaDbPath: string): CalibreBookSync[] {
  const calibreDb = new Database(calibreDbPath, { readonly: true });
  const cwaDb = new Database(cwaDbPath, { readonly: true });

  try {
    const calibreRows = calibreDb.prepare(CALIBRE_QUERY).all() as CalibreRawRow[];

    const cwaRows = cwaDb.prepare("SELECT book_id, read_status FROM book_read_link").all() as CwaRawRow[];
    const cwaByBookId = new Map(cwaRows.map((r) => [r.book_id, r.read_status]));

    const libraryRoot = path.dirname(calibreDbPath);

    return calibreRows.map((row) => ({
      calibreId: row.id,
      title: row.title,
      author: row.author ?? "Unknown",
      seriesName: row.series_name,
      seriesIndex: row.series_index,
      goodreadsId: row.goodreads_id,
      coverPath: row.has_cover === 1 ? path.join(libraryRoot, row.path, "cover.jpg") : null,
      readStatus: cwaByBookId.get(row.id) ?? null,
      koboreadpct: row.koboreadpct,
      kobolastread: row.kobolastread ? new Date(row.kobolastread) : null,
      datestarted: row.datestarted ? new Date(row.datestarted) : null,
      dnf: row.dnf === 1,
    }));
  } finally {
    calibreDb.close();
    cwaDb.close();
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors in `scripts/lib/calibre-sync-reader.ts`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/calibre-sync-reader.ts
git commit -m "feat(scripts): add Calibre sync reader module"
```

---

## Task 3: Main sync script + npm script

**Files:**

- Create: `scripts/sync-calibre.ts`
- Modify: `package.json`

**Important:** The CWA Docker container (`calibre-web-automated`) must be shut down before running this script. The script manages this automatically, but during development keep the container stopped to avoid conflicts.

- [ ] **Step 1: Create `scripts/sync-calibre.ts`**

```typescript
import "dotenv/config";

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { UTApi } from "uploadthing/server";

import type { ReadStatus } from "@/generated/prisma/enums";
import { createAuthorSort, createTitleSort, upsertSeries } from "@/lib/book";
import prisma from "@/lib/prisma";
import { recalculateAllUserStats } from "@/lib/reading/stats-updates";

import { readCalibreSyncData, type CalibreBookSync } from "./lib/calibre-sync-reader";
import { deriveStatus, shouldLogProgress, shouldUpdateStatus } from "./lib/sync-utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CALIBRE_DB = "E:\\Calibre Library\\metadata.db";
const DEFAULT_CWA_DB = "E:\\cwa\\config\\app.db";
const GOODREADS_BASE = "https://www.goodreads.com/book/show";
const CONTAINER_NAME = "calibre-web-automated";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookshelfBook {
  id: number;
  title: string;
  author: string;
  status: ReadStatus;
  progress: number;
  goodreadsUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  series: { name: string } | null;
  seriesIndex: number | null;
}

interface BookUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newStatus: ReadStatus | null;
  newStartedAt: Date | null;
  newFinishedAt: Date | null;
}

interface ProgressUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newProgress: number;
}

interface ProgressSkip {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
}

interface SyncResults {
  toCreate: CalibreBookSync[];
  bookUpdates: BookUpdate[];
  progressUpdates: ProgressUpdate[];
  progressSkips: ProgressSkip[];
  notInCalibre: BookshelfBook[];
  noGoodreadsId: CalibreBookSync[];
}

// ─── Container lifecycle ──────────────────────────────────────────────────────

function stopContainer(): void {
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "pipe" });
    console.log(`Stopped ${CONTAINER_NAME}.`);
  } catch (error) {
    console.error(`Failed to stop ${CONTAINER_NAME}:`, error);
    process.exit(1);
  }
}

function startContainer(): void {
  try {
    execSync(`docker start ${CONTAINER_NAME}`, { stdio: "pipe" });
    console.log(`Started ${CONTAINER_NAME}.`);
  } catch (error) {
    console.error(`Failed to restart ${CONTAINER_NAME} — restart it manually:`, error);
    // Do not change exit code — the sync result is independent of container restart.
  }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function computeResults(calibreBooks: CalibreBookSync[], bookshelfBooks: BookshelfBook[]): SyncResults {
  const bookshelfByUrl = new Map<string, BookshelfBook>();
  for (const b of bookshelfBooks) {
    if (b.goodreadsUrl) bookshelfByUrl.set(b.goodreadsUrl, b);
  }

  const matchedIds = new Set<number>();
  const results: SyncResults = {
    toCreate: [],
    bookUpdates: [],
    progressUpdates: [],
    progressSkips: [],
    notInCalibre: [],
    noGoodreadsId: [],
  };

  for (const calibreBook of calibreBooks) {
    if (!calibreBook.goodreadsId) {
      results.noGoodreadsId.push(calibreBook);
      continue;
    }

    const url = `${GOODREADS_BASE}/${calibreBook.goodreadsId}`;
    const bookshelfBook = bookshelfByUrl.get(url);

    if (!bookshelfBook) {
      results.toCreate.push(calibreBook);
      continue;
    }

    matchedIds.add(bookshelfBook.id);

    const derived = deriveStatus(calibreBook.readStatus, calibreBook.koboreadpct, calibreBook.dnf);

    const newStatus = shouldUpdateStatus(bookshelfBook.status, derived) ? derived : null;
    const effectiveStatus = newStatus ?? bookshelfBook.status;

    const newStartedAt =
      bookshelfBook.startedAt === null && calibreBook.datestarted !== null ? calibreBook.datestarted : null;

    const newFinishedAt =
      bookshelfBook.finishedAt === null && effectiveStatus === "READ" && calibreBook.kobolastread !== null
        ? calibreBook.kobolastread
        : null;

    if (newStatus !== null || newStartedAt !== null || newFinishedAt !== null) {
      results.bookUpdates.push({
        calibreBook,
        bookshelfBook,
        newStatus,
        newStartedAt,
        newFinishedAt,
      });
    }

    if (shouldLogProgress(calibreBook.koboreadpct, bookshelfBook.progress)) {
      results.progressUpdates.push({
        calibreBook,
        bookshelfBook,
        newProgress: calibreBook.koboreadpct!,
      });
    } else if (calibreBook.koboreadpct !== null && calibreBook.koboreadpct > 0) {
      results.progressSkips.push({ calibreBook, bookshelfBook });
    }
  }

  for (const b of bookshelfBooks) {
    if (!matchedIds.has(b.id)) results.notInCalibre.push(b);
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function formatBook(title: string, author: string, seriesName: string | null, seriesIndex: number | null): string {
  const series = seriesName !== null && seriesIndex !== null ? ` [${seriesName} #${seriesIndex}]` : "";
  return `${title} — ${author}${series}`;
}

function printResults(results: SyncResults, apply: boolean): void {
  const mode = apply ? "APPLYING" : "DRY RUN";
  console.log(`\n=== Calibre Sync — ${mode} ===\n`);

  const createLabel = apply ? "CREATED" : "WOULD CREATE";
  console.log(`${createLabel} (${results.toCreate.length})`);
  for (const b of results.toCreate) {
    const derived = deriveStatus(b.readStatus, b.koboreadpct, b.dnf);
    const pct = b.koboreadpct ? ` (${b.koboreadpct}%)` : "";
    const started = b.datestarted ? ` | Started: ${b.datestarted.toISOString().slice(0, 10)}` : "";
    console.log(`  • ${formatBook(b.title, b.author, b.seriesName, b.seriesIndex)}`);
    console.log(`    Status: ${derived}${pct}${started}`);
  }

  const bookUpdatesWithStatus = results.bookUpdates.filter((u) => u.newStatus !== null);
  const updateLabel = apply ? "UPDATED STATUS" : "WOULD UPDATE STATUS";
  console.log(`\n${updateLabel} (${bookUpdatesWithStatus.length})`);
  for (const { calibreBook, bookshelfBook, newStatus, newFinishedAt } of bookUpdatesWithStatus) {
    const finished = newFinishedAt ? ` | Finished: ${newFinishedAt.toISOString().slice(0, 10)}` : "";
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    ${bookshelfBook.status} → ${newStatus}${finished}`);
  }

  const progressLabel = apply ? "LOGGED PROGRESS" : "WOULD LOG PROGRESS";
  console.log(`\n${progressLabel} (${results.progressUpdates.length})`);
  for (const { calibreBook, bookshelfBook, newProgress } of results.progressUpdates) {
    const lastRead = calibreBook.kobolastread ? calibreBook.kobolastread.toISOString().slice(0, 10) : "unknown";
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    ${bookshelfBook.progress}% → ${newProgress}% (kobolastread: ${lastRead})`);
  }

  if (results.progressSkips.length > 0) {
    console.log(`\nSKIPPED — NO PROGRESS INCREASE (${results.progressSkips.length})`);
    for (const { calibreBook, bookshelfBook } of results.progressSkips) {
      console.log(
        `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
      );
      console.log(`    Already at ${bookshelfBook.progress}%, Calibre reports ${calibreBook.koboreadpct}%`);
    }
  }

  console.log(`\nNOT IN CALIBRE (${results.notInCalibre.length})`);

  if (results.noGoodreadsId.length > 0) {
    console.log(`\nNO GOODREADS ID — SKIPPED (${results.noGoodreadsId.length})`);
    for (const b of results.noGoodreadsId) {
      console.log(`  • ${b.title} — ${b.author}`);
    }
  }

  console.log("\n=== Summary ===");
  const pad = (n: number) => String(n).padStart(3);
  console.log(`${apply ? "Created:         " : "Would create:    "}  ${pad(results.toCreate.length)}`);
  console.log(`${apply ? "Updated status:  " : "Would update:    "}  ${pad(bookUpdatesWithStatus.length)}`);
  console.log(`${apply ? "Logged progress: " : "Would log:       "}  ${pad(results.progressUpdates.length)}`);
  if (results.progressSkips.length > 0) {
    console.log(`Skipped (no change):  ${pad(results.progressSkips.length)}`);
  }
  console.log(`Not in Calibre:       ${pad(results.notInCalibre.length)}`);
  if (results.noGoodreadsId.length > 0) {
    console.log(`No Goodreads ID:      ${pad(results.noGoodreadsId.length)}`);
  }

  if (!apply) {
    console.log("\nRun with --apply to write changes.");
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function uploadCover(coverPath: string | null): Promise<string | null> {
  if (!coverPath || !existsSync(coverPath)) return null;
  try {
    const utapi = new UTApi();
    const buffer = readFileSync(coverPath);
    const file = new File([buffer], "cover.jpg", { type: "image/jpeg" });
    const { data, error } = await utapi.uploadFiles(file);
    if (error) {
      console.error(`  ⚠ Cover upload failed for ${path.basename(path.dirname(coverPath))}:`, error.message);
      return null;
    }
    return data?.ufsUrl ?? null;
  } catch (err) {
    console.error(`  ⚠ Cover upload failed for ${path.basename(path.dirname(coverPath))}:`, err);
    return null;
  }
}

async function applyCreates(toCreate: CalibreBookSync[], userId: string): Promise<number> {
  let failures = 0;
  for (const b of toCreate) {
    try {
      const coverUrl = await uploadCover(b.coverPath);
      const seriesId = b.seriesName ? await upsertSeries(prisma, b.seriesName, userId) : null;
      const derived = deriveStatus(b.readStatus, b.koboreadpct, b.dnf);

      await prisma.book.create({
        data: {
          title: b.title,
          titleSort: createTitleSort(b.title),
          author: b.author,
          authorSort: createAuthorSort(b.author),
          seriesId,
          seriesIndex: b.seriesIndex,
          goodreadsUrl: `${GOODREADS_BASE}/${b.goodreadsId}`,
          coverUrl,
          status: derived,
          progress: b.koboreadpct ?? 0,
          startedAt: b.datestarted,
          finishedAt: derived === "READ" ? b.kobolastread : null,
          userId,
        },
      });
    } catch (err) {
      console.error(`  ✗ Failed to create "${b.title}":`, err);
      failures++;
    }
  }
  return failures;
}

async function applyBookUpdates(bookUpdates: BookUpdate[]): Promise<number> {
  let failures = 0;
  for (const { bookshelfBook, newStatus, newStartedAt, newFinishedAt } of bookUpdates) {
    try {
      const data: {
        status?: ReadStatus;
        startedAt?: Date;
        finishedAt?: Date;
      } = {};
      if (newStatus !== null) data.status = newStatus;
      if (newStartedAt !== null) data.startedAt = newStartedAt;
      if (newFinishedAt !== null) data.finishedAt = newFinishedAt;

      await prisma.book.update({ where: { id: bookshelfBook.id }, data });
    } catch (err) {
      console.error(`  ✗ Failed to update "${bookshelfBook.title}":`, err);
      failures++;
    }
  }
  return failures;
}

async function applyProgressUpdates(progressUpdates: ProgressUpdate[], userId: string): Promise<number> {
  let failures = 0;
  for (const { calibreBook, bookshelfBook, newProgress } of progressUpdates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.readingProgress.create({
          data: {
            userId,
            bookId: bookshelfBook.id,
            progress: newProgress,
            createdAt: calibreBook.kobolastread ?? new Date(),
          },
        });
        await tx.book.update({
          where: { id: bookshelfBook.id },
          data: { progress: newProgress },
        });
      });
    } catch (err) {
      console.error(`  ✗ Failed to log progress for "${bookshelfBook.title}":`, err);
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
      "cwa-db": { type: "string", default: DEFAULT_CWA_DB },
      "user-email": { type: "string" },
    },
  });

  const apply = values.apply ?? false;
  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;
  const cwaDbPath = (values["cwa-db"] as string | undefined) ?? DEFAULT_CWA_DB;
  const userEmail = values["user-email"] as string | undefined;

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }

  if (!existsSync(cwaDbPath)) {
    console.error(`Error: CWA database not found at "${cwaDbPath}"`);
    process.exit(1);
  }

  stopContainer();

  try {
    console.log(`Reading Calibre library from: ${calibreDbPath}`);
    console.log(`Reading CWA database from: ${cwaDbPath}`);
    const calibreBooks = readCalibreSyncData(calibreDbPath, cwaDbPath);
    console.log(`Loaded ${calibreBooks.length} books from Calibre`);

    const user = userEmail
      ? await prisma.user.findFirst({ where: { email: userEmail } })
      : await prisma.user.findFirst();

    if (!user) {
      console.error("Error: No bookshelf user found");
      process.exit(1);
    }

    console.log(`Syncing for user: ${user.email}`);

    const bookshelfBooks = await prisma.book.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        author: true,
        status: true,
        progress: true,
        goodreadsUrl: true,
        startedAt: true,
        finishedAt: true,
        series: { select: { name: true } },
        seriesIndex: true,
      },
    });
    console.log(`Loaded ${bookshelfBooks.length} books from bookshelf`);

    const results = computeResults(calibreBooks, bookshelfBooks);
    printResults(results, apply);

    if (apply) {
      let totalFailures = 0;
      totalFailures += await applyCreates(results.toCreate, user.id);
      totalFailures += await applyBookUpdates(results.bookUpdates);
      totalFailures += await applyProgressUpdates(results.progressUpdates, user.id);

      if (results.progressUpdates.length > 0) {
        await recalculateAllUserStats(prisma, user);
      }

      if (totalFailures > 0) {
        console.error(`\n${totalFailures} write(s) failed. See errors above.`);
        process.exit(1);
      }
    }
  } finally {
    startContainer();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add `sync:calibre` to `package.json`**

In `package.json`, add to the `"scripts"` section alongside the existing `"enrich:goodreads-url"` entry:

```json
"sync:calibre": "tsx scripts/sync-calibre.ts"
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any before proceeding.

- [ ] **Step 4: Shut down the CWA container, then run dry-run to verify output**

The script manages the container automatically, but confirm it is stopped first:

```bash
docker stop calibre-web-automated
```

Then run the dry-run:

```bash
pnpm sync:calibre
```

Expected output shape:

```
Stopped calibre-web-automated.
Reading Calibre library from: E:\Calibre Library\metadata.db
Reading CWA database from: E:\cwa\config\app.db
Loaded 337 books from Calibre
Syncing for user: dev@example.com
Loaded NNN books from bookshelf

=== Calibre Sync — DRY RUN ===

WOULD CREATE (N)
  ...
WOULD UPDATE STATUS (N)
  ...
WOULD LOG PROGRESS (N)
  ...
=== Summary ===
...
Run with --apply to write changes.
Started calibre-web-automated.
```

Confirm the container is running again after the dry-run:

```bash
docker ps --filter "name=calibre-web-automated"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-calibre.ts package.json
git commit -m "feat(scripts): add Calibre sync script with Docker container lifecycle"
```

---

## Self-Review Checklist

After writing this plan, checked against spec:

- ✅ Container stop (fatal on failure) + always-restart in `finally`
- ✅ Matching by `goodreadsUrl`
- ✅ Status mapping: `deriveStatus` covers all four cases
- ✅ "Take higher value": `shouldUpdateStatus` uses `>` not `>=`
- ✅ `READ_NEXT` handled — has priority 1, sits below READING
- ✅ Progress sync: `shouldLogProgress` + `ReadingProgress` entry with `kobolastread` as `createdAt`
- ✅ Skipped-progress logged in output
- ✅ Timestamps: `startedAt` + `finishedAt` only set when currently null
- ✅ New book imports: title, author, series, seriesIndex, goodreadsUrl, cover, status, progress, dates
- ✅ Cover upload via `UTApi` + graceful failure
- ✅ `--user-email` flag with `findFirst()` fallback
- ✅ `recalculateAllUserStats` called after progress writes
- ✅ `noGoodreadsId` bucket for Calibre books without a Goodreads identifier
- ✅ `notInCalibre` count-only output (not per-book, too noisy)
- ✅ `--apply` flag; dry-run by default
- ✅ npm script added
