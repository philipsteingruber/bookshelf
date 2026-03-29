# AI Book Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/recommendations` page where users can ask Claude for personalized book recommendations, with results enriched via Google Books and conversation history persisted in localStorage.

**Architecture:** A single `recommendations.getRecommendations` tRPC protected mutation calls Claude via the Anthropic SDK (tool use for structured JSON output), enriches each book with Google Books API data, and returns the full enriched response. The frontend page manages conversation state in localStorage and renders cards with per-type visual styling.

**Tech Stack:** `@anthropic-ai/sdk`, Google Books API (no key required), ShadCN `AlertDialog` + `Switch`, tRPC, Zod, Vitest + Testing Library

---

## File Structure

| File                                                          | Action | Purpose                                        |
| ------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `src/env.ts`                                                  | Modify | Add `ANTHROPIC_API_KEY` env var                |
| `vitest.setup.ts`                                             | Modify | Add `ANTHROPIC_API_KEY` to test env mock       |
| `src/lib/constants.ts`                                        | Modify | Add `RECOMMENDATIONS_MODEL` constant           |
| `src/components/layout/app-sidebar.tsx`                       | Modify | Add Recommendations nav item                   |
| `src/components/ui/alert-dialog.tsx`                          | Create | ShadCN AlertDialog component                   |
| `src/components/ui/switch.tsx`                                | Create | ShadCN Switch component                        |
| `src/trpc/routers/recommendations.ts`                         | Create | tRPC router with `getRecommendations` mutation |
| `src/trpc/routers/recommendations.test.tsx`                   | Create | Router unit tests                              |
| `src/trpc/routers/_app.ts`                                    | Modify | Register `recommendations` router              |
| `src/components/recommendations/recommendation-card.tsx`      | Create | Book card with type-based styling              |
| `src/components/recommendations/recommendation-card.test.tsx` | Create | Card render tests                              |
| `src/app/(authed)/recommendations/page.tsx`                   | Create | Recommendations page                           |

---

### Task 1: Environment setup, constants, nav, and ShadCN components

**Files:**

- Modify: `src/env.ts`
- Modify: `vitest.setup.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `src/components/ui/alert-dialog.tsx` (via ShadCN CLI)
- Create: `src/components/ui/switch.tsx` (via ShadCN CLI)

- [ ] **Step 1: Install `@anthropic-ai/sdk`**

```bash
pnpm add @anthropic-ai/sdk
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Install ShadCN `alert-dialog` and `switch` components**

```bash
pnpm dlx shadcn@latest add alert-dialog switch
```

Expected: `src/components/ui/alert-dialog.tsx` and `src/components/ui/switch.tsx` created.

- [ ] **Step 3: Add `ANTHROPIC_API_KEY` to `src/env.ts`**

In the `server` section, add after `SCRAPFLY_API_KEY`:

```ts
ANTHROPIC_API_KEY: z.string().min(1),
```

In the `runtimeEnv` section, add after `SCRAPFLY_API_KEY`:

```ts
ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
```

- [ ] **Step 4: Add `ANTHROPIC_API_KEY` to `.env.local`**

Open `.env.local` and add:

```
ANTHROPIC_API_KEY=your_key_here
```

Get the key from the Anthropic console.

- [ ] **Step 5: Add `ANTHROPIC_API_KEY` to the vitest mock in `vitest.setup.ts`**

```ts
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    CLERK_SECRET_KEY: "test_clerk_secret",
    CLERK_WEBHOOK_SIGNING_SECRET: "test_webhook_secret",
    UPLOADTHING_TOKEN: "test_uploadthing_token",
    SCRAPFLY_API_KEY: "test_scrapfly_key",
    ANTHROPIC_API_KEY: "test_anthropic_key",
    BETTERSTACK_TOKEN: undefined,
    BETTERSTACK_INGESTING_HOST: undefined,
    VERCEL_URL: undefined,
    VERCEL_REGION: undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test_clerk_publishable",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));
```

- [ ] **Step 6: Add `RECOMMENDATIONS_MODEL` constant to `src/lib/constants.ts`**

Add at the end of the file:

```ts
export const RECOMMENDATIONS_MODEL = "claude-haiku-4-5-20251001" as const;
```

- [ ] **Step 7: Add Recommendations nav item to `src/components/layout/app-sidebar.tsx`**

Add `SparklesIcon` to the lucide-react import:

