const LEADING_ARTICLES = /^(the|a|an)\s+/i;

export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(LEADING_ARTICLES, "");
}

export function normalizeAuthor(author: string): string {
  return author.toLowerCase().trim();
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
