"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import type { Book } from "@/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { Card, CardContent } from "../ui/card";

import ReadStatusButton from "./readstatus-button";

interface BookCardProps {
  book: Book;
  showStatusButton: boolean;
  orientation: "vertical" | "horizontal";
  className?: string;
  priority?: boolean;
}

const BookCard = ({
  book,
  showStatusButton,
  className,
  priority,
}: BookCardProps) => {
  const [imageError, setImageError] = useState(false);
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;

  return (
    <Link href={`/books/${book.id}`}>
      <Card
        className={cn(
          "hover:bg-card/80 overflow-hidden border-2 p-0",
          className,
        )}
      >
        <CardContent className="m-0 flex h-full w-full flex-col gap-y-2 p-0">
          <div className="relative aspect-10/16 w-full bg-linear-to-br from-gray-100 to-gray-200">
            {imageError ? (
              <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-200 via-slate-300 to-slate-400 p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <svg
                    className="h-16 w-16 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <p className="line-clamp-3 text-sm font-medium text-slate-600">
                    {book.title}
                  </p>
                </div>
              </div>
            ) : (
              <Image
                src={coverUrl}
                alt={book.title}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                style={{ objectFit: "cover" }}
                priority={!!priority}
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmMWY1ZjkiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMmU4ZjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=="
                onError={() => setImageError(true)}
              />
            )}
          </div>
          <div className="mt-2 flex min-h-[88px] flex-col gap-y-1 px-2 pb-4">
            <p className="truncate text-base font-semibold">{book.title}</p>
            <p className="truncate font-serif text-sm italic">{book.author}</p>
            {book.series && book.seriesIndex && (
              <p className="truncate font-serif text-sm font-light italic text-muted-foreground">
                {`${book.series} #${book.seriesIndex}`}
              </p>
            )}
            {showStatusButton && <ReadStatusButton book={book} />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default BookCard;
