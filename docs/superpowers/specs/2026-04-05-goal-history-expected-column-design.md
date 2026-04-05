# Goal History — Expected Column

**Date:** 2026-04-05

## Summary

Add an "Expected" column to the goal history table that shows the expected book count at the current point in the year for the current year's row. Past year rows show `—` in this column, keeping the table layout consistent across all rows.

## Context

The `ReadingGoalStats` type already includes `expectedAtThisPoint`, computed in `calculateReadingGoalStats` as:

```
Math.round((goal / daysInYear) * dayOfYear)
```

The `enrichGoalHistory` function builds `EnrichedGoalHistoryEntry[]` from raw history but does not currently expose this value. The goal history table (`reading-goal-columns.tsx`) renders one column per field on `EnrichedGoalHistoryEntry`.

## Approach

Extend `enrichGoalHistory` to accept an optional `referenceDate` parameter (defaulting to `new Date()`). For the entry whose `year` matches `referenceDate.getFullYear()`, compute `expectedAtThisPoint` using the same formula as `calculateReadingGoalStats`. All other entries receive `null`, which renders as `—` in the table.

This keeps the enrichment self-contained and testable (matching the pattern used in `calculateReadingGoalStats`).

## Changes

### 1. `src/lib/types/goals.ts`

Add `expectedAtThisPoint: number | null` to `EnrichedGoalHistoryEntry`.

### 2. `src/lib/reading/reading-goal-utils.ts`

- Add optional `referenceDate: Date = new Date()` parameter to `enrichGoalHistory`
- Import `getDayOfYear` and `getDaysInYear` from `date-fns` (already imported in this file)
- For each entry: if `entry.year === referenceDate.getFullYear()` and `entry.goal > 0`, compute `expectedAtThisPoint`; otherwise `null`

### 3. `src/components/reading-goals/reading-goal-columns.tsx`

Add a new column with:

- `accessorKey: "expectedAtThisPoint"`
- `header: "Expected"`
- Cell: render `—` if `null`, otherwise the numeric value

### 4. `src/lib/reading/reading-goal-utils.test.tsx`

- Pass a fixed `referenceDate` to all existing `enrichGoalHistory` calls so results are deterministic
- Add tests covering: current year entry gets computed value, past year entries get `null`, goal of 0 gets `null`

## Consistency

Every row in the table will have the same columns. Past-year rows render `—` in the Expected column exactly as other non-applicable cells (e.g., `progressPercentage` when `goal === 0`, `differenceFromPrevious` for the first entry). No special casing in the table component is required.
