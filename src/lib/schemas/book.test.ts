import { describe, expect, it } from "vitest";

import { createBookInputSchema } from "./book";

describe("createBookInputSchema", () => {
  const validBase = {
    title: "Test Book",
    author: "Test Author",
    publishedYear: 2020,
  };

  it("passes when alreadyRead is absent", () => {
    const result = createBookInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("passes when alreadyRead is false and no dates provided", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: false,
    });
    expect(result.success).toBe(true);
  });

  it("fails when alreadyRead is true and finishedAt is absent", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((e) => e.path[0] === "finishedAt");
      expect(err?.message).toBe("Finished date is required");
    }
  });

  it("fails when finishedAt is in the future", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: tomorrow,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((e) => e.path[0] === "finishedAt");
      expect(err?.message).toBe("Finished date cannot be in the future");
    }
  });

  it("fails when startedAt is after finishedAt", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
      startedAt: new Date("2024-01-20T12:00:00"),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((e) => e.path[0] === "startedAt");
      expect(err?.message).toBe("Started date must be before the finished date");
    }
  });

  it("passes with alreadyRead true and valid finishedAt only", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
    });
    expect(result.success).toBe(true);
  });

  it("passes with alreadyRead true and valid finishedAt and startedAt", () => {
    const result = createBookInputSchema.safeParse({
      ...validBase,
      alreadyRead: true,
      finishedAt: new Date("2024-01-15T12:00:00"),
      startedAt: new Date("2024-01-01T12:00:00"),
    });
    expect(result.success).toBe(true);
  });
});
