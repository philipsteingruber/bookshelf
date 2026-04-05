# Goal History — Expected Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Expected" column to the goal history table showing the on-pace book count for the current year, and `—` for all past years.

**Architecture:** Extend `enrichGoalHistory` with an optional `referenceDate` parameter. For the entry whose year matches the reference year, compute `expectedAtThisPoint` using the existing formula (`Math.round(goal / daysInYear * dayOfYear)`). All other entries receive `null`. The column cell renders `—` for `null`.

**Tech Stack:** TypeScript, React, TanStack Table (`@tanstack/react-table`), `date-fns`

---

## File Map

| File                                                    | Change                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/types/goals.ts`                                | Add `expectedAtThisPoint: number \| null` to `EnrichedGoalHistoryEntry` |
| `src/lib/reading/reading-goal-utils.ts`                 | Add `referenceDate` param to `enrichGoalHistory`, compute field         |
| `src/lib/reading/reading-goal-utils.test.tsx`           | Update `satisfies` test; add new tests for the field                    |
| `src/components/reading-goals/reading-goal-columns.tsx` | Add "Expected" column                                                   |

---

### Task 1: Add type field and write failing tests (red phase)

**Files:**

- Modify: `src/lib/types/goals.ts`
- Modify: `src/lib/reading/reading-goal-utils.test.tsx`

- [ ] **Step 1: Add `expectedAtThisPoint` to `EnrichedGoalHistoryEntry`**

In `src/lib/types/goals.ts`, update `EnrichedGoalHistoryEntry`:

```ts
export interface EnrichedGoalHistoryEntry extends GoalHistoryEntry {
  progressPercentage: number | null;
  difference: number;
  differenceFromPrevious: number | null;
  expectedAtThisPoint: number | null;
}
```

- [ ] **Step 2: Run tsc to confirm the type change breaks the implementation**

```bash
pnpm tsc --noEmit 2>&1
```

Expected: error in `reading-goal-utils.ts` — `enrichGoalHistory` returns an object missing `expectedAtThisPoint`.

- [ ] **Step 3: Update the existing `satisfies` test to include the new field**

The one test that checks the full object shape (line ~554) uses `enrichGoalHistory` without a `referenceDate`, which will be non-deterministic after the change. Pass `mockDate` to make it deterministic.

`mockDate` is `new Date("2026-01-15T12:00:00")` — day 15 of 365. For `goal: 10`:
`Math.round(10 / 365 * 15) = Math.round(0.411) = 0`

In `src/lib/reading/reading-goal-utils.test.tsx`, update the "should handle single entry correctly" test:

```ts
it("should handle single entry correctly (oldest year case)", () => {
  const input: GoalHistoryEntry[] = [{ year: currentYear, goal: 10, actual: 7 }];

  const result = enrichGoalHistory(input, mockDate);

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({
    year: currentYear,
    goal: 10,
    actual: 7,
    progressPercentage: 70,
    difference: -3,
    differenceFromPrevious: null,
    expectedAtThisPoint: 0,
  } satisfies EnrichedGoalHistoryEntry);
});
```

- [ ] **Step 4: Add three new tests for `expectedAtThisPoint` at the end of the `enrichGoalHistory` describe block (before the closing `})`)**

Add a `refDate` constant at the top of the `enrichGoalHistory` describe block:

- `new Date("2026-07-01")` = day 182 of 365
- `goal=10`: `Math.round(10 / 365 * 182) = Math.round(4.986) = 5`
- `goal=0`: returns `null` (no goal set)
- past year entries: `null`

```ts
describe("enrichGoalHistory", () => {
  const refDate = new Date("2026-07-01"); // day 182 of 365

  // ... existing tests unchanged above ...

  it("should compute expectedAtThisPoint for the current year entry", () => {
    const input: GoalHistoryEntry[] = [{ year: currentYear, goal: 10, actual: 3 }];

    const result = enrichGoalHistory(input, refDate);

    // Math.round(10 / 365 * 182) = 5
    expect(result[0].expectedAtThisPoint).toBe(5);
  });

  it("should return null for expectedAtThisPoint for past year entries", () => {
    const input: GoalHistoryEntry[] = [
      { year: currentYear, goal: 10, actual: 5 },
      { year: currentYear - 1, goal: 10, actual: 8 },
    ];

    const result = enrichGoalHistory(input, refDate);

    const pastEntry = result.find((e) => e.year === currentYear - 1);
    expect(pastEntry?.expectedAtThisPoint).toBeNull();
  });

  it("should return null for expectedAtThisPoint when goal is 0", () => {
    const input: GoalHistoryEntry[] = [{ year: currentYear, goal: 0, actual: 5 }];

    const result = enrichGoalHistory(input, refDate);

    expect(result[0].expectedAtThisPoint).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests to confirm new tests fail**

```bash
pnpm test -- reading-goal-utils 2>&1
```

Expected: 4 failures — the 3 new tests fail because `expectedAtThisPoint` doesn't exist yet, and the `satisfies` test fails due to the shape mismatch.

---

### Task 2: Implement `enrichGoalHistory` update (green phase)

**Files:**

- Modify: `src/lib/reading/reading-goal-utils.ts`

- [ ] **Step 1: Update `enrichGoalHistory` to accept `referenceDate` and compute the field**

`getDayOfYear` and `getDaysInYear` are already imported from `date-fns` at the top of the file.

Replace the entire `enrichGoalHistory` function in `src/lib/reading/reading-goal-utils.ts`:

```ts
export const enrichGoalHistory = (
  goalHistory: GoalHistoryEntry[],
  referenceDate: Date = new Date(),
): EnrichedGoalHistoryEntry[] => {
  if (goalHistory.length === 0) {
    return [];
  }

  const currentYear = referenceDate.getFullYear();
  const reversed = goalHistory.toReversed();
  const result = reversed.map((entry, index) => {
    const expectedAtThisPoint =
      entry.year === currentYear && entry.goal > 0
        ? Math.round((entry.goal / getDaysInYear(referenceDate)) * getDayOfYear(referenceDate))
        : null;

    return {
      ...entry,
      progressPercentage: entry.goal === 0 ? null : Math.round((entry.actual / entry.goal) * 100),
      difference: entry.actual - entry.goal,
      differenceFromPrevious: index === 0 ? null : entry.actual - reversed[index - 1].actual,
      expectedAtThisPoint,
    };
  });

  return result.toReversed();
};
```

- [ ] **Step 2: Run tsc to confirm no type errors**

```bash
pnpm tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 3: Run tests to confirm all pass**

```bash
pnpm test -- reading-goal-utils 2>&1
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/goals.ts src/lib/reading/reading-goal-utils.ts src/lib/reading/reading-goal-utils.test.tsx
git commit -m "feat(goals): add expectedAtThisPoint to enrichGoalHistory"
```

---

### Task 3: Add "Expected" column to the history table

**Files:**

- Modify: `src/components/reading-goals/reading-goal-columns.tsx`

- [ ] **Step 1: Add the "Expected" column after the "Goal" column**

In `src/components/reading-goals/reading-goal-columns.tsx`, insert the new column definition after the `goal` column (after line ~17):

```ts
export const columns: ColumnDef<EnrichedGoalHistoryEntry>[] = [
  { accessorKey: "year", header: "Year" },
  {
    accessorKey: "goal",
    header: "Goal",
    cell: ({ row }) => {
      const goal = row.getValue("goal");
      return goal === 0 ? "—" : goal;
    },
  },
  {
    accessorKey: "expectedAtThisPoint",
    header: "Expected",
    cell: ({ row }) => {
      const expected = row.getValue("expectedAtThisPoint") as number | null;

      if (expected === null) {
        return <span className="text-muted-foreground">—</span>;
      }

      return expected;
    },
  },
  { accessorKey: "actual", header: "Actual" },
  // ... rest of columns unchanged
```

- [ ] **Step 2: Run the full test suite**

```bash
pnpm test 2>&1
```

Expected: all tests pass.

- [ ] **Step 3: Run tsc**

```bash
pnpm tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/components/reading-goals/reading-goal-columns.tsx
git commit -m "feat(goals): add Expected column to goal history table"
```
