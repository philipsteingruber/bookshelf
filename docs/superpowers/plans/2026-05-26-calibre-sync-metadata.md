# Calibre Sync — Metadata Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Calibre sync script to read ISBN, publication year, and summary from Calibre and write them to bookshelf — during new imports and as a backfill for existing matched books (additive-only: only when null).

**Architecture:** Two files change: `calibre-sync-reader.ts` gains new SQL joins and helper functions to extract the raw data; `sync-calibre.ts` gains a `MetadataUpdate` type, a new `metadataUpdates` phase in `computeResults`, a new `applyMetadataUpdates` function, and updated output. Section structure in the main script is tightened to separate pure helpers from output and apply logic.

**Tech Stack:** TypeScript, better-sqlite3, Prisma (PostgreSQL), tsx

---

## File Map

| File                                 | Change                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/calibre-sync-reader.ts` | New SQL columns/joins, two private helper functions, three new fields on `CalibreBookSync`                                                                                                                    |
| `scripts/sync-calibre.ts`            | New `MetadataUpdate` type, extend `BookshelfBook` + `SyncResults`, extend `computeResults`, new `applyMetadataUpdates`, extend `applyCreates`, extend output functions, wire into `main`, reorganise sections |

---

## Task 1: Extend the Calibre reader

**Files:**

- Modify: `scripts/lib/calibre-sync-reader.ts`

- [ ] **Step 1: Add three fields to `CalibreBookSync`**

  Open `scripts/lib/calibre-sync-reader.ts`. In the `CalibreBookSync` interface, add after `goodreadsId`:

  ```typescript
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
  ```

- [ ] **Step 2: Add three fields to `CalibreRawRow`**

  In the `CalibreRawRow` interface, add after `goodreads_id`:

  ```typescript
  isbn: string | null;
  pubdate: string | null;
  description: string | null;
  ```

- [ ] **Step 3: Add `stripHtml` and `extractYear` helpers**

  Add these two functions directly above `readCalibreSyncData`:

  ```typescript
  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Calibre stores "0101-01-01" as a placeholder for unknown publication dates.
  function extractYear(pubdate: string | null): number | null {
    if (!pubdate) return null;
    const year = parseInt(pubdate.slice(0, 4), 10);
    return isNaN(year) || year < 100 ? null : year;
  }
  ```

- [ ] **Step 4: Update `CALIBRE_QUERY`**

  Replace the entire `CALIBRE_QUERY` constant with the version below. The changes are: three new `SELECT` columns (`isbn`, `pubdate`, `description`), three new `LEFT JOIN` clauses, and the three new columns added to `GROUP BY`.

  ```typescript
  const CALIBRE_QUERY = `
    SELECT
      b.id,
      b.title,
      MIN(a.name)                AS author,
      s.name                     AS series_name,
      b.series_index             AS series_index,
      b.path,
      b.has_cover,
      i.val                      AS goodreads_id,
      COALESCE(i13.val, i10.val) AS isbn,
      b.pubdate                  AS pubdate,
      cm.text                    AS description,
      cc5.value                  AS kobolastread,
      cc23.value                 AS datestarted,
      cc29.value                 AS dnf
    FROM books b
    LEFT JOIN books_authors_link bal  ON b.id = bal.book
    LEFT JOIN authors a               ON bal.author = a.id
    LEFT JOIN books_series_link bsl   ON b.id = bsl.book
    LEFT JOIN series s                ON bsl.series = s.id
    LEFT JOIN identifiers i           ON b.id = i.book AND i.type = 'goodreads'
    LEFT JOIN identifiers i13         ON b.id = i13.book AND i13.type = 'isbn13'
    LEFT JOIN identifiers i10         ON b.id = i10.book AND i10.type = 'isbn'
    LEFT JOIN comments    cm          ON cm.book = b.id
    LEFT JOIN custom_column_5  cc5    ON cc5.book  = b.id
    LEFT JOIN custom_column_23 cc23   ON cc23.book = b.id
    LEFT JOIN custom_column_29 cc29   ON cc29.book = b.id
    GROUP BY b.id, b.title, s.name, b.series_index, b.path, b.has_cover,
             i.val, i13.val, i10.val, b.pubdate, cm.text, cc5.value, cc23.value, cc29.value
    ORDER BY b.title
  `;
  ```

- [ ] **Step 5: Update the mapping in `readCalibreSyncData`**

  In the `return calibreRows.map(...)` call, add three new fields after `goodreadsId`:

  ```typescript
  isbn: row.isbn ?? null,
  publishedYear: extractYear(row.pubdate),
  summary: row.description ? (stripHtml(row.description) || null) : null,
  ```

  The `|| null` guard on `summary` converts an empty string (from stripping a blank HTML comment) to `null` so we never overwrite a real summary with an empty string.

- [ ] **Step 6: Verify TypeScript compiles**

  ```powershell
  pnpm tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```powershell
  git add scripts/lib/calibre-sync-reader.ts
  git commit -m "feat(calibre-sync): read isbn, publishedYear, and summary from Calibre"
  ```