```ts
import {
  BookIcon,
  BookOpenIcon,
  BookSearchIcon,
  HistoryIcon,
  LibraryIcon,
  SparklesIcon,
} from "lucide-react";
```

Add to `sidebarItems` array after the History entry:

```ts
const sidebarItems: SidebarItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: BookIcon },
  { title: "Library", href: "/books", icon: BookSearchIcon },
  { title: "Series", href: "/series", icon: LibraryIcon },
  { title: "History", href: "/history", icon: HistoryIcon },
  { title: "Recommendations", href: "/recommendations", icon: SparklesIcon },
];
```

- [ ] **Step 8: Run the test suite to verify nothing is broken**

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/env.ts vitest.setup.ts src/lib/constants.ts src/components/layout/app-sidebar.tsx src/components/ui/alert-dialog.tsx src/components/ui/switch.tsx package.json pnpm-lock.yaml
git commit -m "feat: install @anthropic-ai/sdk, add env var and nav for recommendations"
```

---

### Task 2: `recommendations` tRPC router

**Files:**

- Create: `src/trpc/routers/recommendations.ts`
- Create: `src/trpc/routers/recommendations.test.tsx`
- Modify: `src/trpc/routers/_app.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/trpc/routers/recommendations.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeBook, createMockCaller } from "@/lib/test-utils";

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

