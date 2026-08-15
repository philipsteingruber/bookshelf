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

**Revised 2026-08-15 after an adversarial review** (Opus, run before implementation given
the size of this change) found the first draft would corrupt live data: a missing
anti-refire gate that could loop nightly, a "zero blast radius" claim that was false for
yearly stats, and a "mutually exclusive buckets" claim that was false as specified. This
revision fixes all of those; the fixes are folded directly into the sections below rather
than kept as a separate errata list.

## Goals

- Detect, from sync data alone, when a `READ` book has genuinely been restarted
- Preserve a record of prior finish dates ("times read", when each read finished)
- Let progress/status update normally for the new read-through, exactly as a first read
  would
- Provide a way to correct a false-positive detection without hand-editing the DB
- Never re-detect the same reread twice, and never fire on a book's _first_ read

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
- Preserving the _exact_ pre-reread progress value for the undo tool — only the finish
  date is kept; undo restores `progress: 100` as an approximation (see False-positive
  cleanup).
- Fixing `recommendations.ts`'s 6-month window or `book.ts`'s recently-finished query to
  account for mid-reread books whose `finishedAt` is temporarily null — accepted as a
  pre-existing style of staleness (see Known limitations), not fixed here.

## Pre-implementation validation (required before writing code)

The entire design depends on an assumption that hasn't been empirically checked: that
restarting a finished book actually clears CWA's `book_read_link.read_status` and/or ABS's
`isFinished` flag. `deriveStatus` returns `READ` whenever `readStatus === 1`, regardless of
`koboreadpct`; `deriveAbsStatus` returns `READ` whenever `isFinished` is true, regardless of
progress. If either source keeps its "finished" flag set across a restart, the detection
gate for that source can never fire — silently, not with an error.

**Before implementation starts:** restart one already-`READ` book on the Kobo and one in
Audiobookshelf, run each sync script in dry-run mode, and confirm `read_status`/`isFinished`
actually flip. If ABS doesn't clear `isFinished` on a restart, the ABS half of this design
needs to be dropped or rethought before writing any code — building it against an assumption
that's already known to be untested would just move this review to after the fact.

## Schema

Two additive columns on `Book` (one for history, one for anti-refire — see Detection
heuristic):

```prisma
previousFinishedAt DateTime[] @default([])
rereadAt            DateTime?
```

`startedAt`, `finishedAt`, `progress`, `status`, `dnfAt`, `resetAt` are unchanged in type
and meaning — they continue to describe the current/most-recent read-through, exactly as
every existing consumer (`recommendations.ts`'s `finishedAt: { gte: ... }`,
`sort-utils.ts`'s `orderBy: { finishedAt: "desc" }`, `mark-abandoned-books.ts`'s
`lastActivity` calc, dashboard display, the book router's create/update mutations) already
expects.

`previousFinishedAt` is purely additive: nothing existing reads or writes it except the new
code below and (per the fix in Missed consumers) `getYearlyBookStats`. `rereadAt` mirrors
`dnfAt`/`resetAt` exactly — same shape, same purpose: record _when_ a lowering write
happened so a stale source signal can't silently undo it.

Both sync scripts' `BookshelfBook`/`BookshelfBookForAbs` interfaces (in
`calibre-sync-results.ts`/`abs-sync-results.ts` — these are two separate interfaces with
separate names today, not one shared type; see Missed consumers) gain
`previousFinishedAt: Date[]` and `rereadAt: Date | null`, with matching `select` additions
in `sync-calibre.ts`/`sync-abs.ts`.

## Detection heuristic

**This is a separate predicate, not a branch inside `shouldUpdateStatus`.** The first draft
put reread-start detection inside `shouldUpdateStatus`, which returns a bare `boolean` — the
caller (`computeResults`) would have set `newStatus = derived` from that `true` _and_ still
pushed the book into the ordinary `bookUpdates` bucket, so the same book could land in both
`bookUpdates` and the new `rereadStarts` bucket in the same run, with both apply functions
firing. Keeping detection as its own function, called _before_ `shouldUpdateStatus` with an
explicit skip of the normal status/progress branches when it fires, is what actually makes
the two paths mutually exclusive.

