import { Book } from "@/app/generated/prisma/client";
import { cn } from "@/lib/utils";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import Image from "next/image";
import Link from "next/link";
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
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;

  return (
    <Link href={`/books/${book.id}`} className={cn(className)}>
      <Card className={cn("hover:bg-card/80 border-2", className)}>
        <CardContent className="flex h-full w-full flex-col gap-y-2 p-0">
          <div className="relative aspect-10/16 w-full overflow-hidden bg-gray-200">
            <Image
              src={coverUrl}
              alt={book.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              style={{ objectFit: "cover" }}
              priority={!!priority}
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2UwZTBlMCIvPjwvc3ZnPg=="
            />
          </div>
          <div className="mt-2 flex flex-col gap-y-2 px-2">
            <div className="flex w-full justify-between pr-2">
              <p className="text-sm font-semibold">{`${book.title}`}</p>
              {book.series && book.seriesIndex && (
                <p className="text-sm italic">
                  {`${book.series} #${book.seriesIndex}`}
                </p>
              )}
            </div>
            <p className="text-sm italic">{book.author}</p>
            {showStatusButton && <ReadStatusButton book={book} />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default BookCard;
