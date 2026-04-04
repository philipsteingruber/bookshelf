# Conversational Book Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Book Recommendations page to support open-ended conversational questions (e.g. "why did you pick X?", "what's next in this series?") alongside structured 5-book recommendation requests.

**Architecture:** A new `chat` tRPC mutation replaces `getRecommendations`. It first calls Claude Haiku to classify the user's message as `"recommendation"` or `"question"`, then routes to the existing recommendation logic (5 books) or a new answer path (plain text + 0–3 optional books). The frontend `ConversationMessage` type gains new variants for answer and error messages.

**Tech Stack:** Next.js, tRPC, Prisma, Anthropic SDK (`@anthropic-ai/sdk`), Zod, React Testing Library, Vitest

---

## File Map

| File                                                          | Change                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/components/books/book-cover-fallback.tsx`                | Refactor: `book: Book` → `title: string`                                         |
| `src/components/books/book-card.tsx`                          | Update `BookCoverFallback` caller                                                |
| `src/components/books/book-details/book-details-cover.tsx`    | Update `BookCoverFallback` caller                                                |
| `src/components/recommendations/recommendation-card.tsx`      | Make `type` optional, add blue style, badge placeholder, use `BookCoverFallback` |
| `src/components/recommendations/recommendation-card.test.tsx` | Add tests for new card behaviors                                                 |
| `src/lib/constants.ts`                                        | Add `CLASSIFICATION_MODEL`                                                       |
| `src/trpc/routers/recommendations.ts`                         | Replace `getRecommendations` with `chat` mutation                                |
| `src/trpc/routers/recommendations.test.tsx`                   | Rewrite tests for `chat` procedure                                               |
| `src/app/(authed)/recommendations/page.tsx`                   | Update types, mutation call, rendering, localStorage backfill                    |

---

## Task 1: Refactor `BookCoverFallback` to accept `title: string`

**Files:**

- Modify: `src/components/books/book-cover-fallback.tsx`

- Modify: `src/components/books/book-card.tsx`

- Modify: `src/components/books/book-details/book-details-cover.tsx`

- [x] **Step 1: Update `BookCoverFallback` component**

Replace the entire file content:

```tsx
import { cn } from "@/lib/utils";

const sizeConfig = {
  sm: {
    iconSize: "size-12",
    padding: "p-4",
    gap: "gap-2",
    textSize: "text-xs",
    clamp: "line-clamp-2",
  },
  md: {
    iconSize: "size-16",
    padding: "p-6",
    gap: "gap-3",
    textSize: "text-sm",
    clamp: "line-clamp-3",
  },
  lg: {
    iconSize: "size-32",
    padding: "p-12",
    gap: "gap-6",
    textSize: "text-lg",
    clamp: "line-clamp-4",
  },
};

const BookCoverFallback = ({
  size,
  className,
  title,
}: {
  size: "sm" | "md" | "lg";
  title: string;
  className?: string;
}): React.ReactElement => {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-linear-to-br from-slate-200 via-slate-300 to-slate-400",
        config.padding,
        className,
      )}
    >
      <div className={cn("flex flex-col items-center text-center", config.gap)}>
        <svg className={cn("text-slate-500", config.iconSize)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <p className={cn("font-medium text-slate-600", config.clamp, config.textSize)}>{title}</p>
      </div>
    </div>
  );
};

export default BookCoverFallback;
```

- [x] **Step 2: Update `BookCard` caller**

In `src/components/books/book-card.tsx`, change:

```tsx
// Before:
<BookCoverFallback size="md" book={book} />

// After:
<BookCoverFallback size="md" title={book.title} />
```

- [x] **Step 3: Update `BookDetailsCover` caller**

In `src/components/books/book-details/book-details-cover.tsx`, change:

```tsx
// Before:
<BookCoverFallback size="lg" book={book} />

// After:
<BookCoverFallback size="lg" title={book.title} />
```

- [x] **Step 4: Verify no TypeScript errors**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 5: Commit**

```bash
git add src/components/books/book-cover-fallback.tsx src/components/books/book-card.tsx src/components/books/book-details/book-details-cover.tsx
git commit -m "refactor(book-cover-fallback): accept title string instead of full Book object"
```

---

## Task 2: Update `RecommendationCard` for conversational support

**Files:**

- Modify: `src/components/recommendations/recommendation-card.tsx`

- Modify: `src/components/recommendations/recommendation-card.test.tsx`

- [x] **Step 1: Write failing tests**

Add these cases to `src/components/recommendations/recommendation-card.test.tsx`. Add `fireEvent` to the import from `@testing-library/react`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
```

The existing `makeBook` helper defaults `type: "standard"`. After this task `type` becomes optional, but the default stays `"standard"` so all existing tests keep passing. Add these new test cases at the end of the `describe` block:

