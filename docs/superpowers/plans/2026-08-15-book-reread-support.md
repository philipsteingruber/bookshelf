# Book Reread Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a book that's already `READ` in Bookshelf start a fresh, detected-from-sync read-through ("reread"), track how many times it's been finished, and keep every existing stat (yearly goals, all-time page totals, streaks) correct and mutually consistent once rereads exist.

**Architecture:** Two additive `Book` columns (`previousFinishedAt: DateTime[]`, `rereadAt: DateTime?`). A standalone `isRereadStart` predicate in each sync script's pure `computeResults`/`computeAbsResults` function routes a detected reread to its own `rereadStarts` bucket, disjoint from the existing `bookUpdates`/`progressUpdates` buckets. A new `applyRereadStarts` writes the reset in a single `Book.update`. Two anti-refire gates (`shouldUpdateStatus`, `shouldLogProgress`) stop an untouched second sync source from silently undoing a reread before its own progress is logged. Stats functions (`calculateYearlyStats`, `calculateOverallStats`, `calculateDailyStats`) are reworked to credit every finish, not just the current one, using a shared `calculatePagesForBook` helper.

**Tech Stack:** TypeScript, Prisma (Postgres), Vitest, `tsx` for scripts.

## Global Constraints

- `prisma db push` only — this project has no migrations directory.
- Package manager: `pnpm` only.
- `pnpm run sync:calibre -- --apply` / `pnpm run sync:abs -- --apply` — no bare `--` before a flag like `--apply` itself (breaks `parseArgs`), but pnpm's own `--` separator before the whole flag list is correct and already used elsewhere in this project.
- Double quotes, 2-space indent, explicit error handling — match existing file style exactly; do not introduce `any`.
- Every new/changed function needs a Vitest test in the same style as its neighbors (`describe`/`it`, `makeX` factory helpers where the file already has one).

---

## Task 0: Pre-implementation validation (manual, no code)

**Files:** none — this is a manual verification step, not a code task.

This MUST be done, and MUST pass, before Task 1 starts. The entire feature depends on an unverified assumption: that restarting a finished book actually clears CWA's `book_read_link.read_status` and/or ABS's `isFinished` flag. If it doesn't, the corresponding half of this feature can never fire, silently.

- [ ] **Step 1: Restart one already-`READ` book on the Kobo.** Open a book you've already finished and marked `READ` in Bookshelf, and read past its first page (so KOReader/CWA registers activity).
- [ ] **Step 2: Run the Calibre sync in dry-run mode and inspect the raw CWA DB.**

  ```bash
  cd ~/bookshelf && pnpm run sync:calibre
  sqlite3 /opt/docker/data/cwa/config/app.db \
    "SELECT read_status FROM book_read_link WHERE book_id = <calibre_book_id>;"
  sqlite3 /opt/docker/data/cwa/config/app.db \
    "SELECT progress_percent FROM kobo_reading_state WHERE book_id = <calibre_book_id>;"
  ```

  Expected: `read_status` is no longer `1` (Read) and/or `progress_percent` has dropped from its prior ~100 value. If it hasn't, `deriveStatus` will keep returning `READ` forever for this book and the Calibre half of this feature cannot work as designed — stop and reconsider before writing code.

- [ ] **Step 3: Restart one already-`READ` book in Audiobookshelf.** Reopen a finished audiobook and listen past the first few minutes.
- [ ] **Step 4: Run the ABS sync in dry-run mode and inspect the raw API response.**

  ```bash
  cd ~/bookshelf && pnpm run sync:abs
  ```

  Cross-check against ABS's own `/api/me` media-progress response for that item (via the ABS web UI's network tab, or `curl` with `$ABS_TOKEN`) — confirm `isFinished` is now `false`. If it's still `true`, `deriveAbsStatus` will keep returning `READ` regardless of progress, and the ABS half of this feature is dead on arrival — stop and reconsider (dropping the ABS half, or finding a different signal) before writing code.

- [ ] **Step 5: Record the result.** Note both outcomes (pass/fail) somewhere durable (a comment in the PR description is fine) — later tasks assume both passed. If either failed, stop here and revisit the design with the actual failing behavior in hand rather than continuing against a false assumption.

---

## Task 1: Schema — add `previousFinishedAt` and `rereadAt`

**Files:**

- Modify: `prisma/schema.prisma` (the `Book` model, alongside the existing `resetAt` field)

**Interfaces:**

- Produces: `Book.previousFinishedAt: Date[]`, `Book.rereadAt: Date | null` — every later task in this plan reads or writes one or both of these.

- [ ] **Step 1: Add the two columns**

  In `prisma/schema.prisma`, inside `model Book`, immediately after the existing `resetAt` field and its comment block, add:

  ```prisma
      // History of prior finish dates, oldest first. Populated by
      // applyRereadStarts (scripts/sync-calibre.ts, scripts/sync-abs.ts) when a
      // reread is detected — the CURRENT finishedAt gets pushed here right
      // before it's cleared. Purely additive: nothing else reads or writes it
      // except computeTimesRead and the yearly/all-time stats functions.
      previousFinishedAt DateTime[] @default([])
      // Set once, at reread-start, and never cleared afterward. Gates whether a
      // sync's own status/progress signal is newer than the reread itself —
      // same mechanism as dnfAt/resetAt, see shouldUpdateStatus/shouldLogProgress
      // in scripts/lib/sync-utils.ts.
      rereadAt           DateTime?
  ```

- [ ] **Step 2: Push the schema and regenerate the client**

  ```bash
  cd ~/bookshelf && pnpm prisma db push && pnpm prisma generate
  ```

  Expected: "Your database is now in sync with your Prisma schema" and no errors. This project's custom `generator client` output path means `db push` alone does not always regenerate the client — always follow it with an explicit `prisma generate` (documented precedent: the 2026-08-08 `Float`-column incident in this same file's history).

- [ ] **Step 3: Commit**

  ```bash
  cd ~/bookshelf && git add prisma/schema.prisma
  git commit -m "feat: add Book.previousFinishedAt and Book.rereadAt columns
  ```

Additive columns for reread support - see docs/superpowers/specs/2026-08-15-book-reread-support-design.md"

````

---

## Task 2: `shouldLogProgress` — anti-refire gate

**Files:**
- Modify: `scripts/lib/sync-utils.ts:68-73`
- Modify: `scripts/lib/calibre-sync-results.ts:151` (call site)
- Modify: `scripts/lib/abs-sync-results.ts:110` (call site)
- Test: `scripts/lib/sync-utils.test.ts` (the `describe("shouldLogProgress", ...)` block)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `shouldLogProgress(sourceProgress: number | null, currentProgress: number, rereadAt?: Date | null, sourceUpdatedAt?: Date | null): boolean` — Task 6/7 (`computeResults`/`computeAbsResults`) call this with the new params once `rereadAt` is selected.

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("shouldLogProgress", ...)` block in `scripts/lib/sync-utils.test.ts` (after the existing tests, before the closing `});`):

```typescript
it("does not overwrite progress from a stale cross-source signal after a reread", () => {
  const rereadAt = new Date("2026-08-01");
  const staleSignal = new Date("2026-07-01"); // predates the reread
  expect(shouldLogProgress(100, 5, rereadAt, staleSignal)).toBe(false);
});

it("logs progress from a genuine post-reread signal", () => {
  const rereadAt = new Date("2026-08-01");
  const freshSignal = new Date("2026-08-05");
  expect(shouldLogProgress(15, 5, rereadAt, freshSignal)).toBe(true);
});

it("does not log when rereadAt is set but the source timestamp is unknown", () => {
  const rereadAt = new Date("2026-08-01");
  expect(shouldLogProgress(15, 5, rereadAt, null)).toBe(false);
});

