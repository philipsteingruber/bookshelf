"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { PenIcon } from "lucide-react";

import type { Book } from "@/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
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

const ReadingProgressCard = ({ book }: { book: Book }): React.ReactElement => {
  const [imageError, setImageError] = useState(false);
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const [readingProgressDialogOpen, setReadingProgressDialogOpen] =
    useState<boolean>(false);

  const utils = trpc.useUtils();
  const handleMouseEnter = (): void => {
    utils.book.getBook.prefetch(book.id);

    if (book.coverUrl) {
      const img = new window.Image();
      img.src = book.coverUrl;
    }
  };

  return (
    <div
      className="w-full min-w-[200px] md:w-auto md:min-w-[280px] xl:h-full xl:w-full"
      onMouseEnter={handleMouseEnter}
    >
      <Card className="hover:bg-card/80 h-auto min-h-48 w-full overflow-hidden rounded-md py-0 md:h-48 xl:h-full xl:max-w-[500px]">
        <CardContent className="flex h-full w-full p-0">
          <div className="relative aspect-2/3 h-full shrink-0 bg-linear-to-br from-gray-100 to-gray-200">
            {imageError ? (
              <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-200 via-slate-300 to-slate-400 p-2">
                <svg
                  className="h-8 w-8 text-slate-500"
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
              </div>
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
                  onError={() => setImageError(true)}
                />
              </Link>
            )}
          </div>
          <div className="flex w-full min-w-0 flex-1 gap-x-2 p-1">
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
                        className="hover:border-primary hover:ring-primary cursor-pointer border-none hover:border-2 hover:ring-2"
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
    </div>
  );
};

export default ReadingProgressCard;
