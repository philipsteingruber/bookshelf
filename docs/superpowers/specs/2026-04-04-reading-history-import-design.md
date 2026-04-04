# Reading History Import — Design Spec

**Date:** 2026-04-04
**Branch:** recommendations-conversational-qa

## Overview

Allow users to mark a book as already read at creation time, capturing a finished date, optional started date, and optional rating. This enables importing books read before the app was built without requiring a separate import flow.

## User-Facing Behaviour

A "Reading History" panel appears in the create book form below the Optional Info section. It contains a checkbox labeled "I've already read this book". When checked, three additional fields appear:

- **Finished Date** — required, must not be in the future
- **Started Date** — optional, must be on or before the finished date if provided
- **Rating** — optional, 1–5 stars using the existing `StarRating` component

Both date fields always reserve space for their error messages (via a fixed-height slot) so the layout does not shift when validation fires.

The panel is visually distinct — a bordered, rounded container — consistent with the existing Goodreads import panel style.

## Schema

**File:** `src/lib/schemas/book.ts`

A new `createBookInputSchema` extends the existing `createFormSchema` with four additional fields:

```ts
alreadyRead: z.boolean().optional();
finishedAt: z.date().optional();
startedAt: z.date().optional();
rating: z.number().int().min(1).max(5).optional();
```

A `superRefine` enforces the following cross-field rules:

| Condition                                        | Error field  | Message                                         |
| ------------------------------------------------ | ------------ | ----------------------------------------------- |
| `alreadyRead` is true and `finishedAt` is absent | `finishedAt` | "Finished date is required"                     |
| `finishedAt` is in the future                    | `finishedAt` | "Finished date cannot be in the future"         |
| Both dates present and `startedAt > finishedAt`  | `startedAt`  | "Started date must be before the finished date" |

The existing `createFormSchema` is unchanged. It continues to be used by the edit form and `updateBook` mutation.

## Router

**File:** `src/trpc/routers/book.ts`

The `createBook` mutation switches its input schema from `createFormSchema` to `createBookInputSchema`. The `db.book.create` call is extended:

```ts
// When input.alreadyRead is true, additionally write:
status: "READ";
progress: 100;
finishedAt: input.finishedAt;
startedAt: input.startedAt ?? null;
rating: input.rating ?? null;
```

When `alreadyRead` is false or absent, the book is created with the existing defaults (`status: TO_READ`, `progress: 0`, all date/rating fields null).

No new mutations are introduced. The `updateBook` mutation is unaffected.

## Components

### New: `ReadingHistorySection`

**File:** `src/components/books/create-form/form-sections/reading-history-section.tsx`

Props:

```ts
interface ReadingHistorySectionProps {
  form: UseFormReturn<z.infer<typeof createBookInputSchema>>;
  disabled?: boolean;
}
```

Renders a bordered panel (`border rounded-md p-4`) with:

1. A `Checkbox` (ShadCN) bound to `alreadyRead`, labeled "I've already read this book"
2. When `form.watch("alreadyRead")` is true, three fields appear:
   - `finishedAt` — `<Input type="date">` with required label and always-visible error slot
   - `startedAt` — `<Input type="date">` with optional label and always-visible error slot
   - `rating` — `StarRating` component (optional label, no error slot needed — field is unconstrained)

The error slot beneath each date field is always rendered. When no error is present it renders as an invisible fixed-height element so the layout remains stable.

### Modified: `CreateBookForm`

**File:** `src/components/books/create-form.tsx`

- Form type changes to `z.infer<typeof createBookInputSchema>`
- `defaultValues` adds `alreadyRead: false`, `finishedAt: undefined`, `startedAt: undefined`, `rating: undefined`
- `ReadingHistorySection` inserted between `OptionalInfoSection` and `CoverDropzone`, preceded by a `<Separator>`

No other components are modified.

## Stats Impact

| Stat                      | Source                      | Impact                                                         |
| ------------------------- | --------------------------- | -------------------------------------------------------------- |
| Books finished per year   | `book.finishedAt`           | Correctly attributed to the right year automatically           |
| Dashboard "recently read" | `finishedAt >= 2 weeks ago` | Old books won't appear — correct                               |
| Total pages read          | `ReadingProgress` entries   | Unaffected — no progress entries created for imports           |
| Streaks / active days     | `ReadingProgress` entries   | Unaffected — consistent with existing "mark as read" behaviour |
| `startedAt`               | Informational only          | Not used in any stat calculation                               |

No stats-specific code changes are required.

## Testing

### Schema (`src/lib/schemas/book.ts`)

New unit tests for `createBookInputSchema`'s `superRefine`:

- `alreadyRead: true` with no `finishedAt` → error on `finishedAt`
- `alreadyRead: true` with a future `finishedAt` → error on `finishedAt`
- `alreadyRead: true` with `startedAt` after `finishedAt` → error on `startedAt`
- `alreadyRead: true` with valid `finishedAt` only → passes
- `alreadyRead: true` with valid `finishedAt` and `startedAt` → passes
- `alreadyRead: false` with no dates → passes (same as current behaviour)

### Router (`src/trpc/routers/book.test.tsx`)

New cases in the existing `createBook` describe block:

- `alreadyRead: true` → book created with `status: READ`, `progress: 100`, correct `finishedAt`, `startedAt`, `rating`
- `alreadyRead: true`, no `startedAt` or `rating` → book created with `startedAt: null`, `rating: null`
- `alreadyRead` absent → book created with `status: TO_READ`, `progress: 0`, all date/rating fields null

## Files Changed

| File                                                                         | Change                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/schemas/book.ts`                                                    | Add `createBookInputSchema` with `superRefine`                                              |
| `src/trpc/routers/book.ts`                                                   | Switch `createBook` input to `createBookInputSchema`; write status/dates/rating on creation |
| `src/components/books/create-form.tsx`                                       | Update form type; add `ReadingHistorySection`                                               |
| `src/components/books/create-form/form-sections/reading-history-section.tsx` | New component                                                                               |