```tsx
it("renders without error when type is absent", () => {
  const book = makeBook({ type: undefined });
  render(<RecommendationCard book={book} />);
  expect(screen.getByRole("link", { name: "The Name of the Wind" })).toBeInTheDocument();
  expect(screen.queryByText(/pick/i)).not.toBeInTheDocument();
});

it("always renders badge placeholder element to maintain consistent height", () => {
  render(<RecommendationCard book={makeBook({ type: "standard" })} />);
  expect(screen.getByTestId("badge-placeholder")).toBeInTheDocument();
});

it("renders badge placeholder when type is absent", () => {
  render(<RecommendationCard book={makeBook({ type: undefined })} />);
  expect(screen.getByTestId("badge-placeholder")).toBeInTheDocument();
});

it("renders BookCoverFallback with title when coverUrl is null", () => {
  render(<RecommendationCard book={makeBook({ coverUrl: null })} />);
  // BookCoverFallback renders the title inside the cover area
  // The title also appears in the link, so check that the fallback element is present
  // and the cover image is absent
  expect(screen.queryByAltText("Cover of The Name of the Wind")).not.toBeInTheDocument();
  // BookCoverFallback renders title text (in addition to the link)
  expect(screen.getAllByText("The Name of the Wind")).toHaveLength(2);
});

it("renders BookCoverFallback when image fails to load", () => {
  render(<RecommendationCard book={makeBook({ coverUrl: "https://example.com/cover.jpg" })} />);
  const img = screen.getByAltText("Cover of The Name of the Wind");
  fireEvent.error(img);
  expect(screen.queryByAltText("Cover of The Name of the Wind")).not.toBeInTheDocument();
  expect(screen.getAllByText("The Name of the Wind")).toHaveLength(2);
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/components/recommendations/recommendation-card.test.tsx
```

Expected: the 5 new tests fail. Existing tests pass.

- [x] **Step 3: Replace `recommendation-card.tsx` with updated implementation**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import BookCoverFallback from "@/components/books/book-cover-fallback";
import { useImageError } from "@/hooks/ui";

export type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type?: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};

type StyleConfig = {
  card: string;
  border: string;
  divider: string;
  badge: string | null;
  badgeLabel: string | null;
};

const TYPE_STYLES: Record<"safe" | "standard" | "stretch" | "risky", StyleConfig> = {
  safe: {
    card: "bg-[#f0fdf4] dark:bg-green-950/30",
    border: "border-[#86efac] dark:border-green-800",
    divider: "border-[#bbf7d0] dark:border-green-800",
    badge:
      "text-[#16a34a] bg-[#dcfce7] border-[#86efac] dark:text-green-400 dark:bg-green-950/50 dark:border-green-800",
    badgeLabel: "Safe pick",
  },
  standard: {
    card: "bg-white dark:bg-neutral-900",
    border: "border-gray-200 dark:border-neutral-700",
    divider: "border-neutral-100 dark:border-neutral-700",
    badge: null,
    badgeLabel: null,
  },
  stretch: {
    card: "bg-[#fffbeb] dark:bg-amber-950/30",
    border: "border-[#fcd34d] dark:border-amber-700",
    divider: "border-[#fde68a] dark:border-amber-700",
    badge:
      "text-[#d97706] bg-[#fef3c7] border-[#fcd34d] dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-700",
    badgeLabel: "Stretch pick",
  },
  risky: {
    card: "bg-[#fff7f7] dark:bg-red-950/30",
    border: "border-[#fca5a5] dark:border-red-800",
    divider: "border-[#fecaca] dark:border-red-800",
    badge: "text-[#dc2626] bg-[#fee2e2] border-[#fca5a5] dark:text-red-400 dark:bg-red-950/50 dark:border-red-800",
    badgeLabel: "Risky pick",
  },
};

const CONVERSATIONAL_STYLE: StyleConfig = {
  card: "bg-[#eff6ff] dark:bg-blue-950/30",
  border: "border-[#93c5fd] dark:border-blue-800",
  divider: "border-[#bfdbfe] dark:border-blue-800",
  badge: null,
  badgeLabel: null,
};

interface RecommendationCardProps {
  book: RecommendationBook;
}

