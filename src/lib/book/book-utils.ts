import type { ReadStatus } from "@/generated/prisma/enums";

export const parseReadStatus = (readStatus: ReadStatus): string => {
  switch (readStatus) {
    case "TO_READ":
      return "To Read";
    case "READING":
      return "Reading";
    case "READ":
      return "Finished";
    case "DNF":
      return "DNF";
    case "READ_NEXT":
      return "Read Next";
  }
};

export const getStatusButtonStyle = (readStatus: ReadStatus): string => {
  switch (readStatus) {
    case "TO_READ":
      return "bg-gradient-to-r from-orange-400 to-orange-700 hover:from-orange-500 hover:to-orange-800 text-white";
    case "READING":
      return "bg-gradient-to-r from-blue-500 to-blue-800 hover:from-blue-600 hover:to-blue-900 text-white";
    case "READ":
      return "bg-gradient-to-r from-green-500 to-green-800 hover:from-green-600 hover:to-green-900 text-white";
    case "DNF":
      return "bg-gradient-to-r from-red-500 to-red-800 hover:from-red-600 hover:to-red-900 text-white";
    case "READ_NEXT":
      return "bg-gradient-to-r from-purple-400 to-purple-700 hover:from-purple-500 hover:to-purple-800 text-white";
  }
};

export function createTitleSort(title: string): string {
  if (!(title.startsWith("The") || title.startsWith("the"))) {
    return title;
  }
  const titleSplit = title.split(" ");

  if (titleSplit.length === 1) {
    return title;
  }

  return titleSplit.slice(1).join(" ") + ", " + "The";
}

export function createAuthorSort(author: string): string {
  const authorSplit = author.split(" ");

  if (authorSplit.length === 1) {
    return author;
  }

  const firstName = authorSplit[0];
  const lastNames = authorSplit.slice(1).join(" ");
  return lastNames + ", " + firstName;
}

const AUTHOR_SEPARATOR = " & ";

// Splits a free-text Authors field into individual credited names, in order.
// " & " matches Calibre's own convention (confirmed from CWA's book_edit.html
// template) — this is NOT the right separator for comma-joined sources like
// Audiobookshelf's authorName, since a comma is indistinguishable from a
// single "Lastname, Firstname" author (see docs/kb/bookshelf.md). Dedupes
// exact-duplicate names (e.g. a name credited twice by mistake in the source
// data) while preserving first-occurrence order.
export function parseAuthorString(author: string): string[] {
  const names = author
    .split(AUTHOR_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    deduped.push(name);
  }
  return deduped;
}

// Derives the cached Book.author/authorSort display strings from an ordered
// list of credited author names. Mirrors Calibre's own author_sort
// convention exactly (verified against real multi-author books in the
// library): authorSort is each author's own createAuthorSort() value,
// joined in credited order — never re-alphabetized. Deliberately does NOT
// call createAuthorSort() on the joined author string itself — that
// function assumes a single "First ... Last" name and would mangle a
// multi-author string (see docs/kb/bookshelf.md).
export function computeAuthorFields(names: string[]): { author: string; authorSort: string } {
  return {
    author: names.join(AUTHOR_SEPARATOR),
    authorSort: names.map(createAuthorSort).join(AUTHOR_SEPARATOR),
  };
}

export const calculatePagesFromProgress = (progress: number, pageCount: number | null): number => {
  if (!pageCount) return 0;
  return Math.round((progress / 100) * pageCount);
};

export const formatSeriesIndex = (seriesIndex: number): number => {
  return Number.isInteger(seriesIndex) ? Math.round(seriesIndex) : seriesIndex;
};

// Rounds to at most 2 decimal places without forcing trailing zeros onto
// whole numbers (e.g. strips binary-float noise like 0.040000000000000036
// down to 0.04, while 1 stays 1, not "1.00").
export const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};