---

## Task 2: Extend types and matching in `sync-calibre.ts`

**Files:**

- Modify: `scripts/sync-calibre.ts`

- [ ] **Step 1: Extend `BookshelfBook`**

  In the `BookshelfBook` interface (inside the `─── Types ───` section), add after `seriesIndex`:

  ```typescript
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
  ```

- [ ] **Step 2: Add `MetadataUpdate` interface**

  In the `─── Types ───` section, add after the `ProgressSkip` interface:

  ```typescript
  interface MetadataUpdate {
    calibreBook: CalibreBookSync;
    bookshelfBook: BookshelfBook;
    newIsbn: string | null;
    newPublishedYear: number | null;
    newSummary: string | null;
  }
  ```

- [ ] **Step 3: Add `metadataUpdates` to `SyncResults`**

  In the `SyncResults` interface, add after `progressSkips`:

  ```typescript
  metadataUpdates: MetadataUpdate[];
  ```

- [ ] **Step 4: Initialise `metadataUpdates` in `computeResults`**

  In the `results` object initialiser inside `computeResults`, add:

  ```typescript
  metadataUpdates: [],
  ```

- [ ] **Step 5: Build `metadataUpdates` in the matching loop**

  In `computeResults`, after the existing `if (shouldLogProgress(...))` block (i.e. after `progressUpdates`/`progressSkips` logic), add:

  ```typescript
  const newIsbn = bookshelfBook.isbn === null && calibreBook.isbn !== null ? calibreBook.isbn : null;
  const newPublishedYear =
    bookshelfBook.publishedYear === null && calibreBook.publishedYear !== null ? calibreBook.publishedYear : null;
  const newSummary = bookshelfBook.summary === null && calibreBook.summary !== null ? calibreBook.summary : null;

  if (newIsbn !== null || newPublishedYear !== null || newSummary !== null) {
    results.metadataUpdates.push({
      calibreBook,
      bookshelfBook,
      newIsbn,
      newPublishedYear,
      newSummary,
    });
  }
  ```

- [ ] **Step 6: Extend the Prisma `select` in `main`**

  Find the `prisma.book.findMany` call in `main`. In its `select` object, add after `seriesIndex`:

  ```typescript
  isbn: true,
  publishedYear: true,
  summary: true,
  ```

