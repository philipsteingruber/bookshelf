"use client";

import Image from "next/image";
import Link from "next/link";

import { PenIcon } from "lucide-react";

import BookCoverFallback from "@/components/books/book-cover-fallback";
import type { Book } from "@/generated/prisma/client";
import { useDialogState, useImageError } from "@/hooks/ui";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const ReadingProgressCard = ({
  book,
  className,
}: {
  book: Book;
  className?: string;
}): React.ReactElement => {
  const { imageError, handleImageError } = useImageError(book.coverUrl);
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const {
    isOpen: readingProgressDialogOpen,
    setIsOpen: setReadingProgressDialogOpen,
  } = useDialogState();

  const utils = trpc.useUtils();
  const handleMouseEnter = (): void => {
    utils.book.getBook.prefetch(book.id);

    if (book.coverUrl) {
      const img = new window.Image();
      img.src = book.coverUrl;
    }
  };

  return (
    <Card
      className={cn(
        "hover:bg-card/80 h-48 overflow-hidden rounded-md py-0",
        className,
      )}
      onMouseEnter={handleMouseEnter}
    >
      <CardContent className="flex h-full w-full p-0">
        <div className="relative aspect-2/3 h-full shrink-0 bg-linear-to-br from-gray-100 to-gray-200">
          {imageError ? (
            <BookCoverFallback size="sm" book={book} />
          ) : (
            <Link href={`/books/${book.id}`}>
              <Image
                src={coverUrl}
                alt={book.title}
                fill
                sizes="(max-width: 768px) 100vw, 200px"
                style={{ objectFit: "cover" }}
                priority
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmMWY1ZjkiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMmU4ZjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=="
                onError={handleImageError}
              />
            </Link>
          )}
        </div>
        <div className="relative flex w-full min-w-0 flex-1 gap-x-2 p-1">
          <Link
            href={`/books/${book.id}`}
            className="flex w-full min-w-0 flex-1"
          >
            <div className="flex w-full min-w-0 flex-col justify-center gap-y-1 px-2">
              <div className="flex w-full min-w-0 flex-col gap-y-1">
                <span className="w-full truncate font-semibold">
                  {book.title}
                </span>
                <span className="w-full truncate font-serif">
                  {book.author}
                </span>
              </div>
              <div className="flex w-full items-center gap-x-2">
                <span className="text-sm">{book.progress}%</span>
                <Progress value={book.progress} className="h-3 w-full" />
              </div>
            </div>
          </Link>
          <div className="flex items-end pb-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog
                  open={readingProgressDialogOpen}
                  onOpenChange={setReadingProgressDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant={"ghost"}
                      className="hover:border-primary hover:ring-primary absolute right-1 bottom-1 cursor-pointer border-none hover:border-2 hover:ring-2"
                    >
                      <PenIcon />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="flex flex-col items-center">
                    <DialogTitle className="flex items-center gap-x-1">
                      Update reading progress for{" "}
                      <span className="italic">{book.title}</span>
                    </DialogTitle>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>
                <p>Update reading progress</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReadingProgressCard;
