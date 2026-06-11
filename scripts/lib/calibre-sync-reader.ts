import path from "node:path";

import Database from "better-sqlite3";

export interface CalibreBookSync {
  calibreId: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  goodreadsId: string | null;
  isbn: string | null;
  publishedYear: number | null;
  summary: string | null;
  // Calibre rating on the 2–10 scale (even numbers only), null if unrated
  rating: number | null;
  coverPath: string | null;
  bookFilePath: string | null;
  // CWA reading state (null if book not in CWA)
  readStatus: number | null;
  // KOReader progress from CWA (null if book hasn't been opened in KOReader)
  readPercent: number | null;
  // Calibre custom column data
  datestarted: Date | null;
  dnf: boolean;
  isReadNext: boolean;
}

const CALIBRE_QUERY = `
  SELECT
    b.id,
    b.title,
    MIN(a.name)                AS author,
    s.name                     AS series_name,
    b.series_index             AS series_index,
    b.path,
    b.has_cover,
    i.val                      AS goodreads_id,
    i10.val                    AS isbn,
    b.pubdate                  AS pubdate,
    cm.text                    AS description,
    cc23.value                 AS datestarted,
    cc29.value                 AS dnf,
    r.rating                   AS rating
  FROM books b
  LEFT JOIN books_authors_link bal  ON b.id = bal.book
  LEFT JOIN authors a               ON bal.author = a.id
  LEFT JOIN books_series_link bsl   ON b.id = bsl.book
  LEFT JOIN series s                ON bsl.series = s.id
  LEFT JOIN identifiers i           ON b.id = i.book AND i.type = 'goodreads'
  LEFT JOIN identifiers i10         ON b.id = i10.book AND i10.type = 'isbn'
  LEFT JOIN comments    cm          ON cm.book = b.id
  LEFT JOIN custom_column_23 cc23   ON cc23.book = b.id
  LEFT JOIN custom_column_29 cc29   ON cc29.book = b.id
  LEFT JOIN books_ratings_link brl  ON b.id = brl.book
  LEFT JOIN ratings r               ON r.id = brl.rating
  GROUP BY b.id, b.title, s.name, b.series_index, b.path, b.has_cover,
           i.val, i10.val, b.pubdate, cm.text, cc23.value, cc29.value, r.rating
  ORDER BY b.title
`;

interface CalibreRawRow {
  id: number;
  title: string;
  author: string | null;
  series_name: string | null;
  series_index: number | null;
  path: string;
  has_cover: number;
  goodreads_id: string | null;
  isbn: string | null;
  pubdate: string | null;
  description: string | null;
  datestarted: string | null;
  dnf: number | null;
  rating: number | null;
}

interface CalibreDataRow {
  book: number;
  format: string;
  name: string;
}

interface CwaReadRow {
  book_id: number;
  read_status: number;
}

interface CwaProgressRow {
  book_id: number;
  progress_percent: number | null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Calibre stores "0101-01-01" as a placeholder for unknown publication dates.
export function extractYear(pubdate: string | null): number | null {
  if (!pubdate) return null;
  const year = parseInt(pubdate.slice(0, 4), 10);
  return isNaN(year) || year < 1000 ? null : year;
}

export function readCalibreSyncData(
  calibreDbPath: string,
  cwaDbPath: string,
): CalibreBookSync[] {
  const calibreDb = new Database(calibreDbPath, { readonly: true });
  const cwaDb = new Database(cwaDbPath, { readonly: true });

  try {
    const calibreRows = calibreDb.prepare(CALIBRE_QUERY).all() as CalibreRawRow[];

    const cwaReadRows = cwaDb
      .prepare("SELECT book_id, read_status FROM book_read_link")
      .all() as CwaReadRow[];
    const cwaReadByBookId = new Map(cwaReadRows.map((r) => [r.book_id, r.read_status]));

    const cwaProgressRows = cwaDb
      .prepare(
        `SELECT krs.book_id, kb.progress_percent
         FROM kobo_reading_state krs
         JOIN kobo_bookmark kb ON kb.kobo_reading_state_id = krs.id
         ORDER BY krs.last_modified DESC`,
      )
      .all() as CwaProgressRow[];
    // Keep only the most recent progress per book (ORDER BY ensures first wins)
    const cwaProgressByBookId = new Map<number, number>();
    for (const r of cwaProgressRows) {
      if (!cwaProgressByBookId.has(r.book_id) && r.progress_percent !== null) {
        cwaProgressByBookId.set(r.book_id, r.progress_percent);
      }
    }

    const readNextShelf = cwaDb
      .prepare("SELECT id FROM shelf WHERE name = 'Read Next' LIMIT 1")
      .get() as { id: number } | undefined;
    const readNextBookIds = new Set<number>();
    if (readNextShelf) {
      const readNextRows = cwaDb
        .prepare("SELECT book_id FROM book_shelf_link WHERE shelf = ?")
        .all(readNextShelf.id) as { book_id: number }[];
      for (const r of readNextRows) readNextBookIds.add(r.book_id);
    }

    const dataRows = calibreDb
      .prepare("SELECT book, format, name FROM data WHERE format IN ('KEPUB', 'EPUB')")
      .all() as CalibreDataRow[];

    // Per book, prefer KEPUB over EPUB
    const fileByBookId = new Map<number, string>();
    for (const row of dataRows) {
      const existing = fileByBookId.get(row.book);
      if (!existing || row.format === "KEPUB") {
        fileByBookId.set(row.book, `${row.name}.${row.format.toLowerCase()}`);
      }
    }

    const libraryRoot = path.dirname(calibreDbPath);

    return calibreRows.map((row) => ({
      calibreId: row.id,
      title: row.title,
      author: row.author ?? "Unknown",
      seriesName: row.series_name,
      seriesIndex: row.series_index,
      goodreadsId: row.goodreads_id,
      isbn: row.isbn ?? null,
      publishedYear: extractYear(row.pubdate),
      summary: row.description ? (stripHtml(row.description) || null) : null,
      coverPath:
        row.has_cover === 1 ? path.join(libraryRoot, row.path, "cover.jpg") : null,
      bookFilePath: fileByBookId.has(row.id)
        ? path.join(libraryRoot, row.path, fileByBookId.get(row.id)!)
        : null,
      readStatus: cwaReadByBookId.get(row.id) ?? null,
      readPercent: cwaProgressByBookId.get(row.id) ?? null,
      datestarted: row.datestarted ? new Date(row.datestarted) : null,
      dnf: row.dnf === 1,
      isReadNext: readNextBookIds.has(row.id),
      rating: row.rating ?? null,
    }));
  } finally {
    calibreDb.close();
    cwaDb.close();
  }
}
