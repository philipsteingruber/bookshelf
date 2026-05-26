# Calibre Sync — Metadata Enrichment Design

## Overview

Extend the existing `sync-calibre.ts` script to read three additional fields from the
Calibre `metadata.db` — ISBN, publication year, and book description — and write them to
bookshelf for both new imports and existing matched books (additive-only: only when null).

## Goals

- Sync `isbn`, `publishedYear`, and `summary` from Calibre to bookshelf
- Populate these fields during new book imports
- Backfill them on existing matched books when currently null (same additive-only rule as
  `startedAt` / `finishedAt`)
- Leave the sync script well-organised and clearly sectioned when done

## Non-Goals

- Overwriting fields already set in bookshelf (e.g. from Goodreads enrichment)
- Adding any new Prisma schema columns (all three fields already exist)
- Syncing any other Calibre metadata (tags, publisher, language, etc.)

## New Data Sources

All three fields come from `metadata.db`.

| Field           | Table / column                                      | Notes                                                                                                       |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `isbn`          | `identifiers.val` where `type='isbn13'` or `'isbn'` | ISBN-13 preferred via `COALESCE`; falls back to ISBN-10                                                     |
| `publishedYear` | `books.pubdate` (ISO string)                        | Year extracted in TypeScript; years < 100 treated as null (Calibre's "unknown" placeholder is `0101-01-01`) |
| `summary`       | `comments.text` (HTML)                              | HTML tags stripped with regex; common entities decoded before storing                                       |

## Architecture

No new files. All changes are confined to two existing files:

- `scripts/lib/calibre-sync-reader.ts` — query changes and new fields on `CalibreBookSync`
- `scripts/sync-calibre.ts` — new types, matching logic, apply function, and output

### `calibre-sync-reader.ts` changes

`CalibreBookSync` gains three fields:

```typescript
isbn: string | null;
publishedYear: number | null;
summary: string | null;
```

`CALIBRE_QUERY` gains:

```sql
COALESCE(i13.val, i10.val) AS isbn,
b.pubdate                  AS pubdate,
cm.text                    AS description,

LEFT JOIN identifiers i13 ON b.id = i13.book AND i13.type = 'isbn13'
LEFT JOIN identifiers i10 ON b.id = i10.book AND i10.type = 'isbn'
LEFT JOIN comments    cm  ON cm.book = b.id
```

The existing `GROUP BY` is extended with the new columns. `pubdate` and `description` are
processed into `publishedYear` and `summary` in the TypeScript mapping step.

### `sync-calibre.ts` changes

#### New helper — `stripHtml`

Placed in the `─── Helpers ───` section:

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
```

A regex approach is sufficient because Calibre comments are paragraph-level HTML with no
scripts, tables, or deeply nested elements.

#### New type — `MetadataUpdate`

```typescript
interface MetadataUpdate {
  calibreBook: CalibreBookSync;
  bookshelfBook: BookshelfBook;
  newIsbn: string | null;
  newPublishedYear: number | null;
  newSummary: string | null;
}
```

#### `SyncResults` extension

```typescript
metadataUpdates: MetadataUpdate[];
```

#### `BookshelfBook` extension

`isbn`, `publishedYear`, and `summary` are added to both the interface and the Prisma
`select` so `computeResults` can check what is already populated.

#### `computeResults` changes

For each matched book, after the existing status/progress logic:

```
newIsbn         = bookshelfBook.isbn          === null && calibreBook.isbn          !== null
newPublishedYear = bookshelfBook.publishedYear === null && calibreBook.publishedYear !== null
newSummary      = bookshelfBook.summary       === null && calibreBook.summary       !== null
```

If any of the three is non-null, push a `MetadataUpdate` to `results.metadataUpdates`.

#### `applyCreates` changes

The three fields are written inline in the existing `prisma.book.create` call — no
separate phase needed for imports.

#### New function — `applyMetadataUpdates`

```typescript
async function applyMetadataUpdates(metadataUpdates: MetadataUpdate[]): Promise<string[]>;
```

Same pattern as `applyBookUpdates`: loop, build a partial `data` object from non-null
fields, call `prisma.book.update`, catch per-book errors, return error strings.

#### Output changes

`printResults` gains a **WOULD UPDATE METADATA** block (between `WOULD UPDATE STATUS` and
`WOULD LOG PROGRESS`) listing each book and which fields would be written.

`printApplySummary` gains an **Updated metadata** count line.

## Script Section Structure

After this change the script sections are:

```
─── Types ──────────────────  BookshelfBook, BookUpdate, MetadataUpdate,
                               ProgressUpdate, ProgressSkip, SyncResults
─── Helpers ────────────────  stripHtml, formatBook
─── Matching ───────────────  computeResults
─── Page count ─────────────  computePageCounts
─── Output ─────────────────  printResults, printApplySummary
─── Apply ──────────────────  uploadCover, applyCreates, applyBookUpdates,
                               applyMetadataUpdates, applyProgressUpdates
─── Entry point ────────────  main
```

## Additive-Only Rule

`isbn`, `publishedYear`, and `summary` follow the same rule as `startedAt`/`finishedAt`:
only written when the bookshelf field is currently null. They are never overwritten.

## Edge Cases

- **Calibre "unknown date" placeholder** (`0101-01-01`): year < 100 → treated as null
- **ISBN absent**: both joins return null → `COALESCE` → null → field skipped
- **Empty description**: Calibre may store an empty string in `comments.text` — treat as
  null (do not overwrite a real summary with an empty string)
- **HTML stripping produces empty string**: treat as null for the same reason

## Testing

No new unit tests are required. The new logic follows the same additive-only pattern that
is already tested in `sync-utils.test.ts`. The new fields should be manually verified with
a dry-run (`--dry-run` mode) before applying.
