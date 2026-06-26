import { titleWords, titlesMatch } from "./title-utils";

export { titleWords, titlesMatch };

export const CANONICAL_TAGS = [
  "Science Fiction",
  "Warhammer 40K",
  "Fantasy",
  "Adventure",
  "Horror",
  "Mystery",
  "Humour",
  "Anthologies",
  "Thriller",
  "Classics",
  "Historical",
  "Crime",
  "LitRPG",
  "Dystopian",
  "Young Adult",
  "Nonfiction",
  "Romance",
] as const;

export type CanonicalTag = (typeof CANONICAL_TAGS)[number];
export const CANONICAL_TAG_SET = new Set<string>(CANONICAL_TAGS);

export type EnrichStatus = "add" | "uncategorized" | "complete" | "no-results" | "error";

const TAG_EXCLUSIONS: Array<[CanonicalTag, CanonicalTag[]]> = [
  ["Warhammer 40K", ["Fantasy"]],
];

export function sanitizeTags(tags: CanonicalTag[]): CanonicalTag[] {
  const tagSet = new Set(tags);
  for (const [primary, excluded] of TAG_EXCLUSIONS) {
    if (tagSet.has(primary)) {
      for (const ex of excluded) tagSet.delete(ex);
    }
  }
  return tags.filter((t) => tagSet.has(t));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCache(content: string): Set<number> {
  return new Set(
    content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => parseInt(l, 10))
      .filter((n) => !isNaN(n)),
  );
}

export function deriveEnrichStatus(
  proposedTags: CanonicalTag[],
  currentTags: string[],
): { status: EnrichStatus; tagsToAdd: string[] } {
  const currentTagSet = new Set(currentTags);
  const tagsToAdd = proposedTags.filter((t) => !currentTagSet.has(t));

  let status: EnrichStatus;
  if (tagsToAdd.length > 0) {
    status = "add";
  } else if (proposedTags.length > 0) {
    status = "complete";
  } else if (currentTags.length === 0) {
    status = "uncategorized";
  } else {
    status = "no-results";
  }

  return { status, tagsToAdd };
}
