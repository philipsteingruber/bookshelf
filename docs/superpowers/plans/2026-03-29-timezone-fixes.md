# Timezone Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all places where dates are calculated or displayed using UTC instead of the user's configured timezone.

**Architecture:** All DateTime values are stored in UTC in the database (correct). The bugs are in (a) reading them back for calculations using UTC boundaries instead of the user's local-time boundaries, and (b) displaying them with `toLocaleString()`/`toLocaleDateString()` instead of `formatInTimeZone`. The fix pattern is consistent: use `toZonedTime`/`fromZonedTime` from `date-fns-tz` to convert between UTC storage and local-time logic on the server, and use `formatInTimeZone` wherever a date is displayed or a year/day is extracted.

**Tech Stack:** date-fns, date-fns-tz (already installed), tRPC, React, Prisma (Postgres, UTC storage)

---

## Files Changed

| File                                                                   | Change                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/reading/reading-stats-utils.ts`                               | Add `timezone` param to `calculateYearlyStats`                                                                                |
| `src/lib/reading/reading-stats-utils.test.tsx`                         | Add timezone test for `calculateYearlyStats`                                                                                  |
| `src/lib/reading/chart-utils.ts`                                       | Add `timezone` param to `aggregateByDay`; import `formatInTimeZone`                                                           |
| `src/lib/reading/chart-utils.test.tsx`                                 | Add timezone test for `aggregateByDay`                                                                                        |
| `src/trpc/routers/reading-progress.ts`                                 | Fix "today" query + "same day" delete check; import `fromZonedTime`, `toZonedTime`, `endOfDay`                                |
| `src/trpc/routers/reading-progress.test.tsx`                           | Add timezone tests for both fixes                                                                                             |
| `src/trpc/routers/user.ts`                                             | Fix year calculation in `setReadingGoal`/`getReadingGoal`; pass timezone to `calculateYearlyStats`; import `formatInTimeZone` |
| `src/trpc/routers/user.test.tsx`                                       | Add timezone tests for year calculation + `getYearlyBookStats`                                                                |
| `src/components/books/book-details/reading-progress-history-graph.tsx` | Add `timezone` prop; pass to `aggregateByDay`; fix `toLocaleString()` → `formatInTimeZone`                                    |
| `src/components/books/book-details/reading-progress-history-table.tsx` | Add `timezone` prop; pass to `aggregateByDay`                                                                                 |
| `src/app/(authed)/books/[bookId]/page.tsx`                             | Query timezone; pass to components + `aggregateByDay`                                                                         |
| `src/app/(authed)/dashboard/page.tsx`                                  | Query timezone; fix `toLocaleDateString()` → `formatInTimeZone`                                                               |

---

## Task 1: Fix `calculateYearlyStats` to use user timezone for year extraction

**Files:**

- Modify: `src/lib/reading/reading-stats-utils.ts:293-323`
- Test: `src/lib/reading/reading-stats-utils.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside the `describe("calculateYearlyStats")` block in `reading-stats-utils.test.tsx`:

```typescript
it("should assign books to local year, not UTC year, when timezone is provided", () => {
  // A book finished at 11 PM UTC-5 on Dec 31 is Jan 1 UTC — wrong year in UTC
  // finishedAt = 2025-01-01T03:00:00Z = Dec 31 2024 at 10 PM EST
  const fakeBook = createFakeBook({
    finishedAt: new Date("2025-01-01T03:00:00Z"),
    pageCount: 300,
  });

  const result = calculateYearlyStats(
    [fakeBook],
    READING_GOAL_DEFAULT_THRESHOLD,
    "America/New_York",
  );

  // In America/New_York the book was finished on Dec 31 2024, not Jan 1 2025
  expect(result.booksFinishedByYear).toEqual([{ year: 2024, count: 1 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — the book is assigned to 2025 (UTC year), not 2024 (local year).

- [ ] **Step 3: Update `calculateYearlyStats` to accept and use timezone**

In `reading-stats-utils.ts`, change the function signature and the year extraction:

```typescript
export const calculateYearlyStats = (
  books: Book[],
  readingGoalThreshold: number,
  timezone: string = "UTC",
): YearlyStats => {
  const validBooks = books.filter(
    (book): book is Book & { finishedAt: Date } =>
      book.finishedAt != null && book.pageCount >= readingGoalThreshold,
  );

  if (validBooks.length === 0) return { booksFinishedByYear: [] };

  const booksByYear = new Map<number, number>();

  validBooks.forEach((book) => {
    const year = parseInt(
      formatInTimeZone(book.finishedAt, timezone, "yyyy"),
      10,
    );
    const current = booksByYear.get(year);

    if (!current) {
      booksByYear.set(year, 1);
    } else {
      booksByYear.set(year, current + 1);
    }
  });

  return {
    booksFinishedByYear: Array.from(booksByYear.entries(), ([year, count]) => ({
      year,
      count,
    })).sort((a, b) => b.year - a.year),
  } satisfies YearlyStats;
};
```

(`formatInTimeZone` is already imported at the top of the file.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/reading/reading-stats-utils.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All tests in that file pass (existing tests continue to work because default `timezone = "UTC"` preserves old behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading/reading-stats-utils.ts src/lib/reading/reading-stats-utils.test.tsx
git commit -m "fix(reading-stats): use user timezone for year extraction in calculateYearlyStats"
```

