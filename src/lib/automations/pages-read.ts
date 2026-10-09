export type PagesReadRow = {
  bookId: number;
  progress: number;
  createdAt: Date;
  title: string;
  pageCount: number | null;
};

export type PagesReadDay = {
  date: string;
  pages: number;
  rollingAverage: number;
  books: { title: string; pages: number }[];
};

export type PagesReadSeries = {
  days: PagesReadDay[];
  averagePerDay: number;
};

type PagesReadOptions = {
  // Inclusive YYYY-MM-DD bounds, as calendar days in `timeZone`.
  from: string;
  to: string;
  timeZone: string;
  windowDays: number;
};

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Pages read per calendar day, plus a trailing rolling average, derived from
 * the ReadingProgress history — there is no per-session page log, so a
 * day's pages are the progress increases synced that day × the book's page
 * count. Counted on the day the sync recorded them, not the day the reading
 * happened; audiobook progress converts to pages the same way, since
 * ReadingProgress doesn't record which sync wrote a row.
 *
 * Each book's delta is measured from its previous row, including rows from
 * before `from`, so a book already in progress on 1 Jan only counts what was
 * read after that. A drop (reset, reread, or a sync correction) contributes
 * nothing and becomes the new baseline. Books without a pageCount are
 * skipped rather than guessed at.
 *
 * The first `windowDays - 1` days average over however many days of the
 * range exist so far, rather than reaching back before `from`.
 */
export const computePagesRead = (rows: PagesReadRow[], options: PagesReadOptions): PagesReadSeries => {
  const { from, to, timeZone, windowDays } = options;
  // sv-SE formats as YYYY-MM-DD, so day keys compare as strings.
  const dayOf = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lastProgress = new Map<number, number>();
  const pagesByDay = new Map<string, Map<string, number>>();

  for (const row of sorted) {
    const previous = lastProgress.get(row.bookId) ?? 0;
    lastProgress.set(row.bookId, row.progress);

    const day = dayOf.format(row.createdAt);
    const delta = row.progress - previous;
    if (day < from || day > to || delta <= 0 || !row.pageCount) continue;

    const books = pagesByDay.get(day) ?? new Map<string, number>();
    books.set(row.title, (books.get(row.title) ?? 0) + (delta / 100) * row.pageCount);
    pagesByDay.set(day, books);
  }

  const dailyPages: number[] = [];
  const days: PagesReadDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const books = [...(pagesByDay.get(date) ?? new Map<string, number>())]
      .map(([title, pages]) => ({ title, pages }))
      .sort((a, b) => b.pages - a.pages);
    const pages = books.reduce((sum, book) => sum + book.pages, 0);
    dailyPages.push(pages);

    const window = dailyPages.slice(-windowDays);
    days.push({
      date,
      pages: Math.round(pages),
      rollingAverage: Math.round((window.reduce((sum, p) => sum + p, 0) / window.length) * 10) / 10,
      books: books.map((book) => ({ title: book.title, pages: Math.round(book.pages) })),
    });
  }

  const total = dailyPages.reduce((sum, p) => sum + p, 0);
  const averagePerDay = days.length > 0 ? Math.round((total / days.length) * 10) / 10 : 0;

  return { days, averagePerDay };
};
