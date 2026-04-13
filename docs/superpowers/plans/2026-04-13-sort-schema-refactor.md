# Sort Schema Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `getBooks` sort schema to explicit client-facing field names and move all sort translation (including Prisma-specific column aliases and special-case `orderBy` shapes) into a server-side `toOrderBy` utility.

**Architecture:** Add `SORTABLE_FIELDS` and `SortableField` to `book-filters.ts`, create a pure `toOrderBy(field, direction)` function in `src/lib/book/sort-utils.ts` that handles all translation/special cases, then wire it into `getBooks` and clean up callers.

**Tech Stack:** TypeScript, Zod, Prisma (via generated types), tRPC, Vitest

---

## File Map

| File                                    | Change                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/schemas/book-filters.ts`       | Add `SORTABLE_FIELDS` + `SortableField`; narrow `sortBy` to `z.enum(SORTABLE_FIELDS)` |
| `src/lib/book/sort-utils.ts`            | **Create** — pure `toOrderBy` function                                                |
| `src/lib/book/sort-utils.test.ts`       | **Create** — unit tests for `toOrderBy`                                               |
| `src/lib/book/index.ts`                 | Export `toOrderBy`, `SORTABLE_FIELDS`, `SortableField`                                |
| `src/trpc/routers/book.ts`              | Replace `if`-blocks with `toOrderBy` call                                             |
| `src/hooks/book/use-books.ts`           | Delete line 48 translation expression                                                 |
| `src/hooks/book/use-books.test.tsx`     | Remove/replace the `title → titleSort` mapping test                                   |
| `src/components/books/library-page.tsx` | Change `SORT_CONFIG` type from `BookScalarFieldEnum` to `SortableField`               |

---

### Task 1: Narrow the sort schema

**Files:**

- Modify: `src/lib/schemas/book-filters.ts`

- [ ] **Step 1: Update `book-filters.ts`**

Replace the file content with:

```typescript
import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";

import { VALIDATION_LIMITS } from "../constants";

export const SORTABLE_FIELDS = [
  "title",
  "author",
  "series",
  "finishedAt",
  "createdAt",
  "updatedAt",
  "rating",
  "pageCount",
] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export const bookFiltersSchema = z
  .object({
    status: z.enum(Object.values(ReadStatus)).optional(),
    rating: z.number().min(1).max(5).optional(),
    search: z.string().optional(), // Search in title/author
    sortBy: z.enum(SORTABLE_FIELDS).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(VALIDATION_LIMITS.BOOKS_QUERY_MAX).optional(),
    page: z.number().int().min(1).optional(),
    unrated: z.boolean().optional(),
  })
  .optional();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -40`

Expected: No errors in `book-filters.ts`. (There will be downstream errors in files that still reference `BookScalarFieldEnum` for sort — those will be fixed in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/book-filters.ts
git commit -m "refactor(schema): narrow sortBy to SORTABLE_FIELDS enum"
```

---

### Task 2: Create `toOrderBy` with tests (TDD)

**Files:**

