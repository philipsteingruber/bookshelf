import { describe, expect, it } from "vitest";

import { deriveEnrichStatus, parseCache, stripHtml } from "./enrich-tags-utils";

describe("stripHtml", () => {
  it("removes a simple HTML tag", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes nested HTML tags", () => {
    expect(stripHtml("<p>Hello <em>world</em></p>")).toBe("Hello world");
  });

  it("collapses multiple whitespace characters into a single space", () => {
    expect(stripHtml("<p>Hello</p><p>World</p>")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("  plain text  ")).toBe("plain text");
  });

  it("returns the string unchanged when no HTML is present", () => {
    expect(stripHtml("no tags here")).toBe("no tags here");
  });
});

describe("parseCache", () => {
  it("parses newline-separated integers into a Set", () => {
    expect(parseCache("1\n2\n3\n")).toEqual(new Set([1, 2, 3]));
  });

  it("ignores blank lines", () => {
    expect(parseCache("1\n\n3\n")).toEqual(new Set([1, 3]));
  });

  it("ignores lines that are not valid integers", () => {
    expect(parseCache("1\nabc\n3\n")).toEqual(new Set([1, 3]));
  });

  it("trims whitespace from each line before parsing", () => {
    expect(parseCache("  42  \n")).toEqual(new Set([42]));
  });

  it("returns an empty Set for empty input", () => {
    expect(parseCache("")).toEqual(new Set());
  });

  it("returns an empty Set when input contains only whitespace", () => {
    expect(parseCache("  \n  \n  ")).toEqual(new Set());
  });
});

describe("deriveEnrichStatus", () => {
  it('returns "add" status when proposed tags are not all in current tags', () => {
    const { status } = deriveEnrichStatus(["Fantasy"], []);
    expect(status).toBe("add");
  });

  it("includes only tags absent from current tags in tagsToAdd", () => {
    const { tagsToAdd } = deriveEnrichStatus(["Fantasy", "Adventure"], ["Fantasy"]);
    expect(tagsToAdd).toEqual(["Adventure"]);
  });

  it('returns "complete" status when all proposed tags are already present', () => {
    const { status } = deriveEnrichStatus(["Fantasy"], ["Fantasy"]);
    expect(status).toBe("complete");
  });

  it('returns an empty tagsToAdd for "complete" status', () => {
    const { tagsToAdd } = deriveEnrichStatus(["Fantasy"], ["Fantasy"]);
    expect(tagsToAdd).toHaveLength(0);
  });

  it('returns "uncategorized" status when no tags are proposed and book has no existing tags', () => {
    const { status } = deriveEnrichStatus([], []);
    expect(status).toBe("uncategorized");
  });

  it('returns an empty tagsToAdd for "uncategorized" status', () => {
    const { tagsToAdd } = deriveEnrichStatus([], []);
    expect(tagsToAdd).toHaveLength(0);
  });

  it('returns "no-results" status when no tags are proposed but book has existing tags', () => {
    const { status } = deriveEnrichStatus([], ["Fantasy"]);
    expect(status).toBe("no-results");
  });

  it('returns an empty tagsToAdd for "no-results" status', () => {
    const { tagsToAdd } = deriveEnrichStatus([], ["Fantasy"]);
    expect(tagsToAdd).toHaveLength(0);
  });
});
