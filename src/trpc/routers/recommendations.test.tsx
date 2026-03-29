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