- [ ] **Step 7: Verify TypeScript compiles**

  ```powershell
  pnpm tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```powershell
  git add scripts/sync-calibre.ts
  git commit -m "feat(calibre-sync): add MetadataUpdate type and build metadataUpdates in computeResults"
  ```

---

## Task 3: Add `applyMetadataUpdates` and extend `applyCreates`

**Files:**

- Modify: `scripts/sync-calibre.ts`

- [ ] **Step 1: Add `applyMetadataUpdates`**

  In the `─── Apply ───` section, add this function after `applyBookUpdates`:

  ```typescript
  async function applyMetadataUpdates(metadataUpdates: MetadataUpdate[]): Promise<string[]> {
    const errors: string[] = [];
    for (const { bookshelfBook, newIsbn, newPublishedYear, newSummary } of metadataUpdates) {
      try {
        const data: { isbn?: string; publishedYear?: number; summary?: string } = {};
        if (newIsbn !== null) data.isbn = newIsbn;
        if (newPublishedYear !== null) data.publishedYear = newPublishedYear;
        if (newSummary !== null) data.summary = newSummary;
        await prisma.book.update({ where: { id: bookshelfBook.id }, data });
      } catch (err) {
        errors.push(`Failed to update metadata for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
      }
    }
    return errors;
  }
  ```

- [ ] **Step 2: Extend `applyCreates`**

  In `applyCreates`, inside the `prisma.book.create({ data: { ... } })` call, add after `goodreadsUrl`:

  ```typescript
  isbn: b.isbn,
  publishedYear: b.publishedYear,
  summary: b.summary,
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```powershell
  pnpm tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```powershell
  git add scripts/sync-calibre.ts
  git commit -m "feat(calibre-sync): add applyMetadataUpdates and populate metadata on new imports"
  ```

---

## Task 4: Extend output, wire into `main`, and reorganise sections

**Files:**

- Modify: `scripts/sync-calibre.ts`

- [ ] **Step 1: Add WOULD UPDATE METADATA block to `printResults`**

  In `printResults`, after the `WOULD UPDATE STATUS` block and before the `WOULD LOG PROGRESS` block, add:

  ```typescript
  const metadataLabel = apply ? "UPDATED METADATA" : "WOULD UPDATE METADATA";
  console.log(`\n${metadataLabel} (${results.metadataUpdates.length})`);
  for (const { bookshelfBook, newIsbn, newPublishedYear, newSummary } of results.metadataUpdates) {
    console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author, null, null)}`);
    if (newIsbn !== null) console.log(`    ISBN: ${newIsbn}`);
    if (newPublishedYear !== null) console.log(`    Year: ${newPublishedYear}`);
    if (newSummary !== null) console.log(`    Summary: ${newSummary.slice(0, 80)}…`);
  }
  ```

  Also add a `Would update metadata` line to the dry-run `=== Summary ===` block inside `printResults` (the `if (!apply)` block at the bottom of that function), after `Would update`:

  ```typescript
  console.log(`Would update metadata: ${pad(results.metadataUpdates.length)}`);
  ```

- [ ] **Step 2: Add metadata count to `printApplySummary`**

  Update the `printApplySummary` signature to accept `metadataErrors`:

  ```typescript
  function printApplySummary(
    results: SyncResults,
    createErrors: string[],
    updateErrors: string[],
    metadataErrors: string[],
    progressErrors: string[],
  ): void;
  ```

  Inside the function, add after the `Updated status` line:

  ```typescript
  console.log(`Updated metadata: ${pad(results.metadataUpdates.length - metadataErrors.length)}`);
  ```

- [ ] **Step 3: Wire `applyMetadataUpdates` into `main`**

  In `main`, after `applyBookUpdates` and before `applyProgressUpdates`, add:

  ```typescript
  const metadataErrors = await applyMetadataUpdates(results.metadataUpdates);
  ```

  Update the `printApplySummary` call to pass `metadataErrors` as the fourth argument:

  ```typescript
  printApplySummary(results, createErrors, updateErrors, metadataErrors, progressErrors);
  ```

  Update the `allErrors` array to include `metadataErrors`:

  ```typescript
  const allErrors = [...createErrors, ...updateErrors, ...metadataErrors, ...progressErrors];
  ```

- [ ] **Step 4: Add `─── Helpers ───` section and move `formatBook` into it**

  Currently `formatBook` sits inside the `─── Output ───` section. Move it to a new section between Types and Matching:
  1. Remove `formatBook` from the Output section.
  2. Add a new section banner before `computeResults`:

     ```typescript
     // ─── Helpers ──────────────────────────────────────────────────────────────────
     ```

  3. Place `formatBook` directly under that banner.

  The final section order in the file should be:

  ```
  // ─── Types ────────────────────────────────────────────────────────────────────
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  // ─── Matching ─────────────────────────────────────────────────────────────────
  // ─── Page count ───────────────────────────────────────────────────────────────
  // ─── Output ───────────────────────────────────────────────────────────────────
  // ─── Apply ────────────────────────────────────────────────────────────────────
  // ─── Entry point ──────────────────────────────────────────────────────────────
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```powershell
  pnpm tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 6: Dry-run the sync to verify output**

  ```powershell
  npx tsx scripts/sync-calibre.ts
  ```

  Expected: Script runs, prints `WOULD UPDATE METADATA (N)` block with at least some books listed, no TypeScript or runtime errors.

- [ ] **Step 7: Commit**

  ```powershell
  git add scripts/sync-calibre.ts
  git commit -m "feat(calibre-sync): extend output, wire applyMetadataUpdates, reorganise sections"
  ```
