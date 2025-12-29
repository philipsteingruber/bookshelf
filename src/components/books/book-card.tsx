import { Book } from "@/app/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import Image from "next/image";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import ReadStatusButton from "./readstatus-button";

const BookCard = ({ book }: { book: Book }) => {
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;

  return (
    <Card className="min-w-1/6">
      <CardContent className="flex h-full w-full flex-col gap-y-2 p-0">
        <Image
          src={coverUrl}
          alt={book.title}
          height={240}
          width={160}
          style={{ width: "100%", height: "auto" }}
        />
        <div className="flex flex-col items-start justify-between gap-y-2 pl-2">
          <p className="text-sm font-semibold">{book.title}</p>
          <p className="text-sm">{book.author}</p>
          <ReadStatusButton book={book} />
        </div>
      </CardContent>
    </Card>
  );
};

export default BookCard;
