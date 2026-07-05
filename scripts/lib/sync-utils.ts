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

export function shouldUpdateStatus(current: ReadStatus, derived: ReadStatus): boolean {
  // DNF and READ share a priority tier so neither sync source can silently
  // downgrade a finished/abandoned book. But a DNF book with newly-synced
  // progress means the user resumed it on their device — that should clear
  // DNF rather than get stuck there forever, so it's special-cased past the
  // priority tie instead of folded into STATUS_PRIORITY.
  if (current === "DNF" && (derived === "READING" || derived === "READ")) return true;
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