```typescript
function isRereadStart(
  bookshelfBook: { status: ReadStatus; progress: number; finishedAt: Date | null },
  derived: ReadStatus,
  newProgress: number,
  sourceUpdatedAt: Date | null,
  rereadThreshold: number,
): boolean {
  return (
    bookshelfBook.status === "READ" &&
    derived === "READING" && // NOT "TO_READ" — see below
    bookshelfBook.progress >= rereadThreshold && // the PREVIOUS read must have actually finished
    bookshelfBook.finishedAt !== null &&
    sourceUpdatedAt !== null &&
    sourceUpdatedAt > bookshelfBook.finishedAt &&
    newProgress < rereadThreshold
  );
}
```

Four gates, each fixing a specific failure mode found in review:

- **`bookshelfBook.status === "READ"` and `derived === "READING"` only** — the first draft
  also admitted `derived === "TO_READ"`, which meant a source reporting flat 0% (e.g. a
  wiped/re-added source row, not a restart) would trigger reread logic and write a
  self-contradictory `TO_READ` state with a fabricated `ReadingProgress: 0` row that no
  existing path ever creates. Dropped: a `TO_READ` signal on a `READ` book is far more
  likely a stale/wiped source row than a genuine reread.
- **`bookshelfBook.progress >= rereadThreshold`** — new gate, not in the first draft. Without
  it, any book that's `READ` with low/zero recorded progress (confirmed live: 69 rows in the
  CWA db are `read_status = 1` with **no** `kobo_reading_state` at all, bulk-imported that
  way) would register a _first_ genuine read as a "reread" the moment it's actually opened.
  Requiring the previous read to have actually reached the threshold makes the drop
  meaningful.
- **`sourceUpdatedAt > finishedAt`** — the timestamp gate from the first draft, unchanged:
  rules out a stale source signal that predates the finish.
- **`newProgress < rereadThreshold`** — the threshold gate from the first draft, unchanged:
  rules out trivial drops (e.g. an edition swap nudging `100% → 98%`).

`rereadThreshold` is a `--reread-threshold` CLI flag (default `90`) threaded as a third
parameter into `computeResults`/`computeAbsResults` — there's no existing precedent for a
numeric flag on either sync script (`--reset-below` lives only on
`mark-abandoned-books.ts`), so this is new plumbing, not a reuse of an existing pattern.
Parse with an explicit `Number.isNaN` check and exit with an error on a bad value — the
similar `Number()` call in `mark-abandoned-books.ts` has no such check, and copying that
would mean a typo'd flag silently disables the entire feature instead of erroring.

`isRereadStart` is checked in `computeResults`/`computeAbsResults` before the existing
`shouldUpdateStatus`/`shouldLogProgress` calls for a given book; if it returns `true`, the
book is pushed to a new `rereadStarts` bucket and the loop `continue`s past the normal
status/progress branches for that book (metadata/rating updates are skipped too for that
iteration — harmless, the next sync run picks them up normally). `matchedIds.add` still runs
first, so the book correctly stays out of `notInCalibre`/`notInBookshelf`.

**Deduplication (new — fixes a `push` non-idempotency bug):** if two source rows resolve to
the same Bookshelf book (a Calibre duplicate — the exact case `find-fuzzy-duplicates.ts`
exists to catch — or simply a cron rerun after a partial prior failure), `computeResults`
must dedupe `rereadStarts` by `bookshelfBook.id` before returning, keeping only the first
match. Without this, `previousFinishedAt: { push: ... }` would append the same finish date
twice and `timesRead` would be permanently wrong. Combined with using `set:` (see Result
type / apply function) instead of `push:`, a rerun of the same sync also becomes a no-op
rather than a double-append.

## Anti-refire gate (new — fixes the nightly-inflation bug)