---

## Task 2: Fix `aggregateByDay` to group by local day, not UTC day

**Files:**

- Modify: `src/lib/reading/chart-utils.ts:98-115`
- Test: `src/lib/reading/chart-utils.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside the `describe("aggregateByDay")` block in `chart-utils.test.tsx`:

```typescript
it("should group entries by local day when timezone spans a UTC day boundary", () => {
  // 11 PM EST = next UTC day. Both entries are the same local day (EST) but different UTC days.
  // entry1: 2026-01-15 11 PM EST = 2026-01-16 04:00 UTC
  // entry2: 2026-01-15 10 PM EST = 2026-01-16 03:00 UTC
  const entry1 = createFakeReadingProgressWithProgressSinceLast({
    createdAt: new Date("2026-01-16T04:00:00Z"),
    progress: 80,
    progressSinceLast: 20,
  });
  const entry2 = createFakeReadingProgressWithProgressSinceLast({
    createdAt: new Date("2026-01-16T03:00:00Z"),
    progress: 60,
    progressSinceLast: 20,
  });

  const result = aggregateByDay([entry1, entry2], "America/New_York");

  // Both entries are on Jan 15 in EST, so they should collapse into one entry
  expect(result.length).toEqual(1);
  // Keeps the latest entry (entry1 is later)
  expect(result[0].progress).toEqual(80);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/reading/chart-utils.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — the two entries are on different UTC days so the current code keeps both.

- [ ] **Step 3: Update `aggregateByDay` to accept timezone and group by local day**

In `chart-utils.ts`:

1. Add import at the top of the file:

```typescript
import { formatInTimeZone } from "date-fns-tz";
```

1. Replace the `aggregateByDay` function:

```typescript
export const aggregateByDay = (
  readingHistory: ReadingProgressWithProgressSinceLast[],
  timezone: string = "UTC",
): ReadingProgressWithProgressSinceLast[] => {
  const byDay = new Map<string, ReadingProgressWithProgressSinceLast>();

  readingHistory.forEach((entry) => {
    const dayKey = formatInTimeZone(entry.createdAt, timezone, "yyyy-MM-dd");
    const existing = byDay.get(dayKey);

    if (!existing || entry.createdAt > existing.createdAt) {
      byDay.set(dayKey, entry);
    }
  });

  return Array.from(byDay.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/reading/chart-utils.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass. Existing tests still work because `timezone = "UTC"` is the default.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading/chart-utils.ts src/lib/reading/chart-utils.test.tsx
git commit -m "fix(chart-utils): group reading entries by user local day in aggregateByDay"
```

---

## Task 3: Fix "today" query and "same day" delete check in reading-progress router

**Files:**

- Modify: `src/trpc/routers/reading-progress.ts`
- Test: `src/trpc/routers/reading-progress.test.tsx`

- [ ] **Step 1: Write the failing test for the "today" query**

Find the `describe("createReadingProgressInstance")` block in `reading-progress.test.tsx` and add:

```typescript
it("should use user timezone when querying today's progress for streak calculation", async () => {
  // 3 AM UTC on Jan 15 = 10 PM EST on Jan 14. The user's "today" in EST is Jan 14.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T03:00:00Z"));

  const mockUser = createFakeUser({ timezone: "America/New_York" });
  const { mockDb, caller } = createMockCaller(readingProgressRouter, {
    mockUser,
  });

  const fakeBook = createFakeBook({ userId: mockUser.id });
  const fakeReadingProgress = createFakeReadingProgress({
    bookId: fakeBook.id,
    progress: 50,
  });
  const fakeUserStats = createFakeUserStats();

  vi.mocked(mockDb.book.findUnique).mockResolvedValue(fakeBook);
  vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
    const fakeTxClient = {
      readingProgress: {
        create: vi.fn().mockResolvedValue(fakeReadingProgress),
      },
      book: {
        update: vi.fn().mockResolvedValue({ ...fakeBook, progress: 50 }),
      },
    } as unknown as PrismaClient;
    return callback(fakeTxClient);
  });
  vi.mocked(mockDb.readingProgress.findMany).mockResolvedValue([
    fakeReadingProgress,
  ]);
  vi.mocked(mockDb.userStats.upsert).mockResolvedValue(fakeUserStats);
  vi.mocked(mockDb.userStats.update).mockResolvedValue(fakeUserStats);

  await caller.createReadingProgressInstance({
    bookId: fakeBook.id,
    newProgress: 50,
  });

  // At 3 AM UTC (= 10 PM EST Jan 14), user's "today" in EST is Jan 14.
  // Start of Jan 14 EST = midnight EST Jan 14 = 2026-01-14T05:00:00.000Z
  expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        createdAt: { gte: new Date("2026-01-14T05:00:00.000Z") },
      }),
    }),
  );

  vi.useRealTimers();
});
```

- [ ] **Step 2: Write the failing test for the "same day" delete check**

In the `describe("deleteReadingProgressInstance")` block, add:

```typescript
it("should use user timezone when counting same-day entries during deletion", async () => {
  // Entry created at 11 PM EST = next UTC day.
  // A UTC startOfDay would put this on a different UTC day than a 9 PM EST entry.
  // Both are the same local day in EST and should be counted together.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

  const mockUser = createFakeUser({ timezone: "America/New_York" });
  const { mockDb, caller } = createMockCaller(readingProgressRouter, {
    mockUser,
  });

  const fakeBook = createFakeBook({ userId: mockUser.id });
  // createdAt = 4 AM UTC Jan 15 = 11 PM EST Jan 14
  const fakeReadingProgress = createFakeReadingProgressWithBook({
    createdAt: new Date("2026-01-15T04:00:00Z"),
    bookId: fakeBook.id,
    book: fakeBook,
    progress: 50,
  });
  const fakeUserStats = createFakeUserStats();

  vi.mocked(mockDb.readingProgress.findUnique).mockResolvedValue(
    fakeReadingProgress,
  );

  const mockCount = vi.fn().mockResolvedValue(1);
  vi.mocked(mockDb.$transaction).mockImplementation(async (callback) => {
    const fakeTxClient = {
      readingProgress: {
        delete: vi.fn().mockResolvedValue(fakeReadingProgress),
        findFirst: vi.fn().mockResolvedValue(null),
        count: mockCount,
        findMany: vi.fn().mockResolvedValue([]),
      },
      book: { update: vi.fn().mockResolvedValue(fakeBook) },
      userStats: { update: vi.fn().mockResolvedValue(fakeUserStats) },
    } as unknown as PrismaClient;
    return callback(fakeTxClient);
  });

  await caller.deleteReadingProgressInstance(fakeReadingProgress.id);

  // Entry is on Jan 14 in EST. Day boundaries in EST:
  // dayStart = Jan 14 midnight EST = 2026-01-14T05:00:00.000Z
  // dayEnd   = Jan 15 midnight EST = 2026-01-15T05:00:00.000Z
  expect(mockCount).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        createdAt: {
          gte: new Date("2026-01-14T05:00:00.000Z"),
          lt: new Date("2026-01-15T05:00:00.000Z"),
        },
      }),
    }),
  );

  vi.useRealTimers();
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/trpc/routers/reading-progress.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: Both new tests FAIL.

- [ ] **Step 4: Update imports in `reading-progress.ts`**

Change the date-fns import line at the top of `reading-progress.ts`:

```typescript
import { addDays, startOfDay, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
```

- [ ] **Step 5: Fix the "today" query (line ~153)**

Replace:

```typescript
const todayStart = startOfDay(new Date());
```

With:

```typescript
const timezone = ctx.currentUser.timezone;
const todayStart = fromZonedTime(
  startOfDay(toZonedTime(new Date(), timezone)),
  timezone,
);
```

- [ ] **Step 6: Fix the "same day" delete check (lines ~407-416)**

Replace:

```typescript
const entryDate = startOfDay(readingProgressToDelete.createdAt);
const entriesOnSameDay = await tx.readingProgress.count({
  where: {
    userId: ctx.currentUser.id,
    createdAt: {
      gte: entryDate,
      lt: new Date(entryDate.getTime() + 24 * 60 * 60 * 1000),
    },
  },
});
```

With:

```typescript
const timezone = ctx.currentUser.timezone;
const entryInTz = toZonedTime(readingProgressToDelete.createdAt, timezone);
const dayStartUTC = fromZonedTime(startOfDay(entryInTz), timezone);
const nextDayStartUTC = fromZonedTime(
  addDays(startOfDay(entryInTz), 1),
  timezone,
);
const entriesOnSameDay = await tx.readingProgress.count({
  where: {
    userId: ctx.currentUser.id,
    createdAt: {
      gte: dayStartUTC,
      lt: nextDayStartUTC,
    },
  },
});
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run src/trpc/routers/reading-progress.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/trpc/routers/reading-progress.ts src/trpc/routers/reading-progress.test.tsx
git commit -m "fix(reading-progress): use user timezone for today query and same-day delete check"
```

---

## Task 4: Fix year calculation and yearly stats in user router

**Files:**

- Modify: `src/trpc/routers/user.ts`
- Test: `src/trpc/routers/user.test.tsx`

- [ ] **Step 1: Write failing tests**

In `user.test.tsx`, add the following tests.

Inside `describe("setReadingGoal")`:

```typescript
it("should use user local year, not UTC year, when setting reading goal", async () => {
  // 1 AM UTC Jan 1 2026 = Dec 31 2025 in UTC-5 (America/New_York)
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));

  const mockUser = createFakeUser({ timezone: "America/New_York" });
  const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

  const fakeGoal = createFakeReadingGoal({ year: 2025 });
  vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

  await caller.setReadingGoal(12);

  expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId_year: {
          userId: mockUser.id,
          year: 2025, // local year in EST, not 2026 (UTC year)
        },
      },
    }),
  );

  vi.useRealTimers();
});
```

Inside `describe("getYearlyBookStats")`:

```typescript
it("should assign a book to local year when finishedAt crosses UTC year boundary", async () => {
  // Book finished at 2025-01-01T03:00:00Z = Dec 31 2024 in America/New_York
  const mockUser = createFakeUser({ timezone: "America/New_York" });
  const { mockDb, caller } = createMockCaller(userRouter, { mockUser });

  const books = [
    createFakeBook({
      finishedAt: new Date("2025-01-01T03:00:00Z"),
      pageCount: 300,
    }),
  ];

  vi.mocked(mockDb.book.findMany).mockResolvedValue(books);

  const result = await caller.getYearlyBookStats();

  expect(result.booksFinishedByYear).toEqual([{ year: 2024, count: 1 }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/trpc/routers/user.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: Both new tests FAIL.

- [ ] **Step 3: Add import in `user.ts`**

Add `formatInTimeZone` to the imports at the top of `user.ts`:

```typescript
import { formatInTimeZone } from "date-fns-tz";
```

- [ ] **Step 4: Fix `setReadingGoal` year calculation (line ~28)**

Replace:

```typescript
const currentYear = new Date().getFullYear();
```

With:

```typescript
const currentYear = parseInt(
  formatInTimeZone(new Date(), ctx.currentUser.timezone, "yyyy"),
  10,
);
```

- [ ] **Step 5: Fix `getReadingGoal` year calculation (line ~54)**

Replace:

```typescript
const currentYear = new Date().getFullYear();
```

With:

```typescript
const currentYear = parseInt(
  formatInTimeZone(new Date(), ctx.currentUser.timezone, "yyyy"),
  10,
);
```

- [ ] **Step 6: Pass timezone to `calculateYearlyStats` (line ~133)**

Replace:

```typescript
const stats = calculateYearlyStats(books, threshold);
```

With:

```typescript
const stats = calculateYearlyStats(books, threshold, ctx.currentUser.timezone);
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run src/trpc/routers/user.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/trpc/routers/user.ts src/trpc/routers/user.test.tsx
git commit -m "fix(user): use user timezone for yearly reading goal and stats calculations"
```

---

## Task 5: Pass timezone through book detail UI components

**Files:**

- Modify: `src/app/(authed)/books/[bookId]/page.tsx`
- Modify: `src/components/books/book-details/reading-progress-history-graph.tsx`
- Modify: `src/components/books/book-details/reading-progress-history-table.tsx`

No dedicated unit tests exist for these UI components; correctness is verified visually and by the previously-fixed unit tests.

- [ ] **Step 1: Add `timezone` prop to `ReadingProgressHistoryGraph`**

In `reading-progress-history-graph.tsx`:

1. Add import at the top:

```typescript
import { formatInTimeZone } from "date-fns-tz";
```

1. Change the props interface:

```typescript
const ReadingProgressHistoryGraph = ({
  readingHistory,
  className,
  timezone,
}: {
  readingHistory: ReadingProgressWithProgressSinceLast[];
  className?: string;
  timezone: string;
}): React.ReactElement => {
```

1. Change the `aggregateByDay` call (line ~48):

```typescript
const aggregatedData = aggregateByDay(readingHistory, timezone);
```

1. Replace both `toLocaleString()` calls (lines ~77 and ~89) with `formatInTimeZone`:

```typescript
fullDate: formatInTimeZone(entry.createdAt, timezone, "PPpp"),
```

- [ ] **Step 2: Add `timezone` prop to `ReadingProgressHistory` (the table)**

In `reading-progress-history-table.tsx`:

1. Change the props interface:

```typescript
const ReadingProgressHistory = ({
  readingProgressHistory,
  book,
  timezone,
}: {
  readingProgressHistory: ReadingProgressWithProgressSinceLast[];
  book: Book;
  timezone: string;
}): React.ReactElement => {
```

1. Change the `aggregateByDay` call (line ~43):

```typescript
const aggregatedHistory = aggregateByDay(
  readingProgressHistory.filter((entry) => entry.bookId === book.id),
  timezone,
);
```

- [ ] **Step 3: Query timezone in the book detail page and pass it down**

In `src/app/(authed)/books/[bookId]/page.tsx`:

1. Add import at the top:

```typescript
import { trpc } from "@/trpc/client";
```

1. Add the timezone query inside the `Page` component, alongside the other hooks:

```typescript
const { data: timezoneData } = trpc.user.getTimezone.useQuery();
const timezone = timezoneData?.timezone ?? "UTC";
```

1. Change the `aggregateByDay` call (line ~41):

```typescript
const aggregatedData = aggregateByDay(readingHistory, timezone);
```

1. Add `timezone` prop to both components (lines ~137-153):

```typescript
<ReadingProgressHistoryGraph
  readingHistory={readingHistory}
  className="hidden md:flex"
  timezone={timezone}
/>
```

```typescript
<ReadingProgressHistory
  readingProgressHistory={readingHistory}
  book={book}
  timezone={timezone}
/>
```

- [ ] **Step 4: Verify the app compiles with no type errors**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Expected: No errors in the modified files.

- [ ] **Step 5: Commit**

```bash
git add src/app/(authed)/books/[bookId]/page.tsx src/components/books/book-details/reading-progress-history-graph.tsx src/components/books/book-details/reading-progress-history-table.tsx
git commit -m "fix(book-detail): pass user timezone to aggregateByDay and graph/table components"
```

---

## Task 6: Fix date display in dashboard

**Files:**

- Modify: `src/app/(authed)/dashboard/page.tsx`

- [ ] **Step 1: Update `dashboard/page.tsx`**

1. Add imports at the top:

```typescript
import { formatInTimeZone } from "date-fns-tz";
import { trpc } from "@/trpc/client";
```

1. Add the timezone query inside the `Page` component, alongside the other hooks at the top:

```typescript
const { data: timezoneData } = trpc.user.getTimezone.useQuery();
```

1. Replace the `toLocaleDateString()` call (line ~217):

```typescript
<TooltipContent>{`Finished on ${book.finishedAt ? formatInTimeZone(book.finishedAt, timezoneData?.timezone ?? "UTC", "PP") : ""}`}</TooltipContent>
```

- [ ] **Step 2: Verify the app compiles with no type errors**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm vitest run 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/(authed)/dashboard/page.tsx
git commit -m "fix(dashboard): display book finish date in user timezone instead of browser locale"
```

---

## Self-Review Checklist

- [x] **Critical — "Today" DB query** (reading-progress.ts:153): Fixed in Task 3
- [x] **Critical — "Same day" delete check** (reading-progress.ts:407-416): Fixed in Task 3
- [x] **Critical — `aggregateByDay` UTC grouping** (chart-utils.ts:98-115): Fixed in Task 2
- [x] **Critical — `calculateYearlyStats` UTC year** (reading-stats-utils.ts:307): Fixed in Task 1
- [x] **High — Year calculation in `setReadingGoal`/`getReadingGoal`** (user.ts:28,54): Fixed in Task 4
- [x] **High — `getYearlyBookStats` timezone pass-through** (user.ts:133): Fixed in Task 4
- [x] **High — `toLocaleString()` in graph tooltip** (graph.tsx:77,89): Fixed in Task 5
- [x] **High — `toLocaleDateString()` in dashboard** (dashboard/page.tsx:217): Fixed in Task 6
- [x] All tasks include complete code (no TBDs)
- [x] All type signatures match across tasks
- [x] Existing tests preserved via default `timezone = "UTC"` parameters