- Create: `src/lib/book/sort-utils.test.ts`
- Create: `src/lib/book/sort-utils.ts`
- Modify: `src/lib/book/index.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/book/sort-utils.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { toOrderBy } from "./sort-utils";

describe("toOrderBy", () => {
  it("maps title to titleSort", () => {
    expect(toOrderBy("title", "asc")).toEqual({ titleSort: "asc" });
    expect(toOrderBy("title", "desc")).toEqual({ titleSort: "desc" });
  });

  it("maps author to authorSort", () => {
    expect(toOrderBy("author", "asc")).toEqual({ authorSort: "asc" });
    expect(toOrderBy("author", "desc")).toEqual({ authorSort: "desc" });
  });

  it("returns 3-field nulls-last array for series", () => {
    expect(toOrderBy("series", "asc")).toEqual([
      { series: { sort: "asc", nulls: "last" } },
      { seriesIndex: "asc" },
      { titleSort: "asc" },
    ]);
    // direction is ignored for series (always asc by convention)
    expect(toOrderBy("series", "desc")).toEqual([
      { series: { sort: "asc", nulls: "last" } },
      { seriesIndex: "asc" },
      { titleSort: "asc" },
    ]);
  });

  it("returns 2-field nulls-last array for finishedAt", () => {
    expect(toOrderBy("finishedAt", "desc")).toEqual([
      { finishedAt: { sort: "desc", nulls: "last" } },
      { titleSort: "asc" },
    ]);
    expect(toOrderBy("finishedAt", "asc")).toEqual([
      { finishedAt: { sort: "asc", nulls: "last" } },
      { titleSort: "asc" },
    ]);
  });

  it("passes direction directly for createdAt", () => {
    expect(toOrderBy("createdAt", "desc")).toEqual({ createdAt: "desc" });
  });

  it("passes direction directly for updatedAt", () => {
    expect(toOrderBy("updatedAt", "desc")).toEqual({ updatedAt: "desc" });
  });

  it("passes direction directly for rating", () => {
    expect(toOrderBy("rating", "desc")).toEqual({ rating: "desc" });
  });

  it("passes direction directly for pageCount", () => {
    expect(toOrderBy("pageCount", "asc")).toEqual({ pageCount: "asc" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/book/sort-utils.test.ts`

Expected: FAIL — `Cannot find module './sort-utils'`

- [ ] **Step 3: Implement `toOrderBy`**

Create `src/lib/book/sort-utils.ts`:

```typescript
import type { BookOrderByWithRelationInput } from "@/generated/prisma/internal/prismaNamespace";

import type { SortableField } from "@/lib/schemas/book-filters";

export function toOrderBy(
  sortBy: SortableField,
  direction: "asc" | "desc",
): BookOrderByWithRelationInput | BookOrderByWithRelationInput[] {
  switch (sortBy) {
    case "title":
      return { titleSort: direction };
    case "author":
      return { authorSort: direction };
    case "series":
      return [{ series: { sort: "asc", nulls: "last" } }, { seriesIndex: "asc" }, { titleSort: "asc" }];
    case "finishedAt":
      return [{ finishedAt: { sort: direction, nulls: "last" } }, { titleSort: "asc" }];
    case "createdAt":
      return { createdAt: direction };
    case "updatedAt":
      return { updatedAt: direction };
    case "rating":
      return { rating: direction };
    case "pageCount":
      return { pageCount: direction };
    default: {
      const _exhaustive: never = sortBy;
      throw new Error(`Unhandled sort field: ${_exhaustive}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/book/sort-utils.test.ts`

Expected: All 8 tests PASS

- [ ] **Step 5: Export from barrel**

Update `src/lib/book/index.ts` to add:

```typescript
export { toOrderBy } from "./sort-utils";
export type { SortableField } from "@/lib/schemas/book-filters";
export { SORTABLE_FIELDS } from "@/lib/schemas/book-filters";
```

Final file:

```typescript
export {
  calculatePagesFromProgress,
  createAuthorSort,
  createTitleSort,
  formatSeriesIndex,
  getStatusButtonStyle,
  parseReadStatus,
} from "./book-utils";
export { toOrderBy } from "./sort-utils";
export type { SortableField } from "@/lib/schemas/book-filters";
export { SORTABLE_FIELDS } from "@/lib/schemas/book-filters";
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -40`

Expected: No new errors in `sort-utils.ts` or `index.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/book/sort-utils.ts src/lib/book/sort-utils.test.ts src/lib/book/index.ts
git commit -m "feat(sort): add toOrderBy utility with exhaustive switch and tests"
```

---

### Task 3: Simplify `getBooks` router

**Files:**

- Modify: `src/trpc/routers/book.ts`

- [ ] **Step 1: Update the import and replace `orderBy` logic**

In `src/trpc/routers/book.ts`:

1. Add `toOrderBy` to the import from `@/lib/book`:

```typescript
import { createAuthorSort, createTitleSort, toOrderBy } from "@/lib/book";
```

1. Replace lines 44–56 (the `sortDirection` variable + `let orderBy` + if/else block):

```typescript
const orderBy = toOrderBy(filters?.sortBy ?? "title", filters?.sortDirection ?? "asc");
```

The `BookOrderByWithRelationInput` import is still needed for the `where` variable — keep that import unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -40`

