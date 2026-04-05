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

const makeClassifyResponse = (intent: "recommendation" | "question"): { content: { type: string; id: string; name: string; input: { intent: "recommendation" | "question" } }[] } => ({
  content: [
    {
      type: "tool_use",
      id: "tu_classify",
      name: "classify_intent",
      input: { intent },
    },
  ],
});

const makeRecommendResponse = (books = DEFAULT_BOOKS): { content: { type: string; id: string; name: string; input: { blurb: string; books: { title: string; author: string; reason: string; type: string }[] } }[] } => ({
  content: [
    {
      type: "tool_use",
      id: "tu_recommend",
      name: "recommend_books",
      input: { blurb: "Here are 5 picks.", books },
    },
  ],
});

const makeAnswerResponse = (text: string, books: { title: string; author: string; reason: string }[] = []): { content: { type: string; id: string; name: string; input: { text: string; books: { title: string; author: string; reason: string }[] } }[] } => ({
  content: [
    {
      type: "tool_use",
      id: "tu_answer",
      name: "answer_question",
      input: { text, books },
    },
  ],
});

const makeGoogleBooksJson = (thumbnail?: string, pageCount?: number): { items: { volumeInfo: { imageLinks?: { thumbnail: string }; pageCount?: number } }[] } => ({
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

const makeFetchResponse = (json: unknown): { ok: boolean; json: ReturnType<typeof vi.fn> } => ({
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
