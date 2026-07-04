import "dotenv/config";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import prisma from "@/lib/prisma";

import { DEFAULT_ABS_URL, fetchAbsLibraryItems, resolveBookLibraryId } from "./lib/abs-client";
import { DEFAULT_CALIBRE_DB, DEFAULT_CWA_DB } from "./lib/calibre-constants";
import { readCalibreSyncData } from "./lib/calibre-sync-reader";
import { buildCompositeKey, normalizeAuthor, normalizeTitle, stripSubtitle } from "./lib/normalizer";

// ─── Common shape ───────────────────────────────────────────────────────────

type Source = "CWA" | "ABS" | "Bookshelf";

interface MatchableBook {
  source: Source;
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  seriesName: string | null;
  seriesIndex: number | null;
}

interface Candidate {
  a: MatchableBook;
  b: MatchableBook;
  reason: string;
}

// ─── Fuzzy signal ───────────────────────────────────────────────────────────

// Last token of the normalized author string. Tolerates middle initials and
// punctuation differences across sources without needing to know whether a
// source writes "First Last" or has multiple authors — the surname is the
// most stable token to key off of.
function lastNameToken(author: string): string {
  const words = normalizeAuthor(author)
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.at(-1) ?? "";
}

// lib/title-utils.ts's titlesMatch() treats any single shared word > 2 chars
// as a match, which counts stopwords like "the" — fine for its original use
// but far too loose here, where authors with large shared-universe back
// catalogs (e.g. tie-in fiction) would cross-match on "the"/"and"/"of" alone.
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for", "with", "from",
]);

function significantTitleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w)),
  );
}

function titleFuzzyMatch(a: string, b: string): boolean {
  if (normalizeTitle(stripSubtitle(a)) === normalizeTitle(stripSubtitle(b))) return true;

  const wa = significantTitleWords(a);
  const wb = significantTitleWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  // Majority overlap relative to the shorter title, not "any shared word" —
  // two different books by the same author sharing one word (e.g. "Blood")
  // shouldn't count, but title variants that differ by punctuation/ordering
  // should still clear this bar.
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

// Same series, different index (e.g. "Ravenor #1" vs. "Ravenor #3") is a
// different book, full stop — no title/author heuristic below should be
// allowed to override that. This mainly guards CWA↔Bookshelf, where both
// sides carry Calibre's series metadata and "Series: Book Title" naming
// otherwise fools stripSubtitle into treating every volume as the same title.
function isDefinitelyDifferentBook(a: MatchableBook, b: MatchableBook): boolean {
  if (a.seriesName === null || b.seriesName === null) return false;
  if (a.seriesIndex === null || b.seriesIndex === null) return false;
  return normalizeTitle(a.seriesName) === normalizeTitle(b.seriesName) && a.seriesIndex !== b.seriesIndex;
}

function isFuzzyCandidate(a: MatchableBook, b: MatchableBook): boolean {
  if (isDefinitelyDifferentBook(a, b)) return false;
  if (!titleFuzzyMatch(a.title, b.title)) return false;
  return lastNameToken(a.author) === lastNameToken(b.author);
}

function describeReason(a: MatchableBook, b: MatchableBook): string {
  const notes: string[] = [];

  if (a.isbn && b.isbn && a.isbn !== b.isbn) {
    notes.push("different ISBN (likely a different edition, e.g. audiobook vs. ebook)");
  } else if ((a.isbn === null) !== (b.isbn === null)) {
    notes.push("ISBN missing on one side");
  }

  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) {
    if (normalizeTitle(stripSubtitle(a.title)) === normalizeTitle(stripSubtitle(b.title))) {
      notes.push("subtitle differs");
    } else {
      notes.push("title wording differs");
    }
  }

  if (normalizeAuthor(a.author) !== normalizeAuthor(b.author)) {
    notes.push("author formatting differs");
  }

  return notes.length > 0 ? notes.join("; ") : "fuzzy title/author match";
}

