import { describe, expect, it } from "vitest";

import { isValidIsbn10, isValidIsbn13 } from "./isbn-utils";

describe("isValidIsbn13", () => {
  it("accepts a valid 978 ISBN-13", () => {
    expect(isValidIsbn13("9780261103573")).toBe(true);
  });

  it("accepts a valid 979 ISBN-13", () => {
    expect(isValidIsbn13("9791032303986")).toBe(true);
  });

  it("rejects a 13-digit number with an invalid prefix", () => {
    expect(isValidIsbn13("1234567890123")).toBe(false);
  });

  it("rejects a string shorter than 13 digits", () => {
    expect(isValidIsbn13("978026110357")).toBe(false);
  });

  it("rejects a string longer than 13 digits", () => {
    expect(isValidIsbn13("97802611035730")).toBe(false);
  });

  it("rejects a string containing non-digit characters", () => {
    expect(isValidIsbn13("978-0261103573")).toBe(false);
  });
});

describe("isValidIsbn10", () => {
  it("accepts a valid all-digit ISBN-10", () => {
    expect(isValidIsbn10("0261103571")).toBe(true);
  });

  it("accepts an ISBN-10 ending with X", () => {
    expect(isValidIsbn10("026110357X")).toBe(true);
  });

  it("rejects a string shorter than 10 characters", () => {
    expect(isValidIsbn10("026110357")).toBe(false);
  });

  it("rejects a string longer than 10 characters", () => {
    expect(isValidIsbn10("02611035710")).toBe(false);
  });

  it("rejects a string containing a hyphen", () => {
    expect(isValidIsbn10("0-261103571")).toBe(false);
  });

  it("rejects an X in a position other than the last", () => {
    expect(isValidIsbn10("026110X571")).toBe(false);
  });
});
