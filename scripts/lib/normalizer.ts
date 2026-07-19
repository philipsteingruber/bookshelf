const LEADING_ARTICLES = /^(the|a|an)\s+/i;
const SUBTITLE_SEPARATOR = /\s*[:—]\s*/;
const CURLY_QUOTES = /[‘’]/g;
const CURLY_DOUBLE_QUOTES = /[“”]/g;

// Different metadata sources (e.g. Audible vs. Calibre/OpenLibrary) disagree
// on straight vs. curly quotes for the same title/author, which would
// otherwise silently break exact-match composite-key lookups.
function normalizeQuotes(value: string): string {
  return value.replace(CURLY_QUOTES, "'").replace(CURLY_DOUBLE_QUOTES, '"');
}

export function normalizeTitle(title: string): string {
  return normalizeQuotes(title.toLowerCase().trim()).replace(LEADING_ARTICLES, "");
}

// Strips a ": Subtitle" or " — Subtitle" suffix. Different metadata sources
// (e.g. Audible vs. a hand-entered ebook title) often disagree on whether to
// include the subtitle at all, so matching on the main title alone is a
// useful fallback when the two full titles don't match exactly.
export function stripSubtitle(title: string): string {
  return title.split(SUBTITLE_SEPARATOR)[0]!.trim();
}

export function normalizeAuthor(author: string): string {
  return normalizeQuotes(author.toLowerCase().trim());
}

export function buildCompositeKey(
  title: string,
  author: string,
  seriesName: string | null,
  seriesIndex: number | null,
): string {
  const base = `${normalizeTitle(title)}|${normalizeAuthor(author)}`;
  if (seriesName !== null && seriesIndex !== null) {
    return `${base}|${seriesName.toLowerCase().trim()}|${seriesIndex}`;
  }
  return base;
}