export const RecommendationCard = ({ book }: RecommendationCardProps) => {
  const styles = book.type ? TYPE_STYLES[book.type] : CONVERSATIONAL_STYLE;
  const { imageError, handleImageError } = useImageError(book.coverUrl);
  const goodreadsUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(book.title)}+${encodeURIComponent(book.author)}&search_type=books&search%5Bfield%5D=on`;
  const showFallback = !book.coverUrl || imageError;

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border ${styles.card} ${styles.border}`}>
      <div className="relative h-36 w-full">
        {showFallback ? (
          <BookCoverFallback size="sm" title={book.title} />
        ) : (
          <Image
            src={book.coverUrl!}
            alt={`Cover of ${book.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            onError={handleImageError}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {styles.badge && styles.badgeLabel ? (
          <span
            className={`self-start rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ${styles.badge}`}
          >
            {styles.badgeLabel}
          </span>
        ) : (
          <span
            aria-hidden
            data-testid="badge-placeholder"
            className="invisible self-start rounded border px-1.5 py-0.5 text-[0.65rem]"
          ></span>
        )}
        <Link
          href={goodreadsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-tight font-semibold text-blue-700 underline hover:text-blue-900 dark:text-blue-400"
        >
          {book.title}
        </Link>
        <span className="text-xs text-neutral-500">{book.author}</span>
        {book.pageCount !== null && <span className="text-xs text-neutral-400">{book.pageCount} pages</span>}
        <p
          className={`mt-auto border-t pt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 ${styles.divider}`}
        >
          {book.reason}
        </p>
      </div>
    </div>
  );
};
```

- [x] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/components/recommendations/recommendation-card.test.tsx
```

Expected: all tests pass, including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/recommendations/recommendation-card.tsx src/components/recommendations/recommendation-card.test.tsx
git commit -m "feat(recommendation-card): support optional type, blue conversational style, BookCoverFallback"
```

---

## Task 3: Add `chat` mutation to recommendations router

**Files:**

- Modify: `src/lib/constants.ts`

- Modify: `src/trpc/routers/recommendations.ts`

- Modify: `src/trpc/routers/recommendations.test.tsx`

- [x] **Step 1: Add `CLASSIFICATION_MODEL` constant**

In `src/lib/constants.ts`, add after `RECOMMENDATIONS_MODEL`:

```ts
export const CLASSIFICATION_MODEL = "claude-haiku-4-5-20251001" as const;
```

- [ ] **Step 2: Write failing tests**

Replace the entire contents of `src/trpc/routers/recommendations.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createFakeBook, createMockCaller, createMockDb } from "@/lib/test-utils";

import { recommendationsRouter } from "./recommendations";

// --- Mocks ---

const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockMessagesCreate };
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// --- Helpers ---

const DEFAULT_BOOKS = [
  { title: "Book A", author: "Author A", reason: "Reason A", type: "safe" },
  { title: "Book B", author: "Author B", reason: "Reason B", type: "standard" },
  { title: "Book C", author: "Author C", reason: "Reason C", type: "standard" },
  { title: "Book D", author: "Author D", reason: "Reason D", type: "stretch" },
  { title: "Book E", author: "Author E", reason: "Reason E", type: "risky" },
];

const makeClassifyResponse = (intent: "recommendation" | "question") => ({
  content: [
    {
      type: "tool_use",
      id: "tu_classify",
      name: "classify_intent",
      input: { intent },
    },
  ],
});

const makeRecommendResponse = (books = DEFAULT_BOOKS) => ({
  content: [
    {
      type: "tool_use",
      id: "tu_recommend",
      name: "recommend_books",
      input: { blurb: "Here are 5 picks.", books },
    },
  ],
});

const makeAnswerResponse = (text: string, books: { title: string; author: string; reason: string }[] = []) => ({
  content: [
    {
      type: "tool_use",
      id: "tu_answer",
      name: "answer_question",
      input: { text, books },
    },
  ],
});

const makeGoogleBooksJson = (thumbnail?: string, pageCount?: number) => ({
  items:
    thumbnail || pageCount
      ? [
          {
            volumeInfo: {
              imageLinks: thumbnail ? { thumbnail } : undefined,
              pageCount,
            },
          },
        ]
      : [],
});

const makeFetchResponse = (json: unknown) => ({
  ok: true,
  json: vi.fn().mockResolvedValue(json),
});

// --- Tests ---

describe("recommendationsRouter", () => {
  describe("chat", () => {
    let mockDb: PrismaClient;

    beforeEach(() => {
      vi.clearAllMocks();
      mockDb = createMockDb();
      vi.mocked(mockDb.book.findMany).mockResolvedValue([]);
      mockFetch.mockResolvedValue(makeFetchResponse(makeGoogleBooksJson("http://books.google.com/cover.jpg", 300)));
    });

    // --- Recommendation path ---

    it("routes to recommendation path and returns 5 enriched books", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockResolvedValueOnce(makeRecommendResponse());

      const result = await caller.chat({
        prompt: "Recommend me a fantasy book",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.type).toBe("recommendations");
      if (result.type !== "recommendations") return;
      expect(result.blurb).toBe("Here are 5 picks.");
      expect(result.books).toHaveLength(5);
      expect(result.books[0].title).toBe("Book A");
      expect(result.books[0].type).toBe("safe");
      expect(result.retried).toBe(false);
    });

    it("includes reading history in recommendation path when includeHistory is true", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockResolvedValueOnce(makeRecommendResponse());

      const readBook = createFakeBook({
        title: "The Way of Kings",
        author: "Brandon Sanderson",
        status: "READ",
        rating: 5,
      });

      vi.mocked(mockDb.book.findMany)
        .mockResolvedValueOnce([readBook]) // readBooks
        .mockResolvedValueOnce([readBook]); // allBooks

      await caller.chat({
        prompt: "I like epic fantasy",
        includeHistory: true,
        priorMessages: [],
      });

      // Second call is the recommendation call — check its messages
      const recommendCall = mockMessagesCreate.mock.calls[1][0];
      const lastMessage = recommendCall.messages[recommendCall.messages.length - 1];
      expect(lastMessage.content).toContain("My reading history");
      expect(lastMessage.content).toContain("The Way of Kings");
      expect(lastMessage.content).toContain("★★★★★");
    });

    it("retries when a recommended book is already in the library", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });

      vi.mocked(mockDb.book.findMany)
        .mockResolvedValueOnce([]) // readBooks
        .mockResolvedValueOnce([createFakeBook({ title: "Book A", author: "Author A" })]); // allBooks

      const replacementBooks = [
        { title: "Book F", author: "Author F", reason: "Reason F", type: "safe" },
        ...DEFAULT_BOOKS.slice(1),
      ];

      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockResolvedValueOnce(makeRecommendResponse()) // first attempt — returns "Book A"
        .mockResolvedValueOnce(makeRecommendResponse(replacementBooks)); // retry

      const result = await caller.chat({
        prompt: "Recommend me a book",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.type).toBe("recommendations");
      if (result.type !== "recommendations") return;
      expect(result.retried).toBe(true);
      expect(result.books[0].title).toBe("Book F");
    });

    it("enriches recommendation books with Google Books data", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockResolvedValueOnce(makeRecommendResponse());
      mockFetch.mockResolvedValue(makeFetchResponse(makeGoogleBooksJson("http://books.google.com/cover.jpg", 250)));

      const result = await caller.chat({
        prompt: "Fantasy books",
        includeHistory: false,
        priorMessages: [],
      });

      if (result.type !== "recommendations") return;
      expect(result.books[0].coverUrl).toBe("https://books.google.com/cover.jpg&fife=w400");
      expect(result.books[0].pageCount).toBe(250);
    });

    // --- Question path ---

    it("routes to answer path and returns text with no books", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("question"))
        .mockResolvedValueOnce(makeAnswerResponse("That's a great question about the series."));

      const result = await caller.chat({
        prompt: "Why did you pick Book A?",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.type).toBe("answer");
      if (result.type !== "answer") return;
      expect(result.text).toBe("That's a great question about the series.");
      expect(result.books).toHaveLength(0);
    });

    it("routes to answer path and returns text with 1-3 enriched books", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("question"))
        .mockResolvedValueOnce(
          makeAnswerResponse("The next book in the series is Book X.", [
            { title: "Book X", author: "Author X", reason: "Next in series" },
          ]),
        );

      const result = await caller.chat({
        prompt: "What's next in the series?",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.type).toBe("answer");
      if (result.type !== "answer") return;
      expect(result.text).toBe("The next book in the series is Book X.");
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("Book X");
      expect(result.books[0].coverUrl).toBe("https://books.google.com/cover.jpg&fife=w400");
    });

    it("includes reading history in answer path when includeHistory is true", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("question"))
        .mockResolvedValueOnce(makeAnswerResponse("Based on your tastes, yes."));

      const readBook = createFakeBook({
        title: "Dune",
        author: "Frank Herbert",
        status: "READ",
        rating: 4,
      });

      vi.mocked(mockDb.book.findMany)
        .mockResolvedValueOnce([readBook]) // readBooks
        .mockResolvedValueOnce([readBook]); // allBooks

      await caller.chat({
        prompt: "Does this fit my tastes?",
        includeHistory: true,
        priorMessages: [],
      });

      // Second call is the answer call — check its messages
      const answerCall = mockMessagesCreate.mock.calls[1][0];
      const lastMessage = answerCall.messages[answerCall.messages.length - 1];
      expect(lastMessage.content).toContain("My reading history");
      expect(lastMessage.content).toContain("Dune");
    });

    // --- Error paths ---

    it("throws INTERNAL_SERVER_ERROR when classification call fails", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate.mockRejectedValueOnce(new Error("Anthropic API error"));

      await expect(
        caller.chat({
          prompt: "Recommend something",
          includeHistory: false,
          priorMessages: [],
        }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "intent_classification_failed",
      });
    });

    it("throws INTERNAL_SERVER_ERROR when generation call fails", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockRejectedValueOnce(new Error("Anthropic API error"));

      await expect(
        caller.chat({
          prompt: "Recommend something",
          includeHistory: false,
          priorMessages: [],
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("returns null coverUrl and pageCount when Google Books fetch throws", async () => {
      const { caller } = createMockCaller(recommendationsRouter, { mockDb });
      mockMessagesCreate
        .mockResolvedValueOnce(makeClassifyResponse("recommendation"))
        .mockResolvedValueOnce(makeRecommendResponse());
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await caller.chat({
        prompt: "Fantasy",
        includeHistory: false,
        priorMessages: [],
      });

      if (result.type !== "recommendations") return;
      expect(result.books[0].coverUrl).toBeNull();
      expect(result.books[0].pageCount).toBeNull();
    });
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/trpc/routers/recommendations.test.tsx
```

Expected: all tests fail (procedure `chat` does not exist yet).

- [x] **Step 4: Replace `recommendations.ts` with full implementation**

Replace the entire file content:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { subMonths } from "date-fns";
import type { Logger } from "pino";
import z from "zod";

import { env } from "@/env";
import { ReadStatus } from "@/generated/prisma/enums";
import { performanceLogger } from "@/lib/common/logger";
import { CLASSIFICATION_MODEL, RECOMMENDATIONS_MODEL } from "@/lib/constants";

import { authedProcedure, createTRPCRouter } from "../init";

// --- System prompts ---

const RECOMMENDATIONS_SYSTEM_PROMPT = `You are a book recommendation assistant. The user's explicit request is your primary directive — reading history is supplementary context to inform your selections, not to override what the user is asking for. If the user specifies constraints (e.g., lighter reads, a particular genre, something to break a rut), treat those as hard requirements that shape all 5 recommendations.

When reading history is provided, analyze it for patterns — preferred genres, authors, themes, pacing, and series length. Weight 4–5 star books heavily as strong positive signals for what the user loves. Weight 1–2 star books and DNFs as signals of what to avoid.

Return exactly 5 recommendations. Vary them across this spectrum:
- At least one safe pick — very similar in genre, style, or author to their highest-rated books
- At least two standard picks — solidly within the user's taste but introducing something new
- At least one stretch pick — adjacent genre or style not yet in their library, with clear thematic overlap
- Exactly one risky pick — meaningfully different in genre or style, but with a specific connecting thread (shared theme, tone, narrative structure, or emotional quality). The reason must name this thread explicitly.

Each reason must be personalized — explain specifically why this user will enjoy the book based on their demonstrated tastes. Never write a generic plot summary.

Book titles: The title field must contain the exact published title of a specific individual book — never a series name, never a combined "Series: Book Title" format. For example: use "The Blade Itself", not "The First Law" or "The First Law: The Blade Itself". Only recommend books you are certain exist as published works with that exact title. Never invent or approximate a title.

Series guidance: Strongly prefer recommending the first book in a series. If you recommend a non-first entry, the reason field must explain why — for example: "this volume works as a standalone", "each book in the series is independent", or "the author recommends this as the best starting point". Never recommend a mid-series book without this explanation.

Publication date: Strongly prefer books published after 2000. Only recommend older books when they are exceptionally well-suited to the user's tastes or nothing more recent fills that niche.

Do not recommend any book already in the user's library.

blurb is 2–3 sentences: a conversational intro summarizing your reasoning across the set and how the recommendations fulfill the request.`;

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a book recommendation assistant. Classify the user's message as one of:
- "recommendation": the user is asking for book recommendations (e.g. "recommend me a fantasy book", "what should I read next?", "suggest something like X")
- "question": the user is asking a conversational question about books, authors, or previous recommendations (e.g. "why did you suggest X?", "what's the next book in this series?", "does X fit my tastes?")

Use the classify_intent tool to respond.`;

const ANSWER_SYSTEM_PROMPT = `You are a knowledgeable book assistant. Answer the user's question about books conversationally and helpfully. Use any provided reading history to personalize your answer.

If your answer naturally involves specific books (e.g. the next in a series, a book you are comparing, a direct recommendation in context), include them in the books array (1–3 maximum). Only include books when they directly serve the answer — do not pad with unrelated suggestions. If no books are needed, return an empty array.

Each included book must have a reason that explains specifically why it is relevant to this answer.

Book titles must be exact published titles. Never invent or approximate a title.`;

// --- Tools ---

const RECOMMENDATIONS_TOOL: Anthropic.Tool = {
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
            type: {
              type: "string",
              enum: ["safe", "standard", "stretch", "risky"],
            },
          },
          required: ["title", "author", "reason", "type"],
        },
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["blurb", "books"],
  },
};

const CLASSIFICATION_TOOL: Anthropic.Tool = {
  name: "classify_intent",
  description: "Classify the user message as a recommendation request or a conversational question",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["recommendation", "question"] },
    },
    required: ["intent"],
  },
};

const ANSWER_TOOL: Anthropic.Tool = {
  name: "answer_question",
  description: "Answer a conversational question about books",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      books: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            reason: { type: "string" },
          },
          required: ["title", "author", "reason"],
        },
        minItems: 0,
        maxItems: 3,
      },
    },
    required: ["text", "books"],
  },
};

// --- Zod schemas ---

const recommendedBookSchema = z.object({
  title: z.string(),
  author: z.string(),
  reason: z.string(),
  type: z.enum(["safe", "standard", "stretch", "risky"]),
});

const claudeRecommendOutputSchema = z.object({
  blurb: z.string(),
  books: z.array(recommendedBookSchema).length(5),
});

const claudeAnswerOutputSchema = z.object({
  text: z.string(),
  books: z
    .array(
      z.object({
        title: z.string(),
        author: z.string(),
        reason: z.string(),
      }),
    )
    .max(3)
    .default([]),
});

const claudeClassifyOutputSchema = z.object({
  intent: z.enum(["recommendation", "question"]),
});

// --- Helpers ---

const ratingStars = (r: number | null): string => (r ? "★".repeat(r) : "unrated");

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const enrichBooks = async <T extends { title: string; author: string }>(
  books: T[],
  logger: Logger,
): Promise<(T & { coverUrl: string | null; pageCount: number | null })[]> => {
  return Promise.all(
    books.map(async (book) => {
      try {
        const query = encodeURIComponent(`intitle:${book.title}+inauthor:${book.author}`);
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
        if (!response.ok) {
          throw new Error(`Google Books API returned ${response.status}`);
        }
        const data = (await response.json()) as {
          items?: {
            volumeInfo?: {
              imageLinks?: { thumbnail?: string };
              pageCount?: number;
            };
          }[];
        };
        const volumeInfo = data.items?.[0]?.volumeInfo;
        const rawThumbnail = volumeInfo?.imageLinks?.thumbnail ?? null;
        const coverUrl = rawThumbnail
          ? rawThumbnail.replace("http://", "https://").replace("&edge=curl", "") + "&fife=w400"
          : null;
        const pageCount = volumeInfo?.pageCount ?? null;
        return { ...book, coverUrl, pageCount };
      } catch (error) {
        logger.warn({ error, title: book.title, author: book.author }, "Failed to enrich book from Google Books");
        return { ...book, coverUrl: null, pageCount: null };
      }
    }),
  );
};

// --- Claude callers ---

const classifyIntent = async (prompt: string, logger: Logger): Promise<"recommendation" | "question"> => {
  const timer = performanceLogger("Claude: Classify intent", 5000, logger);
  timer.start();
  try {
    const response = await anthropic.messages.create({
      model: CLASSIFICATION_MODEL,
      max_tokens: 50,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      tools: [CLASSIFICATION_TOOL],
      tool_choice: { type: "tool", name: "classify_intent" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolBlock) {
      throw new Error("Classification did not return a tool use block");
    }

    const parsed = claudeClassifyOutputSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new Error("Classification returned malformed output");
    }

    return parsed.data.intent;
  } catch (error) {
    logger.error({ error }, "Failed to classify intent");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "intent_classification_failed",
    });
  } finally {
    timer.end();
  }
};

const callRecommendations = async (
  messages: Anthropic.MessageParam[],
  logger: Logger,
): Promise<Anthropic.Messages.Message> => {
  const timer = performanceLogger("Claude: Get book recommendations", 20000, logger);
  timer.start();
  try {
    return await anthropic.messages.create({
      model: RECOMMENDATIONS_MODEL,
      max_tokens: 2000,
      system: RECOMMENDATIONS_SYSTEM_PROMPT,
      tools: [RECOMMENDATIONS_TOOL],
      tool_choice: { type: "tool", name: "recommend_books" },
      messages,
    });
  } catch (error) {
    logger.error({ error }, "Failed to call Claude API for recommendations");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get recommendations from AI",
    });
  } finally {
    timer.end();
  }
};

const callAnswer = async (messages: Anthropic.MessageParam[], logger: Logger): Promise<Anthropic.Messages.Message> => {
  const timer = performanceLogger("Claude: Answer book question", 20000, logger);
  timer.start();
  try {
    return await anthropic.messages.create({
      model: RECOMMENDATIONS_MODEL,
      max_tokens: 1000,
      system: ANSWER_SYSTEM_PROMPT,
      tools: [ANSWER_TOOL],
      tool_choice: { type: "tool", name: "answer_question" },
      messages,
    });
  } catch (error) {
    logger.error({ error }, "Failed to call Claude API for answer");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get answer from AI",
    });
  } finally {
    timer.end();
  }
};

const parseRecommendResponse = (
  response: Anthropic.Messages.Message,
  logger: Logger,
): {
  data: {
    blurb: string;
    books: { title: string; author: string; reason: string; type: "safe" | "standard" | "stretch" | "risky" }[];
  };
  toolId: string;
} => {
  const toolBlock = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!toolBlock) {
    logger.error({ content: response.content }, "Claude did not return a tool use block");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse recommendations",
    });
  }
  const parseResult = claudeRecommendOutputSchema.safeParse(toolBlock.input);
  if (!parseResult.success) {
    logger.error(
      { error: parseResult.error, input: toolBlock.input },
      "Claude returned malformed recommendation output",
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse recommendations",
    });
  }
  return { data: parseResult.data, toolId: toolBlock.id };
};

const parseAnswerResponse = (
  response: Anthropic.Messages.Message,
  logger: Logger,
): { text: string; books: { title: string; author: string; reason: string }[] } => {
  const toolBlock = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!toolBlock) {
    logger.error({ content: response.content }, "Claude did not return a tool use block for answer");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse answer",
    });
  }
  const parseResult = claudeAnswerOutputSchema.safeParse(toolBlock.input);
  if (!parseResult.success) {
    logger.error({ error: parseResult.error, input: toolBlock.input }, "Claude returned malformed answer output");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse answer",
    });
  }
  return parseResult.data;
};

// --- Router ---

export const recommendationsRouter = createTRPCRouter({
  chat: authedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        includeHistory: z.boolean(),
        priorMessages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(5000),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug({ includeHistory: input.includeHistory }, "Processing chat message");

      // Step 1: Classify intent
      const intent = await classifyIntent(input.prompt, ctx.logger);
      ctx.logger.debug({ intent }, "Intent classified");

      // Step 2: Fetch reading history (needed for both paths)
      const fetchHistoryTimer = performanceLogger("DB: Fetch reading history", 1000, ctx.logger);
      fetchHistoryTimer.start();

      const [readBooks, allBooks] = await Promise.all([
        ctx.db.book.findMany({
          where: {
            userId: ctx.currentUser.id,
            status: ReadStatus.READ,
            finishedAt: { gte: subMonths(new Date(), 6) },
          },
          select: { title: true, author: true, rating: true },
          orderBy: { rating: { sort: "desc", nulls: "last" } },
        }),
        ctx.db.book.findMany({
          where: { userId: ctx.currentUser.id },
          select: { title: true, author: true },
        }),
      ]);
      fetchHistoryTimer.end({ readCount: readBooks.length, totalCount: allBooks.length });

      const readBooksContext = readBooks.map((b) => `- ${b.title} by ${b.author} ${ratingStars(b.rating)}`).join("\n");
      const allBooksContext = allBooks.map((b) => `${b.title} by ${b.author}`).join(", ");

      const userMessage =
        input.includeHistory && readBooksContext
          ? `My reading history (highest rated first):\n${readBooksContext}\n\nBooks already in my library (do not recommend these):\n${allBooksContext}\n\n---\n${input.prompt}`
          : `Books already in my library (do not recommend these): ${allBooksContext}\n\n---\n${input.prompt}`;

      const conversationMessages: Anthropic.MessageParam[] = [
        ...input.priorMessages,
        { role: "user", content: userMessage },
      ];

      // Step 3: Route to recommendation or answer path
      if (intent === "recommendation") {
        let claudeResponse = await callRecommendations(conversationMessages, ctx.logger);
        let parsed = parseRecommendResponse(claudeResponse, ctx.logger);

        // Duplicate detection + retry
        const duplicates: string[] = [];
        for (const book of parsed.data.books) {
          if (allBooks.find((b) => b.title.trim().toLowerCase() === book.title.trim().toLowerCase())) {
            duplicates.push(book.title);
          }
        }

        if (duplicates.length > 0) {
          claudeResponse = await callRecommendations(
            [
              ...conversationMessages,
              { role: "assistant", content: claudeResponse.content },
              {
                role: "user",
                content: [
                  { type: "tool_result", tool_use_id: parsed.toolId, content: "Received" },
                  {
                    type: "text",
                    text: `The following books you recommended are already in my library: ${duplicates.join(", ")}. Please replace them with different books not in my library, keeping all other recommendations the same.`,
                  },
                ],
              },
            ],
            ctx.logger,
          );
          parsed = parseRecommendResponse(claudeResponse, ctx.logger);
        }

        const enrichTimer = performanceLogger("Google Books: Enrich recommendations", 5000, ctx.logger);
        enrichTimer.start();
        const enrichedBooks = await enrichBooks(parsed.data.books, ctx.logger);
        enrichTimer.end({ count: enrichedBooks.length });

        ctx.logger.info({ bookCount: enrichedBooks.length }, "Recommendations generated successfully");
        return {
          type: "recommendations" as const,
          blurb: parsed.data.blurb,
          books: enrichedBooks,
          retried: duplicates.length > 0,
        };
      } else {
        const claudeResponse = await callAnswer(conversationMessages, ctx.logger);
        const parsed = parseAnswerResponse(claudeResponse, ctx.logger);

        const enrichTimer = performanceLogger("Google Books: Enrich answer books", 5000, ctx.logger);
        enrichTimer.start();
        const enrichedBooks = await enrichBooks(parsed.books, ctx.logger);
        enrichTimer.end({ count: enrichedBooks.length });

        ctx.logger.info({ bookCount: enrichedBooks.length }, "Answer generated successfully");
        return {
          type: "answer" as const,
          text: parsed.text,
          books: enrichedBooks,
        };
      }
    }),
});
```

- [x] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/trpc/routers/recommendations.test.tsx
```

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/trpc/routers/recommendations.ts src/trpc/routers/recommendations.test.tsx
git commit -m "feat(recommendations): replace getRecommendations with chat mutation supporting conversational Q&A"
```

---

## Task 4: Update recommendations page for conversational support

**Files:**

- Modify: `src/app/(authed)/recommendations/page.tsx`

- [x] **Step 1: Replace the entire page with updated implementation**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { RotateCcwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import type { RecommendationBook } from "@/components/recommendations/recommendation-card";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/trpc/client";

// --- Types ---

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

type StoredConversation = {
  messages: ConversationMessage[];
  includeHistory: boolean;
};

type PendingConfirm = "startOver" | "toggleOff" | "toggleOn";

// --- Constants ---

const MAX_EXCHANGES = 10;
const STORAGE_KEY_PREFIX = "bookshelf-recommendations-";

const CLASSIFICATION_ERROR_MESSAGE =
  "Couldn't figure out what you're asking for. Try rephrasing your question more clearly.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// --- Helpers ---

/**
 * Serializes conversation messages for the Claude API.
 * Error turns are omitted. Assistant turns are serialized to their text form.
 */
function serializeForClaude(messages: ConversationMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !(m.role === "assistant" && m.type === "error"))
    .map((m) => {
      if (m.role === "user") return { role: "user", content: m.content };
      if (m.type === "recommendations") {
        return {
          role: "assistant",
          content: JSON.stringify({
            blurb: m.blurb,
            books: m.books.map(({ title, author, reason, type }) => ({
              title,
              author,
              reason,
              type,
            })),
          }),
        };
      }
      // type === "answer"
      return { role: "assistant", content: m.text };
    });
}

const CONFIRM_DESCRIPTIONS: Record<PendingConfirm, string> = {
  startOver: "This will clear your conversation and start fresh. Continue?",
  toggleOff: "This will clear your conversation and turn off reading history context. Continue?",
  toggleOn: "This will clear your conversation and turn on reading history context. Continue?",
};

// --- Component ---

const Page = (): React.ReactElement => {
  const { userId, isSignedIn, isLoaded } = useAuth();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const conversationEndRef = useRef<HTMLDivElement>(null);
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

  // Load persisted conversation from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: StoredConversation = JSON.parse(stored);
        const withIds = (parsed.messages ?? []).map((m) => {
          const withId = m.id ? m : { ...m, id: crypto.randomUUID() };
          // Backfill type for old assistant messages stored before this field was added
          if (withId.role === "assistant" && !("type" in withId)) {
            return { ...withId, type: "recommendations" as const };
          }
          return withId;
        });

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessages(withIds as ConversationMessage[]);
        setIncludeHistory(parsed.includeHistory ?? true);
      }
    } catch {
      // Silently ignore parse errors — start fresh
    }
  }, [storageKey]);

  // Persist conversation to localStorage on every change
  useEffect(() => {
    if (!storageKey) return;
    const toStore: StoredConversation = { messages, includeHistory };
    try {
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {
      // Silently ignore storage errors
    }
  }, [messages, includeHistory, storageKey]);

  const clearConversation = useCallback(
    (newIncludeHistory?: boolean) => {
      setMessages([]);
      if (newIncludeHistory !== undefined) {
        setIncludeHistory(newIncludeHistory);
      }
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    },
    [storageKey],
  );

  const { mutate: chat, isPending } = trpc.recommendations.chat.useMutation({
    onSuccess: (data) => {
      if (data.type === "recommendations") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "recommendations",
            blurb: data.blurb,
            books: data.books,
            retried: data.retried,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "answer",
            text: data.text,
            books: data.books,
          },
        ]);
      }
    },
    onError: (error) => {
      const text =
        error.message === "intent_classification_failed" ? CLASSIFICATION_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
      toast.error(text);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", type: "error", text }]);
    },
  });

  const [isSlowQuery, setIsSlowQuery] = useState(false);
  useEffect(() => {
    if (!isPending) return;

    const timer = setTimeout(() => {
      setIsSlowQuery(true);
    }, 10000);

    return () => {
      clearTimeout(timer);
      setIsSlowQuery(false);
    };
  }, [isPending]);

  // Auto-scroll to latest message or loading indicator
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;

    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ];
    setMessages(updatedMessages);
    setPrompt("");

    // Trim to MAX_EXCHANGES before sending to Claude
    const totalExchanges = Math.floor(updatedMessages.length / 2);
    const drop = Math.max(0, totalExchanges - MAX_EXCHANGES) * 2;
    const priorMessages = serializeForClaude(updatedMessages.slice(drop, -1));

    chat({ prompt: trimmed, includeHistory, priorMessages });
  }, [prompt, isPending, messages, includeHistory, chat]);

  const handleToggle = (checked: boolean): void => {
    if (messages.length > 0) {
      setPendingConfirm(checked ? "toggleOn" : "toggleOff");
    } else {
      setIncludeHistory(checked);
    }
  };

  const handleConfirmAction = (): void => {
    if (pendingConfirm === "startOver") {
      clearConversation();
    } else if (pendingConfirm === "toggleOff") {
      clearConversation(false);
    } else if (pendingConfirm === "toggleOn") {
      clearConversation(true);
    }
    setPendingConfirm(null);
  };

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <>
      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm && CONFIRM_DESCRIPTIONS[pendingConfirm]}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Book Recommendations</h1>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingConfirm("startOver")}
                className="text-muted-foreground gap-1.5 text-xs"
              >
                <RotateCcwIcon className="size-3" />
                Start over
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-sm text-neutral-500">
            <span>Include reading history</span>
            <Switch checked={includeHistory} onCheckedChange={handleToggle} aria-label="Include reading history" />
          </div>
        </div>

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              Ask for a recommendation to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[60%] rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white dark:bg-neutral-700">
                        {message.content}
                      </div>
                    </div>
                  );
                }

                if (message.type === "error") {
                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="max-w-[75%] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                        {message.text}
                      </div>
                    </div>
                  );
                }

                if (message.type === "answer") {
                  return (
                    <div key={message.id} className="flex flex-col gap-3">
                      <div className="max-w-[75%] rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {message.text}
                      </div>
                      {message.books.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {message.books.map((book) => (
                            <RecommendationCard key={`${book.title}-${book.author}`} book={book} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // type === "recommendations"
                return (
                  <div key={message.id} className="flex flex-col gap-3">
                    <div className="max-w-[75%] rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {message.blurb}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {message.books.map((book) => (
                        <RecommendationCard key={`${book.title}-${book.author}`} book={book} />
                      ))}
                    </div>
                    {message.retried && (
                      <span className="text-muted-foreground text-sm">
                        One or more recommendations were replaced because they were already in your library.
                      </span>
                    )}
                  </div>
                );
              })}
              {isPending && (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Spinner className="size-4" />
                  {isSlowQuery ? "This is taking a bit longer than usual…" : "Finding recommendations…"}
                </div>
              )}
              <div ref={conversationEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t bg-white px-6 py-4 dark:bg-neutral-900">
          <div className="flex items-end gap-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask for a recommendation or a question about books…"
              disabled={isPending}
              className="min-h-[42px] resize-none"
              rows={1}
              autoFocus
            />
            <Button
              onClick={handleSubmit}
              disabled={isPending || !prompt.trim()}
              aria-label={isPending ? "Sending…" : "Send"}
              className="shrink-0"
            >
              {isPending ? <Spinner className="size-4" /> : <SendIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Page;
```

- [x] **Step 2: Verify no TypeScript errors**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 3: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [x] **Step 4: Commit**

```bash
git add src/app/(authed)/recommendations/page.tsx
git commit -m "feat(recommendations): update page for conversational Q&A — answer/error message types, chat mutation"
```
