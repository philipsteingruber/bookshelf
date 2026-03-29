import Link from "next/link";

export type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};

const TYPE_STYLES: Record<
  RecommendationBook["type"],
  {
    card: string;
    border: string;
    divider: string;
    badge: string | null;
    badgeLabel: string | null;
  }
> = {
  safe: {
    card: "bg-[#f0fdf4]",
    border: "border-[#86efac]",
    divider: "border-[#bbf7d0]",
    badge: "text-[#16a34a] bg-[#dcfce7] border-[#86efac]",
    badgeLabel: "Safe pick",
  },
  standard: {
    card: "bg-white dark:bg-neutral-900",
    border: "border-gray-200 dark:border-neutral-700",
    divider: "border-neutral-100 dark:border-neutral-700",
    badge: null,
    badgeLabel: null,
  },
  stretch: {
    card: "bg-[#fffbeb]",
    border: "border-[#fcd34d]",
    divider: "border-[#fde68a]",
    badge: "text-[#d97706] bg-[#fef3c7] border-[#fcd34d]",
    badgeLabel: "Stretch pick",
  },
  risky: {
    card: "bg-[#fff7f7]",
    border: "border-[#fca5a5]",
    divider: "border-[#fecaca]",
    badge: "text-[#dc2626] bg-[#fee2e2] border-[#fca5a5]",
    badgeLabel: "Risky pick",
  },
};

interface RecommendationCardProps {
  book: RecommendationBook;
}

export const RecommendationCard = ({ book }: RecommendationCardProps) => {
  const styles = TYPE_STYLES[book.type];
  const goodreadsUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(book.title)}+${encodeURIComponent(book.author)}&search_type=books&search%5Bfield%5D=on`;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${styles.card} ${styles.border}`}
    >
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="h-36 w-full bg-neutral-200 dark:bg-neutral-700" />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {styles.badge && styles.badgeLabel && (
          <span
            className={`self-start rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ${styles.badge}`}
          >
            {styles.badgeLabel}
          </span>
        )}
        <Link
          href={goodreadsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-tight font-semibold text-blue-700 underline hover:text-blue-900 dark:text-blue-400"
        >
          {book.title}
        </Link>
        <span className="text-xs text-neutral-500">{book.author}</span>
        {book.pageCount !== null && (
          <span className="text-xs text-neutral-400">
            {book.pageCount} pages
          </span>
        )}
        <p
          className={`mt-auto border-t pt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 ${styles.divider}`}
        >
          {book.reason}
        </p>
      </div>
    </div>
  );
}