The first draft had no defense against the exact failure mode `dnfAt`/`resetAt` exist to
prevent: `applyRereadStarts` lowers status and progress and clears `dnfAt`/`resetAt`, but
recorded nothing to stop the very next sync from re-promoting the book back to `READ` off a
stale signal — and _that_ re-promotion would then satisfy `isRereadStart` again on the sync
after, appending a fresh bogus `previousFinishedAt` entry every night. Concretely: a book
matched in both CWA and ABS reads `READING` after a genuine reread-start from Calibre, but
ABS still reports `isFinished: true` (hasn't been touched) — `sync-abs.ts` sees
`current === "READING"`, `derived === "READ"`, and the ordinary `statusPriority` rule
promotes it unconditionally. Loop.

Fixed by a new case in `shouldUpdateStatus` (`scripts/lib/sync-utils.ts`), same shape as the
existing `dnfAt`/`resetAt` cases, using the new `rereadAt` column:

```typescript
// A book coming out of a just-detected reread has rereadAt set. Promoting it
// straight back to READ needs the source's own signal to be newer than the
// reread itself — otherwise a source that never actually reset (e.g. ABS
// still reporting isFinished from before the restart) would silently
// re-promote it, and the next sync would misread that as ANOTHER reread.
if (current === "READING" && derived === "READ" && rereadAt !== null) {
  return sourceUpdatedAt !== null && sourceUpdatedAt > rereadAt;
}
```

`rereadAt` is set to `new Date()` by `applyRereadStarts` at reread-start time (see below) and
left in place afterward — once a genuine post-reread completion does clear this gate (a
newer, real finish signal), the completion write also sets `rereadAt: null`, matching how a
completed cycle returns the book to the same "steady `READ` state" it was in before the
reread. Leaving it set between those two points is safe: the gate only ever requires a
_newer_ timestamp, which any genuine subsequent progress signal naturally has.

This is a `shouldUpdateStatus` change, separate from `isRereadStart` — it governs
_completing_ a reread, not detecting its _start_.

## Result type / apply function

New interface, alongside `BookUpdate`/`ProgressUpdate` in `calibre-sync-results.ts`, and the
equivalent `AbsStatusUpdate`/`AbsProgressUpdate` shape in `abs-sync-results.ts` (these two
files have independent, non-shared type names today — `SyncResults`/`BookUpdate` on the
Calibre side, `AbsSyncResults`/`AbsStatusUpdate`/`AbsProgressUpdate` with a `statusUpdates`
bucket on the ABS side; both need their own `RereadStart`-equivalent):

```typescript
interface RereadStart {
  calibreBook: CalibreBookSync; // or AbsBookSync in abs-sync-results.ts
  bookshelfBook: BookshelfBook; // or BookshelfBookForAbs
  newProgress: number;
  newStartedAt: Date | null;
}
```

(`newStatus` is dropped from the first draft's shape — `isRereadStart` only ever admits
`derived === "READING"`, so it was always `"READING"` in practice; keeping a field that can
only hold one value was misleading.)

New `SyncResults.rereadStarts: RereadStart[]` (and the ABS-side equivalent).

New apply function in each sync script:

```typescript
async function applyRereadStarts(rereadStarts: RereadStart[], userId: string): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newProgress, newStartedAt } of rereadStarts) {
    try {
      const previousFinishedAt = [...bookshelfBook.previousFinishedAt, bookshelfBook.finishedAt!]; // non-null: gated on status === "READ"
      await prisma.$transaction(async (tx) => {
        await tx.book.update({
          where: { id: bookshelfBook.id },
          data: {
            previousFinishedAt: { set: previousFinishedAt }, // set, not push — makes a rerun a no-op given the dedup above
            status: "READING",
            progress: newProgress,
            startedAt: newStartedAt ?? new Date(),
            finishedAt: null,
            dnfAt: null,
            resetAt: null,
            rereadAt: new Date(), // anti-refire gate — see above
          },
        });
        await tx.readingProgress.create({
          data: { userId, bookId: bookshelfBook.id, progress: newProgress },
        });
      });
      const timesRead = computeTimesRead({ previousFinishedAt, finishedAt: null });
      console.log(`REREAD_DETECTED: "${bookshelfBook.title}" (id ${bookshelfBook.id}, read count now ${timesRead})`);
    } catch (err) {
      errors.push(`Failed to log reread for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
    }
  }
  return errors;
}
```

`computeTimesRead` (Times Read section below) is imported from `book-utils.ts`.

After this write, the book behaves like a first read in progress, with one exception: the
`rereadAt`-gated completion check above governs its eventual return to `READ`. Everything
else (progress climbing further, metadata/rating updates resuming) flows through the
existing unmodified logic.

**Required plumbing this touches, not previously called out:**

- `printResults` in both scripts needs a **WOULD START REREAD** section — as specified, the
  most destructive write either script makes would otherwise be invisible in dry-run output.
- `printApplySummary` needs a "Started rereads" count line.
- The `recalculateAllUserStats`-triggering guard (`sync-calibre.ts`/`sync-abs.ts`, currently
  `progressUpdates.length > 0 || createdProgressLogged > 0`) must include
  `rereadStarts.length > 0` — `applyRereadStarts` creates `ReadingProgress` rows too.
- `rereadErrors` must be joined into each script's `allErrors` for the exit code.

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

Checked against further edge cases in review, no changes needed:

- **Mid-reread abandoned by `mark-abandoned-books.ts`** (status → `DNF`, `dnfAt` set,
  `finishedAt` stays null): `timesRead` stays at the correct count of completed reads: the
  abandoned attempt isn't counted, matching how a first read's DNF isn't counted either.
- **Mid-reread hit by `--reset-below`**: count stays correct (`previousFinishedAt`
  untouched), but note `mark-abandoned-books.ts`'s reset transaction does
  `readingProgress.deleteMany({ where: { bookId } })` — **all** progress rows for the book,
  including the original read's full history, not just the stalled reread's. This is
  pre-existing behavior, not introduced here, but rereads make it materially more likely to
  bite (a book with real history now has a second, more easily wiped, low-progress attempt
  layered on top). Not fixed in this change — noted as a known limitation.
- **`status: READ` with `finishedAt: null`**, reachable via CSV import setting the two
  independently: undercounts by one. Pre-existing import data-quality issue, not introduced
  or worsened here.

Displayed on the book detail page (`books/[bookId]/page.tsx`) alongside the existing finish
date, e.g. "Read 2 times, most recently finished ...". No `select` change is needed there —
`book.getBook` already uses `include: SERIES_INCLUDE` with no `select`, so the new column
flows through automatically (the first draft incorrectly claimed a `select` change was
needed here; the `select`s that actually need updating are the sync scripts', per Schema
above, plus `getYearlyBookStats` per the fix below).

## Missed consumers (fixes a false "zero blast radius" claim)

The first draft's claim that this change has zero effect on existing consumers was wrong for
one real case, found by searching the codebase directly rather than trusting the spec's own
list:

**Yearly reading stats and reading-goal progress** (`src/lib/reading/reading-stats-utils.ts`'s
`calculateYearlyStats`, fed by `src/trpc/routers/user.ts`'s `getYearlyBookStats` which
queries `where: { finishedAt: { not: null } }`, in turn feeding the reading-goal hook) key
entirely off the scalar `finishedAt`. Without a fix: while a book is mid-reread, it
disappears from its original finish year's count and from that year's goal progress; once
the reread completes, the _original_ finish silently migrates to the _new_ finish's year,
permanently. This is a real, user-visible data corruption, not a cosmetic gap, so it's in
scope for this change:

- `getYearlyBookStats`'s query must also select `previousFinishedAt`.
- `calculateYearlyStats` must count every entry in `previousFinishedAt`, not just the scalar
  `finishedAt`, crediting `pageCount` per finish the same way it currently does for the
  scalar value. The `book is Book & { finishedAt: Date; pageCount: number }` type predicate
  needs updating to account for a book contributing via `previousFinishedAt` while its
  scalar `finishedAt` is null.

**Known, accepted limitation (not fixed here):** `recommendations.ts`'s 6-month
recently-finished window and `book.ts`'s 2-week recently-finished query both still key off
the scalar `finishedAt` and will drop a book while it's mid-reread. Both are relatively
short, soft-touch windows (taste-matching input, a "recently finished" UI list) rather than
a permanent, silently-corrupted count like the yearly stats case above — accepted as-is
rather than bundled into this change.

**Export/import** (`src/lib/export/export-utils.ts`'s hardcoded column list;
`src/lib/schemas/import.ts`, `import-csv.ts`, `import-json.ts`): `previousFinishedAt` must be
added to all four, or a backup/restore round-trip silently drops every book's reread
history. Given the project's existing backup conventions, this is added rather than
excluded.

**Test/seed factories:** `src/lib/test-utils.ts`'s book factory and
`scripts/seed-dev-user.ts` both need `previousFinishedAt: []` added, or every test/dev-seed
consumer of those factories breaks once the column exists and is selected.

## False-positive cleanup

New unscheduled script, `scripts/manage-reread.ts` — same tier as `find-fuzzy-duplicates.ts`
(manual tool, not committed to cron, not run automatically):

- `--list <bookId>` — print `previousFinishedAt`, `rereadAt`, and current
  `status`/`progress`/`finishedAt`
- `--undo-last <bookId>` — pop the most recent `previousFinishedAt` entry back into
  `finishedAt`, restore `status: READ`, set `progress: 100` (an **approximation**, not an
  exact restore — the pre-reread progress value isn't preserved anywhere by design, only the
  finish date is; `isRereadStart`'s threshold gate means the real value was at least
  `rereadThreshold`, so `100` is close), clear `dnfAt`/`resetAt`/`rereadAt` back to `null`,
  and delete every `ReadingProgress` row created since the popped timestamp (mirrors the
  exact manual cleanup already done in the 2026-08-08 duplicate-progress incident), then
  rerun `recalculateAllUserStats()` since the deleted rows affect cached streak/total figures
- Both subcommands log the book's `id` alongside its title, since `--list`/`--undo-last` are
  keyed by id

## Interaction with existing DNF/reset gates

`shouldUpdateStatus` already special-cases `current === "DNF"` and
`current === "TO_READ" && resetAt !== null`. The new `rereadAt`-gated
`current === "READING" && derived === "READ"` case (Anti-refire gate, above) is a third,
independent branch — `current` selects at most one of `DNF`/`TO_READ`/`READING` at a time,
so there's no overlap between the three. Reread _start_ detection (`isRereadStart`) is
separate again, evaluated before any of these, and only ever triggers from
`current === "READ"` — disjoint from all three `shouldUpdateStatus` special cases, which all
require `current` to be something else.

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

- `sync-utils.test.ts` — new tests for `isRereadStart`: fires only when all four gates pass
  (status, prior-progress, timestamp, threshold); does **not** fire when the previous read
  never reached the threshold (the 69-row bulk-import case); does **not** fire on a stale
  timestamp. New tests for the `rereadAt` anti-refire gate in `shouldUpdateStatus`: does
  **not** re-promote `READING → READ` off a stale/pre-existing signal when `rereadAt` is set
  and `sourceUpdatedAt <= rereadAt`; does not affect ordinary `READING → READ` promotion when
  `rereadAt` is null.
- **The single most important new test, the direct regression test for the nightly-inflation
  bug found in review:** simulate two consecutive sync runs after a reread start (one
  Calibre, one ABS, or two runs of the same script) and assert `previousFinishedAt` gains
  exactly one entry, not one per run.
- `calibre-sync-results.test.ts` / `abs-sync-results.test.ts` — new "detects and routes a
  reread to `rereadStarts`, and the same book is absent from both `bookUpdates`/`statusUpdates`
  and `progressUpdates` in the same run" test (explicitly asserting absence from both, not
  just presence in the new bucket); a "two source rows matching the same Bookshelf book
  produce exactly one `rereadStarts` entry" dedup test; existing "promotes an unreset TO_READ
  book unconditionally" non-regression tests are unaffected and must still pass unchanged.
- `book-utils.test.ts` (new file — no such file exists yet in `src/lib/book/`, unlike the
  first draft implied) — `computeTimesRead`, covering the mid-reread case (non-empty
  `previousFinishedAt`, null `finishedAt`) and the edge cases listed under Times Read above.
- `reading-stats-utils.test.ts` — new test asserting a twice-read book (one finish in each of
  two different years) is counted in _both_ years' stats, not just the current
  `finishedAt`'s year.
- **Known coverage gap, acknowledged rather than closed here:** no apply-function tests exist
  today for any script (`applyBookUpdates`, `applyProgressUpdates`, etc. are all untested;
  only the pure `computeResults`/`computeAbsResults` functions are). `applyRereadStarts`'s
  transaction ordering and the `set`-not-`push` behavior are therefore only validated
  indirectly through the pure-function tests above, consistent with the rest of the codebase,
  but worth naming as a pre-existing gap this change doesn't close.

## Migration note

`DateTime[] @default([])` and a nullable `DateTime?` both push cleanly to existing rows via
`prisma db push` (this project's standing convention — no migrations directory). Worth
calling out explicitly since `previousFinishedAt` is the first array column on `Book`.
