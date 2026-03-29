# Book Rating UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 1–5 whole-star rating UI so users can rate their READ and DNF books, with rating input on the book detail page and optionally in the ReadingStatusDialog when marking a book as READ.

**Architecture:** A `StarRating` wrapper component around `@smastrom/react-rating` is placed inline in the book detail metadata row (READ/DNF only) and optionally in the ReadingStatusDialog (READ only). A new `book.updateRating` tRPC mutation handles persistence. Local state drives the UI; the mutation fires on change only when the value actually differs from `book.rating`.

**Tech Stack:** `@smastrom/react-rating`, tRPC, Prisma, React `useState`, Sonner toasts

---

## File Map

| File                                                          | Action                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `src/components/ui/star-rating.tsx`                           | Create — reusable star rating wrapper          |
| `src/trpc/routers/book.ts`                                    | Modify — add `updateRating` mutation           |
| `src/trpc/routers/book.test.tsx`                              | Modify — add `updateRating` tests              |
| `src/app/(authed)/books/[bookId]/page.tsx`                    | Modify — wire up rating on detail page         |
| `src/components/books/book-details/reading-status-dialog.tsx` | Modify — add optional rating when marking READ |

---

## Task 1: Install `@smastrom/react-rating`

**Files:**

- No file changes — dependency install only

- [ ] **Step 1: Install the package**

```bash
pnpm add @smastrom/react-rating
```

Expected: package appears in `package.json` dependencies and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @smastrom/react-rating dependency"
```

---

## Task 2: `book.updateRating` mutation + tests

**Files:**

- Modify: `src/trpc/routers/book.ts`
- Modify: `src/trpc/routers/book.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `src/trpc/routers/book.test.tsx`. Add a new `describe("updateRating")` block after the existing test blocks:

```typescript
describe("updateRating", () => {
  it("should set a rating successfully", async () => {
    const { caller, mockDb } = createMockCaller(bookRouter);

    const book = createFakeBook({
      id: 1,
      userId: "test-user-123",
      rating: null,
    });
    const updatedBook = createFakeBook({ ...book, rating: 4 });

    vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);
    vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

    const result = await caller.updateRating({ bookId: 1, rating: 4 });

    expect(mockDb.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { rating: 4 },
    });
    expect(result.book.rating).toBe(4);
  });

  it("should clear a rating by setting null", async () => {
    const { caller, mockDb } = createMockCaller(bookRouter);

    const book = createFakeBook({ id: 1, userId: "test-user-123", rating: 4 });
    const updatedBook = createFakeBook({ ...book, rating: null });

    vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);
    vi.mocked(mockDb.book.update).mockResolvedValue(updatedBook);

    const result = await caller.updateRating({ bookId: 1, rating: null });

    expect(mockDb.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { rating: null },
    });
    expect(result.book.rating).toBeNull();
  });

  it("should throw FORBIDDEN when book belongs to another user", async () => {
    const { caller, mockDb } = createMockCaller(bookRouter);

    const book = createFakeBook({ id: 1, userId: "other-user-456" });
    vi.mocked(mockDb.book.findUnique).mockResolvedValue(book);

    await expect(
      caller.updateRating({ bookId: 1, rating: 3 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("should throw NOT_FOUND when book does not exist", async () => {
    const { caller, mockDb } = createMockCaller(bookRouter);

    vi.mocked(mockDb.book.findUnique).mockResolvedValue(null);

    await expect(
      caller.updateRating({ bookId: 999, rating: 3 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("should reject a rating below 1", async () => {
    const { caller } = createMockCaller(bookRouter);

    await expect(
      caller.updateRating({ bookId: 1, rating: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("should reject a rating above 5", async () => {
    const { caller } = createMockCaller(bookRouter);

    await expect(
      caller.updateRating({ bookId: 1, rating: 6 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/trpc/routers/book.test.tsx
```

Expected: the 6 new `updateRating` tests fail with errors like "caller.updateRating is not a function".

- [ ] **Step 3: Implement the `updateRating` mutation**

Open `src/trpc/routers/book.ts`. Add `updateRating` to the router object, after the `updatePageCount` mutation:

```typescript
updateRating: authedProcedure
  .input(
    z.object({
      bookId: z.number().int().nonnegative(),
      rating: z.number().int().min(1).max(5).nullable(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    ctx.logger.debug({ bookId: input.bookId }, "Updating book rating");

    const book = await ctx.db.book.findUnique({
      where: { id: input.bookId },
    });

    if (!book) {
      ctx.logger.warn({ bookId: input.bookId }, "Book not found for rating update");
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (book.userId !== ctx.currentUser.id) {
      ctx.logger.warn(
        {
          bookId: input.bookId,
          bookOwnerId: book.userId,
          attemptedBy: ctx.currentUser.id,
        },
        "Permission denied: Attempted to update another user's book rating",
      );
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const updatedBook = await ctx.db.book.update({
      where: { id: input.bookId },
      data: { rating: input.rating },
    });

    ctx.logger.info(
      { bookId: input.bookId, oldRating: book.rating, newRating: input.rating },
      "Book rating updated",
    );

    return { book: updatedBook };
  }),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/trpc/routers/book.test.tsx
```

