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
): ReadStatus {
  if (dnf) return "DNF";
  if (readStatus === 1 || koboreadpct === 100) return "READ";
  if (readStatus === 2 || (koboreadpct !== null && koboreadpct > 0 && koboreadpct < 100))
    return "READING";
  return "TO_READ";
}

export function shouldUpdateStatus(current: ReadStatus, derived: ReadStatus): boolean {
  return statusPriority(derived) > statusPriority(current);
}

export function shouldLogProgress(
  koboreadpct: number | null,
  currentProgress: number,
): boolean {
  return koboreadpct !== null && koboreadpct > currentProgress;
}
