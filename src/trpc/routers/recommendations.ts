import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { env } from "@/env";
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

const recommendedBookSchema = z.object({
  title: z.string(),
  author: z.string(),
  reason: z.string(),
  type: z.enum(["safe", "standard", "stretch", "risky"]),
});

const claudeOutputSchema = z.object({
  blurb: z.string(),
  books: z.array(recommendedBookSchema).length(5),
});

const ratingStars = (r: number | null): string =>
  r ? "★".repeat(r) : "unrated";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
              content: z.string().max(5000),
            }),
          )
          .max(20)
          .default([]),
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

      const parseResult = claudeOutputSchema.safeParse(toolUseBlock.input);
      if (!parseResult.success) {
        ctx.logger.error(
          { error: parseResult.error, input: toolUseBlock.input },
          "Claude returned malformed tool output",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse recommendations",
        });
      }
      const parsed = parseResult.data;

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
              ? rawThumbnail.replace("http://", "https://")
              : null;
            const pageCount = volumeInfo?.pageCount ?? null;
            return { ...book, coverUrl, pageCount };
          } catch (error) {
            ctx.logger.warn(
              { error, title: book.title, author: book.author },
              "Failed to enrich book from Google Books",
            );
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
