import { Book } from "@/app/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import Image from "next/image";
import { Card, CardContent } from "../ui/card";
import ReadStatusButton from "./readstatus-button";

const BookCard = ({ book }: { book: Book }) => {
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;

  return (
    <Card className="min-w-1/6 border-2">
      <CardContent className="flex h-full w-full flex-col gap-y-2 p-0">
        <div className="aspect-10/16 w-full overflow-hidden bg-gray-200">
          <Image
            src={coverUrl}
            alt={book.title}
            height={427}
            width={240}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <div className="flex flex-col gap-y-2 px-2">
          {book.series && book.seriesIndex ? (
            <div className="flex w-full justify-between">
              <p className="text-sm font-semibold">{`${book.title}`}</p>
              <p className="text-sm italic">
                {`${book.series} - ${book.seriesIndex}`}
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold">{book.title}</p>
          )}
          <p className="text-sm italic">{book.author}</p>
          <ReadStatusButton book={book} />
        </div>
      </CardContent>
    </Card>
  );
};

export default BookCard;
