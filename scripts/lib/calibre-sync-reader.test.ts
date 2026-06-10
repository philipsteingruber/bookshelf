import { describe, expect, it } from "vitest";

import { extractYear, stripHtml } from "./calibre-sync-reader";

describe("stripHtml", () => {
  it("removes simple inline tags", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("converts <br> to a newline", () => {
    expect(stripHtml("line one<br>line two")).toBe("line one\nline two");
  });

  it("converts closing block tags to double newlines", () => {
    expect(stripHtml("<p>first</p><p>second</p>")).toBe("first\n\nsecond");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("a &amp; b &lt; c &gt; d &quot;e&quot; f&#39;s")).toBe(
      `a & b < c > d "e" f's`,
    );
  });

  it("collapses multiple spaces on the same line into one", () => {
    expect(stripHtml("word    another")).toBe("word another");
  });

  it("trims leading and trailing whitespace from the final string", () => {
    expect(stripHtml("  <p>text</p>  ")).toBe("text");
  });

  it("collapses more than two consecutive newlines into two", () => {
    expect(stripHtml("<p>a</p>\n\n\n\n<p>b</p>")).toBe("a\n\nb");
  });

  it("returns the input unchanged when no HTML is present", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });

  it("handles &nbsp; by replacing it with a space", () => {
    expect(stripHtml("word&nbsp;word")).toBe("word word");
  });
});

describe("extractYear", () => {
  it("extracts the year from an ISO date string", () => {
    expect(extractYear("2019-05-21T00:00:00+00:00")).toBe(2019);
  });

  it("returns null for the Calibre placeholder date", () => {
    expect(extractYear("0101-01-01T00:00:00+00:00")).toBeNull();
  });

  it("returns null for a null input", () => {
    expect(extractYear(null)).toBeNull();
  });

  it("returns null for a year below 1000", () => {
    expect(extractYear("0999-01-01")).toBeNull();
  });

  it("accepts a year of exactly 1000", () => {
    expect(extractYear("1000-01-01")).toBe(1000);
  });
});