Expected: all tests pass, including the 6 new `updateRating` tests.

- [ ] **Step 5: Commit**

```bash
git add src/trpc/routers/book.ts src/trpc/routers/book.test.tsx
git commit -m "feat(book-router): add updateRating mutation"
```

---

## Task 3: `StarRating` component

**Files:**

- Create: `src/components/ui/star-rating.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ui/star-rating.tsx`:

```typescript
"use client";

import { Rating, Star } from "@smastrom/react-rating";

import "@smastrom/react-rating/style.css";

const starStyles = {
  itemShapes: Star,
  activeFillColor: "#f59e0b",
  inactiveFillColor: "#d1d5db",
  activeStrokeColor: "transparent",
  inactiveStrokeColor: "transparent",
  itemStrokeWidth: 0,
};

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
}

export function StarRating({
  value,
  onChange,
  readOnly = false,
}: StarRatingProps) {
  return (
    <Rating
      value={value ?? 0}
      onChange={(newVal: number) => {
        onChange(newVal === value ? null : newVal);
      }}
      readOnly={readOnly}
      itemStyles={starStyles}
      style={{ maxWidth: 96 }}
    />
  );
}
```

**Notes on the component:**

- `value ?? 0` converts `null` → `0` (the library uses `0` for "no rating", which renders all stars as ghost/inactive).
- `newVal === value ? null : newVal` handles clear-on-re-click: clicking the already-selected star passes `null` to the parent.
- `activeFillColor: "#f59e0b"` is Tailwind `amber-400`.
- `inactiveFillColor: "#d1d5db"` is Tailwind `gray-300` — renders ghost stars.
- The library automatically applies hover preview (fill stars 1..N on hover over star N) and a reduced-opacity hover color. No extra CSS needed.
- `activeStrokeColor: "transparent"` and `inactiveStrokeColor: "transparent"` remove the border from star shapes.
- `style={{ maxWidth: 96 }}` keeps the widget compact (~20px per star with gaps).

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/star-rating.tsx
git commit -m "feat(ui): add StarRating component"
```

---

## Task 4: Rating on book detail page

**Files:**

- Modify: `src/app/(authed)/books/[bookId]/page.tsx`

- [ ] **Step 1: Add local state and mutation to the page**

Open `src/app/(authed)/books/[bookId]/page.tsx`.

Add these imports at the top (maintain alphabetical import order within each group):

```typescript
import { useState } from "react";
import { toast } from "sonner";
import { StarRating } from "@/components/ui/star-rating";
import { trpc } from "@/trpc/client";
```

Inside the `Page` component, add state and mutation after the existing hook calls (after line 61 `const averagePace = calculateAveragePace(readingHistory);`):

```typescript
// undefined = user hasn't interacted yet; falls back to book.rating when displaying.
// This avoids a stale-init bug: useState(book?.rating) would be null during the
// loading phase and never re-initialize once book data arrives.
const [ratingOverride, setRatingOverride] = useState<number | null | undefined>(
  undefined,
);
const localRating =
  ratingOverride !== undefined ? ratingOverride : (book?.rating ?? null);

const trpcUtils = trpc.useUtils();
const { mutate: updateRating } = trpc.book.updateRating.useMutation({
  onSuccess: () => {
    toast.success("Rating saved");
    trpcUtils.book.getBook.invalidate(parseInt(bookId));
  },
  onError: () => {
    toast.error("Failed to save rating");
    setRatingOverride(undefined); // revert: display falls back to book.rating
  },
});

const handleRatingChange = (newRating: number | null) => {
  if (newRating === (book?.rating ?? null)) return;
  setRatingOverride(newRating);
  updateRating({ bookId: parseInt(bookId), rating: newRating });
};
```

- [ ] **Step 2: Add `StarRating` to the metadata row**

Find the metadata row JSX (around line 89). It ends after the published year. Add the rating widget after the published year block:

```tsx
{
  (book.status === "READ" || book.status === "DNF") && (
    <>
      <span className="text-secondary align-middle">•</span>
      <StarRating value={localRating} onChange={handleRatingChange} />
    </>
  );
}
```

The full metadata row should look like this after the change:

```tsx
<div className="text-primary flex items-center gap-x-4">
  <div className="group flex cursor-pointer items-center gap-x-1 text-sm font-semibold">
    <span className="group-hover:underline">
      {book.pageCount ? `${book.pageCount} pages` : "Pages not set"}
    </span>
    <PenIcon className="size-3" />
  </div>
  <span className="text-secondary align-middle">•</span>
  {book.publishedYear ? (
    <span className="text-sm">
      Published{" "}
      <span className="text-sm font-semibold">{book.publishedYear}</span>
    </span>
  ) : (
    <span className="text-sm font-semibold">Unknown publishing year</span>
  )}
  {(book.status === "READ" || book.status === "DNF") && (
    <>
      <span className="text-secondary align-middle">•</span>
      <StarRating value={localRating} onChange={handleRatingChange} />
    </>
  )}
