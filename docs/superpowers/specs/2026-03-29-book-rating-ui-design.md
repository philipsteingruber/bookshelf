# Book Rating UI — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add a 1–5 whole-star rating UI so users can rate their read books. This is a prerequisite for the planned AI book recommendations feature, which will use rating data as part of its context.

The `rating Int?` field already exists on the `Book` model — no schema changes are needed.

---

## Scope

- `StarRating` UI component wrapping `@smastrom/react-rating`
- Rating widget on the book detail page (READ and DNF books only)
- Optional rating input in the ReadingStatusDialog when marking a book as READ
- New `book.updateRating` tRPC mutation
- Rating filter UI is **out of scope** for this spec

---

## Component: `StarRating`

**Location:** `src/components/ui/star-rating.tsx`

Wraps `@smastrom/react-rating` with the following interface:

```ts
interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
}
```

### Visual states

| State    | Appearance                                           |
| -------- | ---------------------------------------------------- |
| Empty    | Five faint gray stars (always visible, never hidden) |
| Hover    | Faded amber fill, progressive left-to-right          |
| Selected | Full amber fill                                      |

Hover behavior: hovering over star N fills stars 1 through N with a faded amber. This is the default behavior of `@smastrom/react-rating` and requires no custom logic.

Clearing: clicking the currently selected star passes `null` to `onChange`, clearing the rating.

---

## Book Detail Page Integration

**File:** `src/app/(authed)/books/[bookId]/page.tsx`

The `StarRating` component is added inline in the metadata row (alongside page count and published year), after the published year entry. It only renders when `book.status === "READ" || book.status === "DNF"`.

### Interaction

- Local `useState<number | null>` initialized from `book.rating` drives the displayed rating.
- On change, compare the new value against `book.rating`. Only call `updateRating` if the value has actually changed — this avoids a redundant mutation when the user clicks the already-selected star value.
- No save button. The mutation fires immediately on click.
- On success: show a success toast and invalidate `trpc.book.getBook`.
- On error: show an error toast. The local state reverts to `book.rating`.
- No debounce. Star ratings are discrete clicks, not continuous input. A double mutation from a misclick followed by a correction is harmless — both are cheap and the DB ends up correct.

---

## ReadingStatusDialog Integration

**File:** `src/components/books/book-details/reading-status-dialog.tsx`

When the user selects **READ** in the dialog, an optional rating section appears below the existing page count input, following the same conditional rendering pattern already used for page count. The rating section does **not** appear for DNF — users can rate DNF books directly on the detail page.

### Interaction

- Local `useState<number | null>` initialized from `book.rating`.
- If the status is changed away from READ and back, the rating state resets to `book.rating` (same reset logic applied to `selectedStatus` on dialog close).
- On submit: if the rating value differs from `book.rating`, fire `updateRating` alongside the existing `updateStatus` mutation. The two mutations are independent — a rating is not required to submit.
- The submit button is not blocked by the rating being unset.

---

## Backend: `book.updateRating`

**File:** `src/trpc/routers/book.ts`

New protected mutation:

```
Input: { bookId: number, rating: number | null }
```

Validation:

- `rating` must be `null` or an integer in the range `[1, 5]`.

Authorization:

- Verify the book belongs to the requesting user before updating (same pattern as existing book mutations).

Operation:

- `prisma.book.update({ where: { id: bookId }, data: { rating } })`

---

## Out of Scope

- Rating filter UI (already in the backend; UI deferred)
- Half-star support (schema stays as `Int`)
- Displaying ratings on book cards or dashboard
- Rating for READING / TO_READ / READ_NEXT books

---

## Dependencies

- `@smastrom/react-rating` — new package to install
