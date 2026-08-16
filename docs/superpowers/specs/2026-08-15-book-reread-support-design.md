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

**Revision history:** this spec has been through two adversarial reviews (Opus, run before
implementation given the size of this change) rather than one. The first found the initial
draft would corrupt live data outright (missing anti-refire gate, a false "zero blast
radius" claim, a false "mutually exclusive buckets" claim) — those fixes are folded into
the sections below. The second, run fresh against the revised spec alone, found the
revision's own headline fix (`getYearlyBookStats`) still didn't work, and — more
fundamentally — that `applyRereadStarts` breaks a monotonic-progress invariant every
page/streak stat in the app depends on. That finding is significant enough that it's called
out as its own section rather than folded in silently: see **Progress-history invariant**,
below. A follow-up question after both reviews ("does all-time page total get the same
reread credit as the yearly total?") surfaced a third gap neither review caught: the
disclosed "all-time doesn't credit rereads" limitation wasn't just a gap, it was an
inconsistency — yearly totals could exceed the all-time total once rereads existed. That's
now fixed too (Progress-history invariant, part 3), rather than left as disclosed debt.

## Goals

- Detect, from sync data alone, when a `READ` book has genuinely been restarted
- Preserve a record of prior finish dates ("times read", when each read finished)
- Let progress/status update normally for the new read-through, exactly as a first read
  would
- Provide a way to correct a false-positive detection without hand-editing the DB
- Never re-detect the same reread twice, and never fire on a book's _first_ read
- Never corrupt the existing streak/page-count stats, even though a reread necessarily
  introduces a downward progress transition those stats were never designed to see

## Non-Goals

- Per-attempt progress curves or per-attempt ratings — `ReadingProgress` stays a single
  flat log per book, not scoped to an attempt. Confirmed acceptable: history granularity
  finer than "count + finish dates" isn't needed. (This was re-examined after the second
  review raised the monotonic-progress problem below, and re-confirmed: the chosen fix is
  contained to `reading-stats-utils.ts`, not a schema change.)
- `previousStartedAt` — only finish dates are tracked historically, not start dates.
  Accepted with a known consequence: `--undo-last` cannot restore the original read's
  `startedAt` (see False-positive cleanup).
- A manual "Read Again" UI action — sync is the only real update path in practice, so this
  isn't the primary trigger and isn't being built.
- Changing `recommendations.ts` to treat a reread as a positive taste signal — a real,
  separate follow-on idea, not bundled into this change.
- Converting `startedAt`/`finishedAt` to array columns — considered and rejected (see
  Alternatives Considered).
- Preserving the _exact_ pre-reread progress value for the undo tool — only the finish
  date is kept; undo restores `progress: 100` as an approximation.
- Fixing `recommendations.ts`'s 6-month window or `book.ts`'s recently-finished query to
  account for mid-reread books whose `finishedAt` is temporarily null — accepted as a
  pre-existing style of staleness, not fixed here.
- Changing how streak-_qualifying days_ are counted — a reread's real reading days are
  already counted correctly once the clamp fix below is in place; the only page-total gap
  this design closes is `calculateOverallStats`'s all-time total (see Progress-history
  invariant), not the day-based streak mechanism itself.

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
needs to be dropped or rethought before writing any code.

## Progress-history invariant (new — the central finding of the second review)

