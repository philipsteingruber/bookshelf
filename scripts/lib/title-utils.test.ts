import { describe, expect, it } from "vitest";

import { titleWords, titlesMatch } from "./title-utils";

describe("titleWords", () => {
  it("returns only words longer than 2 characters", () => {
    const result = titleWords("A it in Lord");
    expect(result.has("lord")).toBe(true);
    expect(result.has("a")).toBe(false);
    expect(result.has("it")).toBe(false);
    expect(result.has("in")).toBe(false);
  });

  it("lowercases all characters", () => {
    expect(titleWords("Blood PACT")).toEqual(new Set(["blood", "pact"]));
  });

  it("replaces punctuation with spaces before splitting", () => {
    const result = titleWords("Gaunt's Ghosts");
    expect(result.has("gaunt")).toBe(true);
    expect(result.has("ghosts")).toBe(true);
    expect(result.has("gaunt's")).toBe(false);
  });

  it("returns an empty set when all words are too short", () => {
    expect(titleWords("A I Me")).toEqual(new Set());
  });
});

describe("titlesMatch", () => {
  it("returns true when titles share a significant word", () => {
    expect(titlesMatch("Lord of the Rings", "The Lord and the King")).toBe(true);
  });

  it("returns false when titles share no significant words", () => {
    expect(titlesMatch("Blood Pact", "Tangled Web")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(titlesMatch("BLOOD PACT", "blood pact")).toBe(true);
  });

  it("matches through punctuation differences", () => {
    expect(titlesMatch("Gaunt's Ghosts", "Gaunts Ghosts")).toBe(true);
  });

  it("returns false when the only shared words are 2 characters or shorter", () => {
    expect(titlesMatch("A is it", "A is it")).toBe(false);
  });
});
