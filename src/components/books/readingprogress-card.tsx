import { Book } from "@/app/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import { PenIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";

const ReadingProgressCard = ({ book }: { book: Book }) => {
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const coverWidth = 80;
  const coverHeight = (16 / 9) * coverWidth;

  return (
    <Link href={`/${book.id}`} className="w-1/4">
      <Card className="hover:bg-secondary/80 w-full">
        <CardContent className="flex gap-x-2 px-2">
          <Image
            src={coverUrl}
            width={coverWidth}
            height={coverHeight}
            alt={book.title}
          />
          <div className="flex w-full flex-col justify-center gap-y-4 px-2">
            <div className="flex flex-col gap-y-1">
              <span className="font-semibold">{book.title}</span>
              <span className="font-serif">{book.author}</span>
            </div>
            <div className="flex w-full items-center gap-x-2">
              <span>{book.progress}%</span>
              <Progress value={book.progress} className="w-full" />
              <PenIcon />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default ReadingProgressCard;
