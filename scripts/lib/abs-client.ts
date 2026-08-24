export const DEFAULT_ABS_URL = process.env.ABS_URL ?? "http://localhost:13378";

export interface AbsMediaProgress {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  duration: number;
  progress: number; // 0-1 fraction
  currentTime: number;
  isFinished: boolean;
  lastUpdate: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface AbsLibrary {
  id: string;
  name: string;
  mediaType: "book" | "podcast";
}

export interface AbsLibraryItem {
  id: string;
  media: {
    metadata: {
      title: string;
      authorName: string | null;
      isbn: string | null;
      asin: string | null;
    };
  };
}

interface AbsMeResponse {
  mediaProgress: AbsMediaProgress[];
}

interface AbsLibrariesResponse {
  libraries: AbsLibrary[];
}

interface AbsLibraryItemsResponse {
  results: AbsLibraryItem[];
}

async function absFetch<T>(baseUrl: string, token: string, path: string): Promise<T> {
  // Timeout added 2026-08-24 alongside sync-calibre.ts's uploadCover() fix
  // (docs/kb/bookshelf.md) — same unbounded-fetch pattern, shared by
  // sync-abs.ts and find-fuzzy-duplicates.ts.
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`ABS request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchAbsMediaProgress(
  baseUrl: string,
  token: string,
): Promise<AbsMediaProgress[]> {
  const me = await absFetch<AbsMeResponse>(baseUrl, token, "/api/me");
  return me.mediaProgress;
}

export async function fetchAbsLibraries(baseUrl: string, token: string): Promise<AbsLibrary[]> {
  const res = await absFetch<AbsLibrariesResponse>(baseUrl, token, "/api/libraries");
  return res.libraries;
}

export async function fetchAbsLibraryItems(
  baseUrl: string,
  token: string,
  libraryId: string,
): Promise<AbsLibraryItem[]> {
  const res = await absFetch<AbsLibraryItemsResponse>(
    baseUrl,
    token,
    `/api/libraries/${libraryId}/items?minified=1&limit=0`,
  );
  return res.results;
}

export async function resolveBookLibraryId(baseUrl: string, token: string): Promise<string> {
  const libraries = await fetchAbsLibraries(baseUrl, token);
  const bookLibraries = libraries.filter((l) => l.mediaType === "book");
  if (bookLibraries.length === 0) {
    throw new Error("No ABS library with mediaType 'book' found.");
  }
  if (bookLibraries.length > 1) {
    const names = bookLibraries.map((l) => `${l.name} (${l.id})`).join(", ");
    throw new Error(
      `Multiple ABS book libraries found — pass --library-id explicitly. Candidates: ${names}`,
    );
  }
  return bookLibraries[0].id;
}