// ─── Exact-match replication (mirrors the real sync scripts) ───────────────

// Mirrors lib/calibre-sync-results.ts: ISBN, else composite key including series.
function isExactMatchCalibreStyle(a: MatchableBook, b: MatchableBook): boolean {
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  return (
    buildCompositeKey(a.title, a.author, a.seriesName, a.seriesIndex) ===
    buildCompositeKey(b.title, b.author, b.seriesName, b.seriesIndex)
  );
}

// Mirrors lib/abs-sync-results.ts: ISBN, else composite key (no series), else
// composite key after stripping a subtitle from either title.
function isExactMatchAbsStyle(a: MatchableBook, b: MatchableBook): boolean {
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  if (buildCompositeKey(a.title, a.author, null, null) === buildCompositeKey(b.title, b.author, null, null)) {
    return true;
  }
  const strippedA = stripSubtitle(a.title);
  const strippedB = stripSubtitle(b.title);
  return (
    buildCompositeKey(strippedA, a.author, null, null) === buildCompositeKey(b.title, b.author, null, null) ||
    buildCompositeKey(a.title, a.author, null, null) === buildCompositeKey(strippedB, b.author, null, null)
  );
}

// No existing sync script matches ABS directly against CWA — this is our own
// call: use the union of both rules above so we don't flag anything either
// half of the real pipeline (CWA→Bookshelf, ABS→Bookshelf) would already
// resolve to the same Bookshelf row.
function isExactMatchAbsCwa(a: MatchableBook, b: MatchableBook): boolean {
  return isExactMatchCalibreStyle(a, b) || isExactMatchAbsStyle(a, b);
}

function findFuzzyUnmatched(
  listA: MatchableBook[],
  listB: MatchableBook[],
  isExactMatch: (a: MatchableBook, b: MatchableBook) => boolean,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const a of listA) {
    for (const b of listB) {
      if (isExactMatch(a, b)) continue;
      if (isFuzzyCandidate(a, b)) {
        candidates.push({ a, b, reason: describeReason(a, b) });
      }
    }
  }
  return candidates;
}

// ─── Report ─────────────────────────────────────────────────────────────────

function formatBook(book: MatchableBook): string {
  const isbn = book.isbn ? `ISBN ${book.isbn}` : "no ISBN";
  const series =
    book.seriesName && book.seriesIndex !== null ? ` [${book.seriesName} #${book.seriesIndex}]` : "";
  return `[${book.source}] **${book.title}**${series} — ${book.author} (${isbn})`;
}

