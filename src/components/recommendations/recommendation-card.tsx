"use client";

import Image from "next/image";
import Link from "next/link";

import BookCoverFallback from "@/components/books/book-cover-fallback";
import { useImageError } from "@/hooks/ui";

export type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type?: "safe" | "standard" | "stretch" | "risky";
  coverUrl: string | null;
  pageCount: number | null;
};

type StyleConfig = {
  card: string;
  border: string;
  divider: string;
  badge: string | null;
  badgeLabel: string | null;
};

const TYPE_STYLES: Record<NonNullable<RecommendationBook["type"]>, StyleConfig> = {
  safe: {
    card: "bg-[#f0fdf4] dark:bg-green-950/30",
    border: "border-[#86efac] dark:border-green-800",
    divider: "border-[#bbf7d0] dark:border-green-800",
    badge:
      "text-[#16a34a] bg-[#dcfce7] border-[#86efac] dark:text-green-400 dark:bg-green-950/50 dark:border-green-800",
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
    card: "bg-[#fffbeb] dark:bg-amber-950/30",
    border: "border-[#fcd34d] dark:border-amber-700",
    divider: "border-[#fde68a] dark:border-amber-700",
    badge:
      "text-[#d97706] bg-[#fef3c7] border-[#fcd34d] dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-700",
    badgeLabel: "Stretch pick",
  },
  risky: {
    card: "bg-[#fff7f7] dark:bg-red-950/30",
    border: "border-[#fca5a5] dark:border-red-800",
    divider: "border-[#fecaca] dark:border-red-800",
    badge: "text-[#dc2626] bg-[#fee2e2] border-[#fca5a5] dark:text-red-400 dark:bg-red-950/50 dark:border-red-800",
    badgeLabel: "Risky pick",
  },
};

const CONVERSATIONAL_STYLE: StyleConfig = {
  card: "bg-[#eff6ff] dark:bg-blue-950/30",
  border: "border-[#93c5fd] dard: border-blue-800",
  divider: "border-[#bfdbfe] dark:border-blue-800",
  badge: null,
  badgeLabel: null,
};

interface RecommendationCardProps {
  recommendation: RecommendationBook;
}

export const RecommendationCard = ({ recommendation }: RecommendationCardProps) => {
  const styles = recommendation.type ? TYPE_STYLES[recommendation.type] : CONVERSATIONAL_STYLE;
  const { imageError, handleImageError } = useImageError(recommendation.coverUrl);
  const showFallback = !recommendation.coverUrl || imageError;
  const goodreadsUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(recommendation.title)}+${encodeURIComponent(recommendation.author)}&search_type=books&search%5Bfield%5D=on`;

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border ${styles.card} ${styles.border}`}>
      <div className="relative h-36 w-full">
        {showFallback ? (
          <BookCoverFallback size="sm" title={recommendation.title} />
        ) : (
          <Image
            src={recommendation.coverUrl!}
            alt={`Cover of ${recommendation.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            onError={handleImageError}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {styles.badge && styles.badgeLabel ? (
          <span
            className={`self-start rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ${styles.badge}`}
          >
            {styles.badgeLabel}
          </span>
        ) : (
          <span
            aria-hidden
            data-testid="badge-placeholder"
            className="invisible self-start rounded border px-1.5 py-0.5 text-[0.65rem]"
          ></span>
        )}
        <Link
          href={goodreadsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-tight font-semibold text-blue-700 underline hover:text-blue-900 dark:text-blue-400"
        >
          {recommendation.title}
        </Link>
        <span className="text-xs text-neutral-500">{recommendation.author}</span>
        {recommendation.pageCount !== null && (
          <span className="text-xs text-neutral-400">{`${recommendation.pageCount} pages`}</span>
        )}
        <p
          className={`mt-auto border-t pt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 ${styles.divider}`}
        >
          {recommendation.reason}
        </p>
      </div>
    </div>
  );
};
