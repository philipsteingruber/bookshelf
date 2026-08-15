# Book Reread Support Design

## Overview

Today `Book` is a single-instance model — one `status`, one `progress`, one
`startedAt`/`finishedAt`, ever. Once a book reaches `READ`/`progress: 100`, both
`shouldUpdateStatus`'s priority ratchet and `shouldLogProgress`'s strict `>` comparison
permanently block any lower value from a sync source, so restarting a finished book on
Kobo/ABS is completely invisible to Bookshelf: status stays `READ`, progress stays `100`,
no new `ReadingProgress` rows are ever logged, no matter how far into the reread you get.

This design lets a `READ` book start a fresh read-through, detected automatically from
CWA/ABS sync data (the UI is effectively readonly today — sync is the only realistic
trigger), while keeping the blast radius on the existing 15+ consumers of
`startedAt`/`finishedAt` at zero.

## Goals

- Detect, from sync data alone, when a `READ` book has genuinely been restarted
- Preserve a record of prior finish dates ("times read", when each read finished)
- Let progress/status update normally for the new read-through, exactly as a first read
  would
- Provide a way to correct a false-positive detection without hand-editing the DB

## Non-Goals

- Per-attempt progress curves or per-attempt ratings — `ReadingProgress` stays a single
  flat log per book, not scoped to an attempt. Confirmed acceptable: history granularity
  finer than "count + finish dates" isn't needed.
- `previousStartedAt` — only finish dates are tracked historically, not start dates.
- A manual "Read Again" UI action — sync is the only real update path in practice, so this
  isn't the primary trigger and isn't being built.
- Changing `recommendations.ts` to treat a reread as a positive taste signal — a real,
  separate follow-on idea, not bundled into this change.
- Converting `startedAt`/`finishedAt` to array columns — considered and rejected (see
  Alternatives Considered).

## Schema

One additive column on `Book`:

```prisma
previousFinishedAt DateTime[] @default([])
```

