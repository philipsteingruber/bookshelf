# Conversational Book Q&A — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Extend the existing Book Recommendations page to support open-ended conversational questions
alongside structured recommendation requests. Examples of conversational questions:

- "Why did you pick X instead of Y?"
- "What's the next book in the series after X?"
- "I've heard good things about X — does it fit my tastes?"

The feature lives on the same `/recommendations` page. The page title stays "Book Recommendations".

---

## Section 1 — Backend Architecture

### Unified `chat` mutation

The existing `getRecommendations` mutation is replaced by a new `chat` mutation. Internally it
performs two sequential Claude API calls.

**Step 1 — Intent classification (Haiku)**

A single cheap call that classifies the user's latest message as either `"recommendation"` or
`"question"`. Only the latest user message is sent — conversation history is not needed for
routing. Uses a small structured tool to return `{ intent: "recommendation" | "question" }`.

**Step 2 — Content generation (existing model)**

Routed based on the classification result:

- `"recommendation"` → calls the existing `callRecommendations` function unchanged. Always
  returns exactly 5 books. Duplicate detection and retry logic is preserved.
- `"question"` → calls a new `callAnswer` function with a different system prompt and a new
  `answer_question` tool. Returns `{ text: string, books?: [{ title, author, reason }] }` with
  0–3 books. Reading history context is injected when `includeHistory` is on, so Claude can
  answer taste-based questions. Books are enriched via the Google Books API the same as
  recommendations.

**Return type (discriminated union):**

```ts
| { type: "recommendations"; blurb: string; books: EnrichedBook[]; retried: boolean }
| { type: "answer"; text: string; books: EnrichedBook[] }
```

---

## Section 2 — Data Model & Conversation State

### `RecommendationBook` type

`type` becomes optional:

```ts
type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type?: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};
```

When `type` is absent, the card uses the conversational (blue) style.

### `ConversationMessage` type

The existing assistant variant gains a `type: "recommendations"` discriminant field. Two new
variants are added:

```ts
type ConversationMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      type: "recommendations";
      blurb: string;
      books: RecommendationBook[];
      retried: boolean;
    }
  | { id: string; role: "assistant"; type: "answer"; text: string; books: RecommendationBook[] }
  | { id: string; role: "assistant"; type: "error"; text: string };
```

### `serializeForClaude`

Updated to handle all assistant variants:

- `"recommendations"` turns → serialized as `{ blurb, books: [...] }` (unchanged)
- `"answer"` turns → serialized as the plain text response
- `"error"` turns → omitted entirely from the serialized history

---

## Section 3 — UI Rendering

### `RecommendationCard` refactor

- `type` is made optional. When absent, the card uses a blue-tinted style:
  - Background: `bg-[#eff6ff]` / `dark:bg-blue-950/30`
  - Border: `border-[#93c5fd]` / `dark:border-blue-800`
  - Divider: `border-[#bfdbfe]` / `dark:border-blue-800`
- The badge row is **always rendered**. When `type` is absent or `standard` (which already has
  no badge), an invisible fixed-height placeholder occupies the badge row so all cards maintain
  consistent height regardless of type.

### Conversation rendering

**Recommendation turns** (unchanged):

- Blurb text in left-aligned bubble
- 5-card grid below (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- "Retried" notice if applicable

**Answer turns:**

- Text in the same left-aligned bubble as the blurb
- 0–3 book cards below in the same grid (capped at 3 by the tool schema)
- Same `RecommendationCard` component, no type badge (blue conversational style)

**Error turns:**

- A simple error card rendered inline in the conversation thread:
  "Something went wrong. Please try again."
- The user's message that triggered the error is **kept** in the conversation so they can see
  what they asked without retyping
- No toast is shown for API errors — the inline card is the sole feedback mechanism

### Loading state

A single continuous spinner with the existing text ("Finding recommendations…" / slow-query
fallback) is shown for both the classification and generation steps. The user sees one
uninterrupted loading state.

---

## Section 4 — Error Handling

| Failure point                               | Behavior                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Intent classification call fails            | Inline error card added to conversation; user message kept           |
| Generation call fails (recommendation path) | Inline error card added to conversation; user message kept           |
| Generation call fails (answer path)         | Inline error card added to conversation; user message kept           |
| Google Books enrichment fails per-book      | Graceful fallback to `coverUrl: null`, `pageCount: null` (unchanged) |

Toasts are removed from the API error path for this feature.

---

## Section 5 — Testing

### `recommendations.test.tsx` (updated for `chat` procedure)

- Routes to recommendation path when classification returns `"recommendation"` (5 books)
- Routes to answer path when classification returns `"question"`
- Answer path with 0 books
- Answer path with 1–3 books
- Duplicate detection + retry on recommendation path (carried over from existing tests)

### `recommendation-card.test.tsx` (additions)

- Renders correctly without a `type` (blue conversational style applied)
- Badge placeholder renders and preserves layout height when badge is absent
