import { TRPCError } from "@trpc/server";
import z from "zod";

import { scrape } from "@/lib/goodreads-scraper";

import { authedProcedure, createTRPCRouter } from "../init";

export const goodReadsRouter = createTRPCRouter({
  scrape: authedProcedure
    .input(z.url())
    .mutation(async ({ ctx, input: url }) => {
      let scrapeData;
      try {
        scrapeData = await scrape(url);
      } catch (error: unknown) {
        ctx.logger.warn({ url }, "Failed to fetch book details from GoodReads");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to fetch book details from GoodReads",
          cause: error,
        });
      }

      return scrapeData;
    }),
});