it("is unaffected by rereadAt/sourceUpdatedAt when rereadAt is null", () => {
  expect(shouldLogProgress(60, 50, null, null)).toBe(true);
  expect(shouldLogProgress(60, 50)).toBe(true); // existing 2-arg call sites keep working
});
````

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts -t "shouldLogProgress"
  ```

  Expected: the four new tests FAIL (`shouldLogProgress` doesn't accept 4 args yet — TypeScript will actually fail to compile before the test runner reports a runtime failure).

- [ ] **Step 3: Implement**

  Replace the existing `shouldLogProgress` in `scripts/lib/sync-utils.ts:68-73` with:

  ```typescript
  export function shouldLogProgress(
    sourceProgress: number | null,
    currentProgress: number,
    rereadAt: Date | null = null,
    sourceUpdatedAt: Date | null = null,
  ): boolean {
    if (sourceProgress === null || sourceProgress <= currentProgress) return false;
    // A book with a set rereadAt just had a reread detected. Logging progress
    // from a source that hasn't itself been touched since (e.g. ABS still
    // reporting its old 100% from before the restart) would silently
    // overwrite the reread's own low progress. Require the source's own
    // signal to be newer than the reread itself, same shape as the
    // shouldUpdateStatus gate below.
    if (rereadAt !== null) {
      return sourceUpdatedAt !== null && sourceUpdatedAt > rereadAt;
    }
    return true;
  }
  ```

- [ ] **Step 4: Update the two production call sites**

  `scripts/lib/calibre-sync-results.ts:151` — change:

  ```typescript
  if (shouldLogProgress(calibreBook.readPercent, bookshelfBook.progress)) {
  ```

  to:

  ```typescript
  if (shouldLogProgress(calibreBook.readPercent, bookshelfBook.progress, bookshelfBook.rereadAt, calibreBook.progressUpdatedAt)) {
  ```

  `scripts/lib/abs-sync-results.ts:110` — change:

  ```typescript
  if (shouldLogProgress(absBook.progressPercent, bookshelfBook.progress)) {
  ```

  to:

  ```typescript
  if (shouldLogProgress(absBook.progressPercent, bookshelfBook.progress, bookshelfBook.rereadAt, absBook.progressUpdatedAt)) {
  ```

  (These two edits reference `bookshelfBook.rereadAt`, which doesn't exist on either `BookshelfBook` interface yet — Task 6/7 add it. Leave a `// TODO(Task 6/7): add rereadAt to BookshelfBook` comment here for now, or do this step as part of Task 6/7 instead — whichever the implementer reaches first; both files will fail to typecheck until both this step and Task 6/7's interface change land together. Recommended: do this call-site edit as part of Task 6/7's steps instead of here, to avoid a broken intermediate commit. This step is listed here for completeness of `shouldLogProgress`'s consumers, but its actual edit happens in Task 6 Step 4 and Task 7 Step 4.)

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts -t "shouldLogProgress"
  ```

  Expected: all `shouldLogProgress` tests PASS. (The call-site edits in Step 4 are deferred to Tasks 6/7 as noted — this step only needs `sync-utils.test.ts` to pass, which it will once `shouldLogProgress` itself compiles.)

- [ ] **Step 6: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/lib/sync-utils.ts scripts/lib/sync-utils.test.ts
  git commit -m "feat: add rereadAt anti-refire gate to shouldLogProgress"
  ```

---

## Task 3: `shouldUpdateStatus` — anti-refire gate

**Files:**

- Modify: `scripts/lib/sync-utils.ts:29-66`
- Modify: `scripts/lib/calibre-sync-results.ts:120-128` (call site)
- Modify: `scripts/lib/abs-sync-results.ts:87-95` (call site)
- Test: `scripts/lib/sync-utils.test.ts` (the `describe("shouldUpdateStatus", ...)` block)

**Interfaces:**

- Consumes: nothing new from earlier tasks.
- Produces: `shouldUpdateStatus(current, derived, dnfAt, resetAt, rereadAt, sourceUpdatedAt): boolean` — note the new `rereadAt` parameter is inserted **before** `sourceUpdatedAt`, changing the function from 5 to 6 positional params. Every existing call site (2 production, ~15 in the test file) must be updated in this task.

- [ ] **Step 1: Write the failing tests**

  In `scripts/lib/sync-utils.test.ts`, the `describe("shouldUpdateStatus", ...)` block currently uses a 3-tuple `NO_TIMESTAMPS` spread across 5-arg calls. Update the constant and every call site to account for the new 6th param, and add the new reread-specific tests. Replace the entire block (lines 57–141) with:

  ```typescript
  describe("shouldUpdateStatus", () => {
    const NO_TIMESTAMPS: [Date | null, Date | null, Date | null, Date | null] = [null, null, null, null];
    const DNF_AT = new Date("2026-06-01");
    const BEFORE_DNF = new Date("2026-05-01");
    const AFTER_DNF = new Date("2026-07-01");
    const RESET_AT = new Date("2026-06-01");
    const BEFORE_RESET = new Date("2026-05-01");
    const AFTER_RESET = new Date("2026-07-01");
    const REREAD_AT = new Date("2026-06-01");
    const BEFORE_REREAD = new Date("2026-05-01");
    const AFTER_REREAD = new Date("2026-07-01");

    it("updates TO_READ to READING", () => {
      expect(shouldUpdateStatus("TO_READ", "READING", ...NO_TIMESTAMPS)).toBe(true);
    });

    it("updates TO_READ to READ", () => {
      expect(shouldUpdateStatus("TO_READ", "READ", ...NO_TIMESTAMPS)).toBe(true);
    });

    it("updates READING to READ", () => {
      expect(shouldUpdateStatus("READING", "READ", ...NO_TIMESTAMPS)).toBe(true);
    });

    it("updates READ_NEXT to READING", () => {
      expect(shouldUpdateStatus("READ_NEXT", "READING", ...NO_TIMESTAMPS)).toBe(true);
    });

    it("does not downgrade READ to READING", () => {
      expect(shouldUpdateStatus("READ", "READING", ...NO_TIMESTAMPS)).toBe(false);
    });

    it("does not change READ to DNF (equal priority)", () => {
      expect(shouldUpdateStatus("READ", "DNF", ...NO_TIMESTAMPS)).toBe(false);
    });

    it("clears DNF to READING when the source's progress signal is newer than the DNF decision", () => {
      expect(shouldUpdateStatus("DNF", "READING", DNF_AT, null, null, AFTER_DNF)).toBe(true);
    });

    it("clears DNF to READ when the source's progress signal is newer than the DNF decision", () => {
      expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, AFTER_DNF)).toBe(true);
    });

    it("does not clear DNF when the source's progress signal predates the DNF decision", () => {
      expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, BEFORE_DNF)).toBe(false);
    });

    it("does not clear DNF when dnfAt is unknown", () => {
      expect(shouldUpdateStatus("DNF", "READ", null, null, null, AFTER_DNF)).toBe(false);
    });

    it("does not clear DNF when the source has no progress timestamp", () => {
      expect(shouldUpdateStatus("DNF", "READ", DNF_AT, null, null, null)).toBe(false);
    });

    it("promotes a reset TO_READ book to READING when the source's progress signal is newer than the reset", () => {
      expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, AFTER_RESET)).toBe(true);
    });

    it("promotes a reset TO_READ book to READ when the source's progress signal is newer than the reset", () => {
      expect(shouldUpdateStatus("TO_READ", "READ", null, RESET_AT, null, AFTER_RESET)).toBe(true);
    });

    it("does not promote a reset TO_READ book when the source's progress signal predates the reset", () => {
      expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, BEFORE_RESET)).toBe(false);
    });

    it("does not promote a reset TO_READ book when the source has no progress timestamp", () => {
      expect(shouldUpdateStatus("TO_READ", "READING", null, RESET_AT, null, null)).toBe(false);
    });

    it("promotes an unreset TO_READ book to READING regardless of source timestamp", () => {
      expect(shouldUpdateStatus("TO_READ", "READING", null, null, null, BEFORE_RESET)).toBe(true);
    });

    it("does not change READ_NEXT to TO_READ", () => {
      expect(shouldUpdateStatus("READ_NEXT", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
    });

    it("does not update when status is unchanged", () => {
      expect(shouldUpdateStatus("READING", "READING", ...NO_TIMESTAMPS)).toBe(false);
      expect(shouldUpdateStatus("TO_READ", "TO_READ", ...NO_TIMESTAMPS)).toBe(false);
    });

    it("does not promote READING to READ off a stale signal after a reread", () => {
      expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, BEFORE_REREAD)).toBe(false);
    });

    it("promotes READING to READ from a genuine post-reread signal", () => {
      expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, AFTER_REREAD)).toBe(true);
    });

    it("does not promote READING to READ when rereadAt is set but the source has no timestamp", () => {
      expect(shouldUpdateStatus("READING", "READ", null, null, REREAD_AT, null)).toBe(false);
    });

    it("promotes an unreread READING book to READ unconditionally", () => {
      // rereadAt is null for every book that's never been reread — this
      // ordinary "finished reading it" case must keep working exactly as
      // before, with no timestamp requirement.
      expect(shouldUpdateStatus("READING", "READ", null, null, null, null)).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts -t "shouldUpdateStatus"
  ```

  Expected: FAIL (TypeScript compile error — `shouldUpdateStatus` still takes 5 args).

- [ ] **Step 3: Implement**

  Replace `scripts/lib/sync-utils.ts:29-66` with:

  ```typescript
  export function shouldUpdateStatus(
    current: ReadStatus,
    derived: ReadStatus,
    dnfAt: Date | null,
    resetAt: Date | null,
    rereadAt: Date | null,
    sourceUpdatedAt: Date | null,
  ): boolean {
    // DNF and READ share a priority tier so neither sync source can silently
    // downgrade a finished/abandoned book. But a DNF book with newly-synced
    // progress means the user resumed it on their device — that should clear
    // DNF rather than get stuck there forever, so it's special-cased past the
    // priority tie instead of folded into STATUS_PRIORITY.
    //
    // That resume is only genuine if the source's own progress signal is newer
    // than the DNF decision. Without that check, a signal that already existed
    // before the DNF (e.g. CWA's read_status left at "Read" from months ago)
    // would silently clear a DNF that was never actually resumed. If either
    // timestamp is unknown, don't risk a silent clear.
    if (current === "DNF" && (derived === "READING" || derived === "READ")) {
      return dnfAt !== null && sourceUpdatedAt !== null && sourceUpdatedAt > dnfAt;
    }
    // Same problem, one priority tier down: a book reset to TO_READ (by
    // mark-abandoned-books.ts's --reset-below branch, or manually via the UI)
    // wipes Bookshelf's own progress, but the source (ABS/Calibre) isn't
    // touched — it can still report the pre-reset progress it always had. Bare
    // priority comparison would let that stale signal immediately promote the
    // book straight back to READING, undoing the reset on the very next sync.
    //
    // Unlike DNF, TO_READ is also the default status for a book that was never
    // started — resetAt is null for the overwhelming majority of TO_READ books,
    // and that ordinary "starting a new book" case must keep working. So this
    // only gates when a reset actually happened (resetAt !== null); otherwise
    // it falls through to the same unconditional promotion as before.
    if (current === "TO_READ" && (derived === "READING" || derived === "READ") && resetAt !== null) {
      return sourceUpdatedAt !== null && sourceUpdatedAt > resetAt;
    }
    // A book with a set rereadAt just had a reread detected (see
    // isRereadStart). Promoting it back to READ needs the source's own
    // signal to be newer than the reread itself — otherwise a source that
    // was never touched (e.g. ABS still reporting isFinished from before the
    // restart) would silently re-promote it before its own progress has ever
    // been logged.
    if (current === "READING" && derived === "READ" && rereadAt !== null) {
      return sourceUpdatedAt !== null && sourceUpdatedAt > rereadAt;
    }
    return statusPriority(derived) > statusPriority(current);
  }
  ```

- [ ] **Step 4: Update the two production call sites**

  Same note as Task 2 Step 4: these edits touch `BookshelfBook`/`BookshelfBookForAbs`, which don't have `rereadAt` yet. Defer the actual edit to Task 6 Step 4 / Task 7 Step 4, where the interface change and the call-site update land in the same commit. This task's tests (Step 1–3 above) exercise `shouldUpdateStatus` directly and don't require the call sites to compile.

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts -t "shouldUpdateStatus"
  ```

  Expected: all PASS.

- [ ] **Step 6: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/lib/sync-utils.ts scripts/lib/sync-utils.test.ts
  git commit -m "feat: add rereadAt anti-refire gate to shouldUpdateStatus"
  ```

---

## Task 4: `isRereadStart` predicate

**Files:**

- Modify: `scripts/lib/sync-utils.ts` (new export, after `deriveAbsStatus`)
- Test: `scripts/lib/sync-utils.test.ts` (new `describe` block)

**Interfaces:**

- Consumes: nothing new from earlier tasks.
- Produces: `isRereadStart(bookshelfBook, derived, sourceProgress, sourceUpdatedAt, minPriorProgress, dropThreshold): boolean` — Task 6/7 call this in `computeResults`/`computeAbsResults` before the existing status/progress branches.

- [ ] **Step 1: Write the failing tests**

  Add to `scripts/lib/sync-utils.test.ts`, after the `describe("deriveAbsStatus", ...)` block:

  ```typescript
  describe("isRereadStart", () => {
    const finishedAt = new Date("2026-06-01");
    const afterFinish = new Date("2026-07-01");
    const beforeFinish = new Date("2026-05-01");
    const readBook = { status: "READ" as const, progress: 100, finishedAt };

    it("fires when a finished book's source progress drops meaningfully after a newer signal", () => {
      expect(isRereadStart(readBook, "READING", 5, afterFinish, 90, 50)).toBe(true);
    });

    it("does not fire when status is not READ", () => {
      expect(isRereadStart({ ...readBook, status: "READING" }, "READING", 5, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire when derived is TO_READ, not READING", () => {
      expect(isRereadStart(readBook, "TO_READ", 0, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire when the previous read never reached minPriorProgress", () => {
      // the 69-row bulk-import case: READ with low/zero recorded progress
      expect(isRereadStart({ ...readBook, progress: 20 }, "READING", 5, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire on a drop smaller than dropThreshold", () => {
      // 90% -> 89%, the noise-level move a book marked read at 90-99% can produce
      expect(isRereadStart({ ...readBook, progress: 90 }, "READING", 89, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire when sourceProgress is null", () => {
      expect(isRereadStart(readBook, "READING", null, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire when finishedAt is null", () => {
      expect(isRereadStart({ ...readBook, finishedAt: null }, "READING", 5, afterFinish, 90, 50)).toBe(false);
    });

    it("does not fire on a stale timestamp that predates the finish", () => {
      expect(isRereadStart(readBook, "READING", 5, beforeFinish, 90, 50)).toBe(false);
    });

    it("does not fire when the source has no timestamp", () => {
      expect(isRereadStart(readBook, "READING", 5, null, 90, 50)).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts -t "isRereadStart"
  ```

  Expected: FAIL (`isRereadStart` is not exported yet).

- [ ] **Step 3: Implement**

  Add to `scripts/lib/sync-utils.ts`, after `deriveAbsStatus`:

  ```typescript
  // Detects the start of a genuine reread from sync data alone. Deliberately a
  // standalone predicate, not folded into shouldUpdateStatus — shouldUpdateStatus
  // returns a bare boolean the caller uses to build an ordinary BookUpdate, which
  // would let a detected reread land in BOTH the normal update bucket and a new
  // reread bucket in the same sync run. Calling this FIRST and skipping the
  // normal branches when it fires is what keeps the two paths disjoint.
  export function isRereadStart(
    bookshelfBook: { status: ReadStatus; progress: number; finishedAt: Date | null },
    derived: ReadStatus,
    sourceProgress: number | null,
    sourceUpdatedAt: Date | null,
    minPriorProgress: number,
    dropThreshold: number,
  ): boolean {
    return (
      bookshelfBook.status === "READ" &&
      derived === "READING" && // NOT "TO_READ" — that signal on a READ book is far
      // more likely a stale/wiped source row than a genuine reread.
      sourceProgress !== null && // a null-coalesced 0 would satisfy every other
      // condition and register as a reread to 0%, reopening the same
      // self-contradictory-state problem the TO_READ exclusion above closes.
      bookshelfBook.progress >= minPriorProgress && // the PREVIOUS read must have
      // actually finished, not just that the new value is low — otherwise a
      // book that's READ with low/zero recorded progress (a real live case:
      // bulk-imported rows with no kobo_reading_state at all) would register
      // its FIRST real read as a "reread" the moment it's opened.
      bookshelfBook.progress - sourceProgress >= dropThreshold && // a genuine
      // DELTA, not a single absolute cutoff — a book Kobo marks read at
      // 90-99% (front/back matter) is common, and a bare progress<90 check
      // would fire on a 90%->89% noise-level move.
      bookshelfBook.finishedAt !== null &&
      sourceUpdatedAt !== null &&
      sourceUpdatedAt > bookshelfBook.finishedAt // rules out a stale source
      // signal that predates the finish.
    );
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/sync-utils.test.ts
  ```

  Expected: the whole file PASSES (all `describe` blocks, including the untouched earlier ones).

- [ ] **Step 5: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/lib/sync-utils.ts scripts/lib/sync-utils.test.ts
  git commit -m "feat: add isRereadStart reread-detection predicate"
  ```

---

## Task 5: `computeTimesRead` helper

**Files:**

- Modify: `src/lib/book/book-utils.ts` (new export)
- Modify: `src/lib/book/index.ts` (export it)
- Test: `src/lib/book/book-utils.test.tsx` (existing file — add a new `describe` block, do NOT create a new file)

**Interfaces:**

- Consumes: nothing new from earlier tasks.
- Produces: `computeTimesRead(book: { previousFinishedAt: Date[]; finishedAt: Date | null }): number`, imported from `@/lib/book` — used by Task 8/9 (`applyRereadStarts`'s log line) and Task 12 (book detail page display).

- [ ] **Step 1: Write the failing tests**

  Add to `src/lib/book/book-utils.test.tsx`, inside the existing `describe("bookUtils", ...)` block (after the last existing nested `describe`):

  ```typescript
  describe("computeTimesRead", () => {
    it("counts one read for a finished book with no reread history", () => {
      expect(computeTimesRead({ previousFinishedAt: [], finishedAt: new Date("2026-01-01") })).toBe(1);
    });

    it("counts zero for a book that has never been finished", () => {
      expect(computeTimesRead({ previousFinishedAt: [], finishedAt: null })).toBe(0);
    });

    it("does not overcount a book that is currently mid-reread", () => {
      // one prior completed read, current attempt not yet finished (finishedAt
      // is null while mid-reread) — must read as 1, not 2.
      expect(computeTimesRead({ previousFinishedAt: [new Date("2026-01-01")], finishedAt: null })).toBe(1);
    });

    it("counts every completed finish for a book currently READ after two rereads", () => {
      expect(
        computeTimesRead({
          previousFinishedAt: [new Date("2026-01-01"), new Date("2026-04-01")],
          finishedAt: new Date("2026-08-01"),
        }),
      ).toBe(3);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/book/book-utils.test.tsx -t "computeTimesRead"
  ```

  Expected: FAIL (not defined/imported yet).

- [ ] **Step 3: Implement**

  Add to `src/lib/book/book-utils.ts`, after `roundToTwoDecimals`:

  ```typescript
  // A book that's currently mid-reread has a null finishedAt (reset by
  // applyRereadStarts) even though previousFinishedAt already holds a prior
  // completion — counting previousFinishedAt.length + 1 unconditionally would
  // overcount an unfinished second read-through as two completed reads.
  export function computeTimesRead(book: { previousFinishedAt: Date[]; finishedAt: Date | null }): number {
    return book.previousFinishedAt.length + (book.finishedAt !== null ? 1 : 0);
  }
  ```

  In `src/lib/book/index.ts`, add `computeTimesRead` to the named export list from `./book-utils` (alphabetical, matching the existing ordering):

  ```typescript
  export {
    calculatePagesFromProgress,
    computeAuthorFields,
    computeTimesRead,
    createAuthorSort,
    createTitleSort,
    formatSeriesIndex,
    getStatusButtonStyle,
    parseAuthorString,
    parseReadStatus,
    roundToTwoDecimals,
  } from "./book-utils";
  ```

  Add the import at the top of `src/lib/book/book-utils.test.tsx`'s existing `@/lib/book` import block:

  ```typescript
  import {
    computeAuthorFields,
    computeTimesRead,
    createAuthorSort,
    createTitleSort,
    formatSeriesIndex,
    getStatusButtonStyle,
    parseAuthorString,
    parseReadStatus,
    roundToTwoDecimals,
  } from "@/lib/book";
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/book/book-utils.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/book/book-utils.ts src/lib/book/index.ts src/lib/book/book-utils.test.tsx
  git commit -m "feat: add computeTimesRead helper"
  ```

---

## Task 6: `calibre-sync-results.ts` — reread wiring

**Files:**

- Modify: `scripts/lib/calibre-sync-results.ts`
- Test: `scripts/lib/calibre-sync-results.test.ts`

**Interfaces:**

- Consumes: `isRereadStart`, `shouldLogProgress` (Tasks 2, 4), `shouldUpdateStatus` (Task 3, new 6-arg signature).
- Produces: `SyncResults.rereadStarts: RereadStart[]`; `BookshelfBook` gains `previousFinishedAt: Date[]` and `rereadAt: Date | null` — Task 8 (`sync-calibre.ts`) consumes both.

- [ ] **Step 1: Write the failing tests**

  Add to `scripts/lib/calibre-sync-results.test.ts`. First, extend the `makeBookshelf` factory (around line 32-51) to include the two new fields — find:

  ```typescript
  function makeBookshelf(overrides: Partial<BookshelfBook> = {}): BookshelfBook {
    return {
      id: 100,
      title: "Blood Pact",
      author: "Dan Abnett",
      status: "TO_READ",
      progress: 0,
      startedAt: null,
      finishedAt: null,
      dnfAt: null,
      resetAt: null,
      series: { name: "Gaunt's Ghosts" },
  ```

  and add, right after `resetAt: null,`:

  ```typescript
      previousFinishedAt: [],
      rereadAt: null,
  ```

  Then add a new `describe` block at the end of the file:

  ```typescript
  describe("computeResults — reread detection", () => {
    const finishedAt = new Date("2026-06-01");
    const afterFinish = new Date("2026-07-01");

    it("routes a detected reread to rereadStarts and NOT to bookUpdates or progressUpdates", () => {
      const calibre = makeCalibре({ readStatus: 2, readPercent: 5, progressUpdatedAt: afterFinish });
      const bookshelf = makeBookshelf({ status: "READ", progress: 100, finishedAt });
      const { rereadStarts, bookUpdates, progressUpdates } = computeResults([calibre], [bookshelf]);

      expect(rereadStarts).toHaveLength(1);
      expect(rereadStarts[0]!.newProgress).toBe(5);
      expect(bookUpdates).toHaveLength(0);
      expect(progressUpdates).toHaveLength(0);
    });

    it("does not detect a reread for an ordinary in-progress book", () => {
      const calibre = makeCalibре({ readStatus: 2, readPercent: 40, progressUpdatedAt: afterFinish });
      const bookshelf = makeBookshelf({ status: "READING", progress: 20 });
      const { rereadStarts } = computeResults([calibre], [bookshelf]);
      expect(rereadStarts).toHaveLength(0);
    });

    it("dedupes two Calibre rows matching the same bookshelf book into one rereadStarts entry", () => {
      const calibreA = makeCalibре({
        calibreId: 1,
        readStatus: 2,
        readPercent: 5,
        progressUpdatedAt: afterFinish,
      });
      const calibreB = makeCalibре({
        calibreId: 2,
        readStatus: 2,
        readPercent: 8,
        progressUpdatedAt: afterFinish,
      });
      const bookshelf = makeBookshelf({ status: "READ", progress: 100, finishedAt });
      const { rereadStarts } = computeResults([calibreA, calibreB], [bookshelf]);
      expect(rereadStarts).toHaveLength(1);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/calibre-sync-results.test.ts
  ```

  Expected: FAIL (`rereadStarts` doesn't exist on `SyncResults`; `previousFinishedAt`/`rereadAt` not on `BookshelfBook`).

- [ ] **Step 3: Implement — types**

  In `scripts/lib/calibre-sync-results.ts`, update the imports at the top:

  ```typescript
  import { buildCompositeKey } from "./normalizer";
  import { deriveStatus, isRereadStart, shouldLogProgress, shouldUpdateStatus } from "./sync-utils";
  import type { CalibreBookSync } from "./calibre-sync-reader";
  ```

  Add `previousFinishedAt`/`rereadAt` to `BookshelfBook` (after the existing `resetAt: Date | null;`):

  ```typescript
    previousFinishedAt: Date[];
    rereadAt: Date | null;
  ```

  Add a new `RereadStart` interface, after `RatingUpdate`:

  ```typescript
  export interface RereadStart {
    calibreBook: CalibreBookSync;
    bookshelfBook: BookshelfBook;
    newProgress: number; // sourceProgress, already confirmed non-null by isRereadStart
    newStartedAt: Date | null; // the source's own start date — see computeResults below
  }
  ```

  Add `rereadStarts: RereadStart[];` to `SyncResults`, and initialize it (`rereadStarts: [],`) in the `results` object literal inside `computeResults`.

- [ ] **Step 4: Implement — detection wiring**

  Inside `computeResults`'s main `for (const calibreBook of calibreBooks)` loop, immediately after `matchedIds.add(bookshelfBook.id);` and before the existing `const derived = deriveStatus(...)` line, insert:

  ```typescript
  const derived = deriveStatus(
    calibreBook.readStatus,
    calibreBook.readPercent,
    calibreBook.dnf,
    calibreBook.isReadNext,
  );

  if (
    isRereadStart(
      bookshelfBook,
      derived,
      calibreBook.readPercent,
      calibreBook.progressUpdatedAt,
      REREAD_MIN_PRIOR_PROGRESS,
      REREAD_DROP_THRESHOLD,
    )
  ) {
    results.rereadStarts.push({
      calibreBook,
      bookshelfBook,
      newProgress: calibreBook.readPercent!, // non-null: isRereadStart requires it
      newStartedAt: calibreBook.datestarted,
    });
    continue;
  }
  ```

  (This replaces the pre-existing `const derived = deriveStatus(...)` block — don't duplicate it, just insert the `if (isRereadStart(...))` check right after it, keeping everything below unchanged.)

  Add the two threshold constants near the top of the file, after the imports:

  ```typescript
  const REREAD_MIN_PRIOR_PROGRESS = 90;
  const REREAD_DROP_THRESHOLD = 50;
  ```

  Update the existing `shouldUpdateStatus` call site (was 5 args) to the new 6-arg signature:

  ```typescript
  const newStatus = shouldUpdateStatus(
    bookshelfBook.status,
    derived,
    bookshelfBook.dnfAt,
    bookshelfBook.resetAt,
    bookshelfBook.rereadAt,
    calibreBook.progressUpdatedAt,
  )
    ? derived
    : null;
  ```

  Update the existing `shouldLogProgress` call site (was 2 args):

  ```typescript
      if (
        shouldLogProgress(
          calibreBook.readPercent,
          bookshelfBook.progress,
          bookshelfBook.rereadAt,
          calibreBook.progressUpdatedAt,
        )
      ) {
  ```

- [ ] **Step 5: Add deduplication**

  At the very end of `computeResults`, right before `return results;`, add:

  ```typescript
  // Two source rows can resolve to the same bookshelf book (a Calibre
  // duplicate, or a cron rerun after a partial prior failure) — dedupe by
  // bookshelfBook.id so a rerun/duplicate can't double-append the same
  // finish date via previousFinishedAt's `set` write in applyRereadStarts.
  const seenRereadIds = new Set<number>();
  results.rereadStarts = results.rereadStarts.filter((r) => {
    if (seenRereadIds.has(r.bookshelfBook.id)) return false;
    seenRereadIds.add(r.bookshelfBook.id);
    return true;
  });
  ```

- [ ] **Step 6: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/calibre-sync-results.test.ts
  ```

  Expected: PASS — this includes every pre-existing test in the file (they must still pass unmodified, confirming the reread branch doesn't affect ordinary sync behavior).

- [ ] **Step 7: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/lib/calibre-sync-results.ts scripts/lib/calibre-sync-results.test.ts
  git commit -m "feat: wire reread detection into computeResults"
  ```

---

## Task 7: `abs-sync-results.ts` — reread wiring

**Files:**

- Modify: `scripts/lib/abs-sync-results.ts`
- Test: `scripts/lib/abs-sync-results.test.ts`

**Interfaces:**

- Consumes: `isRereadStart`, `shouldLogProgress` (Tasks 2, 4), `shouldUpdateStatus` (Task 3, new 6-arg signature).
- Produces: `AbsSyncResults.rereadStarts: RereadStart[]`; `BookshelfBookForAbs` gains `previousFinishedAt: Date[]` and `rereadAt: Date | null` — Task 9 (`sync-abs.ts`) consumes both.

This mirrors Task 6 exactly, on the ABS-side parallel implementation (`AbsSyncResults`/`AbsStatusUpdate`/`statusUpdates` — separately named, not shared types with the Calibre side).

- [ ] **Step 1: Write the failing tests**

  Extend `makeBookshelf` in `scripts/lib/abs-sync-results.test.ts` (add after the existing `resetAt: null,`):

  ```typescript
      previousFinishedAt: [],
      rereadAt: null,
  ```

  Add a new `describe` block at the end of the file:

  ```typescript
  describe("computeAbsResults — reread detection", () => {
    const finishedAt = new Date("2026-06-01");
    const afterFinish = new Date("2026-07-01");

    it("routes a detected reread to rereadStarts and NOT to statusUpdates or progressUpdates", () => {
      const abs = makeAbs({ progressPercent: 5, isFinished: false, progressUpdatedAt: afterFinish });
      const bookshelf = makeBookshelf({ status: "READ", progress: 100, finishedAt });
      const { rereadStarts, statusUpdates, progressUpdates } = computeAbsResults([abs], [bookshelf]);

      expect(rereadStarts).toHaveLength(1);
      expect(rereadStarts[0]!.newProgress).toBe(5);
      expect(statusUpdates).toHaveLength(0);
      expect(progressUpdates).toHaveLength(0);
    });

    it("does not detect a reread for an ordinary in-progress item", () => {
      const abs = makeAbs({ progressPercent: 40, isFinished: false, progressUpdatedAt: afterFinish });
      const bookshelf = makeBookshelf({ status: "READING", progress: 20 });
      const { rereadStarts } = computeAbsResults([abs], [bookshelf]);
      expect(rereadStarts).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/abs-sync-results.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement — types**

  Update the imports:

  ```typescript
  import { buildCompositeKey, stripSubtitle } from "./normalizer";
  import { deriveAbsStatus, isRereadStart, shouldLogProgress, shouldUpdateStatus } from "./sync-utils";
  import type { AbsBookSync } from "./abs-sync-reader";
  ```

  Add `previousFinishedAt: Date[]` and `rereadAt: Date | null` to `BookshelfBookForAbs` (after `resetAt: Date | null;`).

  Add a `RereadStart` interface (this file's own copy — parallel to the Calibre one, not shared):

  ```typescript
  export interface RereadStart {
    absBook: AbsBookSync;
    bookshelfBook: BookshelfBookForAbs;
    newProgress: number;
    newStartedAt: Date | null;
  }
  ```

  Add `rereadStarts: RereadStart[];` to `AbsSyncResults`, initialized to `[]` in `computeAbsResults`.

- [ ] **Step 4: Implement — detection wiring**

  Add the two threshold constants near the top:

  ```typescript
  const REREAD_MIN_PRIOR_PROGRESS = 90;
  const REREAD_DROP_THRESHOLD = 50;
  ```

  Inside `computeAbsResults`'s loop, immediately after `const derived = deriveAbsStatus(absBook.progressPercent, absBook.isFinished);`, insert:

  ```typescript
  if (
    isRereadStart(
      bookshelfBook,
      derived,
      absBook.progressPercent,
      absBook.progressUpdatedAt,
      REREAD_MIN_PRIOR_PROGRESS,
      REREAD_DROP_THRESHOLD,
    )
  ) {
    results.rereadStarts.push({
      absBook,
      bookshelfBook,
      newProgress: absBook.progressPercent,
      newStartedAt: absBook.startedAt,
    });
    continue;
  }
  ```

  Update the `shouldUpdateStatus` call site to 6 args:

  ```typescript
  const newStatus = shouldUpdateStatus(
    bookshelfBook.status,
    derived,
    bookshelfBook.dnfAt,
    bookshelfBook.resetAt,
    bookshelfBook.rereadAt,
    absBook.progressUpdatedAt,
  )
    ? derived
    : null;
  ```

  Update the `shouldLogProgress` call site:

  ```typescript
      if (
        shouldLogProgress(
          absBook.progressPercent,
          bookshelfBook.progress,
          bookshelfBook.rereadAt,
          absBook.progressUpdatedAt,
        )
      ) {
  ```

- [ ] **Step 5: Add deduplication**

  Before `return results;`:

  ```typescript
  const seenRereadIds = new Set<number>();
  results.rereadStarts = results.rereadStarts.filter((r) => {
    if (seenRereadIds.has(r.bookshelfBook.id)) return false;
    seenRereadIds.add(r.bookshelfBook.id);
    return true;
  });
  ```

- [ ] **Step 6: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run scripts/lib/abs-sync-results.test.ts
  ```

  Expected: PASS, including all pre-existing tests.

- [ ] **Step 7: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/lib/abs-sync-results.ts scripts/lib/abs-sync-results.test.ts
  git commit -m "feat: wire reread detection into computeAbsResults"
  ```

---

## Task 8: `sync-calibre.ts` — `applyRereadStarts`, CLI, dry-run output

**Files:**

- Modify: `scripts/sync-calibre.ts`

**Interfaces:**

- Consumes: `SyncResults.rereadStarts` (Task 6), `computeTimesRead` (Task 5, imported from `@/lib/book`).
- Produces: nothing further downstream — this is the final apply-layer for the Calibre side.

- [ ] **Step 1: Add `previousFinishedAt`/`rereadAt` to the `select`**

  In `main()`, the `prisma.book.findMany` call around line 494-513 — add two lines to the `select` object, after `resetAt: true,`:

  ```typescript
        previousFinishedAt: true,
        rereadAt: true,
  ```

- [ ] **Step 2: Add the `applyRereadStarts` function**

  Add after `applyProgressUpdates` (around line 398), before `applyReadNextRemovals`:

  ```typescript
  async function applyRereadStarts(rereadStarts: RereadStart[], userId: string): Promise<string[]> {
    const errors: string[] = [];
    for (const { bookshelfBook, newProgress, newStartedAt } of rereadStarts) {
      try {
        // finishedAt is guaranteed non-null here specifically because
        // isRereadStart's finishedAt !== null gate already required it — not
        // because of status === "READ" alone, which can co-occur with a null
        // finishedAt via CSV import.
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
        // No ReadingProgress row is created here — the new attempt's history
        // starts with the first genuinely shouldLogProgress-gated row from a
        // later sync, avoiding a phantom "read on this day" log entry.
        const timesRead = computeTimesRead({ previousFinishedAt, finishedAt: null });
        console.log(`REREAD_DETECTED: "${bookshelfBook.title}" (id ${bookshelfBook.id}, read count now ${timesRead})`);
      } catch (err) {
        errors.push(`Failed to log reread for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
      }
    }
    return errors;
  }
  ```

  Add `RereadStart` to the type-only import from `./lib/calibre-sync-results`, and add `computeTimesRead` to the existing `@/lib/book` import.

- [ ] **Step 3: Add CLI flags**

  In `main()`'s `parseArgs` options object, add two new flags:

  ```typescript
      "reread-min-prior-progress": { type: "string", default: "90" },
      "reread-drop-threshold": { type: "string", default: "50" },
  ```

  After the existing `const apply = values.apply ?? false;` line, add:

  ```typescript
  const rereadMinPriorProgress = Number(values["reread-min-prior-progress"]);
  const rereadDropThreshold = Number(values["reread-drop-threshold"]);
  if (Number.isNaN(rereadMinPriorProgress) || Number.isNaN(rereadDropThreshold)) {
    console.error("Error: --reread-min-prior-progress and --reread-drop-threshold must be numbers");
    process.exit(1);
  }
  ```

  **Note:** `computeResults` currently takes exactly 2 params (`calibreBooks`, `bookshelfBooks`) with the two threshold constants hardcoded inside the file (Task 6, Step 4). To make them CLI-configurable, `computeResults`'s signature needs a third optional param: `computeResults(calibreBooks, bookshelfBooks, thresholds = { minPriorProgress: REREAD_MIN_PRIOR_PROGRESS, dropThreshold: REREAD_DROP_THRESHOLD })`, defaulting to the same constants so every existing call site (including all of Task 6's tests) keeps compiling unchanged. Update the `isRereadStart` call in `computeResults` to use `thresholds.minPriorProgress`/`thresholds.dropThreshold` instead of the bare constants, and update this call site in `sync-calibre.ts` to pass `{ minPriorProgress: rereadMinPriorProgress, dropThreshold: rereadDropThreshold }`.

- [ ] **Step 4: Update the `computeResults` call site**

  ```typescript
  const results = computeResults(calibreBooks, bookshelfBooks, {
    minPriorProgress: rereadMinPriorProgress,
    dropThreshold: rereadDropThreshold,
  });
  ```

- [ ] **Step 5: Add dry-run output**

  In `printResults`, after the `WOULD REMOVE FROM CWA READ NEXT SHELF` block and before `NOT IN CALIBRE`, add:

  ```typescript
  const rereadLabel = apply ? "STARTED REREAD" : "WOULD START REREAD";
  console.log(`\n${rereadLabel} (${results.rereadStarts.length})`);
  for (const { calibreBook, bookshelfBook, newProgress } of results.rereadStarts) {
    console.log(
      `  • ${formatBook(bookshelfBook.title, bookshelfBook.author, calibreBook.seriesName, calibreBook.seriesIndex)}`,
    );
    console.log(`    READ → READING | ${bookshelfBook.progress}% → ${newProgress}%`);
  }
  ```

  In the `if (!apply)` summary block, add a line after `Would remove from Read Next (CWA):`:

  ```typescript
  console.log(`Would start reread:   ${pad(results.rereadStarts.length)}`);
  ```

  In `printApplySummary`, add a matching parameter and line — update the signature:

  ```typescript
  function printApplySummary(
    results: SyncResults,
    createErrors: string[],
    updateErrors: string[],
    metadataErrors: string[],
    ratingErrors: string[],
    progressErrors: string[],
    readNextErrors: string[],
    rereadErrors: string[],
  ): void {
  ```

  and add, after the `Removed from Read Next (CWA):` line:

  ```typescript
  console.log(`Started reread:       ${pad(results.rereadStarts.length - rereadErrors.length)}`);
  ```

- [ ] **Step 6: Wire the apply call, recalc guard, and error aggregation into `main()`**

  In the `if (apply)` block, after `const readNextErrors = ...`:

  ```typescript
  const rereadErrors = await applyRereadStarts(results.rereadStarts, user.id);
  ```

  Update the `recalculateAllUserStats` guard:

  ```typescript
  if (results.progressUpdates.length > 0 || createdProgressLogged > 0 || results.rereadStarts.length > 0) {
    await recalculateAllUserStats(prisma, user);
  }
  ```

  Update the `printApplySummary` call to pass `rereadErrors`, and the `allErrors` array to include it:

  ```typescript
  printApplySummary(
    results,
    createErrors,
    updateErrors,
    metadataErrors,
    ratingErrors,
    progressErrors,
    readNextErrors,
    rereadErrors,
  );

  const allErrors = [
    ...createErrors,
    ...updateErrors,
    ...metadataErrors,
    ...ratingErrors,
    ...progressErrors,
    ...readNextErrors,
    ...rereadErrors,
  ];
  ```

- [ ] **Step 7: Typecheck and dry-run smoke test**

  ```bash
  cd ~/bookshelf && pnpm tsc --noEmit
  pnpm run sync:calibre
  ```

  Expected: no type errors; the dry-run output includes a `WOULD START REREAD (0)` section (0, since no real reread exists yet in the live data) without crashing.

- [ ] **Step 8: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/sync-calibre.ts
  git commit -m "feat: apply reread detection in sync-calibre.ts"
  ```

---

## Task 9: `sync-abs.ts` — `applyRereadStarts`, CLI, dry-run output

**Files:**

- Modify: `scripts/sync-abs.ts`

**Interfaces:**

- Consumes: `AbsSyncResults.rereadStarts` (Task 7), `computeTimesRead` (Task 5).
- Produces: nothing further downstream.

Mirrors Task 8 on the ABS side, adapted to `sync-abs.ts`'s smaller shape (no page counts, no metadata/rating/read-next sections).

- [ ] **Step 1: Add `previousFinishedAt`/`rereadAt` to the `select`**

  In `main()`'s `prisma.book.findMany` (lines 173-187), add after `resetAt: true,`:

  ```typescript
        previousFinishedAt: true,
        rereadAt: true,
  ```

- [ ] **Step 2: Add `applyRereadStarts`**

  Add after `applyProgressUpdates` (around line 121):

  ```typescript
  async function applyRereadStarts(rereadStarts: RereadStart[], userId: string): Promise<string[]> {
    const errors: string[] = [];
    for (const { bookshelfBook, newProgress, newStartedAt } of rereadStarts) {
      try {
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
        const timesRead = computeTimesRead({ previousFinishedAt, finishedAt: null });
        console.log(`REREAD_DETECTED: "${bookshelfBook.title}" (id ${bookshelfBook.id}, read count now ${timesRead})`);
      } catch (err) {
        errors.push(`Failed to log reread for "${bookshelfBook.title}": ${extractErrorMessage(err)}`);
      }
    }
    return errors;
  }
  ```

  Add `RereadStart` to the type-only import from `./lib/abs-sync-results`, and add:

  ```typescript
  import { computeTimesRead } from "@/lib/book";
  ```

- [ ] **Step 3: Add CLI flags**

  Same as Task 8 Step 3, in this file's `parseArgs` options:

  ```typescript
      "reread-min-prior-progress": { type: "string", default: "90" },
      "reread-drop-threshold": { type: "string", default: "50" },
  ```

  After `const apply = values.apply ?? false;`:

  ```typescript
  const rereadMinPriorProgress = Number(values["reread-min-prior-progress"]);
  const rereadDropThreshold = Number(values["reread-drop-threshold"]);
  if (Number.isNaN(rereadMinPriorProgress) || Number.isNaN(rereadDropThreshold)) {
    console.error("Error: --reread-min-prior-progress and --reread-drop-threshold must be numbers");
    process.exit(1);
  }
  ```

  Update `computeAbsResults`'s signature the same way as `computeResults` in Task 8 Step 3 (third optional `thresholds` param, same default shape), and update the call:

  ```typescript
  const results = computeAbsResults(absBooks, bookshelfBooks, {
    minPriorProgress: rereadMinPriorProgress,
    dropThreshold: rereadDropThreshold,
  });
  ```

- [ ] **Step 4: Add dry-run output**

  In `printResults`, after the `WOULD LOG PROGRESS` block and before `SKIPPED`, add:

  ```typescript
  const rereadLabel = apply ? "STARTED REREAD" : "WOULD START REREAD";
  console.log(`\n${rereadLabel} (${results.rereadStarts.length})`);
  for (const { bookshelfBook, newProgress } of results.rereadStarts) {
    console.log(`  • ${formatBook(bookshelfBook.title, bookshelfBook.author)}`);
    console.log(`    READ → READING | ${bookshelfBook.progress}% → ${newProgress}%`);
  }
  ```

  In the `if (!apply)` summary, add after `Would log progress:`:

  ```typescript
  console.log(`Would start reread:   ${pad(results.rereadStarts.length)}`);
  ```

  In `printApplySummary`, add a `rereadErrors: string[]` parameter and a matching line after `Logged progress:`:

  ```typescript
  console.log(`Started reread:       ${pad(results.rereadStarts.length - rereadErrors.length)}`);
  ```

- [ ] **Step 5: Wire into `main()`**

  ```typescript
  const rereadErrors = await applyRereadStarts(results.rereadStarts, user.id);
  ```

  Update the recalc guard:

  ```typescript
  if (results.progressUpdates.length > 0 || results.rereadStarts.length > 0) {
    await recalculateAllUserStats(prisma, user);
  }
  ```

  (Note this script has no `createdProgressLogged` — its guard is only these two conditions, matching this script's actual existing shape, not `sync-calibre.ts`'s.)

  Update the `printApplySummary` call and `allErrors`:

  ```typescript
  printApplySummary(results, statusErrors, progressErrors, rereadErrors);

  const allErrors = [...statusErrors, ...progressErrors, ...rereadErrors];
  ```

- [ ] **Step 6: Typecheck and dry-run smoke test**

  ```bash
  cd ~/bookshelf && pnpm tsc --noEmit
  pnpm run sync:abs
  ```

  Expected: no type errors; dry-run output includes `WOULD START REREAD (0)`.

- [ ] **Step 7: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/sync-abs.ts
  git commit -m "feat: apply reread detection in sync-abs.ts"
  ```

---

## Task 10: `reading-stats-utils.ts` — clamp negative progress deltas

**Files:**

- Modify: `src/lib/reading/reading-stats-utils.ts` (`calculatePagesPerDay` and `calculateWeeklyStats`'s inner `calculateWeekPages`)
- Test: `src/lib/reading/reading-stats-utils.test.tsx`

**Interfaces:**

- Consumes: nothing new from earlier tasks — this is a pure bugfix, independent of the sync-side work.
- Produces: nothing new downstream; existing exports keep their signatures.

- [ ] **Step 1: Write the failing test**

  In `src/lib/reading/reading-stats-utils.test.tsx`, find the `describe` block that tests `calculateDailyStats` (which exercises `calculatePagesPerDay` internally) and add:

  ```typescript
  it("clamps a negative day to zero pages instead of subtracting, when a reread drops progress below an old baseline", () => {
    const book = { id: 1, pageCount: 300, title: "Test" };
    const progress = [
      createFakeReadingProgress({
        id: "p1",
        bookId: 1,
        progress: 100,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      }),
      // A reread's first genuinely-logged row, well below the old 100%
      // baseline — must not produce a negative page count for this day.
      createFakeReadingProgress({
        id: "p2",
        bookId: 1,
        progress: 15,
        createdAt: new Date("2026-02-01T10:00:00Z"),
      }),
    ].map((p) => ({ ...p, book }));

    const result = calculateDailyStats(progress, "UTC");
    expect(result.averagePagesPerDay).toBeGreaterThanOrEqual(0);
  });
  ```

  (Adjust the exact factory/import names to match this file's existing conventions — check the top of the file for how `ReadingProgressWithBook` fixtures are built in neighboring tests and follow that pattern exactly rather than introducing a new one.)

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx -t "clamps a negative day"
  ```

  Expected: FAIL — without the clamp, `progressGain` for the Feb 1 entry is `15 - 100 = -85`, producing a negative page count.

- [ ] **Step 3: Implement the clamp in `calculatePagesPerDay`**

  In `src/lib/reading/reading-stats-utils.ts`, inside `calculatePagesPerDay` (around line 147), change:

  ```typescript
  const progressGain = dayMaxProgress - baseline;
  ```

  to:

  ```typescript
  // A reread resets progress below the old baseline. Without this clamp,
  // the first genuinely-logged row after a reread produces a large
  // negative progressGain, which fails the streak-qualifying threshold
  // for that day.
  const progressGain = Math.max(0, dayMaxProgress - baseline);
  ```

- [ ] **Step 4: Implement the same clamp in `calculateWeeklyStats`'s `calculateWeekPages`**

  Around line 269, change:

  ```typescript
  const progressGain = weekMaxProgress - baseline;
  ```

  to:

  ```typescript
  const progressGain = Math.max(0, weekMaxProgress - baseline);
  ```

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx
  ```

  Expected: PASS, including every pre-existing test in the file (the clamp is a no-op for any non-negative delta, which is every case that isn't a reread).

- [ ] **Step 6: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/reading/reading-stats-utils.ts src/lib/reading/reading-stats-utils.test.tsx
  git commit -m "fix: clamp negative daily/weekly progress deltas at zero"
  ```

---

## Task 11: `ReadingProgressWithBook` type + `stats-updates.ts` select

**Files:**

- Modify: `src/lib/types/reading.ts`
- Modify: `src/lib/reading/stats-updates.ts`

**Interfaces:**

- Consumes: `Book.previousFinishedAt`/`rereadAt` (Task 1).
- Produces: `ReadingProgressWithBook.book` now includes `finishedAt`, `previousFinishedAt`, `rereadAt` — Task 12 (`calculatePagesForBook`) requires this.

This is pure plumbing/setup for Task 12 — folded into its own small task because it touches a shared type consumed by multiple call sites, and getting the `select` wrong silently produces `undefined` at runtime rather than a compile error in some Prisma configurations, so it's worth its own verification step.

- [ ] **Step 1: Widen the type**

  In `src/lib/types/reading.ts`, change:

  ```typescript
  export type ReadingProgressWithBook = ReadingProgress & {
    book: Pick<Book, "pageCount" | "id" | "title">;
  };
  ```

  to:

  ```typescript
  export type ReadingProgressWithBook = ReadingProgress & {
    book: Pick<Book, "pageCount" | "id" | "title" | "finishedAt" | "previousFinishedAt" | "rereadAt">;
  };
  ```

- [ ] **Step 2: Update the one production query that feeds the stats functions**

  In `src/lib/reading/stats-updates.ts`, `recalculateAllUserStats`'s query (around line 21-24), change:

  ```typescript
  const allProgress = await db.readingProgress.findMany({
    where: { userId: user.id },
    include: { book: { select: { pageCount: true, id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });
  ```

  to:

  ```typescript
  const allProgress = await db.readingProgress.findMany({
    where: { userId: user.id },
    include: {
      book: {
        select: {
          pageCount: true,
          id: true,
          title: true,
          finishedAt: true,
          previousFinishedAt: true,
          rereadAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  ```

  **Do not** widen `src/trpc/routers/reading-progress.ts`'s `getRecentReadingProgress` query — it also returns `ReadingProgressWithBook` but never calls `calculateOverallStats`/`calculatePagesForBook`, so it doesn't need the new fields.

- [ ] **Step 3: Typecheck**

  ```bash
  cd ~/bookshelf && pnpm tsc --noEmit
  ```

  Expected: no errors (the widened `Pick` is a superset, so nothing that read the old narrower shape breaks).

- [ ] **Step 4: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/types/reading.ts src/lib/reading/stats-updates.ts
  git commit -m "feat: widen ReadingProgressWithBook for reread-aware stats"
  ```

---

## Task 12: `calculatePagesForBook` — credit every finish (all-time + daily average)

**Files:**

- Modify: `src/lib/reading/reading-stats-utils.ts` (`calculateOverallStats`, `calculateDailyStats`)
- Test: `src/lib/reading/reading-stats-utils.test.tsx`

**Interfaces:**

- Consumes: `ReadingProgressWithBook.book.{finishedAt,previousFinishedAt,rereadAt}` (Task 11).
- Produces: `calculatePagesForBook(entries, book): number` — used by both `calculateOverallStats` and `calculateDailyStats`, keeping them consistent with each other and with the yearly stats fix in Task 13.

- [ ] **Step 1: Write the failing tests**

  Add a new `describe` block to `src/lib/reading/reading-stats-utils.test.tsx`:

  ```typescript
  describe("calculatePagesForBook", () => {
    const book = (overrides = {}) => ({
      pageCount: 300,
      finishedAt: null as Date | null,
      previousFinishedAt: [] as Date[],
      rereadAt: null as Date | null,
      ...overrides,
    });

    it("matches the pre-existing max-progress formula for a book never reread", () => {
      const entries = [{ progress: 40, createdAt: new Date("2026-01-01") }];
      expect(calculatePagesForBook(entries as never, book())).toBe(120); // 40% of 300
    });

    it("credits the full page count once for a finished, never-reread book", () => {
      expect(calculatePagesForBook([], book({ finishedAt: new Date("2026-01-01") }))).toBe(300);
    });

    it("credits full page count twice for a book finished, then finished again", () => {
      expect(
        calculatePagesForBook(
          [],
          book({
            finishedAt: new Date("2026-08-01"),
            previousFinishedAt: [new Date("2026-01-01")],
          }),
        ),
      ).toBe(600);
    });

    it("does not leak a prior attempt's max progress into the open attempt's credit", () => {
      const rereadAt = new Date("2026-07-01");
      const entries = [
        // Belongs to the FINISHED prior attempt — must not count toward the
        // open attempt's max.
        { progress: 100, createdAt: new Date("2026-06-01") },
        // Belongs to the current, still-open attempt.
        { progress: 20, createdAt: new Date("2026-07-15") },
      ];
      const result = calculatePagesForBook(
        entries as never,
        book({ finishedAt: null, previousFinishedAt: [new Date("2026-06-01")], rereadAt }),
      );
      // 1 finished credit (300) + 20% of the OPEN attempt only (60), not 100%
      // of the pre-reread row leaking in.
      expect(result).toBe(360);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx -t "calculatePagesForBook"
  ```

  Expected: FAIL (not exported yet).

- [ ] **Step 3: Implement**

  Add to `src/lib/reading/reading-stats-utils.ts`, before `calculateDailyStats`:

  ```typescript
  // Credits every completed finish (matching calculateYearlyStats' logic)
  // plus the currently-open attempt's own progress, scoped to rows logged
  // after rereadAt so a prior attempt's higher max can't leak in as this
  // attempt's progress. Strict generalization of the old max-progress-per-book
  // formula: reduces to it exactly for any book that's never been reread
  // (timesRead <= 1, rereadAt === null).
  const calculatePagesForBook = (
    entries: ReadingProgressWithBook[],
    book: Pick<Book, "pageCount" | "finishedAt" | "previousFinishedAt" | "rereadAt">,
  ): number => {
    const timesRead = book.previousFinishedAt.length + (book.finishedAt !== null ? 1 : 0);
    const finishedPages = timesRead * (book.pageCount ?? 0);

    if (book.finishedAt !== null) return finishedPages; // no open attempt — done

    const openAttemptRows = entries.filter((e) => book.rereadAt === null || e.createdAt > book.rereadAt);
    const openAttemptMax = openAttemptRows.length > 0 ? Math.max(...openAttemptRows.map((e) => e.progress)) : 0;
    return finishedPages + calculatePagesFromProgress(openAttemptMax, book.pageCount);
  };
  ```

- [ ] **Step 4: Use it in `calculateOverallStats`**

  Replace the existing max-per-book aggregation (lines 350-367) — change:

  ```typescript
  const bookProgress = new Map<number, { max: number; pageCount: number | null }>();

  validProgress.forEach((entry) => {
    const current = bookProgress.get(entry.bookId);
    if (!current) {
      bookProgress.set(entry.bookId, {
        max: entry.progress,
        pageCount: entry.book.pageCount,
      });
    } else {
      current.max = Math.max(current.max, entry.progress);
    }
  });

  let totalPagesRead = 0;
  bookProgress.forEach(({ max, pageCount }) => {
    totalPagesRead += calculatePagesFromProgress(max, pageCount);
  });
  ```

  to:

  ```typescript
  const entriesByBook = new Map<number, ReadingProgressWithBook[]>();
  validProgress.forEach((entry) => {
    const existing = entriesByBook.get(entry.bookId) ?? [];
    entriesByBook.set(entry.bookId, [...existing, entry]);
  });

  let totalPagesRead = 0;
  entriesByBook.forEach((entries) => {
    totalPagesRead += calculatePagesForBook(entries, entries[0]!.book);
  });
  ```

- [ ] **Step 5: Use it in `calculateDailyStats`**

  Apply the identical replacement to `calculateDailyStats`'s own copy of the same pattern (lines 180-195) — same before/after shape as Step 4, inside that function.

- [ ] **Step 6: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx
  ```

  Expected: PASS, including every pre-existing `calculateOverallStats`/`calculateDailyStats` test (the "matches the pre-existing formula" test in Step 1 is the direct non-regression check).

- [ ] **Step 7: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/reading/reading-stats-utils.ts src/lib/reading/reading-stats-utils.test.tsx
  git commit -m "feat: credit every finish in all-time and daily-average page totals"
  ```

---

## Task 13: `calculateYearlyStats` — credit `previousFinishedAt`

**Files:**

- Modify: `src/lib/reading/reading-stats-utils.ts` (`calculateYearlyStats`)
- Modify: `src/trpc/routers/user.ts` (`getYearlyBookStats`)
- Test: `src/lib/reading/reading-stats-utils.test.tsx`

**Interfaces:**

- Consumes: `Book.previousFinishedAt` (Task 1).
- Produces: nothing new downstream — this closes the yearly-stats half of the Progress-history invariant fix.

- [ ] **Step 1: Write the failing test**

  Add to `src/lib/reading/reading-stats-utils.test.tsx`, in (or near) the existing `calculateYearlyStats` tests:

  ```typescript
  it("counts a twice-read book in both years it was finished, not just the current finishedAt year", () => {
    const book = createFakeBook({
      finishedAt: new Date("2026-08-01"),
      previousFinishedAt: [new Date("2025-03-01")],
      pageCount: 300,
    });

    const result = calculateYearlyStats([book], 0, "UTC");
    const years = result.booksFinishedByYear.map((y) => y.year).sort();
    expect(years).toEqual([2025, 2026]);
    expect(result.pagesFinishedByYear.find((y) => y.year === 2025)?.pages).toBe(300);
    expect(result.pagesFinishedByYear.find((y) => y.year === 2026)?.pages).toBe(300);
  });

  it("does not count a mid-reread book (finishedAt null) in the CURRENT attempt's absent year, only its prior finish", () => {
    const book = createFakeBook({
      finishedAt: null,
      previousFinishedAt: [new Date("2025-03-01")],
      pageCount: 300,
    });

    const result = calculateYearlyStats([book], 0, "UTC");
    expect(result.booksFinishedByYear).toEqual([{ year: 2025, count: 1 }]);
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx -t "twice-read book"
  ```

  Expected: FAIL — `calculateYearlyStats` currently filters on `finishedAt != null` alone and ignores `previousFinishedAt`.

- [ ] **Step 3: Implement**

  Replace `calculateYearlyStats` (lines 295-327) with:

  ```typescript
  export const calculateYearlyStats = (
    books: Book[],
    readingGoalThreshold: number,
    timezone: string = DEFAULT_TIMEZONE,
  ): YearlyStats => {
    const validBooks = books.filter(
      (book): book is Book & { pageCount: number } =>
        (book.finishedAt != null || book.previousFinishedAt.length > 0) &&
        book.pageCount != null &&
        book.pageCount >= readingGoalThreshold,
    );

    if (validBooks.length === 0) return { booksFinishedByYear: [], pagesFinishedByYear: [] };

    const booksByYear = new Map<number, number>();
    const pagesByYear = new Map<number, number>();

    const creditYear = (finishDate: Date, pageCount: number) => {
      const year = getYearInTimezone(finishDate, timezone);
      booksByYear.set(year, (booksByYear.get(year) ?? 0) + 1);
      pagesByYear.set(year, (pagesByYear.get(year) ?? 0) + pageCount);
    };

    validBooks.forEach((book) => {
      if (book.finishedAt !== null) creditYear(book.finishedAt, book.pageCount);
      for (const priorFinish of book.previousFinishedAt) creditYear(priorFinish, book.pageCount);
    });

    return {
      booksFinishedByYear: Array.from(booksByYear.entries(), ([year, count]) => ({
        year,
        count,
      })).sort((a, b) => b.year - a.year),
      pagesFinishedByYear: Array.from(pagesByYear.entries(), ([year, pages]) => ({
        year,
        pages,
      })).sort((a, b) => b.year - a.year),
    } satisfies YearlyStats;
  };
  ```

  (The type predicate drops `finishedAt: Date` from its refinement since a mid-reread book with a real `previousFinishedAt` history but null `finishedAt` must still pass the filter — `creditYear` is called conditionally inside the `forEach` instead of relying on the predicate to guarantee a non-null `finishedAt`.)

- [ ] **Step 4: Fix `getYearlyBookStats`'s `where` clause**

  In `src/trpc/routers/user.ts`, the `getYearlyBookStats` query (around line 129-131), change:

  ```typescript
  const books = await ctx.db.book.findMany({
    where: { userId: ctx.currentUser.id, finishedAt: { not: null } },
  });
  ```

  to:

  ```typescript
  const books = await ctx.db.book.findMany({
    where: {
      userId: ctx.currentUser.id,
      OR: [{ finishedAt: { not: null } }, { previousFinishedAt: { isEmpty: false } }],
    },
  });
  ```

  (No `select` needed — this query already returns the full `Book` shape, which now includes `previousFinishedAt` automatically.)

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  cd ~/bookshelf && pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx
  pnpm tsc --noEmit
  ```

  Expected: PASS; no type errors in `user.ts`.

- [ ] **Step 6: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/reading/reading-stats-utils.ts src/trpc/routers/user.ts
  git commit -m "fix: credit previousFinishedAt in yearly stats and its source query"
  ```

---

## Task 14: Book detail page — display "times read"

**Files:**

- Modify: `src/app/(authed)/books/[bookId]/page.tsx`

**Interfaces:**

- Consumes: `computeTimesRead` (Task 5), `Book.previousFinishedAt` (flows through automatically via `book.getBook`'s existing `include: SERIES_INCLUDE` with no `select` — no query change needed).

- [ ] **Step 1: Add the import**

  At the top of `src/app/(authed)/books/[bookId]/page.tsx`, add `computeTimesRead` to the existing `@/lib/book` import (or add a new import line if none exists yet).

- [ ] **Step 2: Add the display**

  In the metadata row (around line 108-129, the `<div className="text-primary flex items-center gap-x-4">` block), add a new conditional segment after the published-year block and before the rating block:

  ```typescript
              {computeTimesRead(book) > 1 && (
                <>
                  <span className="text-secondary align-middle">•</span>
                  <span className="text-sm">Read {computeTimesRead(book)} times</span>
                </>
              )}
  ```

````

  (Gated on `> 1`, not `> 0` — a book read exactly once doesn't need a "Read 1 times" badge cluttering a page that already shows its `READ` status and finish date elsewhere; the badge is only useful once there's a reread to report.)

- [ ] **Step 3: Manual verification**

  ```bash
  cd ~/bookshelf && pnpm dev
````

Navigate to a book detail page for a book with no reread history — confirm no badge appears. This can't be fully exercised end-to-end until a real reread has been detected via the sync scripts (Tasks 8/9); a component-level snapshot test is optional here given the rest of the codebase has no existing test coverage for this specific page (verified: no test file exists alongside `page.tsx`).

- [ ] **Step 4: Commit**

  ```bash
  cd ~/bookshelf && git add "src/app/(authed)/books/[bookId]/page.tsx"
  git commit -m "feat: show times-read count on book detail page"
  ```

---

## Task 15: Export/import — `previousFinishedAt` and `rereadAt`

**Files:**

- Modify: `src/lib/export/export-utils.ts`
- Modify: `src/lib/schemas/import.ts`
- Modify: `src/lib/import/import-csv.ts`
- Modify: `src/lib/import/import-json.ts`

**Interfaces:**

- Consumes: `Book.previousFinishedAt`/`rereadAt` (Task 1). `BookForExport` (`src/lib/types/export.ts`) needs no code change — it's derived automatically from Prisma's `Book` type via `BookGetPayload`, so it already includes the two new fields.

- [ ] **Step 1: Add the two columns to CSV export**

  In `src/lib/export/export-utils.ts`, `exportBooksToCSV`'s `headers` array, add after `"finishedAt"`:

  ```typescript
      "previousFinishedAt",
      "rereadAt",
  ```

  In the `rows` mapping, add after `book.finishedAt?.toISOString() ?? "",`:

  ```typescript
      book.previousFinishedAt.map((d) => d.toISOString()).join(","),
      book.rereadAt?.toISOString() ?? "",
  ```

  (The existing `escapeCSV` already quotes any comma-containing cell correctly — no new delimiter scheme needed for the comma-joined timestamp list.)

- [ ] **Step 2: Add the two fields to the JSON import schema**

  In `src/lib/schemas/import.ts`, inside `importJSONSchema`'s `books` array item schema, add after `finishedAt: z.coerce.date().nullable(),`:

  ```typescript
        previousFinishedAt: z.array(z.coerce.date()),
        rereadAt: z.coerce.date().nullable(),
  ```

- [ ] **Step 3: Add the two fields to the CSV import schema**

  In `bookCSVSchema`, add after `finishedAt: emptyToNullDate,`:

  ```typescript
    previousFinishedAt: z.preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v.split(",") : []),
      z.array(z.coerce.date()),
    ),
    rereadAt: emptyToNullDate,
  ```

- [ ] **Step 4: Wire both fields into the two `book.create` calls**

  In `src/lib/import/import-csv.ts`, add to the `data:` object after `finishedAt: book.finishedAt,`:

  ```typescript
            previousFinishedAt: { set: book.previousFinishedAt },
            rereadAt: book.rereadAt,
  ```

  Apply the identical addition in `src/lib/import/import-json.ts`'s `book.create` call.

- [ ] **Step 5: Typecheck**

  ```bash
  cd ~/bookshelf && pnpm tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 6: Manual round-trip verification**

  Export a small set of books to CSV, confirm the new `previousFinishedAt`/`rereadAt` columns appear (empty for books with no reread history), and that re-importing the same file doesn't throw. A full re-import test needs a book with actual reread history to exercise the array-parsing path meaningfully — acceptable to defer full verification until Task 8/9 have produced a real reread in a dev DB (see this project's existing precedent: "no new unit tests are required" for comparable metadata-sync changes, verified manually with a dry run).

- [ ] **Step 7: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/export/export-utils.ts src/lib/schemas/import.ts src/lib/import/import-csv.ts src/lib/import/import-json.ts
  git commit -m "feat: include previousFinishedAt and rereadAt in export/import"
  ```

---

## Task 16: Test/seed factories

**Files:**

- Modify: `src/lib/test-utils.ts`
- Modify: `scripts/seed-dev-user.ts`

**Interfaces:**

- Consumes: `Book.previousFinishedAt`/`rereadAt` (Task 1).

Neither factory strictly needs this to avoid breaking (verified: both already omit `dnfAt`/`resetAt` without issue — the `test-utils.ts` factory casts `as BookWithSeries`, and `seed-dev-user.ts` relies on the column's `@default`). Added because tests exercising `computeTimesRead`/reread logic elsewhere in this codebase need a factory that can produce non-default values for these fields via `overrides`.

- [ ] **Step 1: Update `createFakeBook`**

  In `src/lib/test-utils.ts`, in `createFakeBook` (around line 131-161), add after `finishedAt: null,`:

  ```typescript
      previousFinishedAt: [],
      rereadAt: null,
  ```

- [ ] **Step 2: Run the full test suite to confirm nothing regresses**

  ```bash
  cd ~/bookshelf && pnpm vitest run
  ```

  Expected: PASS — this is the broadest possible check that adding two fields to the shared factory hasn't broken any consumer across the whole test suite.

- [ ] **Step 3: Commit**

  ```bash
  cd ~/bookshelf && git add src/lib/test-utils.ts
  git commit -m "test: add previousFinishedAt/rereadAt to createFakeBook factory"
  ```

  (`scripts/seed-dev-user.ts` is intentionally left unchanged — its explicit `data:` object relies on the column's `@default([])`/`null`, which is correct and requires no edit; verified in Task 15's investigation, not worth a no-op commit here.)

---

## Task 17: `manage-reread.ts` — false-positive cleanup script

**Files:**

- Create: `scripts/manage-reread.ts`
- Modify: `package.json` (`scripts` block)

**Interfaces:**

- Consumes: `Book.previousFinishedAt`/`rereadAt` (Task 1).

Unscheduled manual tool, same tier as `scripts/find-fuzzy-duplicates.ts` — not committed to cron, not run automatically. No test file: this project has no existing precedent for testing its manual/unscheduled scripts (verified: `find-fuzzy-duplicates.ts` has no test file either), so this follows the same convention.

- [ ] **Step 1: Write the script**

  ```typescript
  import "dotenv/config";

  import { parseArgs } from "node:util";

  import { recalculateAllUserStats } from "@/lib/reading/stats-updates";
  import prisma from "@/lib/prisma";

  async function listBook(bookId: number): Promise<void> {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        finishedAt: true,
        previousFinishedAt: true,
        rereadAt: true,
      },
    });
    if (!book) {
      console.error(`No book found with id ${bookId}`);
      process.exit(1);
    }
    console.log(`"${book.title}" (id ${book.id})`);
    console.log(`  status:              ${book.status}`);
    console.log(`  progress:            ${book.progress}%`);
    console.log(`  finishedAt:          ${book.finishedAt?.toISOString() ?? "null"}`);
    console.log(`  rereadAt:            ${book.rereadAt?.toISOString() ?? "null"}`);
    console.log(`  previousFinishedAt:  [${book.previousFinishedAt.map((d) => d.toISOString()).join(", ")}]`);
  }

  async function undoLast(bookId: number): Promise<void> {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true, previousFinishedAt: true, rereadAt: true, userId: true },
    });
    if (!book) {
      console.error(`No book found with id ${bookId}`);
      process.exit(1);
    }
    if (book.previousFinishedAt.length === 0) {
      console.log(`"${book.title}": nothing to undo — previousFinishedAt is empty.`);
      return;
    }

    const restoredFinishedAt = book.previousFinishedAt[book.previousFinishedAt.length - 1]!;
    const remainingPreviousFinishedAt = book.previousFinishedAt.slice(0, -1);

    // Delete progress rows logged since the reread started, NOT since the
    // restored finishedAt — applyBookUpdates/applyProgressUpdates run as
    // separate steps in each sync script, so the original read's own final
    // progress row is routinely stamped AFTER its finishedAt and would be
    // wrongly deleted by a "since finishedAt" rule.
    const deleteFrom = book.rereadAt ?? restoredFinishedAt;

    await prisma.$transaction(async (tx) => {
      await tx.readingProgress.deleteMany({
        where: { bookId: book.id, createdAt: { gte: deleteFrom } },
      });
      await tx.book.update({
        where: { id: book.id },
        data: {
          previousFinishedAt: { set: remainingPreviousFinishedAt },
          status: "READ",
          // Approximation, not an exact restore — the pre-reread progress
          // value isn't preserved; isRereadStart's prior-progress gate means
          // the real value was at least minPriorProgress, so 100 is close.
          // previousStartedAt isn't tracked, so startedAt is left as-is —
          // undo is explicitly lossy on that field.
          progress: 100,
          finishedAt: restoredFinishedAt,
          dnfAt: null,
          resetAt: null,
          rereadAt: null,
        },
      });
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: book.userId } });
    await recalculateAllUserStats(prisma, user);

    console.log(
      `"${book.title}" (id ${book.id}): undone. Restored to READ, finished ${restoredFinishedAt.toISOString()}.`,
    );
  }

  async function main(): Promise<void> {
    const { values, positionals } = parseArgs({
      options: {
        list: { type: "string" },
        "undo-last": { type: "string" },
      },
      allowPositionals: true,
    });

    if (values.list !== undefined) {
      await listBook(Number(values.list));
    } else if (values["undo-last"] !== undefined) {
      await undoLast(Number(values["undo-last"]));
    } else {
      console.error("Usage: pnpm run manage:reread -- --list <bookId> | --undo-last <bookId>");
      process.exit(1);
    }
  }

  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
  ```

- [ ] **Step 2: Register the script in `package.json`**

  In the `scripts` block, add alongside the existing `"find:fuzzy-duplicates"` entry:

  ```json
      "manage:reread": "tsx scripts/manage-reread.ts"
  ```

- [ ] **Step 3: Typecheck and smoke-test against a real book id**

  ```bash
  cd ~/bookshelf && pnpm tsc --noEmit
  pnpm run manage:reread -- --list <a real book id from your dev/prod DB>
  ```

  Expected: no type errors; `--list` prints the book's current state without error. (`--undo-last` is destructive — don't smoke-test it against real data without a book that actually has `previousFinishedAt` entries, which won't exist until Task 8/9 have run for real.)

- [ ] **Step 4: Commit**

  ```bash
  cd ~/bookshelf && git add scripts/manage-reread.ts package.json
  git commit -m "feat: add manage-reread.ts false-positive cleanup script"
  ```

---

## Final check

After all 17 tasks (0 is manual, 1-17 are code):

- [ ] `pnpm tsc --noEmit` — zero errors across the whole project
- [ ] `pnpm vitest run` — full suite passes
- [ ] `pnpm run sync:calibre` and `pnpm run sync:abs` (dry run, no `--apply`) both complete without crashing and show a `WOULD START REREAD` section
- [ ] Re-read `docs/superpowers/specs/2026-08-15-book-reread-support-design.md`'s Testing section one more time and confirm every bullet has a corresponding task above (cross-reference: `isRereadStart` gates → Task 4; `rereadAt` regression test → Tasks 2+3; bucket-exclusivity + dedup tests → Tasks 6/7; `computeTimesRead` → Task 5; yearly/clamp/`calculatePagesForBook` tests → Tasks 10/12/13)
