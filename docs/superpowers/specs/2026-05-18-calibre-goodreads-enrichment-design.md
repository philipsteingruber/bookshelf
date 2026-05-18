# Calibre Goodreads URL Enrichment Script — Design

## Overview

A one-off script that reads Goodreads identifiers from a local Calibre library and backfills
the `goodreadsUrl` field on matching bookshelf books. This is a prerequisite for a future
Calibre sync script, which will use `goodreadsUrl` as its primary deduplication key.

## Goals

- Populate `goodreadsUrl` on existing bookshelf books that have a matching Goodreads identifier
  in Calibre
- Surface which Calibre books have no Goodreads identifier (so they can be manually enriched)
- Surface which Calibre books are not yet in the bookshelf (useful context for the future sync)
- Never write anything without explicit opt-in via `--apply`

## Non-Goals

- Syncing reading progress or status (separate future script)
- Importing books that don't already exist in the bookshelf
- Modifying any bookshelf field other than `goodreadsUrl`

## Architecture

Single TypeScript script at `scripts/enrich-goodreads-url.ts`.

**Run with:**

```bash
npx tsx scripts/enrich-goodreads-url.ts [--apply] [--calibre-db <path>]
```

- Omitting `--apply` always produces a dry-run — no writes occur
- `--calibre-db` defaults to `E:\Calibre Library\metadata.db`
- Reads Calibre via `better-sqlite3` (new dev dependency, synchronous, read-only)
- Writes to Prisma Postgres using the existing Prisma client and `DATABASE_URL` from `.env`
- `tsx` is already available in the project

## Matching Logic

### Normalization

Two pure functions applied to both Calibre and bookshelf data before comparison:

- `normalizeTitle(title)`: lowercase → trim → strip leading `the`, `a`, `an` (case-insensitive)
- `normalizeAuthor(author)`: lowercase → trim

### Composite Key

For each Calibre book that has a `goodreads` identifier in the `identifiers` table:

- **With series:** `normalizeTitle(title)|normalizeAuthor(author)|lowercase(seriesName)|seriesIndex`
- **Without series:** `normalizeTitle(title)|normalizeAuthor(author)`

The same key is computed for every bookshelf book. Calibre's `series_index` is a float; the
bookshelf's `seriesIndex` is also a float — raw float equality is used (e.g. `1.0 === 1.0`).

### Match Outcomes

| Outcome                                       | Action                                  |
| --------------------------------------------- | --------------------------------------- |
| Exactly one match, no existing `goodreadsUrl` | Candidate for update                    |
| Exactly one match, already has `goodreadsUrl` | Skip — already enriched                 |
| No match                                      | Flag in "NOT FOUND IN BOOKSHELF" output |
| Multiple matches (ambiguous key)              | Warn with both titles, skip both        |

## Output Format

```
=== Goodreads URL Enrichment — DRY RUN ===

WOULD UPDATE (32)
  • All Systems Red — Martha Wells [The Murderbot Diaries #1]
    → https://www.goodreads.com/book/show/32758901

ALREADY ENRICHED — SKIP (1)
  • Anarch — Dan Abnett [Gaunt's Ghosts #15]

NOT FOUND IN BOOKSHELF (12)
  • Some Calibre Book — Some Author [Some Series #3]

NO GOODREADS ID IN CALIBRE (8)
  • Some Other Book — Some Author

=== Summary ===
Would update:          32
Already enriched:       1
Not in bookshelf:      12
No Goodreads ID:        8

Run with --apply to write changes.
```

When `--apply` is passed, "WOULD UPDATE" becomes "UPDATED" and the summary reflects actual
writes. All other sections remain identical for easy comparison between runs.

## Error Handling

**Fatal (exit immediately):**

- Calibre DB path does not exist or is not readable
- `DATABASE_URL` not set in environment
- Prisma client fails to connect

**Per-book warnings (log and continue):**

- Multiple bookshelf books resolve to the same composite key — warn with both titles, skip both
- DB write failure on a specific book during `--apply` — log the error, continue, report all
  failures in the summary

**Nothing is silently skipped.** Every Calibre book appears in exactly one output section.

## Testing

The normalization functions are pure and are the most likely source of silent match failures.
They are extracted into a separate module and unit-tested.

Cases to cover:

- Strips leading `the`, `a`, `an` (case-insensitive variations)
- Lowercases and trims whitespace
- Titles starting with a number are unaffected
- Series names with apostrophes (e.g. `Gaunt's Ghosts`) are handled correctly
- Author names are only lowercased and trimmed — no article stripping

The matching logic end-to-end is verified manually via dry-run output before `--apply` is used.
The DB write path is a single Prisma `update` per matched book and does not require automated
testing.

## New Dependencies

- `better-sqlite3` — synchronous SQLite driver for reading Calibre's `metadata.db`
- `@types/better-sqlite3` — TypeScript types (dev dependency)
