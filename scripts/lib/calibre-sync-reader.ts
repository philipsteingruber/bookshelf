import path from "node:path";

import Database from "better-sqlite3";

export interface CalibreBookSync {
  calibreId: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  goodreadsId: string | null;
  coverPath: string | null;
  // CWA reading state (null if book not in CWA)
  readStatus: number | null;
  // KOReader progress from CWA (null if book hasn't been opened in KOReader)
  readPercent: number | null;
  // Calibre custom column data
  kobolastread: Date | null;
  datestarted: Date | null;
  dnf: boolean;
}

const CALIBRE_QUERY = `
  SELECT
    b.id,
    b.title,
    MIN(a.name)    AS author,
    s.name         AS series_name,
    b.series_index AS series_index,
    b.path,
    b.has_cover,
    i.val          AS goodreads_id,
    cc5.value      AS kobolastread,
    cc23.value     AS datestarted,
    cc29.value     AS dnf
  FROM books b
  LEFT JOIN books_authors_link bal  ON b.id = bal.book
  LEFT JOIN authors a               ON bal.author = a.id
  LEFT JOIN books_series_link bsl   ON b.id = bsl.book
  LEFT JOIN series s                ON bsl.series = s.id
  LEFT JOIN identifiers i           ON b.id = i.book AND i.type = 'goodreads'
  LEFT JOIN custom_column_5  cc5    ON cc5.book  = b.id
  LEFT JOIN custom_column_23 cc23   ON cc23.book = b.id
  LEFT JOIN custom_column_29 cc29   ON cc29.book = b.id
  GROUP BY b.id, b.title, s.name, b.series_index, b.path, b.has_cover,
           i.val, cc5.value, cc23.value, cc29.value
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
  kobolastread: string | null;
  datestarted: string | null;
  dnf: number | null;
}

interface CwaReadRow {
  book_id: number;
  read_status: number;
}

interface CwaProgressRow {
  book_id: number;
  progress_percent: number | null;
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

    const libraryRoot = path.dirname(calibreDbPath);

    return calibreRows.map((row) => ({
      calibreId: row.id,
      title: row.title,
      author: row.author ?? "Unknown",
      seriesName: row.series_name,
      seriesIndex: row.series_index,
      goodreadsId: row.goodreads_id,
      coverPath:
        row.has_cover === 1 ? path.join(libraryRoot, row.path, "cover.jpg") : null,
      readStatus: cwaReadByBookId.get(row.id) ?? null,
      readPercent: cwaProgressByBookId.get(row.id) ?? null,
      kobolastread: row.kobolastread ? new Date(row.kobolastread) : null,
      datestarted: row.datestarted ? new Date(row.datestarted) : null,
      dnf: row.dnf === 1,
    }));
  } finally {
    calibreDb.close();
    cwaDb.close();
  }
}
