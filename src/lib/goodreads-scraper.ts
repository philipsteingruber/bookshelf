import { decode } from "he";
import { ScrapeConfig, ScrapflyClient } from "scrapfly-sdk";
import z from "zod";

import { env } from "@/env";
import type { ScrapeData, SeriesInfo } from "@/lib/types";

export const scrape = async (url: string): Promise<ScrapeData> => {
  const validate = z
    .url()
    .refine(
      (url) =>
        url.startsWith("https://www.goodreads.com") ||
        url.startsWith("http://www.goodreads.com") ||
        url.startsWith("https://goodreads.com") ||
        url.startsWith("http://goodreads.com"),
      {
        message: "URL must be from goodreads.com",
      },
    )
    .safeParse(url);

  if (!validate.success) {
    throw new Error("Invalid URL");
  }
  const validatedUrl = validate.data!;

  const scrapflyClient = new ScrapflyClient({
    key: env.SCRAPFLY_API_KEY,
  });

  const result = await scrapflyClient.scrape(
    new ScrapeConfig({ url: validatedUrl }),
  );

  if (result.result.status_code !== 200) {
    throw new Error("Failed to fetch data from GoodReads", {
      cause: { code: "BAD_REQUEST" },
    });
  }

  // Title (without series)
  const title = result
    .selector("h1")
    .clone()
    .find("span")
    .remove()
    .end()
    .text()
    .trim();

  if (!title) {
    throw new Error("Unable to find title on requested page");
  }

  // Summary
  const summaryHtml = result
    .selector(".DetailsLayoutRightParagraph__widthConstrained")
    .find("span")
    .html();
  const summary = summaryHtml
    ? decode(
        summaryHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
      ).trim()
    : undefined;

  // Author
  let author = result.selector(".ContributorLink__name").text();
  author = author.slice(0, author.length / 2);

  if (!author) {
    throw new Error("Unable to find author on requested page");
  }

  // Series / Published Year
  let seriesInfo: SeriesInfo | undefined;
  let publishedYear: number | undefined;

  const response = await fetch(url);
  const text = await response.text();

  const seriesMatch = /Book (\d+) in the (.+?) series/.exec(text);
  if (seriesMatch?.[1] && seriesMatch?.[2]) {
    seriesInfo = {
      series: decode(seriesMatch[2]),
      seriesIndex: parseInt(seriesMatch[1]),
    };
  }

  const publishedYearMatch = /First published.+? \d{1,2}, (\d{4})/.exec(text);
  if (publishedYearMatch) {
    publishedYear = parseInt(publishedYearMatch[1]);
  }
  if (!publishedYear) {
    throw new Error("Unable to find published year on requested page");
  }

  return {
    title,
    author,
    publishedYear,
    seriesInfo,
    summary,
  };
};
