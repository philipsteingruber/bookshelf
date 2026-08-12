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
  return statusPriority(derived) > statusPriority(current);
}

export function shouldLogProgress(
  koboreadpct: number | null,
  currentProgress: number,
): boolean {
  return koboreadpct !== null && koboreadpct > currentProgress;
}

export function deriveAbsStatus(progressPercent: number, isFinished: boolean): ReadStatus {
  if (isFinished || progressPercent >= 100) return "READ";
  if (progressPercent > 0) return "READING";
  return "TO_READ";
}
