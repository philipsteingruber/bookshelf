import { describe, expect, it } from "vitest";

import { extractErrorMessage, normaliseGoodreadsUrl } from "./calibre-constants";

describe("normaliseGoodreadsUrl", () => {
  it("strips a query-string slug from a Goodreads URL", () => {
    expect(
      normaliseGoodreadsUrl("https://www.goodreads.com/book/show/12345.Some_Book_Title"),
    ).toBe("https://www.goodreads.com/book/show/12345");
  });

  it("strips a hash from a Goodreads URL", () => {
    expect(
      normaliseGoodreadsUrl("https://www.goodreads.com/book/show/12345#reviews"),
    ).toBe("https://www.goodreads.com/book/show/12345");
  });

  it("returns the URL unchanged when it is already normalised", () => {
    expect(
      normaliseGoodreadsUrl("https://www.goodreads.com/book/show/12345"),
    ).toBe("https://www.goodreads.com/book/show/12345");
  });

  it("does not alter the numeric ID", () => {
    const result = normaliseGoodreadsUrl(
      "https://www.goodreads.com/book/show/99999.Foo",
    );
    expect(result).toContain("99999");
    expect(result).not.toContain("Foo");
  });
});

describe("extractErrorMessage", () => {
  it("returns the message from a plain Error", () => {
    expect(extractErrorMessage(new Error("something went wrong"))).toBe("something went wrong");
  });

  it("returns the last non-empty line from a multi-line Prisma error", () => {
    const err = new Error("file.ts:10\nmodule context\nActual error message");
    expect(extractErrorMessage(err)).toBe("Actual error message");
  });

  it("converts a non-Error value to its string representation", () => {
    expect(extractErrorMessage("raw string error")).toBe("raw string error");
    expect(extractErrorMessage(42)).toBe("42");
  });

  it("handles an error whose message consists of only whitespace lines", () => {
    const err = new Error("   \n   \n   ");
    expect(typeof extractErrorMessage(err)).toBe("string");
  });
});
