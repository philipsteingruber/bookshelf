# AI Book Recommendations — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add a `/recommendations` page where users can ask Claude for personalized book recommendations. Claude generates recommendations using the user's reading history (READ books + ratings) and/or a custom prompt. Results are enriched with cover images and page counts from the Google Books API. Conversation persists across sessions via localStorage.

---

## Scope

- Dedicated `/recommendations` page with a conversational chat UI
- `recommendations.getRecommendations` tRPC mutation
- Claude integration via Anthropic SDK (tool use for structured output)
- Google Books API enrichment (cover image, page count)
- localStorage persistence for conversation history
- "Include reading history" toggle with clear-on-confirm behavior
- "Start over" button with the same confirm dialog
- Four recommendation types: safe, standard, stretch, risky — each visually distinct

**Out of scope:**

- Saving recommendations to the library from this page
- Server-side conversation persistence
- Streaming responses

---

## Page: `/recommendations`

**File:** `src/app/(authed)/recommendations/page.tsx`

### Layout

Three vertical regions:

**Header bar:**

- Left: "Book Recommendations" title + "↺ Start over" ghost button (only rendered when `messages.length > 0`)
- Right: "Include reading history" label + ShadCN `Switch`

**Conversation area:**

- Scrollable, grows to fill available height
- Empty state when no messages: _"Ask for a recommendation to get started."_
- Each exchange renders in order:
  - _User turn:_ right-aligned dark bubble with prompt text
  - _Assistant turn:_ left-aligned blurb paragraph + responsive card grid (3 columns on desktop, 1 on mobile)
- Loading state: spinner with _"Finding recommendations…"_ replaces the send button while a request is in flight; input is disabled

**Input area (pinned to bottom):**

- ShadCN `Textarea` — auto-resizes, submits on Enter, newline on Shift+Enter
- Send `Button` — disabled and shows spinner while loading
- Both disabled during in-flight request

### Confirmation dialog

Used by both "Start over" and the history toggle. Rendered with ShadCN `AlertDialog`:

> _"This will clear your conversation and start fresh. Continue?"_

On confirm: calls `clearConversation()` (wipes localStorage entry + resets component state). For the toggle, also flips the toggle value after clearing.

---

## Book Cards

**File:** `src/components/recommendations/recommendation-card.tsx`

Each card displays:

