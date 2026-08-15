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

export function deriveStatus(
  readStatus: number | null,
  koboreadpct: number | null,
  dnf: boolean,
  isReadNext: boolean = false,
): ReadStatus {
  if (dnf) return "DNF";
  if (readStatus === 1 || koboreadpct === 100) return "READ";
  if (readStatus === 2 || (koboreadpct !== null && koboreadpct > 0 && koboreadpct < 100))
    return "READING";
  if (isReadNext) return "READ_NEXT";
  return "TO_READ";
}

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

export function deriveAbsStatus(progressPercent: number, isFinished: boolean): ReadStatus {
  if (isFinished || progressPercent >= 100) return "READ";
  if (progressPercent > 0) return "READING";
  return "TO_READ";
}

// Detects the start of a genuine reread from sync data alone. Deliberately a
// standalone predicate, not folded into shouldUpdateStatus — shouldUpdateStatus
// returns a bare boolean the caller uses to build an ordinary BookUpdate, which
// would let a detected reread land in BOTH the normal update bucket and a new
// reread bucket in the same sync run. Calling this FIRST and skipping the
// normal branches when it fires is what keeps the two paths disjoint.
export function isRereadStart(
  bookshelfBook: {
    status: ReadStatus;
    progress: number;
    finishedAt: Date | null;
    rereadAt: Date | null;
  },
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
    sourceUpdatedAt > bookshelfBook.finishedAt && // rules out a stale source
    // signal that predates the finish.
    (bookshelfBook.rereadAt === null || sourceUpdatedAt > bookshelfBook.rereadAt) // once a
    // reread has been detected (and possibly undone via manage-reread.ts's
    // --undo-last, which deliberately leaves rereadAt set as a suppression
    // marker rather than clearing it), the same stale source row must not
    // re-trigger detection on the next sync — the source's own timestamp
    // has to be newer than the reread marker itself, not just newer than
    // the (possibly restored) finishedAt.
  );
}
