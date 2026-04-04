# Reading History Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to mark a book as already read at creation time, with a finished date, optional started date, and optional rating — enabling import of books read before the app was built.

**Architecture:** Extend the book creation schema (`createBookInputSchema`) with four optional fields and cross-field validation via `superRefine`. The `createBook` router mutation conditionally writes `status: READ`, dates, and rating in the same `db.book.create` call. A new `ReadingHistorySection` component renders a collapsible panel in the create form.

**Tech Stack:** Zod (schema + `superRefine`), tRPC, React Hook Form (`Controller`), ShadCN (`Checkbox`, `Input`), `@smastrom/react-rating` (`StarRating`), `date-fns` (`format`), Vitest

---

## File Map

| File                                                                         | Action | Responsibility                                                                         |
| ---------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `src/lib/schemas/book.ts`                                                    | Modify | Add `createBookInputSchema` with `superRefine` cross-field validation                  |
| `src/lib/schemas/book.test.ts`                                               | Create | Unit tests for `createBookInputSchema` validation rules                                |
| `src/trpc/routers/book.ts`                                                   | Modify | Switch `createBook` to `createBookInputSchema`; write status/dates/rating on creation  |
| `src/trpc/routers/book.test.tsx`                                             | Modify | Add router-level tests for the `alreadyRead` creation paths                            |
| `src/components/books/create-form/form-sections/reading-history-section.tsx` | Create | Panel component: checkbox + conditional date/rating fields                             |
| `src/components/books/create-form.tsx`                                       | Modify | Update form type; add `ReadingHistorySection` between optional info and cover dropzone |

---

## Task 1: Schema — `createBookInputSchema`

**Files:**

- Modify: `src/lib/schemas/book.ts`
- Create: `src/lib/schemas/book.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/schemas/book.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createBookInputSchema } from "./book";

describe("createBookInputSchema", () => {
  const validBase = {
    title: "Test Book",
    author: "Test Author",
    publishedYear: 2020,
  };

  it("passes when alreadyRead is absent", () => {
    const result = createBookInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("passes when alreadyRead is false and no dates provided", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: false,
    });
    expect(result.success).toBe(true);
  });

  it("fails when alreadyRead is true and finishedAt is absent", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.errors.find((e) => e.path[0] === "finishedAt");
      expect(err?.message).toBe("Finished date is required");
    }
  });

  it("fails when finishedAt is in the future", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: tomorrow,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.errors.find((e) => e.path[0] === "finishedAt");
      expect(err?.message).toBe("Finished date cannot be in the future");
    }
  });

  it("fails when startedAt is after finishedAt", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
      startedAt: new Date("2024-01-20T12:00:00"),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.errors.find((e) => e.path[0] === "startedAt");
      expect(err?.message).toBe("Started date must be before the finished date");
    }
  });

  it("passes with alreadyRead true and valid finishedAt only", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
    });
    expect(result.success).toBe(true);
  });

  it("passes with alreadyRead true and valid finishedAt and startedAt", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
      startedAt: new Date("2024-01-01T12:00:00"),
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect all to fail with "cannot find module"**

```bash
pnpm test -- src/lib/schemas/book.test.ts
```

Expected: `Error: Cannot find module './book'` (or import errors — `createBookInputSchema` doesn't exist yet).

- [ ] **Step 3: Implement `createBookInputSchema` in `src/lib/schemas/book.ts`**

Add after the existing `createFormSchema` export:

```ts
export const createBookInputSchema = createFormSchema
  .extend({
    alreadyRead: z.boolean().optional(),
    finishedAt: z.date().optional(),
    startedAt: z.date().optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.alreadyRead) {
      if (!data.finishedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finished date is required",
          path: ["finishedAt"],
        });
        return;
      }
      if (data.finishedAt > new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finished date cannot be in the future",
          path: ["finishedAt"],
        });
      }
      if (data.startedAt && data.startedAt > data.finishedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Started date must be before the finished date",
          path: ["startedAt"],
        });
      }
    }
  });
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
pnpm test -- src/lib/schemas/book.test.ts
```

Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/book.ts src/lib/schemas/book.test.ts
git commit -m "feat(books): add createBookInputSchema with already-read validation"
```