</div>
```

- [ ] **Step 3: Verify the page compiles**

```bash
pnpm tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Manually verify in the browser**

Run `pnpm dev` and navigate to any READ or DNF book. Confirm:

- Five ghost stars appear inline in the metadata row.
- Hovering star N fills stars 1..N with faded amber.
- Clicking a star saves the rating and shows a success toast.
- Clicking the same star again clears the rating.
- For READING / TO_READ / READ_NEXT books — stars do not appear.

- [ ] **Step 5: Commit**

```bash
git add src/app/"(authed)"/books/"[bookId]"/page.tsx
git commit -m "feat(book-detail): add star rating to metadata row"
```

---

## Task 5: Optional rating in ReadingStatusDialog

**Files:**

- Modify: `src/components/books/book-details/reading-status-dialog.tsx`

- [ ] **Step 1: Add imports and rating state to the dialog**

Open `src/components/books/book-details/reading-status-dialog.tsx`.

Add the import for `StarRating` (keep import order):

```typescript
import { StarRating } from "@/components/ui/star-rating";
```

Inside the `ReadingStatusDialog` component, add rating state after the existing `useState` calls (after line 44 `const [pageCountInput, setPageCountInput] = useState("")`):

```typescript
const [localRating, setLocalRating] = useState<number | null>(
  book.rating ?? null,
);
```

Add the `updateRating` mutation after the `updatePageCount` mutation declaration (after line 64):

```typescript
const { mutate: updateRating } = trpc.book.updateRating.useMutation({
  onSuccess: () => trpcUtils.book.getBook.invalidate(book.id),
});
```

- [ ] **Step 2: Add rating reset on dialog close**

Find the `onOpenChange` handler (around line 76). Add `setLocalRating(book.rating ?? null)` to the close block:

```typescript
onOpenChange={(open) => {
  handleOpenReadingStatusDialogChange(open);
  if (!open) {
    setSelectedStatus(book.status);
    setPageCountInput("");
    setLocalRating(book.rating ?? null);
  }
}}
```

- [ ] **Step 3: Add rating input to the dialog body**

Find the existing `selectedStatus === "READ" || selectedStatus === "READING"` block (around line 116). Add a second conditional block immediately after it, inside the same `DialogContent`, for the rating:

```tsx
{
  selectedStatus === "READ" && (
    <div className="flex items-center gap-x-2">
      <Label>Rate this book (optional)</Label>
      <StarRating value={localRating} onChange={setLocalRating} />
    </div>
  );
}
```

The section of the dialog body should look like this after the change:

```tsx
{
  (selectedStatus === "READ" || selectedStatus === "READING") && (
    <div className="flex flex-col">
      <Separator className="my-4" />
      <div className="mb-2 flex gap-x-2">
        <Label htmlFor="pageCount">Page Count</Label>
        <Input
          id="pageCount"
          value={pageCountInput}
          onChange={(e) => setPageCountInput(e.target.value)}
          className="max-w-1/2"
          placeholder={book.pageCount.toString() || pageCountInput}
        />
      </div>
    </div>
  );
}
{
  selectedStatus === "READ" && (
    <div className="flex items-center gap-x-2">
      <Label>Rate this book (optional)</Label>
      <StarRating value={localRating} onChange={setLocalRating} />
    </div>
  );
}
```

- [ ] **Step 4: Fire rating mutation on submit**

Find the submit button's `onClick` handler (around line 137). Add the rating mutation call alongside the existing mutations:

```typescript
onClick={() => {
  if (pageCountInput) {
    updatePageCount({
      bookId: book.id,
      newPageCount: parseInt(pageCountInput),
    });
  }
  if (localRating !== (book.rating ?? null)) {
    updateRating({ bookId: book.id, rating: localRating });
  }
  updateStatus({
    bookId: book.id,
    newStatus: selectedStatus as ReadStatus,
  });
}}
```

- [ ] **Step 5: Verify the dialog compiles**

```bash
pnpm tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 6: Manually verify in the browser**

Navigate to any book that is not currently READ. Open the status dialog.

Confirm:

- Selecting READ shows a "Rate this book (optional)" row with five ghost stars.
- Selecting READING or any other status — stars do not appear.
- Setting a rating and submitting fires both the rating mutation and the status mutation.
- Submitting without setting a rating works normally (rating mutation is skipped).
- Closing the dialog resets the rating input to the book's current rating.

- [ ] **Step 7: Commit**

```bash
git add src/components/books/book-details/reading-status-dialog.tsx
git commit -m "feat(reading-status-dialog): add optional rating when marking as READ"
```
