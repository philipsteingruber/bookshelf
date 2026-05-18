import { describe, expect, it } from "vitest";

import { buildCompositeKey, normalizeAuthor, normalizeTitle } from "./normalizer";

describe("normalizeTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTitle("  Blood Pact  ")).toBe("blood pact");
  });

  it("strips leading 'The '", () => {
    expect(normalizeTitle("The Name of the Wind")).toBe("name of the wind");
  });

  it("strips leading 'A '", () => {
    expect(normalizeTitle("A Memory Called Empire")).toBe("memory called empire");
  });

  it("strips leading 'An '", () => {
    expect(normalizeTitle("An Absolutely Remarkable Thing")).toBe("absolutely remarkable thing");
  });

  it("strips articles case-insensitively", () => {
    expect(normalizeTitle("THE Lord of the Rings")).toBe("lord of the rings");
    expect(normalizeTitle("the Dark Knight")).toBe("dark knight");
  });

  it("does not strip articles that appear mid-title", () => {
    expect(normalizeTitle("All the Light We Cannot See")).toBe("all the light we cannot see");
  });

  it("does not affect titles starting with a number", () => {
    expect(normalizeTitle("1984")).toBe("1984");
    expect(normalizeTitle("13th Legion")).toBe("13th legion");
  });

  it("does not strip 'the' when it is part of a word at the start", () => {
    expect(normalizeTitle("Theorem")).toBe("theorem");
  });
});

describe("normalizeAuthor", () => {
  it("lowercases and trims", () => {
    expect(normalizeAuthor("  Dan Abnett  ")).toBe("dan abnett");
  });

  it("preserves punctuation", () => {
    expect(normalizeAuthor("J.R.R. Tolkien")).toBe("j.r.r. tolkien");
  });
});

describe("buildCompositeKey", () => {
  it("builds key without series", () => {
    expect(buildCompositeKey("Blood Pact", "Dan Abnett", null, null)).toBe(
      "blood pact|dan abnett",
    );
  });

  it("builds key with series", () => {
    expect(buildCompositeKey("Blood Pact", "Dan Abnett", "Gaunt's Ghosts", 12)).toBe(
      "blood pact|dan abnett|gaunt's ghosts|12",
    );
  });

  it("strips leading article from title but not from series name", () => {
    expect(
      buildCompositeKey("A Thousand Sons", "Graham McNeill", "The Horus Heresy", 12),
    ).toBe("thousand sons|graham mcneill|the horus heresy|12");
  });

  it("falls back to title+author key when series name is null", () => {
    expect(buildCompositeKey("Circe", "Madeline Miller", null, 1)).toBe(
      "circe|madeline miller",
    );
  });

  it("falls back to title+author key when series index is null", () => {
    expect(buildCompositeKey("Circe", "Madeline Miller", "Some Series", null)).toBe(
      "circe|madeline miller",
    );
  });
});
