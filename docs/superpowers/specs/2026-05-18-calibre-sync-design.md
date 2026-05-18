# Calibre Sync Script — Design

## Overview

A daily scheduled script that reads reading state from a local Calibre library and CWA instance
and syncs it into the bookshelf database. Runs unattended as a Windows Task Scheduler job.
Stops the CWA Docker container before touching any SQLite files and always restarts it,
even on failure.

## Goals

- Sync reading status (`TO_READ` / `READING` / `READ` / `DNF`) from Calibre/CWA to bookshelf
- Sync reading progress percentage from Kobo sync data (`koboreadpct`)
- Sync `startedAt` and `finishedAt` dates from Calibre custom columns
- Import Calibre books that do not yet exist in bookshelf (with cover upload)
- Never downgrade a book's status (take the higher value)
- Dry-run by default; writes only with `--apply`

## Non-Goals

- Syncing page count (user enters manually in bookshelf)
- Syncing ratings or reviews
- Syncing in the reverse direction (bookshelf → Calibre)
- Modifying any bookshelf book that has no matching Calibre entry

## Architecture

Two files:

- `scripts/sync-calibre.ts` — entry point, container lifecycle, matching, output, writes
- `scripts/lib/calibre-sync-reader.ts` — reads all sync data from both SQLite databases

**Run with:**

```bash
npx tsx scripts/sync-calibre.ts [--apply] [--calibre-db <path>] [--cwa-db <path>]
```

Defaults:

- `--calibre-db`: `E:\Calibre Library\metadata.db`
- `--cwa-db`: `E:\cwa\config\app.db`

## Container Lifecycle

The script stops the CWA Docker container before any SQLite reads and restarts it in a
`finally` block, so the container is always restored regardless of success or failure.

```
docker stop calibre-web-automated   ← fatal if this fails (exit 1, container not stopped)
try {
  ... all DB reads and sync logic ...
} finally {
  docker start calibre-web-automated  ← always runs; logs error if it fails but does not
}                                       change the script's exit code
```

`docker stop` and `docker start` are called via `child_process.execSync` (synchronous) to
guarantee the container is stopped before DB reads begin.

## Data Sources

### CWA `app.db` — `book_read_link`

| Column                      | Type     | Meaning                           |
| --------------------------- | -------- | --------------------------------- |
| `book_id`                   | INTEGER  | Calibre book ID                   |
| `read_status`               | INTEGER  | 0=unread, 1=read, 2=reading       |
| `last_modified`             | DATETIME | When the status was last changed  |
| `last_time_started_reading` | DATETIME | When reading started (often null) |

### Calibre `metadata.db` — custom columns

| Column table       | Label          | Type     | Meaning                      |
| ------------------ | -------------- | -------- | ---------------------------- |
| `custom_column_3`  | `koboreadpct`  | INT      | Kobo read percentage (0–100) |
| `custom_column_5`  | `kobolastread` | DATETIME | Last Kobo sync timestamp     |
| `custom_column_23` | `datestarted`  | DATETIME | When reading started         |
| `custom_column_29` | `dnf`          | BOOL     | Did-not-finish flag          |

### Calibre `metadata.db` — other tables

- `books`: title, path (for cover location), has_cover
- `authors` + `books_authors_link`: author name (`MIN(name)` for multi-author)
- `series` + `books_series_link`: series name
- `identifiers`: Goodreads ID (`type='goodreads'`)

## Matching

Primary key: `goodreadsUrl`. All 337 Calibre books have Goodreads identifiers. The
enrichment script from the previous step populated `goodreadsUrl` on existing bookshelf books.

A Calibre book is matched to a bookshelf book when:

```
'https://www.goodreads.com/book/show/' + calibre.goodreadsId === bookshelf.goodreadsUrl
```

Books in Calibre with no bookshelf match are candidates for import.
Books in bookshelf with no Calibre match are reported as "not in Calibre" but not touched.

## Status Mapping

Calibre/CWA signals are combined into a single derived status, then compared against the
current bookshelf status using a priority order to prevent downgrades.

**Derived status from Calibre/CWA:**

| Signals                                    | Derived status |
| ------------------------------------------ | -------------- |
| `dnf=1`                                    | `DNF`          |
| `read_status=1` OR `koboreadpct=100`       | `READ`         |
| `read_status=2` OR `0 < koboreadpct < 100` | `READING`      |
| Everything else                            | `TO_READ`      |

**Priority order (high → low):** `DNF` = `READ` > `READING` > `READ_NEXT` > `TO_READ`

The script only writes a new status if the derived status has a higher or equal priority than
the current bookshelf status. A `READ` book in bookshelf is never changed to `READING`.