`startedAt`, `finishedAt`, `progress`, `status`, `dnfAt`, `resetAt` are unchanged in type
and meaning — they continue to describe the current/most-recent read-through, exactly as
every existing consumer (`recommendations.ts`'s `finishedAt: { gte: ... }`,
`sort-utils.ts`'s `orderBy: { finishedAt: "desc" }`, `reading-stats-utils.ts`,
`mark-abandoned-books.ts`'s `lastActivity` calc, dashboard display, CSV/JSON
import-export, the book router's create/update mutations) already expects.

`previousFinishedAt` is purely additive: nothing existing reads or writes it. Only the new
reread-detection code (below) and the new "times read" display consume it.

`BookshelfBook` (the interface each sync script selects from Prisma, in
`calibre-sync-results.ts`/`abs-sync-results.ts`) gains a `previousFinishedAt: Date[]` field
and matching `select`, alongside the existing `dnfAt`/`resetAt` fields it already carries.

## Detection heuristic

New case added to `shouldUpdateStatus` (`scripts/lib/sync-utils.ts`), same shape as the
existing `dnfAt`/`resetAt` special cases — a reread start is recognized when **all** of:

```
current === "READ"
  && (derived === "TO_READ" || derived === "READING")
  && book.finishedAt !== null && sourceUpdatedAt !== null && sourceUpdatedAt > book.finishedAt
  && newProgress < REREAD_THRESHOLD
```

- The timestamp gate (`sourceUpdatedAt > finishedAt`) is the same shape that already fixed
  two prior incidents (the 2026-07-06 DNF false-clear, the 2026-08-12 reset-below
  false-promotion) — it rules out a stale source signal that predates the finish, not a
  genuine restart.
- The threshold gate (`newProgress < REREAD_THRESHOLD`) exists because the timestamp gate
  alone doesn't rule out _trivial_ drops — e.g. an edition swap in Calibre recalculating
  page count and nudging `100% → 98%` isn't a reread. `REREAD_THRESHOLD` is a
  `--reread-threshold` CLI flag on both sync scripts (default `90`), same pattern as the
  existing `--reset-below` flag — tunable, not hardcoded.

This is evaluated in `computeResults`/`computeAbsResults` **before** the existing
`shouldUpdateStatus`/`shouldLogProgress` checks for a given book. If it fires, the book is
routed to a new `rereadStarts` result bucket instead of the normal `bookUpdates` /
`progressUpdates` buckets — the two paths are mutually exclusive per book per sync run, so
there's no risk of double-applying.

## Result type / apply function

New interface, alongside `BookUpdate`/`ProgressUpdate` in
`calibre-sync-results.ts`/`abs-sync-results.ts`:

```typescript
interface RereadStart {
  calibreBook: CalibreBookSync; // or AbsBookSync in abs-sync-results.ts
  bookshelfBook: BookshelfBook;
  newProgress: number;
  newStatus: ReadStatus; // READING in the overwhelming majority of cases
  newStartedAt: Date | null;
}
```

New `SyncResults.rereadStarts: RereadStart[]`.

New apply function in each sync script, mirroring `applyProgressUpdates`'s existing
transaction shape:

```typescript
async function applyRereadStarts(rereadStarts: RereadStart[], userId: string): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newProgress, newStatus, newStartedAt } of rereadStarts) {
    try {
      const previousFinishedAt = [...bookshelfBook.previousFinishedAt, bookshelfBook.finishedAt!]; // non-null: gated on current === "READ"
      await prisma.$transaction(async (tx) => {
        await tx.book.update({
          where: { id: bookshelfBook.id },
          data: {
            previousFinishedAt: { push: bookshelfBook.finishedAt! },
            status: newStatus,
            progress: newProgress,
            startedAt: newStartedAt ?? new Date(),
            finishedAt: newStatus === "READ" ? new Date() : null,
            dnfAt: null,
            resetAt: null,
          },
        });
        await tx.readingProgress.create({
          data: { userId, bookId: bookshelfBook.id, progress: newProgress },
        });
      });
      const timesRead = computeTimesRead({ previousFinishedAt, finishedAt: newStatus === "READ" ? new Date() : null });
      console.log(`REREAD_DETECTED: "${bookshelfBook.title}" (read count now ${timesRead})`);
    } catch (err) {
      errors.push(`Failed to log reread for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
    }
  }
  return errors;
}
```

The `REREAD_DETECTED` log line is deliberately more visible than a routine progress-update
line — this is a status/progress _reset_, not an increment — and feeds
`book-pipeline-log-check` the same way other sync events already do. `computeTimesRead`
(defined in the Times Read section below) is imported from `book-utils.ts` for this line.

After this write, the book behaves exactly like a first read in progress: subsequent syncs
flow through the existing unmodified `shouldUpdateStatus`/`shouldLogProgress` logic with no
further special-casing needed.

## Times read

New helper in `book-utils.ts`:

```typescript
function computeTimesRead(book: { previousFinishedAt: Date[]; finishedAt: Date | null }): number {
  return book.previousFinishedAt.length + (book.finishedAt !== null ? 1 : 0);
}
```

The `+ (finishedAt !== null ? 1 : 0)` guard matters: a book that's _currently_ mid-reread
has a null `finishedAt` (reset by `applyRereadStarts` above) even though
`previousFinishedAt` already holds one prior completion — counting
`previousFinishedAt.length + 1` unconditionally would overcount an unfinished second
read-through as two completed reads.

Displayed on the book detail page (`books/[bookId]/page.tsx`) alongside the existing finish
date, e.g. "Read 2 times, most recently finished ...". Requires adding
`previousFinishedAt` to that page's book query `select`.

## False-positive cleanup

New unscheduled script, `scripts/manage-reread.ts` — same tier as `find-fuzzy-duplicates.ts`
(manual tool, not committed to cron, not run automatically):

- `--list <bookId>` — print `previousFinishedAt` plus current `status`/`progress`/`finishedAt`
- `--undo-last <bookId>` — pop the most recent `previousFinishedAt` entry back into
  `finishedAt`, restore `status: READ` / `progress: 100`, and delete every `ReadingProgress`
  row created since that popped timestamp (mirrors the exact manual cleanup already done in
  the 2026-08-08 duplicate-progress incident), then rerun `recalculateAllUserStats()` since
  the deleted rows affect cached streak/total figures

## Interaction with existing DNF/reset gates

`shouldUpdateStatus` already special-cases `current === "DNF"` and
`current === "TO_READ" && resetAt !== null`. The new `current === "READ"` reread case is a
third, mutually exclusive branch — `current` can only be one status at a time, so there's no
overlap between the three special cases. Reread _completion_ (back to `READ` again) needs no
new logic: `statusPriority(READ) > statusPriority(READING)` already permits that transition
under the existing unconditional rule.

## Alternatives considered

**Converting `startedAt`/`finishedAt` to `DateTime[]` directly**, rather than adding a
separate `previousFinishedAt`. Initially looked simpler (no new column), but rejected after
checking actual usage: Prisma's scalar-list filtering has no `gte`/`orderBy` support through
the typed API (only `has`/`hasSome`/`isEmpty`/`equals`), and `finishedAt` is used in range
and sort queries in at least three places (`recommendations.ts`'s
`finishedAt: { gte: subMonths(...) }`, `sort-utils.ts`'s `orderBy: { finishedAt: "desc" }`,
`user.ts`'s `finishedAt: { not: null }`) plus `reading-stats-utils.ts`'s per-year grouping.
Converting the column would mean rewriting those as raw SQL, not just a type change — a
larger blast radius than the additive-column approach, for the same feature.

**A full `ReadThrough` table** (one row per attempt, own status/progress/dates/rating,
`Book` kept as a denormalized cache — the same shape as the `Author`/`BookAuthor`
migration). Gives per-attempt progress curves and ratings, but that granularity was
confirmed not needed. Rejected in favor of the much smaller additive-column approach.

## Testing

- `sync-utils.test.ts` — new tests for the reread-start branch of `shouldUpdateStatus`:
  fires only when all three gates pass (status, timestamp, threshold); does not fire on a
  trivial drop above the threshold; does not fire on a stale timestamp
- `calibre-sync-results.test.ts` / `abs-sync-results.test.ts` — new "detects and routes a
  reread to rereadStarts, not bookUpdates/progressUpdates" test, alongside the existing
  "promotes an unreset TO_READ book unconditionally" non-regression tests
- `book-utils.test.ts` — `computeTimesRead`, specifically covering the mid-reread case
  (non-empty `previousFinishedAt`, null `finishedAt`) to pin down the counting fix
