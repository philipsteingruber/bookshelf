import {
  fetchAbsLibraryItems,
  fetchAbsMediaProgress,
  type AbsLibraryItem,
} from "./abs-client";

export interface AbsBookSync {
  absLibraryItemId: string;
  title: string;
  author: string;
  isbn: string | null;
  // 0-100, rounded
  progressPercent: number;
  isFinished: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export async function readAbsSyncData(
  baseUrl: string,
  token: string,
  libraryId: string,
): Promise<AbsBookSync[]> {
  const [items, mediaProgress] = await Promise.all([
    fetchAbsLibraryItems(baseUrl, token, libraryId),
    fetchAbsMediaProgress(baseUrl, token),
  ]);

  const itemsById = new Map<string, AbsLibraryItem>(items.map((i) => [i.id, i]));

  const result: AbsBookSync[] = [];
  for (const progress of mediaProgress) {
    // Podcast episode progress has episodeId set — not relevant to the book library.
    if (progress.episodeId !== null) continue;

    const item = itemsById.get(progress.libraryItemId);
    if (!item) continue;

    result.push({
      absLibraryItemId: item.id,
      title: item.media.metadata.title,
      author: item.media.metadata.authorName ?? "Unknown",
      isbn: item.media.metadata.isbn,
      progressPercent: Math.round(progress.progress * 100),
      isFinished: progress.isFinished,
      startedAt: progress.startedAt ? new Date(progress.startedAt) : null,
      finishedAt: progress.finishedAt ? new Date(progress.finishedAt) : null,
    });
  }
  return result;
}
