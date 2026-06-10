export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function titlesMatch(a: string, b: string): boolean {
  const wa = titleWords(a);
  const wb = titleWords(b);
  return [...wa].some((w) => wb.has(w));
}