Expected: No errors in `book.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/trpc/routers/book.ts
git commit -m "refactor(router): replace getBooks orderBy if-blocks with toOrderBy"
```

---

### Task 4: Remove client-side sort translation from `useBooks`

**Files:**

- Modify: `src/hooks/book/use-books.ts`
- Modify: `src/hooks/book/use-books.test.tsx`

- [ ] **Step 1: Delete the translation expression in `use-books.ts`**

In `src/hooks/book/use-books.ts`, replace line 48:

```typescript
sortBy: sortBy === "title" ? "titleSort" : sortBy === "author" ? "authorSort" : sortBy,
```

With:

```typescript
sortBy,
```

- [ ] **Step 2: Update `useBooks` hook type**

In `src/hooks/book/use-books.ts`, the `options` parameter type is `BookFilters & { enabled?: boolean }`. `BookFilters` is inferred from `bookFiltersSchema`, which now has `sortBy: z.enum(SORTABLE_FIELDS).optional()`. The type `"title"` and `"author"` are valid members of `SortableField`, so no additional change is needed in the hook signature.

Verify the `sortBy` default still works — `sortBy = "title"` is a valid `SortableField`.

- [ ] **Step 3: Update `use-books.test.tsx`**

Find and replace the test "should map sort fields (title -> titleSort, author -> authorSort)" at lines 55–66. Replace the entire `it` block with a test verifying the field is now passed directly:

```typescript
it("should pass sortBy directly without translation", () => {
  renderHook(() => useBooks({ sortBy: "title" }));
  expect(trpc.book.getBooks.useQuery).toHaveBeenCalledWith(
    expect.objectContaining({ sortBy: "title" }),
    expect.anything(),
  );
  renderHook(() => useBooks({ sortBy: "author" }));
  expect(trpc.book.getBooks.useQuery).toHaveBeenCalledWith(
    expect.objectContaining({ sortBy: "author" }),
    expect.anything(),
  );
});
```

- [ ] **Step 4: Run hook tests**

Run: `pnpm vitest run src/hooks/book/use-books.test.tsx`

Expected: All tests PASS

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -40`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/book/use-books.ts src/hooks/book/use-books.test.tsx
git commit -m "refactor(hook): remove client-side sort field translation from useBooks"
```

---

### Task 5: Type `SORT_CONFIG` against `SortableField` in `library-page.tsx`

**Files:**

- Modify: `src/components/books/library-page.tsx`

- [ ] **Step 1: Update imports**

In `src/components/books/library-page.tsx`:

Remove:

```typescript
import type { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";
```

Add:

```typescript
import type { SortableField } from "@/lib/book";
```

- [ ] **Step 2: Update `SORT_CONFIG` type annotation**

Change line 35:

```typescript
const SORT_CONFIG: Record<SortOptions, { sortBy: BookScalarFieldEnum; sortDirection: "asc" | "desc" }> = {
```

To:

```typescript
const SORT_CONFIG: Record<SortOptions, { sortBy: SortableField; sortDirection: "asc" | "desc" }> = {
```

- [ ] **Step 3: Update `parseSelectedSort` return type**

Change line 78:

```typescript
const parseSelectedSort = (value: string): { sortBy: BookScalarFieldEnum; sortDirection: "asc" | "desc" } => {
```

To:

```typescript
const parseSelectedSort = (value: string): { sortBy: SortableField; sortDirection: "asc" | "desc" } => {
```

And the fallback default value on line 81:

```typescript
sortBy: "title" as BookScalarFieldEnum,
```

To:

```typescript
sortBy: "title" as SortableField,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -40`

Expected: No errors. No remaining references to `BookScalarFieldEnum` for sort purposes.

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/books/library-page.tsx
git commit -m "refactor(library): type SORT_CONFIG against SortableField instead of BookScalarFieldEnum"
```