---

## Task 2: Router — update `createBook` mutation

**Files:**

- Modify: `src/trpc/routers/book.ts`
- Modify: `src/trpc/routers/book.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/trpc/routers/book.test.tsx`, inside the existing `describe("createBook", ...)` block, add three new `it` blocks after the existing ones:

```ts
it("should create book with READ status when alreadyRead is true", async () => {
  const { caller, mockDb } = createMockCaller(bookRouter);

  const finishedAt = new Date("2024-06-01T12:00:00");
  const startedAt = new Date("2024-05-01T12:00:00");

  const bookData = {
    title: "Old Book",
    author: "Test Author",
    publishedYear: 2020,
    alreadyRead: true as const,
    finishedAt,
    startedAt,
    rating: 4,
  };

  const createdBook = createFakeBook({
    title: bookData.title,
    status: "READ" as ReadStatus,
    progress: 100,
    finishedAt,
    startedAt,
    rating: 4,
  });

  vi.mocked(mockDb.book.create).mockResolvedValue(createdBook);
  vi.mocked(mockDb.book.findFirst).mockResolvedValue(null);

  await caller.createBook(bookData);

  const createCall = vi.mocked(mockDb.book.create).mock.calls[0][0];
  expect(createCall.data.status).toBe("READ");
  expect(createCall.data.progress).toBe(100);
  expect(createCall.data.finishedAt).toEqual(finishedAt);
  expect(createCall.data.startedAt).toEqual(startedAt);
  expect(createCall.data.rating).toBe(4);
});

it("should create book with null startedAt and rating when only finishedAt is provided", async () => {
  const { caller, mockDb } = createMockCaller(bookRouter);

  const finishedAt = new Date("2024-06-01T12:00:00");

  const bookData = {
    title: "Old Book",
    author: "Test Author",
    publishedYear: 2020,
    alreadyRead: true as const,
    finishedAt,
  };

  const createdBook = createFakeBook({
    status: "READ" as ReadStatus,
    progress: 100,
    finishedAt,
    startedAt: null,
    rating: null,
  });

  vi.mocked(mockDb.book.create).mockResolvedValue(createdBook);
  vi.mocked(mockDb.book.findFirst).mockResolvedValue(null);

  await caller.createBook(bookData);

  const createCall = vi.mocked(mockDb.book.create).mock.calls[0][0];
  expect(createCall.data.status).toBe("READ");
  expect(createCall.data.startedAt).toBeNull();
  expect(createCall.data.rating).toBeNull();
});

it("should not set status when alreadyRead is absent", async () => {
  const { caller, mockDb } = createMockCaller(bookRouter);

  const bookData = {
    title: "Future Book",
    author: "Test Author",
    publishedYear: 2026,
  };

  const createdBook = createFakeBook({ ...bookData, status: "TO_READ" as ReadStatus });

  vi.mocked(mockDb.book.create).mockResolvedValue(createdBook);
  vi.mocked(mockDb.book.findFirst).mockResolvedValue(null);

  await caller.createBook(bookData);

  const createCall = vi.mocked(mockDb.book.create).mock.calls[0][0];
  expect(createCall.data.status).toBeUndefined();
});
```

- [ ] **Step 2: Run tests — expect new tests to fail**

```bash
pnpm test -- src/trpc/routers/book.test.tsx
```

Expected: The 3 new tests fail because `createBook` still uses `createFormSchema` and doesn't handle `alreadyRead`.

- [ ] **Step 3: Update the router**

In `src/trpc/routers/book.ts`, make two changes:

**Change 1** — Update the import at the top of the file:

```ts
// Replace:
import { createFormSchema } from "@/lib/schemas/book";
// With:
import { createBookInputSchema } from "@/lib/schemas/book";
```

