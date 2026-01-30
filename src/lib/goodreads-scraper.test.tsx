import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesInfo } from "@/lib/types";

import { scrape } from "./goodreads-scraper";

describe("goodreadsScraper", () => {
  describe("scrape", () => {
    beforeEach(() => vi.clearAllMocks());

    const validBookURL =
      "https://www.goodreads.com/book/show/797215.Honour_Guard";

    it("should reject non-URL strings", async () => {
      await expect(scrape("NON URL STRING")).rejects.toMatchObject({
        message: "Invalid URL",
      });
    });

    it("should reject URLs not from goodreads.com domain", async () => {
      await expect(scrape("http://google.com")).rejects.toMatchObject({
        message: "Invalid URL",
      });
    });

    it.skip("should accept https://goodreads.com URLs", async () => {
      await expect(scrape(validBookURL)).resolves.toBeDefined();
    }, 10000);

    it.skip("should accept http://goodreads.com URLs", async () => {
      await expect(scrape(validBookURL)).resolves.toBeDefined();
    }, 10000);

    it.skip("should extract valid information when book is part of a series", async () => {
      const result = await scrape(
        "https://www.goodreads.com/book/show/797215.Honour_Guard",
      );

      expect(result.author).toEqual("Dan Abnett");
      expect(result.title).toEqual("Honour Guard");
      expect(result.publishedYear).toEqual(2001);
      expect(result.summary).toBeDefined();
      expect(result.seriesInfo).toMatchObject({
        series: "Gaunt's Ghosts",
        seriesIndex: 4,
      } satisfies SeriesInfo);
    }, 10000);

    it.skip("should return undefined seriesInfo when book is standalone", async () => {
      const result = await scrape(
        "https://www.goodreads.com/book/show/30753457-dante",
      );

      expect(result.seriesInfo).toBeUndefined();
    }, 10000);
  });
});
