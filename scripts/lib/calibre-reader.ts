import Database from "better-sqlite3";

export interface CalibreBook {
  id: number;
  title: string;
  author: string;
  seriesName: string | null;
  seriesIndex: number | null;
  goodreadsId: string | null;
}

const QUERY = `
  SELECT
    b.id,
    b.title,
    MIN(a.name)    AS author,
    s.name         AS series_name,
    b.series_index AS series_index,
    i.val          AS goodreads_id
  FROM books b
  LEFT JOIN books_authors_link bal ON b.id = bal.book
  LEFT JOIN authors a              ON bal.author = a.id
  LEFT JOIN books_series_link bsl  ON b.id = bsl.book
  LEFT JOIN series s               ON bsl.series = s.id
  LEFT JOIN identifiers i          ON b.id = i.book AND i.type = 'goodreads'
  GROUP BY b.id, b.title, s.name, b.series_index, i.val
  ORDER BY b.title
`;

interface RawRow {
  id: number;
  title: string;
  author: string | null;
  series_name: string | null;
  series_index: number | null;
  goodreads_id: string | null;
}

export function readCalibreBooks(dbPath: string): CalibreBook[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(QUERY).all() as RawRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author ?? "Unknown",
      seriesName: row.series_name,
      seriesIndex: row.series_index,
      goodreadsId: row.goodreads_id,
    }));
  } finally {
    db.close();
  }
}