**Change 2** — In the `createBook` procedure, switch the input schema and extend the `db.book.create` call. Replace the entire `createBook: authedProcedure` definition's `.input(...)` line and the `db.book.create` call:

```ts
createBook: authedProcedure
  .input(createBookInputSchema)          // <-- was createFormSchema
  .mutation(async ({ ctx, input }) => {
    // ... (all existing duplicate-check logic stays unchanged) ...

    // Replace the existing db.book.create call with:
    const alreadyReadData = input.alreadyRead
      ? {
          status: "READ" as const,
          progress: 100,
          finishedAt: input.finishedAt,
          startedAt: input.startedAt ?? null,
          rating: input.rating ?? null,
        }
      : {};

    const createBookTimer = performanceLogger(
      "DB: Create book",
      1000,
      ctx.logger,
    );
    createBookTimer.start();
    const book = await ctx.db.book.create({
      data: {
        title: input.title,
        titleSort: createTitleSort(input.title),
        author: input.author,
        authorSort: createAuthorSort(input.author),
        pageCount: input.pageCount,
        isbn: input.isbn || null,
        series: normalizedSeries,
        seriesIndex: input.seriesIndex,
        publishedYear: input.publishedYear,
        summary: input.summary,
        coverUrl: input.coverUrl,
        userId,
        ...alreadyReadData,
      },
    });
    createBookTimer.end({ bookId: book.id });
    // ... (rest of the mutation — logging, return — stays unchanged)
  }),
```

Note: `updateBook` still uses `createFormSchema.partial()` directly — no changes needed there.

- [ ] **Step 4: Run tests — expect all to pass**

```bash
pnpm test -- src/trpc/routers/book.test.tsx
```

Expected: All existing tests plus the 3 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add src/trpc/routers/book.ts src/trpc/routers/book.test.tsx
git commit -m "feat(books): update createBook mutation to support already-read status on creation"
```

---

## Task 3: `ReadingHistorySection` component

**Files:**

- Create: `src/components/books/create-form/form-sections/reading-history-section.tsx`

This is a UI component — no automated tests. Manual verification happens in Task 4.

- [ ] **Step 1: Create the component**

Create `src/components/books/create-form/form-sections/reading-history-section.tsx`:

```tsx
"use client";

import { format } from "date-fns";
import { Controller } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import type z from "zod";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StarRating } from "@/components/ui/star-rating";
import type { createBookInputSchema } from "@/lib/schemas/book";
import { cn } from "@/lib/utils";

interface ReadingHistorySectionProps {
  form: UseFormReturn<z.infer<typeof createBookInputSchema>>;
  disabled?: boolean;
}

export const ReadingHistorySection = ({ form, disabled = false }: ReadingHistorySectionProps): React.ReactElement => {
  const alreadyRead = form.watch("alreadyRead");
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-semibold">Reading History</p>
      <Controller
        name="alreadyRead"
        control={form.control}
        render={({ field }) => (
          <div className="flex items-center gap-x-2">
            <Checkbox
              id="create-book-form-alreadyRead"
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
            <label htmlFor="create-book-form-alreadyRead" className="cursor-pointer text-sm font-medium">
              I&apos;ve already read this book
            </label>
          </div>
        )}
      />
      {alreadyRead && (
        <FieldGroup className="mt-4 gap-y-1">
          <Controller
            name="finishedAt"
            control={form.control}
            disabled={disabled}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel htmlFor="create-book-form-finishedAt">
                  Finished Date <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="create-book-form-finishedAt"
                  type="date"
                  max={today}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val ? new Date(`${val}T00:00:00`) : undefined);
                  }}
                />
                <p className={cn("text-destructive text-sm", !fieldState.error && "invisible")}>
                  {fieldState.error?.message ?? "\u00A0"}
                </p>
              </Field>
            )}
          />
          <Controller
            name="startedAt"
            control={form.control}
            disabled={disabled}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel htmlFor="create-book-form-startedAt">
                  Started Date <span className="text-muted-foreground text-xs">(optional)</span>
                </FieldLabel>
                <Input
                  id="create-book-form-startedAt"
                  type="date"
                  max={today}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val ? new Date(`${val}T00:00:00`) : undefined);
                  }}
                />
                <p className={cn("text-destructive text-sm", !fieldState.error && "invisible")}>
                  {fieldState.error?.message ?? "\u00A0"}
                </p>
              </Field>
            )}
          />
          <Controller
            name="rating"
            control={form.control}
            render={({ field }) => (
              <Field className="gap-y-1">
                <FieldLabel>
                  Rating <span className="text-muted-foreground text-xs">(optional)</span>
                </FieldLabel>
                <StarRating value={field.value ?? null} onChange={field.onChange} readOnly={disabled} />
              </Field>
            )}
          />
        </FieldGroup>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/books/create-form/form-sections/reading-history-section.tsx
