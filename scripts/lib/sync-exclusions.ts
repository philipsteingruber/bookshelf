// Books the nightly sync scripts must never ingest.
//
// The only entry today is the Concordance sandbox: a book with no real reading
// on either side, used to test reading-position sync by setting progress by
// hand. CWA's Kobo bookmark only ratchets forward (the fork's SQL arbiter
// rejects any lower percentage), so test progress cannot be reset through the
// API — without this list, whatever high-water mark a test reached would be
// logged as real reading at 02:15 and counted toward streaks. See
// docs/kb/reading-progress-sync.md in the homelab repo.
//
// Keyed on stable source IDs, not titles, so a metadata edit can't silently
// re-admit a book.

export const EXCLUDED_CALIBRE_IDS: ReadonlySet<number> = new Set([
  463, // Lucky Day — Concordance sandbox
]);

export const EXCLUDED_ABS_ITEM_IDS: ReadonlySet<string> = new Set([
  "c7f6855f-907b-4bc5-ab25-708e2273ead1", // Lucky Day — Concordance sandbox
]);

export interface ExclusionResult<T> {
  kept: T[];
  skipped: T[];
}

// Splits source records into those to sync and those to skip. Skipped records
// are returned rather than discarded so the caller can log them — a book that
// silently vanishes from a sync is harder to debug than one named in the log.
export function partitionExcluded<T, K>(
  items: readonly T[],
  keyOf: (item: T) => K,
  excluded: ReadonlySet<K>,
): ExclusionResult<T> {
  const result: ExclusionResult<T> = { kept: [], skipped: [] };
  for (const item of items) {
    if (excluded.has(keyOf(item))) {
      result.skipped.push(item);
    } else {
      result.kept.push(item);
    }
  }
  return result;
}