`READ_NEXT` is a bookshelf-only status with no Calibre equivalent. It is treated as higher
priority than `TO_READ` but lower than `READING` — a book in `READ_NEXT` in bookshelf that
Calibre also shows as `TO_READ` is left unchanged.

## Progress Sync

Source: `koboreadpct` (integer 0–100, populated by Kobo device sync via Calibre plugin).

A `ReadingProgress` entry is created when `koboreadpct > Book.progress`. The entry uses:

- `progress`: `koboreadpct`
- `createdAt`: `kobolastread` (when the Kobo synced, not when the script runs)

If `koboreadpct <= Book.progress`, no entry is created. This is logged as
`SKIPPED — NO PROGRESS INCREASE`.

After all progress writes, `recalculateAllUserStats` is called once for the bookshelf user.

## Timestamps

- `startedAt`: set from `datestarted` (Calibre custom column). Only written if
  `Book.startedAt` is currently null.
- `finishedAt`: set from `kobolastread` for books whose derived status is `READ`. Only
  written if `Book.finishedAt` is currently null.

Neither field is ever overwritten if already set — the sync is additive only.

## New Book Imports

When a Calibre book has no bookshelf match, the script creates a new `Book` record:

| Field          | Source                                                     |
| -------------- | ---------------------------------------------------------- |
| `title`        | `books.title`                                              |
| `titleSort`    | `createTitleSort(title)` (existing bookshelf helper)       |
| `author`       | `MIN(authors.name)` via `books_authors_link`               |
| `authorSort`   | `createAuthorSort(author)`                                 |
| `seriesId`     | Upsert via `upsertSeries()` (existing helper), or null     |
| `seriesIndex`  | `books.series_index`, or null if no series                 |
| `goodreadsUrl` | `'https://www.goodreads.com/book/show/' + identifiers.val` |
| `coverUrl`     | Uploaded to UploadThing from local file (see below)        |
| `status`       | Derived status (see Status Mapping)                        |
| `progress`     | `koboreadpct`, or 0                                        |
| `startedAt`    | `datestarted`, or null                                     |
| `finishedAt`   | `kobolastread` if READ, else null                          |
| `userId`       | The bookshelf user's ID                                    |

**Cover upload:** If `books.has_cover = 1`, the cover is read from
`E:\Calibre Library\{books.path}\cover.jpg`, wrapped in a Node.js `File` object, and
uploaded via `UTApi.uploadFiles`. If the upload fails, the book is still created with
`coverUrl = null` and the failure is logged.

## User Resolution

The script targets a single bookshelf user. It accepts an optional `--user-email` flag.
If omitted, it calls `prisma.user.findFirst()` and uses that user. If no user exists, the
script exits with an error.

## Output Format

```
=== Calibre Sync — DRY RUN ===

WOULD CREATE (12)
  • Ravenor — Dan Abnett [Ravenor #1]
    Status: READING (42%) | Started: 2026-01-15

WOULD UPDATE STATUS (8)
  • All Systems Red — Martha Wells
    TO_READ → READ | Finished: 2026-05-10

WOULD LOG PROGRESS (5)
  • Dark Imperium — Guy Haley
    35% → 41% (kobolastread: 2026-05-17)

SKIPPED — NO PROGRESS INCREASE (3)
  • Ravenor — Dan Abnett
    Already at 50%, Calibre reports 50%

NOT IN CALIBRE (180)
  (count only — no per-book listing, too noisy)

=== Summary ===
Would create:              12
Would update status:        8
Would log progress:         5
Skipped (no change):        3
Not in Calibre:           180
```

When `--apply` is passed, labels change to past tense ("CREATED", "UPDATED STATUS", etc.)
and the summary reflects actual writes.

## Error Handling

**Fatal (exit immediately):**

- `docker stop` fails (container may still be running — do not read SQLite)
- Either SQLite database cannot be opened
- `DATABASE_URL` not set
- No bookshelf user found

**Per-book warnings (log and continue):**

- Cover upload fails — create book without cover, log warning
- Prisma write fails for a specific book — log error, continue, report failures in summary

**Always:**

- `docker start` runs in `finally`, regardless of what happened above
- If `docker start` fails, log the error but do not change the script's exit code (the
  sync may have succeeded — the container restart failure is reported separately)

**Exit codes:**

- `0`: completed (even if some per-book writes failed — check the summary)
- `1`: fatal error before sync started, or `docker stop` failed

## Testing

The pure data-transformation logic (status derivation, progress comparison) is extracted into
testable functions and unit-tested. The container lifecycle and DB I/O are not unit-tested.

Cases to cover:

- Status derivation from all signal combinations
- "Take higher value" — existing bookshelf statuses that should not be downgraded
- Progress comparison — skipped vs. written
- Timestamp assignment — only written when null
