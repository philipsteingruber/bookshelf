import { describe, expect, it } from "vitest";

import { toOrderBy } from "./sort-utils";

describe("toOrderBy", () => {
  it("maps title to titleSort", () => {
    expect(toOrderBy("title", "asc")).toEqual({ titleSort: "asc" });
    expect(toOrderBy("title", "desc")).toEqual({ titleSort: "desc" });
  });

  it("maps author to authorSort", () => {
    expect(toOrderBy("author", "asc")).toEqual({ authorSort: "asc" });
    expect(toOrderBy("author", "desc")).toEqual({ authorSort: "desc" });
  });

  it("returns 3-field nulls-last array for series", () => {
    expect(toOrderBy("series", "asc")).toEqual([
      { series: { sort: "asc", nulls: "last" } },
      { seriesIndex: "asc" },
      { titleSort: "asc" },
    ]);
    // direction is ignored for series (always asc by convention)
    expect(toOrderBy("series", "desc")).toEqual([
      { series: { sort: "asc", nulls: "last" } },
      { seriesIndex: "asc" },
      { titleSort: "asc" },
    ]);
  });

  it("returns 2-field nulls-last array for finishedAt", () => {
    expect(toOrderBy("finishedAt", "desc")).toEqual([
      { finishedAt: { sort: "desc", nulls: "last" } },
      { titleSort: "asc" },
    ]);
    expect(toOrderBy("finishedAt", "asc")).toEqual([
      { finishedAt: { sort: "asc", nulls: "last" } },
      { titleSort: "asc" },
    ]);
  });

  it("passes direction directly for createdAt", () => {
    expect(toOrderBy("createdAt", "desc")).toEqual({ createdAt: "desc" });
  });

  it("passes direction directly for updatedAt", () => {
    expect(toOrderBy("updatedAt", "desc")).toEqual({ updatedAt: "desc" });
  });

  it("passes direction directly for rating", () => {
    expect(toOrderBy("rating", "desc")).toEqual({ rating: "desc" });
  });

  it("passes direction directly for pageCount", () => {
    expect(toOrderBy("pageCount", "asc")).toEqual({ pageCount: "asc" });
  });
});
