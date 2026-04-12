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

const RECOMMENDATIONS_SYSTEM_PROMPT_NO_HISTORY = `You are a book recommendation assistant. The user's explicit request is your sole directive — make recommendations that directly fulfil what the user is asking for, with no assumptions about their personal tastes.

Return exactly 5 recommendations. Vary them to give the user a genuine range of options:
- At least one very close match to what the user described
- A mix of well-known and lesser-known titles
- At least one pick that takes the request in a related but slightly unexpected direction

Each reason must explain specifically why this book fits the user's request. Never write a generic plot summary.

Book titles: The title field must contain the exact published title of a specific individual book — never a series name, never a combined "Series: Book Title" format. For example: use "The Blade Itself", not "The First Law" or "The First Law: The Blade Itself". Only recommend books you are certain exist as published works with that exact title. Never invent or approximate a title.

Series guidance: Strongly prefer recommending the first book in a series. If you recommend a non-first entry, the reason field must explain why — for example: "this volume works as a standalone", "each book in the series is independent", or "the author recommends this as the best starting point". Never recommend a mid-series book without this explanation.

Publication date: Strongly prefer books published after 2000. Only recommend older books when they are exceptionally well-suited to the user's request or nothing more recent fills that niche.

Do not recommend any book already in the user's library.

blurb is 2–3 sentences: a conversational intro summarizing your reasoning across the set and how the recommendations fulfil the request.`;

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a book recommendation assistant. Classify the user's message as one of:
- "recommendation": the user is asking for book recommendations (e.g. "recommend me a fantasy book", "what should I read next?", "suggest something like X")
- "question": the user is asking a conversational question about books, authors, or previous recommendations (e.g. "why did you suggest X?", "what's the next book in this series?", "does X fit my tastes?")

Use the classify_intent tool to respond.`;

const ANSWER_SYSTEM_PROMPT = `You are a knowledgeable book assistant. Answer the user's question about books conversationally and helpfully. Use any provided reading history to personalize your answer.

If your answer naturally involves specific books (e.g. the next in a series, a book you are comparing, a direct recommendation in context), include them in the books array (1–3 maximum). Only include books when they directly serve the answer — do not pad with unrelated suggestions. If no books are needed, return an empty array.

Each included book must have a reason that explains specifically why it is relevant to this answer.

Book titles must be exact published titles. Never invent or approximate a title.`;

const ANSWER_SYSTEM_PROMPT_NO_HISTORY = `You are a knowledgeable book assistant. Answer the user's question about books conversationally and helpfully.

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

const bookBaseSchema = z.object({
  title: z.string(),
  author: z.string(),
  reason: z.string(),
});

const recommendedBookSchema = bookBaseSchema.extend({ type: z.enum(["safe", "standard", "stretch", "risky"]) });

const claudeRecommendOutputSchema = z.object({
  blurb: z.string(),
  books: z.array(recommendedBookSchema).length(5),
});

const claudeAnswerOutputSchema = z.object({
  text: z.string(),
  books: z.array(bookBaseSchema).max(3).default([]),
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
    if (error instanceof TRPCError) throw error;
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
  systemPrompt: string,
  logger: Logger,
): Promise<Anthropic.Messages.Message> => {
  const timer = performanceLogger("Claude: Get book recommendations", 20000, logger);
  timer.start();
  try {
    return await anthropic.messages.create({
      model: RECOMMENDATIONS_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
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

const callAnswer = async (
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  logger: Logger,
): Promise<Anthropic.Messages.Message> => {
  const timer = performanceLogger("Claude: Answer book question", 20000, logger);
  timer.start();
  try {
    return await anthropic.messages.create({
      model: RECOMMENDATIONS_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
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

      const fetchHistoryTimer = performanceLogger("DB: Fetch reading history and classify intent", 1000, ctx.logger);
      fetchHistoryTimer.start();

      const [intent, readBooks, allBooks] = await Promise.all([
        classifyIntent(input.prompt, ctx.logger),
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

      const recommendSystemPrompt = input.includeHistory
        ? RECOMMENDATIONS_SYSTEM_PROMPT
        : RECOMMENDATIONS_SYSTEM_PROMPT_NO_HISTORY;
      const answerSystemPrompt = input.includeHistory ? ANSWER_SYSTEM_PROMPT : ANSWER_SYSTEM_PROMPT_NO_HISTORY;

      if (intent === "recommendation") {
        let claudeResponse = await callRecommendations(conversationMessages, recommendSystemPrompt, ctx.logger);
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
            recommendSystemPrompt,
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
        const claudeResponse = await callAnswer(conversationMessages, answerSystemPrompt, ctx.logger);
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
