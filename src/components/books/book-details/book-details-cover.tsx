import Image from "next/image";
import Link from "next/link";

import BookCoverFallback from "@/components/books/book-cover-fallback";
import type { Book } from "@/generated/prisma/client";
import { useImageError } from "@/hooks/ui";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface BookDetailsCoverProps {
  book: Book;
  className?: string;
}

const BookDetailsCover = ({ book, className }: BookDetailsCoverProps): React.ReactElement => {
  const coverUrl = book?.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const { imageError, handleImageError } = useImageError(book.coverUrl ?? null);

  return (
    <Link
      href={coverUrl}
      target="_blank"
      prefetch={false}
      className={cn("h-[450px] w-[300px] lg:h-[500px] lg:w-[333px] xl:h-[600px] xl:w-[400px]", className)}
    >
      <div className="relative h-full w-full overflow-hidden rounded-md bg-linear-to-br from-gray-100 to-gray-200">
        {imageError ? (
          <BookCoverFallback size="lg" title={book.title} />
        ) : (
          <Image
            src={coverUrl}
            alt={`${book.title} cover`}
            width={400}
            height={600}
            unoptimized
            className="rounded-md"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmMWY1ZjkiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMmU4ZjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=="
            onError={handleImageError}
          />
        )}
      </div>
    </Link>
  );
};

export default BookDetailsCover;
