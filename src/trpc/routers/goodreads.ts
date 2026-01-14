import { TRPCError } from "@trpc/server";
import z from "zod";

import { scrape } from "@/lib/goodreads-scraper";

import { authedProcedure, createTRPCRouter } from "../init";

export const goodReadsRouter = createTRPCRouter({
  scrape: authedProcedure
    .input(z.url())
    .mutation(async ({ ctx, input: url }) => {
      const startTime = Date.now();
      let scrapeData;
      try {
        scrapeData = await scrape(url);
      } catch (error: unknown) {
        ctx.logger.error(
          {
            url,
            errorName: error instanceof Error ? error.name : "Unknown",
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            errorCause: error instanceof Error ? error.cause : undefined,
            durationMs: Date.now() - startTime,
          },
          "Failed to fetch book details from GoodReads"
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to fetch book details from GoodReads",
          cause: error,
        });
      }

      return scrapeData;
    }),
});
