"use client";

import Image from "next/image";
import Link from "next/link";

import BookCoverFallback from "@/components/books/book-cover-fallback";
import { Badge } from "@/components/ui/badge";
import { useImageError } from "@/hooks/ui";
import { cn } from "@/lib/utils";

export type RecommendationBook = {
  title: string;
  author: string;
  reason: string;
  type?: "safe" | "standard" | "stretch" | "risky" | null;
  coverUrl: string | null;
  pageCount: number | null;
};

type StyleConfig = {
  card: string;
  border: string;
  divider: string;
};

type BadgeConfig = {
  label: string;
  variant: "safe" | "stretch" | "risky";
};

const BADGE_CONFIGS: Partial<Record<NonNullable<RecommendationBook["type"]>, BadgeConfig>> = {
  safe: { label: "Safe pick", variant: "safe" },
  stretch: { label: "Stretch pick", variant: "stretch" },
  risky: { label: "Risky pick", variant: "risky" },
};

const TYPE_STYLES: Record<NonNullable<RecommendationBook["type"]>, StyleConfig> = {
  safe: {
    card: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-300 dark:border-green-800",
    divider: "border-green-200 dark:border-green-800",
  },
  standard: {
    card: "bg-white dark:bg-neutral-900",
    border: "border-gray-200 dark:border-neutral-700",
    divider: "border-neutral-100 dark:border-neutral-700",
  },
  stretch: {
    card: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-700",
    divider: "border-amber-200 dark:border-amber-700",
  },
  risky: {
    card: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300 dark:border-red-800",
    divider: "border-red-200 dark:border-red-800",
  },
};

const CONVERSATIONAL_STYLE: StyleConfig = {
  card: "bg-blue-50 dark:bg-blue-950/30",
  border: "border-blue-300 dark:border-blue-800",
  divider: "border-blue-200 dark:border-blue-800",
};

interface RecommendationCardProps {
  recommendation: RecommendationBook;
}

export const RecommendationCard = ({ recommendation }: RecommendationCardProps) => {
  const styles = recommendation.type ? TYPE_STYLES[recommendation.type] : CONVERSATIONAL_STYLE;
  const { imageError, handleImageError } = useImageError(recommendation.coverUrl);
  const showFallback = !recommendation.coverUrl || imageError;
  const badgeConfig = recommendation.type ? (BADGE_CONFIGS[recommendation.type] ?? null) : null;
  const goodreadsUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(recommendation.title)}+${encodeURIComponent(recommendation.author)}&search_type=books&search%5Bfield%5D=on`;

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border", styles.card, styles.border)}>
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
        <Badge
          variant={badgeConfig?.variant ?? "outline"}
          className={cn(
            "self-start rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase",
            !badgeConfig && "invisible",
          )}
          {...(!badgeConfig && { "aria-hidden": true, "data-testid": "badge-placeholder" })}
        >
          {badgeConfig?.label ?? "placeholder"}
        </Badge>
        <Link
          href={goodreadsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-tight font-semibold text-blue-700 underline hover:text-blue-900 dark:text-blue-400"
        >
          {recommendation.title}
        </Link>
        <span className="text-xs text-neutral-500">{recommendation.author}</span>
        <span className="text-xs text-neutral-400">
          {recommendation.pageCount !== null ? `${recommendation.pageCount} pages` : "—"}
        </span>
        <p
          className={cn(
            "mt-auto border-t pt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400",
            styles.divider,
          )}
        >
          {recommendation.reason}
        </p>
      </div>
    </div>
  );
};