git commit -m "feat(books): add ReadingHistorySection form component"
```

---

## Task 4: Wire `ReadingHistorySection` into `CreateBookForm`

**Files:**

- Modify: `src/components/books/create-form.tsx`

- [ ] **Step 1: Update `create-form.tsx`**

Apply all four changes below to `src/components/books/create-form.tsx`:

**Change 1** — Update the schema import:

```ts
// Replace:
import { createFormSchema } from "@/lib/schemas/book";
// With:
import { createBookInputSchema } from "@/lib/schemas/book";
```

**Change 2** — Import the new section component (add alongside the existing section imports):

```ts
import { ReadingHistorySection } from "./create-form/form-sections/reading-history-section";
```

**Change 3** — Update the form type and `defaultValues`:

```ts
// Replace:
const form = useForm<z.infer<typeof createFormSchema>>({
  resolver: zodResolver(createFormSchema),
  defaultValues: {
    title: "",
    author: "",
    isbn: "",
    pageCount: undefined,
    publishedYear: undefined,
    summary: "",
    series: "",
    seriesIndex: undefined,
    coverUrl: "",
  },
});

// With:
const form = useForm<z.infer<typeof createBookInputSchema>>({
  resolver: zodResolver(createBookInputSchema),
  defaultValues: {
    title: "",
    author: "",
    isbn: "",
    pageCount: undefined,
    publishedYear: undefined,
    summary: "",
    series: "",
    seriesIndex: undefined,
    coverUrl: "",
    alreadyRead: false,
    finishedAt: undefined,
    startedAt: undefined,
    rating: undefined,
  },
});
```

**Change 4** — Update the `onSubmit` type signature and insert `ReadingHistorySection` in the JSX. Find the `onSubmit` function and update its parameter type:

```ts
// Replace:
const onSubmit = async (
  data: z.infer<typeof createFormSchema>,
): Promise<void> => {
// With:
const onSubmit = async (
  data: z.infer<typeof createBookInputSchema>,
): Promise<void> => {
```

Then in the JSX, between `</OptionalInfoSection>` and `<CoverDropzone`, add:

```tsx
<Separator className="my-4" />
<ReadingHistorySection
  form={form}
  disabled={isUploading || isCreatingBook}
/>
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/books/create-form.tsx
git commit -m "feat(books): wire ReadingHistorySection into create book form"
```

---

## Manual Verification Checklist

After all tasks are done, verify in the browser (`pnpm dev`):

- [ ] Create form shows "Reading History" panel below Optional Info
- [ ] Checking the box reveals Finished Date, Started Date, and Rating fields
- [ ] Unchecking the box hides all three fields
- [ ] Submitting without a Finished Date (when checked) shows an inline error; layout does not shift
- [ ] Submitting with a future Finished Date shows an inline error
- [ ] Submitting with Started Date after Finished Date shows an inline error on Started Date
- [ ] Submitting with valid dates creates the book with `status: READ` (visible in book details)
- [ ] The year appears correctly in yearly stats after import
- [ ] Resetting the form clears the checkbox and date fields
- [ ] All fields are disabled while creating/uploading