const makeClaudeResponse = (books = DEFAULT_BOOKS) => ({
  content: [
    {
      type: "tool_use",
      id: "tu_test",
      name: "recommend_books",
      input: { blurb: "Here are 5 picks.", books },
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
  describe("getRecommendations", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockResolvedValue(
        makeFetchResponse(
          makeGoogleBooksJson("http://books.google.com/cover.jpg", 300),
        ),
      );
    });

    it("should return blurb and 5 enriched books", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());

      const result = await caller.getRecommendations({
        prompt: "Recommend me a fantasy book",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.blurb).toBe("Here are 5 picks.");
      expect(result.books).toHaveLength(5);
      expect(result.books[0].title).toBe("Book A");
      expect(result.books[0].type).toBe("safe");
    });

    it("should include reading history context when includeHistory is true", async () => {
      const { caller, mockDb } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());

      const readBook = createFakeBook({
        title: "The Way of Kings",
        author: "Brandon Sanderson",
        status: "READ",
        rating: 5,
      });

      vi.mocked(mockDb.book.findMany)
        .mockResolvedValueOnce([readBook]) // readBooks
        .mockResolvedValueOnce([readBook]); // allBooks

      await caller.getRecommendations({
        prompt: "I like epic fantasy",
        includeHistory: true,
        priorMessages: [],
      });

      const calledWith = mockMessagesCreate.mock.calls[0][0];
      const lastMessage = calledWith.messages[calledWith.messages.length - 1];
      expect(lastMessage.content).toContain("My reading history");
      expect(lastMessage.content).toContain("The Way of Kings");
      expect(lastMessage.content).toContain("★★★★★");
    });

    it("should not include reading history when includeHistory is false", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());

      await caller.getRecommendations({
        prompt: "Just give me something good",
        includeHistory: false,
        priorMessages: [],
      });

      const calledWith = mockMessagesCreate.mock.calls[0][0];
      const lastMessage = calledWith.messages[calledWith.messages.length - 1];
      expect(lastMessage.content).toBe("Just give me something good");
      expect(lastMessage.content).not.toContain("reading history");
    });

    it("should rewrite Google Books http thumbnail URL to https", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());
      mockFetch.mockResolvedValue(
        makeFetchResponse(
          makeGoogleBooksJson("http://books.google.com/cover.jpg", 250),
        ),
      );

      const result = await caller.getRecommendations({
        prompt: "Fantasy books",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.books[0].coverUrl).toBe(
        "https://books.google.com/cover.jpg",
      );
      expect(result.books[0].pageCount).toBe(250);
    });

    it("should return null coverUrl and pageCount when Google Books returns no items", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());
      mockFetch.mockResolvedValue(makeFetchResponse({ items: [] }));

      const result = await caller.getRecommendations({
        prompt: "Fantasy",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.books[0].coverUrl).toBeNull();
      expect(result.books[0].pageCount).toBeNull();
    });

    it("should return null coverUrl and pageCount when Google Books fetch throws", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await caller.getRecommendations({
        prompt: "Fantasy",
        includeHistory: false,
        priorMessages: [],
      });

      expect(result.books[0].coverUrl).toBeNull();
      expect(result.books[0].pageCount).toBeNull();
    });

    it("should throw INTERNAL_SERVER_ERROR when Claude API throws", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockRejectedValue(new Error("Anthropic API error"));

      await expect(
        caller.getRecommendations({
          prompt: "Fantasy",
          includeHistory: false,
          priorMessages: [],
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("should include priorMessages in the Claude call", async () => {
      const { caller } = createMockCaller(recommendationsRouter);
      mockMessagesCreate.mockResolvedValue(makeClaudeResponse());

      await caller.getRecommendations({
        prompt: "More like the first one",
        includeHistory: false,
        priorMessages: [
          { role: "user", content: "Give me fantasy" },
          { role: "assistant", content: '{"blurb":"Great picks","books":[]}' },
        ],
      });

      const calledWith = mockMessagesCreate.mock.calls[0][0];
      expect(calledWith.messages).toHaveLength(3); // 2 prior + 1 new
      expect(calledWith.messages[0].role).toBe("user");
      expect(calledWith.messages[1].role).toBe("assistant");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/trpc/routers/recommendations.test.tsx
```

Expected: FAIL — "Cannot find module './recommendations'"

- [ ] **Step 3: Create `src/trpc/routers/recommendations.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { ReadStatus } from "@/generated/prisma/enums";
import { performanceLogger } from "@/lib/common/logger";
import { RECOMMENDATIONS_MODEL } from "@/lib/constants";

import { authedProcedure, createTRPCRouter } from "../init";

const RECOMMENDATIONS_SYSTEM_PROMPT = `You are a book recommendation assistant. When reading history is provided, analyze it for patterns — preferred genres, authors, themes, pacing, and series length. Weight 4–5 star books heavily as strong positive signals for what the user loves. Weight 1–2 star books as signals of what to avoid.

Return exactly 5 recommendations. Vary them across this spectrum:
- At least one safe pick — very similar in genre, style, or author to their highest-rated books
- At least two standard picks — solidly within the user's taste but introducing something new
- At least one stretch pick — adjacent genre or style not yet in their library, with clear thematic overlap
- Exactly one risky pick — meaningfully different in genre or style, but with a specific connecting thread (shared theme, tone, narrative structure, or emotional quality). The reason must name this thread explicitly.

Each reason must be personalized — explain specifically why this user will enjoy the book based on their demonstrated tastes. Never write a generic plot summary.

Do not recommend any book already in the user's library.

blurb is 2–3 sentences: a conversational intro summarizing your reasoning across the set.`;

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

type RecommendedBook = {
  title: string;
  author: string;
  reason: string;
  type: "safe" | "standard" | "stretch" | "risky";
};

type ClaudeOutput = {
  blurb: string;
  books: RecommendedBook[];
};

export const recommendationsRouter = createTRPCRouter({
  getRecommendations: authedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        includeHistory: z.boolean(),
        priorMessages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.debug(
        { includeHistory: input.includeHistory },
        "Getting book recommendations",
      );

      let readBooksContext = "";
      let allBooksContext = "";

      if (input.includeHistory) {
        const fetchHistoryTimer = performanceLogger(
          "DB: Fetch reading history for recommendations",
          500,
          ctx.logger,
        );
        fetchHistoryTimer.start();

        const [readBooks, allBooks] = await Promise.all([
          ctx.db.book.findMany({
            where: { userId: ctx.currentUser.id, status: ReadStatus.READ },
            select: { title: true, author: true, rating: true },
            orderBy: { rating: { sort: "desc", nulls: "last" } },
          }),
          ctx.db.book.findMany({
            where: { userId: ctx.currentUser.id },
            select: { title: true, author: true },
          }),
        ]);
        fetchHistoryTimer.end({
          readCount: readBooks.length,
          totalCount: allBooks.length,
        });

        const ratingStars = (r: number | null): string =>
          r ? "★".repeat(r) : "unrated";

        readBooksContext = readBooks
          .map((b) => `- ${b.title} by ${b.author} ${ratingStars(b.rating)}`)
          .join("\n");

        allBooksContext = allBooks
          .map((b) => `${b.title} by ${b.author}`)
          .join(", ");
      }

      const userMessage =
        input.includeHistory && readBooksContext
          ? `My reading history (highest rated first):\n${readBooksContext}\n\nBooks already in my library (do not recommend these):\n${allBooksContext}\n\n---\n${input.prompt}`
          : input.prompt;

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const callClaudeTimer = performanceLogger(
        "Claude: Get book recommendations",
        15000,
        ctx.logger,
      );
      callClaudeTimer.start();

      let claudeResponse: Anthropic.Message;
      try {
        claudeResponse = await anthropic.messages.create({
          model: RECOMMENDATIONS_MODEL,
          max_tokens: 2000,
          system: RECOMMENDATIONS_SYSTEM_PROMPT,
          tools: [RECOMMENDATIONS_TOOL],
          tool_choice: { type: "tool", name: "recommend_books" },
          messages: [
            ...input.priorMessages,
            { role: "user", content: userMessage },
          ],
        });
      } catch (error) {
        ctx.logger.error({ error }, "Failed to call Claude API");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get recommendations from AI",
        });
      }
      callClaudeTimer.end();

      const toolUseBlock = claudeResponse.content.find(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );

      if (!toolUseBlock) {
        ctx.logger.error(
          { content: claudeResponse.content },
          "Claude did not return a tool use block",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse recommendations",
        });
      }

      const parsed = toolUseBlock.input as ClaudeOutput;

      const enrichBookTimer = performanceLogger(
        "Google Books: Enrich recommendations",
        5000,
        ctx.logger,
      );
      enrichBookTimer.start();

      const enrichedBooks = await Promise.all(
        parsed.books.map(async (book) => {
          try {
            const query = encodeURIComponent(
              `intitle:${book.title}+inauthor:${book.author}`,
            );
            const response = await fetch(
              `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`,
            );
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
              ? rawThumbnail.replace("http://", "https://")
              : null;
            const pageCount = volumeInfo?.pageCount ?? null;
            return { ...book, coverUrl, pageCount };
          } catch {
            return { ...book, coverUrl: null, pageCount: null };
          }
        }),
      );

      enrichBookTimer.end({ count: enrichedBooks.length });

      ctx.logger.info(
        { bookCount: enrichedBooks.length },
        "Recommendations generated successfully",
      );

      return { blurb: parsed.blurb, books: enrichedBooks };
    }),
});
```

- [ ] **Step 4: Register the router in `src/trpc/routers/_app.ts`**

```ts
import { createTRPCRouter } from "../init";

import { bookRouter } from "./book";
import { goodReadsRouter } from "./goodreads";
import { readingProgressRouter } from "./reading-progress";
import { recommendationsRouter } from "./recommendations";
import { userRouter } from "./user";

export const appRouter = createTRPCRouter({
  user: userRouter,
  book: bookRouter,
  readingProgress: readingProgressRouter,
  goodReads: goodReadsRouter,
  recommendations: recommendationsRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm test src/trpc/routers/recommendations.test.tsx
```

Expected: 8 tests passing, 0 failures.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/trpc/routers/recommendations.ts src/trpc/routers/recommendations.test.tsx src/trpc/routers/_app.ts
git commit -m "feat(recommendations): add getRecommendations tRPC mutation with Claude + Google Books"
```

---

### Task 3: `RecommendationCard` component

**Files:**

- Create: `src/components/recommendations/recommendation-card.tsx`
- Create: `src/components/recommendations/recommendation-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/recommendations/recommendation-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecommendationCard } from "./recommendation-card";
import type { RecommendationBook } from "./recommendation-card";

const makeBook = (
  overrides: Partial<RecommendationBook> = {},
): RecommendationBook => ({
  title: "The Name of the Wind",
  author: "Patrick Rothfuss",
  reason: "A lyrical coming-of-age with a brilliant magic system.",
  type: "standard",
  coverUrl: null,
  pageCount: 662,
  ...overrides,
});

describe("RecommendationCard", () => {
  it("renders title as a Goodreads search link opening in new tab", () => {
    render(<RecommendationCard book={makeBook()} />);
    const link = screen.getByRole("link", { name: "The Name of the Wind" });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("goodreads.com/search"),
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders author name", () => {
    render(<RecommendationCard book={makeBook()} />);
    expect(screen.getByText("Patrick Rothfuss")).toBeInTheDocument();
  });

  it("renders page count when provided", () => {
    render(<RecommendationCard book={makeBook({ pageCount: 662 })} />);
    expect(screen.getByText("662 pages")).toBeInTheDocument();
  });

  it("omits page count when null", () => {
    render(<RecommendationCard book={makeBook({ pageCount: null })} />);
    expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
  });

  it("renders reason text", () => {
    render(<RecommendationCard book={makeBook()} />);
    expect(
      screen.getByText(
        "A lyrical coming-of-age with a brilliant magic system.",
      ),
    ).toBeInTheDocument();
  });

  it("renders 'Safe pick' badge for safe type", () => {
    render(<RecommendationCard book={makeBook({ type: "safe" })} />);
    expect(screen.getByText("Safe pick")).toBeInTheDocument();
  });

  it("renders 'Stretch pick' badge for stretch type", () => {
    render(<RecommendationCard book={makeBook({ type: "stretch" })} />);
    expect(screen.getByText("Stretch pick")).toBeInTheDocument();
  });

  it("renders 'Risky pick' badge for risky type", () => {
    render(<RecommendationCard book={makeBook({ type: "risky" })} />);
    expect(screen.getByText("Risky pick")).toBeInTheDocument();
  });

  it("renders no badge for standard type", () => {
    render(<RecommendationCard book={makeBook({ type: "standard" })} />);
    expect(screen.queryByText(/pick/i)).not.toBeInTheDocument();
  });

  it("renders cover image with alt text when coverUrl provided", () => {
    render(
      <RecommendationCard
        book={makeBook({ coverUrl: "https://example.com/cover.jpg" })}
      />,
    );
    const img = screen.getByAltText("Cover of The Name of the Wind");
    expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
  });

  it("renders placeholder div (no img) when coverUrl is null", () => {
    render(<RecommendationCard book={makeBook({ coverUrl: null })} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/components/recommendations/recommendation-card.test.tsx
```

Expected: FAIL — "Cannot find module './recommendation-card'"

- [ ] **Step 3: Create `src/components/recommendations/recommendation-card.tsx`**

```tsx
import Link from "next/link";

export type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};

const TYPE_STYLES: Record<
  RecommendationBook["type"],
  {
    card: string;
    border: string;
    divider: string;
    badge: string | null;
    badgeLabel: string | null;
  }
> = {
  safe: {
    card: "bg-[#f0fdf4]",
    border: "border-[#86efac]",
    divider: "border-[#bbf7d0]",
    badge: "text-[#16a34a] bg-[#dcfce7] border-[#86efac]",
    badgeLabel: "Safe pick",
  },
  standard: {
    card: "bg-white dark:bg-neutral-900",
    border: "border-neutral-200 dark:border-neutral-700",
    divider: "border-neutral-100 dark:border-neutral-700",
    badge: null,
    badgeLabel: null,
  },
  stretch: {
    card: "bg-[#fffbeb]",
    border: "border-[#fcd34d]",
    divider: "border-[#fde68a]",
    badge: "text-[#d97706] bg-[#fef3c7] border-[#fcd34d]",
    badgeLabel: "Stretch pick",
  },
  risky: {
    card: "bg-[#fff7f7]",
    border: "border-[#fca5a5]",
    divider: "border-[#fecaca]",
    badge: "text-[#dc2626] bg-[#fee2e2] border-[#fca5a5]",
    badgeLabel: "Risky pick",
  },
};

interface RecommendationCardProps {
  book: RecommendationBook;
}

export function RecommendationCard({ book }: RecommendationCardProps) {
  const styles = TYPE_STYLES[book.type];
  const goodreadsUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(book.title)}+${encodeURIComponent(book.author)}&search_type=books&search%5Bfield%5D=on`;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${styles.card} ${styles.border}`}
    >
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="h-36 w-full bg-neutral-200 dark:bg-neutral-700" />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {styles.badge && styles.badgeLabel && (
          <span
            className={`self-start rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ${styles.badge}`}
          >
            {styles.badgeLabel}
          </span>
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
        {book.pageCount !== null && (
          <span className="text-xs text-neutral-400">
            {book.pageCount} pages
          </span>
        )}
        <p
          className={`mt-auto border-t pt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 ${styles.divider}`}
        >
          {book.reason}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/recommendations/recommendation-card.test.tsx
```

Expected: 11 tests passing, 0 failures.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/recommendations/recommendation-card.tsx src/components/recommendations/recommendation-card.test.tsx
git commit -m "feat(recommendations): add RecommendationCard component with type-based styling"
```

---

### Task 4: Recommendations page

**Files:**

- Create: `src/app/(authed)/recommendations/page.tsx`

There is no separate test file for this page — consistent with the rest of the codebase (no page-level tests exist). The tRPC mutation and the card component are both tested in their own units.

- [ ] **Step 1: Create `src/app/(authed)/recommendations/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { RotateCcwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import type { RecommendationBook } from "@/components/recommendations/recommendation-card";
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
  | { role: "user"; content: string }
  | { role: "assistant"; blurb: string; books: RecommendationBook[] };

type StoredConversation = {
  messages: ConversationMessage[];
  includeHistory: boolean;
};

type PendingConfirm = "startOver" | "toggleOff" | "toggleOn";

// --- Constants ---

const MAX_EXCHANGES = 10;
const STORAGE_KEY_PREFIX = "bookshelf-recommendations-";

// --- Helpers ---

/**
 * Serializes conversation messages for the Claude API.
 * Assistant turns are converted back to JSON strings (omitting coverUrl/pageCount)
 * to keep the context window lean.
 */
function serializeForClaude(
  messages: ConversationMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
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
  });
}

// --- Component ---

const Page = (): React.ReactElement => {
  const { userId, isSignedIn, isLoaded } = useAuth();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  const conversationEndRef = useRef<HTMLDivElement>(null);
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

  // Load persisted conversation from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: StoredConversation = JSON.parse(stored);
        setMessages(parsed.messages ?? []);
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

  // Auto-scroll to latest message
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const { mutate: getRecommendations, isPending } =
    trpc.recommendations.getRecommendations.useMutation({
      onSuccess: (data) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", blurb: data.blurb, books: data.books },
        ]);
      },
      onError: () => {
        toast.error("Failed to get recommendations. Please try again.");
        // Remove the optimistically-added user message
        setMessages((prev) => prev.slice(0, -1));
      },
    });

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;

    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(updatedMessages);
    setPrompt("");

    // Trim to MAX_EXCHANGES before sending to Claude
    const totalExchanges = Math.floor(updatedMessages.length / 2);
    const drop = Math.max(0, totalExchanges - MAX_EXCHANGES) * 2;
    const priorMessages = serializeForClaude(updatedMessages.slice(drop, -1));

    getRecommendations({ prompt: trimmed, includeHistory, priorMessages });
  };

  const handleToggle = (checked: boolean) => {
    if (messages.length > 0) {
      setPendingConfirm(checked ? "toggleOn" : "toggleOff");
    } else {
      setIncludeHistory(checked);
    }
  };

  const handleConfirmAction = () => {
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
            <AlertDialogDescription>
              This will clear your conversation and start fresh. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex h-full flex-col">
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
            <Switch checked={includeHistory} onCheckedChange={handleToggle} />
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
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[60%] rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white dark:bg-neutral-700">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={index} className="flex flex-col gap-3">
                    <div className="max-w-[75%] rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {message.blurb}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {message.books.map((book, bookIndex) => (
                        <RecommendationCard key={bookIndex} book={book} />
                      ))}
                    </div>
                  </div>
                ),
              )}
              {isPending && (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Spinner className="size-4" />
                  Finding recommendations…
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
              placeholder="Ask for a recommendation…"
              disabled={isPending}
              className="min-h-[42px] resize-none"
              rows={1}
            />
            <Button
              onClick={handleSubmit}
              disabled={isPending || !prompt.trim()}
              className="shrink-0"
            >
              {isPending ? (
                <Spinner className="size-4" />
              ) : (
                <SendIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Page;
```

- [ ] **Step 2: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Start the dev server and manually verify the page**

```bash
pnpm dev
```

Open `http://localhost:3000/recommendations` and verify:

- [ ] Page loads with header, empty state, and input area
- [ ] "Include reading history" toggle is visible and on by default
- [ ] "Start over" button does NOT appear on an empty conversation
- [ ] Typing and pressing Enter submits the prompt
- [ ] "Finding recommendations…" spinner appears while waiting
- [ ] Blurb and 5 book cards appear after response
- [ ] Cards show correct badge (Safe pick / Stretch pick / Risky pick) and coloring
- [ ] Card titles are clickable Goodreads links
- [ ] "Start over" button appears once there are messages; clicking it shows the confirmation dialog
- [ ] Toggling "Include reading history" with an existing conversation shows the confirmation dialog
- [ ] Refreshing the page restores the conversation from localStorage
- [ ] Recommendations nav item appears in sidebar and highlights when on the page

- [ ] **Step 4: Commit**

```bash
git add src/app/\(authed\)/recommendations/page.tsx
git commit -m "feat(recommendations): add recommendations page with chat UI and localStorage persistence"
```