`ReadingProgress` rows are strictly increasing today, forever, per book —
`shouldLogProgress`'s strict `>` guarantees it, and the only two existing paths that ever
_lower_ progress (`--reset-below`, the UI's `TO_READ` reset) delete every row for the book
first, preserving the invariant rather than violating it. Every stats function that reads
`ReadingProgress` was written assuming that invariant holds:

- `calculatePagesPerDay` (`reading-stats-utils.ts`) computes each day's page gain as
  `dayMaxProgress - baseline`, where `baseline` is the book's last-logged progress _before_
  that day, searched across the book's **entire** row history — not reset by anything a
  reread does. The first genuinely-logged row after a reread (once real reading resumes,
  whether that's the reset day itself or days later) computes against the old pre-reread
  baseline (e.g. `100`) and produces a large negative `progressGain`, which then fails the
  streak-qualifying threshold for that day.
- `calculateOverallStats` (`reading-stats-utils.ts`, feeds `UserStats.totalPagesRead` via
  `recalculateAllUserStats`) also uses _max_ progress per book, cross-attempt — so a fully
  completed reread credited **zero** additional pages in the first two revisions of this
  spec, even after the yearly-stats fix below makes it count as a second finish. Caught
  when checking whether "books finished this year" and "all-time pages read" could ever
  disagree: they could, badly — summing every year's page total could exceed the
  all-time total, since the yearly fix credits every finish but the all-time calculation
  didn't. That inconsistency is fixed here too, not left as a disclosed gap.

**Fix — three parts, applied together:**

1. `applyRereadStarts` does **not** create a `ReadingProgress` row at reread-start (see
   Result type / apply function below) — avoids logging a phantom "you read on this day"
   entry for a day that was really just a detection event, not reading activity.
2. `calculatePagesPerDay` and its weekly equivalent (`reading-stats-utils.ts`) clamp the
   gain at zero: `progressGain = Math.max(0, dayMaxProgress - baseline)`. This stops a
   stale/inflated baseline from producing a _negative_ page count and corrupting the
   streak-qualifying check for the transition day. This part governs day-based streak
   credit only, not the all-time total — see part 3.
3. `calculateOverallStats` is reworked to credit **every finish**, matching the yearly
   logic instead of diverging from it, using `rereadAt` as the boundary that separates a
   completed attempt's rows from the currently-open one:

   ```typescript
   function calculatePagesForBook(
     entries: ReadingProgressWithBook[], // all rows for one book, any attempt
     book: Pick<Book, "pageCount" | "finishedAt" | "previousFinishedAt" | "rereadAt">,
   ): number {
     const timesRead = book.previousFinishedAt.length + (book.finishedAt !== null ? 1 : 0);
     const finishedPages = timesRead * (book.pageCount ?? 0);

     if (book.finishedAt !== null) return finishedPages; // no open attempt — done

     // Currently unfinished (first read in progress, or mid-reread): credit the OPEN
     // attempt's own max, scoped to rows logged since the last reread boundary so a prior
     // attempt's higher max can't leak in as this attempt's progress.
     const openAttemptRows = entries.filter((e) => book.rereadAt === null || e.createdAt > book.rereadAt);
     const openAttemptMax = openAttemptRows.length > 0 ? Math.max(...openAttemptRows.map((e) => e.progress)) : 0;
     return finishedPages + calculatePagesFromProgress(openAttemptMax, book.pageCount);
   }
   ```

   **Correction (post-implementation review):** an earlier revision of this spec claimed
   this was "a strict generalization, not a behavior change for any book that's never been
   reread." That claim is false for a _finished_ book, and has been corrected here rather
   than left in place. The old `max-progress-per-book` formula credited pages based on the
   book's actual max _logged_ progress (e.g. 95% of a 300-page book if that's as high as any
   `ReadingProgress` row ever got). The code above does not reproduce that: for any book with
   `finishedAt !== null`, it returns `finishedPages = timesRead * pageCount` unconditionally
   — the full `pageCount`, credited the moment `finishedAt` is set, regardless of what the
   logged progress rows actually reached. Since CWA sync doesn't force progress to 100 when
   marking a book read, a book finished via CWA sync with logged progress that never reached
   100% is a real, live case this diverges on.
   **This has been reviewed and the decision is to keep this behavior** — crediting the full
   `pageCount` on finish is arguably more correct (the book was genuinely finished, logged
   progress data is an imperfect proxy for pages actually read) — but the spec's prior claim
   that this is behavior-preserving for a never-reread book was wrong and should not be
   trusted as a compatibility guarantee. The divergence is pinned by a test: see
   `reading-stats-utils.test.tsx`, a finished book whose logged progress never reaches 100%
   asserts the full `pageCount` is credited, not the logged max.

   **Related, also intentional:** `calculateDailyStats`'s `averagePagesPerDay` is computed
   via this same `calculatePagesForBook` (finish-credited, same as `calculateOverallStats`),
   while `pagesToday`/`pagesYesterday` in that same `DailyStats` object remain delta-based
   (`calculatePagesPerDay`, unaffected by this fix). For a library containing finished books
   whose logged progress didn't reach 100%, `averagePagesPerDay` can therefore exceed
   `pagesToday`/`pagesYesterday` within the same returned object. **This has been reviewed
   and the decision is to keep both finish-credited/delta-based as they are** — the two
   figures measure genuinely different things (a lifetime/library average that credits
   completed books in full, vs. a specific day's incremental logged delta) and some
   divergence between them is expected, not a bug.

   **Plumbing this requires:** `ReadingProgressWithBook.book`
   (`src/lib/types/reading.ts`) currently only picks `pageCount`/`id`/`title` — it needs
   `finishedAt`, `previousFinishedAt`, and `rereadAt` added. The one production query that
   feeds `calculateOverallStats` (`stats-updates.ts`'s `recalculateAllUserStats`) needs its
   `book: { select: {...} }` updated to match. (`reading-progress.ts`'s
   `getRecentReadingProgress` also returns `ReadingProgressWithBook` but never calls
   `calculateOverallStats`, so it doesn't need the new fields — don't widen its query
   unnecessarily.)

**What this leaves as an accepted limitation:** the day-based streak _qualifying-day_ logic
(`calculateStreakDetails`/`getQualifyingDays`, which use the clamped daily/weekly
functions from part 2, not part 3's per-book total) still can't retroactively credit a
reread's pages to a day earlier than when that reread's own progress was actually logged —
which is correct, not a gap: a streak should reflect the days you actually engaged with the
book, and part 2 already ensures a reread can't corrupt that count negatively. Nothing
further is owed here.

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
`dnfAt`/`resetAt` in shape — set once, at reread-start, and **never cleared** afterward
(see Anti-refire gates below for why leaving it set permanently is safe rather than an
oversight).

Both sync scripts' `BookshelfBook`/`BookshelfBookForAbs` interfaces (in
`calibre-sync-results.ts`/`abs-sync-results.ts` — these are two separate interfaces with
separate names today, not one shared type) gain `previousFinishedAt: Date[]` and
`rereadAt: Date | null`, with matching `select` additions in `sync-calibre.ts`/`sync-abs.ts`.

## Detection heuristic

Detection is a standalone predicate, not a branch inside `shouldUpdateStatus` — keeping it
separate, called _before_ `shouldUpdateStatus` with an explicit skip of the normal
status/progress branches when it fires, is what makes `rereadStarts` and the ordinary
`bookUpdates`/`progressUpdates` buckets mutually exclusive per book per run (confirmed by
both reviews).

```typescript
function isRereadStart(
  bookshelfBook: {
    status: ReadStatus;
    progress: number;
    finishedAt: Date | null;
    rereadAt: Date | null;
  },
  derived: ReadStatus,
  sourceProgress: number | null,
  sourceUpdatedAt: Date | null,
  minPriorProgress: number, // e.g. 90 — was the previous read genuinely finished?
  dropThreshold: number, // e.g. 50 — is the drop meaningful, not just noise?
): boolean {
  return (
    bookshelfBook.status === "READ" &&
    derived === "READING" && // NOT "TO_READ" — see below
    sourceProgress !== null && // NOT null — see below
    bookshelfBook.progress >= minPriorProgress &&
    bookshelfBook.progress - sourceProgress >= dropThreshold &&
    bookshelfBook.finishedAt !== null &&
    sourceUpdatedAt !== null &&
    sourceUpdatedAt > bookshelfBook.finishedAt &&
    (bookshelfBook.rereadAt === null || sourceUpdatedAt > bookshelfBook.rereadAt)
  );
}
```

**Revised after the final whole-branch review:** a 7th gate (`rereadAt` suppression) was
added late, closing a gap the review found in `manage-reread.ts`'s `--undo-last`: undo
restores `finishedAt` to the book's original finish date, which is exactly the value that
made the source's timestamp look "newer" the first time — so without this gate, the same
unchanged stale source row would immediately re-trigger detection right after being undone,
defeating the whole point of `--undo-last`. `--undo-last` was correspondingly changed to
**not** clear `rereadAt` back to `null` on restore — it's left at whatever value the
original (bad) detection set, and this gate then requires a genuinely newer source signal
before a reread can fire again for that book. See False-positive cleanup, below, for the
updated `--undo-last` behavior.

Seven gates. Two constants (`minPriorProgress` default `90`, `dropThreshold` default `50`),
both `--reread-min-prior-progress`/`--reread-drop-threshold` CLI flags — split out from a
single first-draft `--reread-threshold` because the two questions ("did the previous read
really finish" and "is this drop meaningful") turned out not to be the same threshold. Each
gate, and what it fixes:

- **`status === "READ"` and `derived === "READING"` only** (not `TO_READ`) — a `TO_READ`
  signal on a `READ` book is far more likely a stale/wiped source row than a genuine
  reread, and admitting it produced a self-contradictory state in an earlier draft.
- **`sourceProgress !== null`** — new gate. `deriveStatus` returns `READING` for
  `readStatus === 2` regardless of `koboreadpct`, so a CWA row can derive `READING` with a
  null percent (the same 69-row bulk-import shape already documented as a live case).
  Without this gate, a null-coalesced `0` would satisfy every other condition and register
  as a reread to `0%` — exactly the self-contradictory-state failure mode the `TO_READ`
  exclusion above was meant to close, reopened through a different door.
- **`progress >= minPriorProgress`** — requires the _previous_ read to have actually
  reached the threshold, not just that the new value is low. Without it, any `READ` book
  with low/zero recorded progress (the same 69-row case) would register its _first_ real
  read as a "reread" the moment it's opened.
- **`progress - sourceProgress >= dropThreshold`** — a genuine _delta_, not the single
  absolute cutoff a first draft used (`progress >= 90 && newProgress < 90`, which fires on
  a 90%→89% noise-level move — a book Kobo marks read at 90–99% front/back matter is a
  common real state). Requiring a real drop distinguishes noise from a restart.
- **`sourceUpdatedAt > finishedAt`** — rules out a stale source signal that predates the
  finish.
- **`rereadAt === null || sourceUpdatedAt > rereadAt`** — added late, after the final
  review (see the note above the code block): suppresses re-detection from the same stale
  source signal after a false positive has been undone via `manage-reread.ts --undo-last`.

`isRereadStart` is checked in `computeResults`/`computeAbsResults` before the existing
`shouldUpdateStatus`/`shouldLogProgress` calls for a given book; if it returns `true`, the
book is pushed to a new `rereadStarts` bucket and the loop `continue`s past the normal
status/progress branches for that book (metadata/rating updates are skipped for that
iteration too — harmless, the next sync run picks them up; `matchedIds.add` still runs
first, so the book correctly stays out of `notInCalibre`/`notInBookshelf`).

**Deduplication:** if two source rows resolve to the same Bookshelf book (a Calibre
duplicate, or a cron rerun after a partial prior failure), `computeResults` dedupes
`rereadStarts` by `bookshelfBook.id` before returning, keeping only the first match — this
is what actually protects against a double-append, not the `set`-vs-`push` choice below
(see Result type / apply function for why).

**Why an ordinary rerun can't re-detect the same reread:** after a successful
`applyRereadStarts`, the book's `status` is `READING`, so gate 1 (`status === "READ"`)
rejects it on every subsequent run regardless of anything else. This is a property of gate
1 alone, holds even if `rereadAt` were removed entirely, and is the actual reason a nightly
reinflation loop can't occur through ordinary _re-detection_. `rereadAt` (gates 6/7 combined
with the Anti-refire section below) has a narrower, different job: stopping a stale
cross-source signal from silently undoing an _already-detected_ reread before its own
progress is logged, and — as of the final review — stopping the exact same stale signal
from re-triggering detection a second time after a false positive is manually undone. Both
are about a signal that predates the reread's own timeline, not about an ordinary repeat
sync of a book already mid-reread.

## Anti-refire gates (what `rereadAt` actually protects, and where)

Once a reread has started, a **second sync source** that hasn't itself been touched (the
running example throughout this spec: Calibre detects the reread, but ABS still reports
`isFinished: true` from before the restart) can otherwise silently undo it on its own sync
run, before any real progress on the new attempt has been logged. Two separate places need
a gate, not one — the first revision of this spec only added the first:

**1. Status** — `shouldUpdateStatus` (`scripts/lib/sync-utils.ts`), a new case alongside the
existing `dnfAt`/`resetAt` special cases:

```typescript
// A book with a set rereadAt just had a reread detected. Promoting it back
// to READ needs the source's own signal to be newer than the reread itself
// — otherwise a source that was never touched (e.g. ABS still reporting
// isFinished from before the restart) would silently re-promote it.
if (current === "READING" && derived === "READ" && rereadAt !== null) {
  return sourceUpdatedAt !== null && sourceUpdatedAt > rereadAt;
}
```

**2. Progress** — `shouldLogProgress` (`scripts/lib/sync-utils.ts`), **missed in the first
revision of this spec** and just as necessary: without it, the same untouched-ABS scenario
passes `shouldLogProgress(100, 5)` → `true`, silently overwriting the reread's own low
progress back to `100`. `shouldLogProgress` doesn't take a timestamp today — this is a real
signature change, not a one-line tweak:

```typescript
export function shouldLogProgress(
  sourceProgress: number | null,
  currentProgress: number,
  rereadAt: Date | null = null,
  sourceUpdatedAt: Date | null = null,
): boolean {
  if (sourceProgress === null || sourceProgress <= currentProgress) return false;
  if (rereadAt !== null) {
    return sourceUpdatedAt !== null && sourceUpdatedAt > rereadAt;
  }
  return true;
}
```

Both existing call sites (`calibre-sync-results.ts:151`, `abs-sync-results.ts:110`) pass
the two new parameters; both default to `null`/unset behavior for every book that's never
had a reread, so this is additive to the function's existing behavior, not a change to it.

**On leaving `rereadAt` set forever, never cleared:** the first revision of this spec
claimed a "completion write" clears it back to `null` — no such write exists anywhere in
the design, and this revision removes that claim rather than inventing a new one. Leaving
`rereadAt` set permanently is safe: both gates above only ever require a _newer_ timestamp
than `rereadAt`, which any genuine subsequent signal naturally has, so a book that's
completed its reread and moved on behaves identically whether `rereadAt` is still set or
not. No new write path is needed.

**Regression test, corrected:** the first revision's flagship test asserted the _count_ of
`previousFinishedAt` entries stays at one across repeated stale-signal syncs — but that
property holds from gate 1 of `isRereadStart` alone (see above), so the test would pass
even with `rereadAt` deleted entirely. The test that actually exercises `rereadAt` needs to
assert what these two gates actually protect: after a reread start, a stale cross-source
sync leaves `status` at `READING` (not promoted to `READ`) **and** `progress` unchanged at
the reread's own value (not reverted to the old high value) — i.e., testing both gates
above together, since the status gate alone doesn't prevent the progress-overwrite failure
mode.

## Result type / apply function

New interface, alongside `BookUpdate`/`ProgressUpdate` in `calibre-sync-results.ts`, and the
equivalent shape in `abs-sync-results.ts` (`AbsSyncResults`/`AbsStatusUpdate`/
`AbsProgressUpdate` with a `statusUpdates` bucket — a separately-named, parallel
implementation, not a shared type):

```typescript
interface RereadStart {
  calibreBook: CalibreBookSync; // or AbsBookSync in abs-sync-results.ts
  bookshelfBook: BookshelfBook; // or BookshelfBookForAbs
  newProgress: number; // sourceProgress, already confirmed non-null by isRereadStart
  newStartedAt: Date | null; // the source's own start date, NOT a fallback to "now" — see below
}
```

New `SyncResults.rereadStarts: RereadStart[]` (and the ABS-side equivalent).

New apply function in each sync script:

```typescript
async function applyRereadStarts(rereadStarts: RereadStart[], userId: string): Promise<string[]> {
  const errors: string[] = [];
  for (const { bookshelfBook, newProgress, newStartedAt } of rereadStarts) {
    try {
      // finishedAt is guaranteed non-null here specifically because isRereadStart's
      // `bookshelfBook.finishedAt !== null` gate already required it — not because of
      // `status === "READ"` alone, which (per the Times Read section) can co-occur with a
      // null finishedAt via CSV import.
      if (bookshelfBook.finishedAt === null) {
        errors.push(`Skipped reread for "${bookshelfBook.title}": finishedAt was unexpectedly null`);
        continue;
      }
      const previousFinishedAt = [...bookshelfBook.previousFinishedAt, bookshelfBook.finishedAt];
      await prisma.book.update({
        where: { id: bookshelfBook.id },
        data: {
          previousFinishedAt: { set: previousFinishedAt },
          status: "READING",
          progress: newProgress,
          startedAt: newStartedAt ?? new Date(),
          finishedAt: null,
          dnfAt: null,
          resetAt: null,
          rereadAt: new Date(),
        },
      });
      // No ReadingProgress row is created here — see Progress-history invariant above.
      // The new attempt's history starts with the first genuinely shouldLogProgress-gated
      // row from a later sync.
      const timesRead = computeTimesRead({ previousFinishedAt, finishedAt: null });
      console.log(`REREAD_DETECTED: "${bookshelfBook.title}" (id ${bookshelfBook.id}, read count now ${timesRead})`);
    } catch (err) {
      errors.push(`Failed to log reread for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
    }
  }
  return errors;
}
```

No `$transaction` wrapper is needed here (unlike `applyProgressUpdates`'s existing
transaction, which pairs a `Book` update with a `ReadingProgress` create): this is now a
single `book.update` call, since the no-log-row decision above removed the second write
that transaction was coordinating.

`computeTimesRead` (Times Read section below) is imported from `@/lib/book` (see Missed
consumers for why the import path matters).

**`newStartedAt` derivation, corrected:** the existing `newStartedAt` computed elsewhere in
`computeResults`/`computeAbsResults` for the ordinary `BookUpdate`/`AbsStatusUpdate` path is
gated on `bookshelfBook.startedAt === null` — never true for a `READ` book, so reusing that
formula for the reread path would always fall through to `new Date()`, silently discarding
the source's real restart date (`calibreBook.datestarted`, `absBook.startedAt`) even when
it's available. The reread path computes its own `newStartedAt` independently:
`calibreBook.datestarted ?? new Date()` / `absBook.startedAt ?? new Date()`, not reusing
the existing-book's `startedAt === null` gate at all.

**Required plumbing this touches:**

- `printResults` in both scripts needs a **WOULD START REREAD** section — the most
  destructive write either script makes would otherwise be invisible in dry-run output.
- `printApplySummary` needs a "Started rereads" count line.
- The `recalculateAllUserStats`-triggering guard must include `rereadStarts.length > 0` —
  even without a `ReadingProgress` row from `applyRereadStarts` itself, a completed reread
  eventually produces new progress rows through the normal path, and the guard's existing
  condition differs by script: `sync-calibre.ts` currently checks
  `progressUpdates.length > 0 || createdProgressLogged > 0`; `sync-abs.ts` only checks
  `results.progressUpdates.length > 0` (no `createdProgressLogged` on that side — the two
  scripts aren't symmetric here, and the plumbing change needs to match each script's real
  condition, not assume they're identical).
- `rereadErrors` must be joined into each script's `allErrors` for the exit code.
- `computeTimesRead` needs an export added to `src/lib/book/index.ts` — both sync scripts
  import shared helpers from `@/lib/book`, not from individual files directly.

## Times read

New helper in `book-utils.ts`:

```typescript
function computeTimesRead(book: { previousFinishedAt: Date[]; finishedAt: Date | null }): number {
  return book.previousFinishedAt.length + (book.finishedAt !== null ? 1 : 0);
}
```

The `+ (finishedAt !== null ? 1 : 0)` guard matters: a book that's _currently_ mid-reread
has a null `finishedAt` even though `previousFinishedAt` already holds one prior completion
— counting `previousFinishedAt.length + 1` unconditionally would overcount an unfinished
second read-through as two completed reads.

Edge cases checked across both reviews, no changes needed:

- **Mid-reread abandoned by `mark-abandoned-books.ts`** (status → `DNF`, `dnfAt` set,
  `finishedAt` stays null): count stays correct — the abandoned attempt isn't counted,
  matching how a first read's DNF isn't counted either.
- **Mid-reread hit by `--reset-below`**: count stays correct, but that reset transaction's
  `readingProgress.deleteMany({ where: { bookId } })` deletes **all** progress rows for the
  book, including the original read's full history, not just the stalled reread's —
  pre-existing behavior, not introduced here, but rereads make it materially more likely to
  bite. Noted as a known limitation, not fixed in this change.
- **`status: READ` with `finishedAt: null`** (reachable via CSV import): undercounts by
  one — pre-existing import data-quality issue, not introduced or worsened here. This is
  also the reason `applyRereadStarts` above guards on `finishedAt !== null` explicitly
  rather than trusting `status === "READ"` to imply it.

Displayed on the book detail page (`books/[bookId]/page.tsx`) alongside the existing finish
date, e.g. "Read 2 times, most recently finished ...". No `select` change is needed there —
`book.getBook` already uses `include: SERIES_INCLUDE` with no `select`, so the new column
flows through automatically.

## Missed consumers

**Yearly reading stats and reading-goal progress**
(`src/lib/reading/reading-stats-utils.ts`'s `calculateYearlyStats`, fed by
`src/trpc/routers/user.ts`'s `getYearlyBookStats`) key off `finishedAt`, both for reading
and for filtering. Without a fix, a mid-reread book disappears from its original finish
year's count while `finishedAt` is null, and its finish silently migrates to the new year
once the reread completes.

**The fix needs to touch the query's `where`, not just the read side — this was specified
incorrectly in the first revision.** `getYearlyBookStats`'s query
(`where: { finishedAt: { not: null } }`) excludes a mid-reread book from the result set
entirely; making `calculateYearlyStats` count `previousFinishedAt` changes nothing if the
row was already filtered out before reaching that function. The `where` clause needs:

```typescript
where: {
  userId: ctx.currentUser.id,
  OR: [{ finishedAt: { not: null } }, { previousFinishedAt: { isEmpty: false } }],
}
```

There is no `select` on this query today (it returns the full `Book` shape already) — the
first revision's claim that a `select` addition was needed here was also wrong; that
requirement applies to the sync scripts' own selects, not this query.

With the `where` fixed, `calculateYearlyStats` must count every entry in
`previousFinishedAt` in addition to the scalar `finishedAt`, crediting `pageCount` per
finish the same way it currently does for the scalar value, and the
`book is Book & { finishedAt: Date; pageCount: number }` type predicate needs updating to
account for a book contributing via `previousFinishedAt` while its scalar `finishedAt` is
null.

**Known, accepted limitation (not fixed here):** `recommendations.ts`'s 6-month
recently-finished window and `book.ts`'s 2-week recently-finished query both still key off
the scalar `finishedAt` and will drop a book while it's mid-reread — relatively short,
soft-touch windows rather than a permanent corrupted count, accepted as-is.

**Export/import** (`src/lib/export/export-utils.ts`'s hardcoded column list;
`src/lib/schemas/import.ts`, `import-csv.ts`, `import-json.ts`): both `previousFinishedAt`
and `rereadAt` need to be added — not just `previousFinishedAt` as the first revision
specified. `dnfAt`/`resetAt` are already absent from export today (a pre-existing gap, not
introduced here), but adding reread _history_ while leaving out the anti-refire _guard_
would mean a restored DB has `previousFinishedAt` entries with no protection against the
exact stale-signal refire the guard exists to prevent. `previousFinishedAt` (an array)
serializes as a single CSV cell containing comma-separated ISO-8601 timestamps — the
existing `escapeCSV`/quoting already handles a comma-containing cell correctly, so no new
delimiter scheme is needed, just a `.map(d => d.toISOString()).join(",")` on export and a
`.split(",").filter(Boolean).map(s => new Date(s))` on import.

**Test/seed factories:** `src/lib/test-utils.ts`'s book factory and
`scripts/seed-dev-user.ts` don't strictly _need_ `previousFinishedAt`/`rereadAt` added to
avoid breaking (the factory already omits `dnfAt`/`resetAt` without issue, and
`seed-dev-user.ts`'s explicit `data:` object is covered by the column's `@default`) — the
first revision's claim that omitting them would break existing consumers was wrong. They're
added anyway because tests exercising `computeTimesRead`/reread logic need a factory that
can produce non-default values for these fields.

## False-positive cleanup

New unscheduled script, `scripts/manage-reread.ts` — same tier as `find-fuzzy-duplicates.ts`
(manual tool, not committed to cron, not run automatically):

- `--list <bookId>` — print `previousFinishedAt`, `rereadAt`, and current
  `status`/`progress`/`finishedAt`
- `--undo-last <bookId>` — pop the most recent `previousFinishedAt` entry back into
  `finishedAt`, restore `status: READ`, set `progress: 100` (an **approximation** — the
  exact pre-reread value isn't preserved; `isRereadStart`'s prior-progress gate means the
  real value was at least `minPriorProgress`, so `100` is close), clear `dnfAt`/`resetAt`
  back to `null`, and delete every `ReadingProgress` row created **since `rereadAt`** — not
  since the popped `finishedAt` timestamp, which was a bug in the first revision:
  `applyBookUpdates` (which sets `finishedAt`) and `applyProgressUpdates` (which logs the
  100% row) run as separate steps in each script's main flow, so the original read's own
  final progress row is routinely stamped _after_ its `finishedAt` and would be wrongly
  deleted by a "since `finishedAt`" rule. `previousStartedAt` isn't tracked (Non-Goals), so
  `startedAt` is left as whatever it currently holds rather than restored — undo is
  explicitly lossy on that field. **`rereadAt` is deliberately NOT cleared** — added after
  the final whole-branch review found that clearing it let the exact same stale source
  signal that caused the false positive immediately re-trigger `isRereadStart` on the very
  next sync (its 7th gate requires a source timestamp newer than `rereadAt`; leaving the
  original detection's `rereadAt` in place is what suppresses that same stale signal going
  forward, while a genuinely newer signal still correctly passes and can start a real
  reread later).
- If `previousFinishedAt` is empty, `--undo-last` reports "nothing to undo" and makes no
  changes.
- Both subcommands log the book's `id` alongside its title, since `--list`/`--undo-last` are
  keyed by id.

## Interaction with existing DNF/reset gates

`shouldUpdateStatus` already special-cases `current === "DNF"` and
`current === "TO_READ" && resetAt !== null`. The new `rereadAt`-gated
`current === "READING" && derived === "READ"` case is a third, independent branch —
`current` selects at most one of `DNF`/`TO_READ`/`READING` at a time, so there's no overlap
between the three. If a stalled reread later gets DNF'd or reset, the `dnfAt`/`resetAt`
branches take precedence — safe, since both are necessarily _newer_ than `rereadAt` when
that happens, so they're strictly stricter gates, not a regression. `isRereadStart` itself
is disjoint from all three `shouldUpdateStatus` cases, since it only ever triggers from
`current === "READ"`.

## Alternatives considered

**Converting `startedAt`/`finishedAt` to `DateTime[]` directly**, rather than adding a
separate `previousFinishedAt`. Rejected: Prisma's scalar-list filtering has no
`gte`/`orderBy` support through the typed API, and `finishedAt` is used in range and sort
queries in multiple places (`recommendations.ts`, `sort-utils.ts`, `user.ts`,
`reading-stats-utils.ts`'s per-year grouping). Converting the column would mean rewriting
those as raw SQL — a larger blast radius than the additive-column approach.

**A full `ReadThrough` table** (one row per attempt, own status/progress/dates/rating,
`Book` kept as a denormalized cache). Gives per-attempt progress curves and would sidestep
the Progress-history invariant problem entirely by construction. Re-examined after the
second review surfaced that problem, and still rejected: the clamp fix (streak-day
corruption) plus the `rereadAt`-boundary-scoped credit fix (all-time page total) together
solve the concrete failure modes without a schema change — completed rereads now credit
their full page count exactly once per finish, matching the yearly logic, using `rereadAt`
as a cheap substitute for a real per-attempt row boundary. What's still not possible without
an actual `ReadThrough` table: a per-attempt progress _curve_ (e.g. "show me how read #2
progressed day by day") — the `rereadAt` boundary only supports a single before/after split,
not N-way segmentation across three or more rereads of the same book. Confirmed acceptable,
per the original Non-Goals decision on progress-curve granularity.

## Testing

- `sync-utils.test.ts` — `isRereadStart`: fires only when all seven gates pass; does not fire
  when the previous read never reached `minPriorProgress` (the 69-row bulk-import case);
  does not fire on a drop smaller than `dropThreshold` (the 90%→89% noise case); does not
  fire when `sourceProgress` is null (the null-`koboreadpct` case); does not fire on a
  stale timestamp. `shouldUpdateStatus`'s `rereadAt` gate: does not re-promote
  `READING → READ` off a stale/pre-existing signal when `rereadAt` is set and
  `sourceUpdatedAt <= rereadAt`; unaffected when `rereadAt` is null. `shouldLogProgress`'s
  new `rereadAt`/`sourceUpdatedAt` parameters: does not overwrite progress from a stale
  cross-source signal when `rereadAt` is set; unaffected (existing behavior) when unset.
- **The regression test that actually exercises `rereadAt`** (corrected from the first
  revision, whose equivalent test passed for the wrong reason — see Anti-refire gates
  above): after a reread start, a stale cross-source sync leaves both `status` at
  `READING` and `progress` unchanged at the reread's own value — testing both gates
  together, since the status gate alone doesn't prevent the progress-overwrite failure
  mode.
- `calibre-sync-results.test.ts` / `abs-sync-results.test.ts` — a reread book is present in
  `rereadStarts` and absent from both `bookUpdates`/`statusUpdates` and `progressUpdates` in
  the same run (asserting absence from both explicitly); two source rows matching the same
  Bookshelf book produce exactly one `rereadStarts` entry (dedup); existing
  "promotes an unreset TO_READ book unconditionally" non-regression tests are unaffected.
- `src/lib/book/book-utils.test.tsx` (existing file — the first revision incorrectly
  claimed no test file existed yet for `book-utils.ts`; this adds to the existing file, not
  a new one) — `computeTimesRead`, covering the mid-reread case and the edge cases under
  Times Read above.
- `src/lib/reading/reading-stats-utils.test.tsx` (existing file — `.tsx`, not `.ts`) — a
  twice-read book (one finish in each of two different years) is counted in both years, not
  just the current `finishedAt`'s year; the `Math.max(0, ...)` clamp produces zero, not a
  negative page count, for a day whose baseline predates a reread reset;
  `calculatePagesForBook`: a book with `timesRead === 1` and `rereadAt === null` produces
  the same result as the pre-existing formula (non-regression); a twice-finished book with
  no open attempt credits `2 × pageCount`; a book mid-reread with one prior finish credits
  `1 × pageCount` plus only the open attempt's own max (rows before `rereadAt` must not
  leak into the open-attempt max) — this last case is the one that would silently regress
  to the old under-crediting behavior if the `rereadAt` filter were dropped, so it's the
  most important of the three.
- **Known coverage gap, acknowledged rather than closed here:** no apply-function tests
  exist today for any script (only the pure `computeResults`/`computeAbsResults` functions
  are tested). `applyRereadStarts`'s write and the removal of the transaction wrapper are
  therefore only validated indirectly through the pure-function tests above, consistent
  with the rest of the codebase.

## Migration note

`DateTime[] @default([])` and a nullable `DateTime?` both push cleanly to existing rows via
`prisma db push` (this project's standing convention — no migrations directory).
`previousFinishedAt` is the first array column on `Book`.