function renderSection(title: string, candidates: Candidate[]): string {
  const lines = [`## ${title} (${candidates.length})`, ""];
  if (candidates.length === 0) {
    lines.push("No probable unmatched duplicates found.", "");
    return lines.join("\n");
  }
  for (const { a, b, reason } of candidates) {
    lines.push(`- ${formatBook(a)} ↔ ${formatBook(b)}`);
    lines.push(`  Reason: ${reason}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "calibre-db": { type: "string", default: DEFAULT_CALIBRE_DB },
      "cwa-db": { type: "string", default: DEFAULT_CWA_DB },
      "abs-url": { type: "string", default: DEFAULT_ABS_URL },
      "abs-token": { type: "string" },
      "user-email": { type: "string" },
      out: { type: "string" },
    },
  });

  const calibreDbPath = (values["calibre-db"] as string | undefined) ?? DEFAULT_CALIBRE_DB;
  const cwaDbPath = (values["cwa-db"] as string | undefined) ?? DEFAULT_CWA_DB;
  const absUrl = (values["abs-url"] as string | undefined) ?? DEFAULT_ABS_URL;
  const absToken = (values["abs-token"] as string | undefined) ?? process.env.ABS_TOKEN;
  const userEmail =
    (values["user-email"] as string | undefined) ?? process.env.CALIBRE_SYNC_USER_EMAIL;

  if (!userEmail) {
    console.error("Error: No user specified. Set CALIBRE_SYNC_USER_EMAIL in .env or pass --user-email");
    process.exit(1);
  }
  if (!absToken) {
    console.error("Error: No ABS token. Set ABS_TOKEN in .env or pass --abs-token");
    process.exit(1);
  }
  if (!existsSync(calibreDbPath)) {
    console.error(`Error: Calibre database not found at "${calibreDbPath}"`);
    process.exit(1);
  }
  if (!existsSync(cwaDbPath)) {
    console.error(`Error: CWA database not found at "${cwaDbPath}"`);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email: userEmail } });
  if (!user) {
    console.error(`Error: No bookshelf user found with email "${userEmail}"`);
    process.exit(1);
  }

  console.log(`Reading Calibre library from: ${calibreDbPath}`);
  const calibreBooks: MatchableBook[] = readCalibreSyncData(calibreDbPath, cwaDbPath).map((b) => ({
    source: "CWA",
    id: String(b.calibreId),
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    seriesName: b.seriesName,
    seriesIndex: b.seriesIndex,
  }));
  console.log(`Loaded ${calibreBooks.length} books from CWA/Calibre`);

  console.log(`Reading ABS library from: ${absUrl}`);
  const absLibraryId = await resolveBookLibraryId(absUrl, absToken);
  const absItems = await fetchAbsLibraryItems(absUrl, absToken, absLibraryId);
  const absBooks: MatchableBook[] = absItems
    .filter((item) => item.media.metadata.authorName !== null)
    .map((item) => ({
      source: "ABS",
      id: item.id,
      title: item.media.metadata.title,
      author: item.media.metadata.authorName as string,
      isbn: item.media.metadata.isbn,
      seriesName: null,
      seriesIndex: null,
    }));
  console.log(`Loaded ${absBooks.length} books from ABS`);

  const bookshelfRows = await prisma.book.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      seriesIndex: true,
      series: { select: { name: true } },
    },
  });
  const bookshelfBooks: MatchableBook[] = bookshelfRows.map((b) => ({
    source: "Bookshelf",
    id: String(b.id),
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    seriesName: b.series?.name ?? null,
    seriesIndex: b.seriesIndex,
  }));
  console.log(`Loaded ${bookshelfBooks.length} books from Bookshelf`);

  const cwaVsBookshelf = findFuzzyUnmatched(calibreBooks, bookshelfBooks, isExactMatchCalibreStyle);
  const absVsBookshelf = findFuzzyUnmatched(absBooks, bookshelfBooks, isExactMatchAbsStyle);
  const absVsCwa = findFuzzyUnmatched(absBooks, calibreBooks, isExactMatchAbsCwa);

  const total = cwaVsBookshelf.length + absVsBookshelf.length + absVsCwa.length;
  console.log(`\nFound ${total} probable unmatched duplicate(s) across all comparisons.`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = (values.out as string | undefined) ?? `logs/fuzzy-duplicates/${timestamp}.md`;
  mkdirSync(path.dirname(outPath), { recursive: true });

  const report = [
    "# Fuzzy Duplicate Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Books that are probably the same title but whose metadata wouldn't be caught",
    "by sync-calibre.ts's or sync-abs.ts's exact-match logic (ISBN, then a",
    "normalized title+author composite key). These are candidates for manual",
    "review only — nothing here has been changed automatically.",
    "",
    renderSection("CWA ↔ Bookshelf", cwaVsBookshelf),
    renderSection("ABS ↔ Bookshelf", absVsBookshelf),
    renderSection("ABS ↔ CWA", absVsCwa),
  ].join("\n");

  writeFileSync(outPath, report);
  console.log(`Report written to ${outPath}`);

  const latestPath = path.join(path.dirname(outPath), "latest.md");
  writeFileSync(latestPath, report);
  console.log(`Report written to ${latestPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
