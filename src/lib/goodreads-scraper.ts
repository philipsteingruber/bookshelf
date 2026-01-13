import { decode } from "he";
import { ScrapeConfig, ScrapflyClient } from "scrapfly-sdk";
import z from "zod";

type SeriesInfo = { series: string; seriesIndex: number };

export const scrape = async (
  url: string,
): Promise<{
  data?: {
    title: string;
    author: string;
    publishedYear: number;
    seriesInfo?: SeriesInfo;
  };
  isLoading: boolean;
  error?: string;
}> => {
  let isLoading = true;
  let data:
    | {
        title: string;
        author: string;
        seriesInfo?: SeriesInfo;
        publishedYear: number;
      }
    | undefined;
  let error: string | undefined;

  try {
    const validatedUrl = z.url().parse(url);

    const scrapflyClient = new ScrapflyClient({
      key: "scp-live-c4598004547f434fa6167852b5e09280",
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

    // Author
    let author = result.selector(".ContributorLink__name").text();
    author = author.slice(0, author.length / 2);

    // Series / Published Year
    let seriesInfo: { series: string; seriesIndex: number } | undefined;
    let publishedYear: number | undefined = -1;

    await fetch(url).then(async (response) => {
      const text = await response.text();

      const seriesMatch = /Book (\d+) in the (.+?) series/.exec(text);
      if (!!seriesMatch && !!seriesMatch[1] && !!seriesMatch[2]) {
        seriesInfo = {
          seriesIndex: parseInt(seriesMatch[1]),
          series: decode(seriesMatch[2]),
        };
      }

      const publishedYearMatch = /First published.+? \d{1,2}, (\d{4})/.exec(
        text,
      );
      if (!!publishedYearMatch) {
        publishedYear = parseInt(publishedYearMatch[1]);
      }
    });

    data = { title, author, publishedYear, seriesInfo };
  } catch (err: any) {
    error = err.message;
  } finally {
    isLoading = false;
  }
  console.log(data);
  return {
    data,
    isLoading,
    error,
  };
};