- Cover image (from Google Books) or a gray placeholder if unavailable
- Title — linked to `https://www.goodreads.com/search?q={title}+{author}` (same pattern as book details page), opens in new tab
- Author
- Page count (omitted if unavailable)
- Reason blurb (1–2 sentences from Claude, tailored to the user's tastes)
- Type badge (for safe, stretch, and risky picks only)

### Card type styling

| Type       | Background | Border    | Badge color            |
| ---------- | ---------- | --------- | ---------------------- |
| `safe`     | `#f0fdf4`  | `#86efac` | Green — "Safe pick"    |
| `standard` | white      | `#e5e7eb` | None                   |
| `stretch`  | `#fffbeb`  | `#fcd34d` | Amber — "Stretch pick" |
| `risky`    | `#fff7f7`  | `#fca5a5` | Red — "Risky pick"     |

---

## Backend: `recommendations.getRecommendations`

**File:** `src/trpc/routers/recommendations.ts`

Protected mutation.

**Input:**

```ts
{
  prompt: string;
  includeHistory: boolean;
  priorMessages: {
    role: "user" | "assistant";
    content: string;
  }
  [];
}
```

`priorMessages` is the conversation history prepared by the client: assistant turns are serialized from `{ blurb, books }` to a JSON content string before being passed here. Up to 10 prior exchanges are included; the client drops the oldest from the front before sending.

**Flow:**

1. **Fetch reading data** (if `includeHistory`), two queries in parallel:
   - READ books with ratings, sorted by rating descending — preference signal
   - All books (title + author only) — deduplication list

2. **Call Claude** via `@anthropic-ai/sdk` using `messages.create` with tool use. Model: `claude-haiku-4-5-20251001` (named constant `RECOMMENDATIONS_MODEL`). The tool schema defines the expected output shape (see below). `priorMessages` are passed as the conversation history before the new user message.

3. **Parse tool call result** — validated against the schema; throws a tRPC `INTERNAL_SERVER_ERROR` if malformed.

4. **Enrich with Google Books** — `Promise.all` over the 5 books, each fetching:

   ```
   https://www.googleapis.com/books/v1/volumes?q=intitle:{title}+inauthor:{author}&maxResults=1
   ```

   Extracts `volumeInfo.imageLinks.thumbnail` and `volumeInfo.pageCount`. Both nullable; missing data is `null`. Google Books thumbnail URLs use `http://` — rewrite to `https://` before returning to avoid mixed-content errors. No API key required for low-volume queries.

5. **Return** enriched response to the client.

**Return type:**

```ts
{
  blurb: string;
  books: {
    title: string;
    author: string;
    reason: string;
    type: "safe" | "standard" | "stretch" | "risky";
    coverUrl: string | null;
    pageCount: number | null;
  }
  [];
}
```

---

## Claude Prompt Design

### Tool schema

```ts
{
  name: "recommend_books",
  description: "Return 5 book recommendations as structured data",
  input_schema: {
    type: "object",
    properties: {
      blurb: { type: "string" },
      books: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            reason: { type: "string" },
            type: { type: "string", enum: ["safe", "standard", "stretch", "risky"] }
          },
          required: ["title", "author", "reason", "type"]
        },
        minItems: 5,
        maxItems: 5
      }
    },
    required: ["blurb", "books"]
  }
}
```

### System prompt

> You are a book recommendation assistant. When reading history is provided, analyze it for patterns — preferred genres, authors, themes, pacing, and series length. Weight 4–5 star books heavily as strong positive signals for what the user loves. Weight 1–2 star books as signals of what to avoid.
>
> Return exactly 5 recommendations. Vary them across this spectrum:
>
> - At least one **safe** pick — very similar in genre, style, or author to their highest-rated books
> - At least two **standard** picks — solidly within the user's taste but introducing something new
> - At least one **stretch** pick — adjacent genre or style not yet in their library, with clear thematic overlap
> - Exactly one **risky** pick — meaningfully different in genre or style, but with a specific connecting thread (shared theme, tone, narrative structure, or emotional quality). The `reason` must name this thread explicitly.
>
> Each `reason` must be personalized — explain specifically why _this user_ will enjoy the book based on their demonstrated tastes. Never write a generic plot summary.
>
> Do not recommend any book already in the user's library.
>
> `blurb` is 2–3 sentences: a conversational intro summarizing your reasoning across the set.

### User message

If `includeHistory` is true, the user message is prefixed with a reading context block:

```
My reading history (highest rated first):
- The Way of Kings by Brandon Sanderson ★★★★★
- Dune by Frank Herbert ★★★★
- ...

Books already in my library (do not recommend these):
- Project Hail Mary, The Martian, Elantris, ...

---
{user's prompt}
```

If `includeHistory` is false, only the user's prompt is sent.

---

## localStorage Persistence

**Key:** `bookshelf-recommendations-{userId}`

**Stored shape:**

```ts
type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};

type ConversationMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; blurb: string; books: RecommendationBook[] };

type StoredConversation = {
  messages: ConversationMessage[];
  includeHistory: boolean;
};
```

**Sending history to Claude:**

Assistant turns are serialized back to `{ blurb, books: [{ title, author, reason, type }] }` (omitting `coverUrl` and `pageCount`) before being sent as `content` strings in `priorMessages`. This keeps the Claude context lean.

**Limits:**

- Maximum 10 exchanges (20 messages) in localStorage. When exceeded, oldest exchanges are dropped from the front before saving.
- The 10-exchange cap is also applied client-side before assembling `priorMessages` to send to Claude.

---

## New Files

| File                                                     | Purpose              |
| -------------------------------------------------------- | -------------------- |
| `src/app/(authed)/recommendations/page.tsx`              | Recommendations page |
| `src/components/recommendations/recommendation-card.tsx` | Individual book card |
| `src/trpc/routers/recommendations.ts`                    | tRPC router          |

## Modified Files

| File                       | Change                            |
| -------------------------- | --------------------------------- |
| `src/trpc/routers/_app.ts` | Register `recommendations` router |

---

## Dependencies

- `@anthropic-ai/sdk` — new package to install
- `ANTHROPIC_API_KEY` — new required environment variable

---

## Out of Scope

- Adding recommended books directly to the library
- Server-side conversation persistence
- Streaming Claude responses
- Displaying recommendation cards on other pages
